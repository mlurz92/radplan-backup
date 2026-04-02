import {
  WORKPLACES,
  STATUSES,
  CODE_MAP,
  MONTHS,
  MONTHS_SHORT,
  DOW_ABBR,
  DOW_LONG,
  VACATION_CODES,
  WISH_TYPES,
  WISH_MAP,
  RBN_ROW_KEY,
  RBN_ROW_LABEL,
  isFacharzt,
  isAssistenzarzt,
  getEmpMeta,
  posColor,
  getSaxonyHolidaysCached,
  dateKey,
  monthKey,
  daysInMonth,
  weekday,
  isWeekend,
  isFriday,
  isHoliday,
  isTodayCol,
  isoWeekNumber,
  nextCalendarDay,
  cellColor,
  empInitials,
  getRbnOptionsForDate,
  formatRbnDisplay
} from './constants.js';

import {
  state,
  DATA,
  planMode,
  planData,
  planBaseline,
  planHistory,
  planHistoryIdx,
  planSessions,
  IS_MOBILE,
  TOD_Y,
  TOD_M,
  TOD_D,
  loadFromStorage,
  saveToStorage,
  setPlanMode,
  setPlanData,
  setPlanBaseline,
  setPlanHistory,
  setPlanHistoryIdx,
  setDeptTab,
  syncWithServer,
  forceSyncWithServer,
  serverLastModified,
  serverFetchSuccessful
} from './state.js';

import {
  getMonthData,
  ensurePostBDFreiDays,
  getCell,
  setCell,
  clearCell,
  getRbnValue,
  setRbnValue,
  dutyOwner,
  getEmployeesForYear,
  cloneData,
  persistPlanSessionRefs,
  hasAnyPlanChanges,
  loadPlanSessionForState,
  addEmployee,
  removeEmployee
} from './model.js';

import {
  render,
  showOverlay,
  hideOverlay,
  showToast,
  renderDeptContent,
  renderEmployeeDashboard,
  openProfileModal,
  refreshOpenContextPanels,
  updateOpenModalLayouts,
  refreshResponsiveLayout,
  queueResponsiveRefresh,
  scrollToToday as doScrollToToday,
  openScoreInfoModal
} from './render.js';

import {
  computeAutoPlan,
  collectHistoricalDutyStatsAsync,
  sleep,
  TARGET_WEEKEND_DUTY,
  RELAXED_WEEKEND_DUTY_LIMIT,
  isDutyExempt,
  DUTY_EXEMPT
} from './autoplan.js';

import { NeuralGraph } from './neuralgraph.js';

let localAutoPlanResult = null;
let localAutoPlanTargets = {};
let localApViewMode = "config";
let localAutoPlanConfigRenderToken = 0;
let localApAnimationId = null;
let neuralGraphInstance = null;

export function isPeriodFlyoutOpen() {
  const el = document.getElementById("period-flyout");
  return !!el && !el.hasAttribute("hidden");
}

export function populatePeriodMonthSelect() {
  const sel = document.getElementById("period-month-select");
  if (!sel || sel.options.length) {
    return;
  }
  
  MONTHS.forEach((label, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

export function syncPeriodControls() {
  const monthSelect = document.getElementById("period-month-select");
  const yearInput = document.getElementById("period-year-input");
  const context = document.getElementById("period-context");
  
  if (monthSelect) {
    monthSelect.value = String(state.periodDraft.month);
  }
  
  if (yearInput) {
    yearInput.value = String(state.periodDraft.year);
  }
  
  if (context) {
    if (planMode) {
      context.textContent = `Planungsmodus aktiv · aktive Sicht ${MONTHS[state.month]} ${state.year} · Auswahl ${MONTHS[state.periodDraft.month]} ${state.periodDraft.year}`;
    } else {
      context.textContent = `Aktive Ansicht ${MONTHS[state.month]} ${state.year} · Auswahl ${MONTHS[state.periodDraft.month]} ${state.periodDraft.year}`;
    }
  }
  
  const labelBtn = document.getElementById("month-label-btn");
  if (labelBtn) {
    labelBtn.setAttribute("aria-expanded", isPeriodFlyoutOpen() ? "true" : "false");
  }
}

export function openPeriodFlyout() {
  populatePeriodMonthSelect();
  state.periodDraft = { year: state.year, month: state.month };
  syncPeriodControls();
  
  const el = document.getElementById("period-flyout");
  if (!el) {
    return;
  }
  
  el.removeAttribute("hidden");
  el.setAttribute("aria-hidden", "false");
  document.body.classList.add("period-flyout-open");
  syncPeriodControls();
}

export function closePeriodFlyout() {
  const el = document.getElementById("period-flyout");
  if (!el) {
    return;
  }
  
  el.setAttribute("hidden", "");
  el.setAttribute("aria-hidden", "true");
  document.body.classList.remove("period-flyout-open");
  syncPeriodControls();
}

export function shiftMonth(delta) {
  const total = state.year * 12 + state.month + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12;
  return { year: nextYear, month: nextMonth };
}

export function switchPeriod(targetYear, targetMonth, options = {}) {
  const { closeFlyout = true } = options;
  
  if (closeFlyout) {
    closePeriodFlyout();
  }
  
  if (planMode) {
    persistPlanSessionRefs();
  }
  
  state.year = targetYear;
  state.month = targetMonth;
  state.periodDraft = { year: targetYear, month: targetMonth };
  
  if (planMode) {
    loadPlanSessionForState(targetYear, targetMonth);
  }
  
  syncPeriodControls();
  refreshOpenContextPanels();
  render();
}

export function changeMonth(delta) {
  const next = shiftMonth(delta);
  switchPeriod(next.year, next.month);
}

export function changeYear(delta) {
  switchPeriod(state.year + delta, state.month);
}

export function applyPeriodDraft() {
  const year = Math.max(2000, Math.min(2100, parseInt(state.periodDraft.year, 10) || state.year));
  const month = Math.max(0, Math.min(11, parseInt(state.periodDraft.month, 10) || 0));
  switchPeriod(year, month);
}

export function handleTodayClick() {
  if (state.year !== TOD_Y || state.month !== TOD_M) {
    switchPeriod(TOD_Y, TOD_M, { closeFlyout: true });
    setTimeout(doScrollToToday, 100);
  } else {
    doScrollToToday();
  }
}

export function isEditorOpen() {
  const el = document.getElementById("modal-editor");
  return el && !el.hasAttribute("hidden");
}

export function recordPlanHistory() {
  if (!planMode || !planData) {
    return;
  }
  
  const newHistory = planHistory.slice(0, planHistoryIdx + 1);
  newHistory.push({
    assignments: cloneData(planData.assignments),
    rbn: cloneData(planData.rbn || {}),
  });
  
  setPlanHistory(newHistory);
  setPlanHistoryIdx(newHistory.length - 1);
  persistPlanSessionRefs();
  updatePlanBarUI();
}

export function updatePlanBarUI() {
  const undoBtn = document.getElementById("btn-plan-undo");
  const redoBtn = document.getElementById("btn-plan-redo");
  
  if (!undoBtn || !redoBtn) {
    return;
  }
  
  const canUndo = planHistoryIdx > 0;
  const canRedo = planHistoryIdx < planHistory.length - 1;
  
  undoBtn.disabled = !canUndo;
  redoBtn.disabled = !canRedo;
  undoBtn.title = canUndo ? `Rückgängig (Strg+Z)` : "";
  redoBtn.title = canRedo ? `Vorwärts (Strg+Y)` : "";
}

export function enterPlanMode() {
  const { year: y, month: m } = state;
  setPlanMode(true);
  loadPlanSessionForState(y, m);
  localAutoPlanTargets = {};
  render();
  showToast("Planungsmodus aktiv");
}

export function exitPlanMode() {
  persistPlanSessionRefs();
  setPlanMode(false);
  setPlanData(null);
  setPlanBaseline(null);
  setPlanHistory([]);
  setPlanHistoryIdx(-1);
  render();
}

export function getWish(emp, day) {
  if (!planMode || !planData?.wishes) {
    return null;
  }
  return planData.wishes[emp]?.[day] || null;
}

export function setWish(emp, day, wishCode) {
  if (!planMode || !planData) {
    return;
  }
  if (!planData.wishes[emp]) {
    planData.wishes[emp] = {};
  }
  if (wishCode) {
    planData.wishes[emp][day] = wishCode;
  } else {
    delete planData.wishes[emp][day];
  }
}

export function toggleWish(emp, day, wishCode) {
  const current = getWish(emp, day);
  if (current === wishCode) {
    setWish(emp, day, null);
  } else {
    setWish(emp, day, wishCode);
  }
}

export function closePlanMode() {
  persistPlanSessionRefs();
  if (hasAnyPlanChanges()) {
    if (!confirm("Planungsmodus schließen?\nEs gibt ungespeicherte Änderungen in mindestens einem Monatsentwurf.")) {
      return;
    }
  }
  exitPlanMode();
}

export function abortPlanChanges() {
  if (!planMode || !planBaseline) {
    return;
  }
  
  const draftState = JSON.stringify({
    assignments: planData.assignments,
    rbn: planData.rbn || {},
  });
  
  if (draftState === JSON.stringify(planBaseline)) {
    showToast("Keine Änderungen");
    return;
  }
  
  planData.assignments = cloneData(planBaseline.assignments || {});
  planData.rbn = cloneData(planBaseline.rbn || {});
  
  setPlanHistory([{ 
    assignments: cloneData(planData.assignments), 
    rbn: cloneData(planData.rbn || {}) 
  }]);
  
  setPlanHistoryIdx(0);
  persistPlanSessionRefs();
  render();
  showToast("Zurückgesetzt");
}

export function savePlanDraft() {
  if (!planMode || !planData) {
    return;
  }
  
  const key = `radplan_v3_plan_${monthKey(state.year, state.month)}`;
  
  try {
    persistPlanSessionRefs();
    localStorage.setItem(
      key,
      JSON.stringify({
        employees: planData.employees,
        assignments: planData.assignments,
        rbn: planData.rbn || {},
        wishes: planData.wishes || {},
      })
    );
    
    setPlanBaseline({
      assignments: cloneData(planData.assignments),
      rbn: cloneData(planData.rbn || {}),
    });
    
    persistPlanSessionRefs();
    updatePlanBarUI();
    saveToStorage();
    showToast("Entwurf gespeichert");
  } catch (e) {
    showToast("Fehler beim Speichern");
  }
}

export function applyPlanToMain() {
  if (!planMode || !planData) {
    return;
  }
  
  const k = monthKey(state.year, state.month);
  
  if (!DATA[k]) {
    DATA[k] = { employees: [...planData.employees], assignments: {}, rbn: {} };
  }
  
  DATA[k].employees = [...planData.employees];
  DATA[k].assignments = cloneData(planData.assignments);
  DATA[k].rbn = cloneData(planData.rbn || {});
  
  saveToStorage();
  exitPlanMode();
  showToast("Planung übernommen");
}

export function undoPlan() {
  if (!planMode || planHistoryIdx <= 0) {
    return;
  }
  
  setPlanHistoryIdx(planHistoryIdx - 1);
  const snap = planHistory[planHistoryIdx] || { assignments: {}, rbn: {} };
  
  planData.assignments = cloneData(snap.assignments || {});
  planData.rbn = cloneData(snap.rbn || {});
  
  persistPlanSessionRefs();
  updatePlanBarUI();
  render();
}

export function redoPlan() {
  if (!planMode || planHistoryIdx >= planHistory.length - 1) {
    return;
  }
  
  setPlanHistoryIdx(planHistoryIdx + 1);
  const snap = planHistory[planHistoryIdx] || { assignments: {}, rbn: {} };
  
  planData.assignments = cloneData(snap.assignments || {});
  planData.rbn = cloneData(snap.rbn || {});
  
  persistPlanSessionRefs();
  updatePlanBarUI();
  render();
}

export function openEditor(emp, day) {
  const { year: y, month: m } = state;
  const isRbnRow = emp === RBN_ROW_KEY;
  const cell = isRbnRow ? { assignment: getRbnValue(y, m, day) || null, duty: null } : getCell(y, m, emp, day);
  const hols = getSaxonyHolidaysCached(y);
  
  state.edit = { emp, day, isRbnRow };
  let wp = [];
  let st = null;
  
  if (isRbnRow && cell.assignment) {
    wp = [cell.assignment];
  } else if (cell.assignment) {
    cell.assignment.split("/").map((x) => x.trim()).forEach((p) => {
      if (WORKPLACES.find((w) => w.code === p)) {
        wp.push(p);
      } else if (STATUSES.find((s) => s.code === p)) {
        st = p;
      }
    });
  }
  
  state.ed = { wp: [...wp], st, duty: cell.duty || null };
  
  const wd = weekday(y, m, day);
  const hol = isHoliday(y, m, day, hols);
  const we = isWeekend(y, m, day);
  const holNm = hols[dateKey(y, m, day)] || "";
  
  const edTitle = document.getElementById("ed-title");
  if (edTitle) {
    edTitle.textContent = isRbnRow ? RBN_ROW_LABEL : emp;
  }
  
  const edSub = document.getElementById("ed-sub");
  if (edSub) {
    edSub.textContent = `${DOW_LONG[wd]}, ${day}. ${MONTHS[m]} ${y}${holNm ? " · " + holNm : ""}`;
  }
  
  const dtlEl = document.getElementById("ed-day-label");
  if (dtlEl) {
    if (hol) {
      dtlEl.innerHTML = `<span class="day-type-label dtl-hol">Feiertag${holNm ? ": " + holNm : ""}</span>`;
    } else if (we) {
      dtlEl.innerHTML = `<span class="day-type-label dtl-we">Wochenende</span>`;
    } else {
      dtlEl.innerHTML = "";
    }
  }
  
  const modalHd = document.getElementById("ed-modal-hd");
  const planBadge = document.getElementById("ed-plan-badge");
  const modalEl = document.getElementById("modal-editor");
  
  if (planMode) {
    if (modalHd) modalHd.classList.add("plan-mode-hd");
    if (modalEl) modalEl.classList.add("plan-mode-editor");
    if (planBadge) planBadge.style.display = "inline-flex";
  } else {
    if (modalHd) modalHd.classList.remove("plan-mode-hd");
    if (modalEl) modalEl.classList.remove("plan-mode-editor");
    if (planBadge) planBadge.style.display = "none";
  }
  
  refreshEditorChips();
  showOverlay("modal-editor");
}

export function refreshEditorChips() {
  const { year: y, month: m } = state;
  const { wp, st, duty } = state.ed;
  const { emp, day, isRbnRow } = state.edit;
  
  const wpLabel = document.getElementById("ed-wp-label");
  const wpHint = document.getElementById("ed-wp-hint");
  const stSection = document.getElementById("ed-st-section");
  const dutySection = document.getElementById("ed-duty-section");
  const dutyWarn = document.getElementById("ed-duty-warn");
  
  if (isRbnRow) {
    if (wpLabel) wpLabel.textContent = "RD Neurorad";
    if (wpHint) wpHint.textContent = "— manuelle Namensauswahl, wird nie durch Auto-Planung verändert";
    if (stSection) stSection.style.display = "none";
    if (dutySection) dutySection.style.display = "none";
    if (dutyWarn) dutyWarn.style.display = "none";
  } else {
    if (wpLabel) wpLabel.textContent = "Arbeitsplatz";
    if (wpHint) wpHint.textContent = "— Mehrfachauswahl möglich, z. B. MR/CT";
    if (stSection) stSection.style.display = "";
    if (dutySection) dutySection.style.display = "";
  }
  
  const wpC = document.getElementById("ed-wp");
  if (wpC) {
    wpC.innerHTML = "";
    
    const rbnOptions = getRbnOptionsForDate(y, m);
    if (isRbnRow && state.ed.wp[0] && !rbnOptions.includes(state.ed.wp[0])) {
      rbnOptions.unshift(state.ed.wp[0]);
    }
    
    const wpOptions = isRbnRow ? rbnOptions.map((label) => ({ code: label, label, bg: "#E0F2FE", fg: "#0C4A6E" })) : WORKPLACES;
    
    wpOptions.forEach((w, idx) => {
      const on = wp.includes(w.code);
      const dimC = isRbnRow ? false : !!st;
      
      const chip = document.createElement("div");
      chip.className = `chip-wp${on ? " on" : ""}${dimC ? " dim" : ""}`;
      chip.style.cssText = `background:${on ? w.fg : w.bg};color:${on ? "#fff" : w.fg};position:relative`;
      
      if (isRbnRow) {
        chip.style.minWidth = "190px";
        chip.style.alignItems = "flex-start";
        chip.style.textAlign = "left";
        chip.style.lineHeight = "1.35";
        chip.style.fontFamily = "var(--font-sans)";
        chip.style.fontSize = "12px";
        chip.style.fontWeight = "700";
      }
      
      const kbdBadge = `<span style="position:absolute;top:2px;right:2px;font-family:var(--font-mono);font-size:7px;font-weight:700;line-height:1;opacity:${dimC ? 0.3 : 0.55};background:rgba(0,0,0,0.12);color:inherit;padding:1px 3px;border-radius:2px;pointer-events:none">${idx + 1}</span>`;
      
      if (isRbnRow) {
        chip.innerHTML = `${w.label}`;
      } else {
        chip.innerHTML = `${kbdBadge}${w.code}<span class="chip-sub">${w.label}</span>`;
      }
      
      if (!dimC) {
        chip.addEventListener("click", () => {
          const i = state.ed.wp.indexOf(w.code);
          if (i >= 0) {
            state.ed.wp.splice(i, 1);
          } else if (isRbnRow) {
            state.ed.wp = [w.code];
          } else {
            state.ed.wp.push(w.code);
          }
          refreshEditorChips();
        });
      }
      wpC.appendChild(chip);
    });
    
    let kbdHint = document.getElementById("ed-wp-kbd-hint");
    if (!kbdHint) {
      kbdHint = document.createElement("div");
      kbdHint.id = "ed-wp-kbd-hint";
      kbdHint.style.cssText = "margin-top:6px;display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--gray-400);";
      kbdHint.innerHTML = `
        <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;opacity:.6">
          <rect x="2" y="4" width="20" height="16" transform="translate(2 4)"/>
          <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12"/>
        </svg>
        <span>Ziffern 1–8 für Arbeitsplatz · D für Bereitschaft · H für Hintergrund · S oder ↵ zum Speichern</span>
      `;
      wpC.parentNode.insertBefore(kbdHint, wpC.nextSibling);
    }
    kbdHint.style.display = !isRbnRow && !IS_MOBILE ? "flex" : "none";
  }
  
  if (isRbnRow) {
    const stC = document.getElementById("ed-st");
    if (stC) stC.innerHTML = "";
    
    const dtC = document.getElementById("ed-duty");
    if (dtC) dtC.innerHTML = "";
    
    const edPreviewVal = document.getElementById("ed-preview-val");
    if (edPreviewVal) edPreviewVal.textContent = state.ed.wp[0] || "—";
    
    const edPreviewDuties = document.getElementById("ed-preview-duties");
    if (edPreviewDuties) edPreviewDuties.innerHTML = "";
    
    const wishC = document.getElementById("ed-wish");
    const wishHd = document.getElementById("ed-wish-hd");
    if (wishC) wishC.style.display = "none";
    if (wishHd) wishHd.style.display = "none";
    return;
  }
  
  const stC = document.getElementById("ed-st");
  if (stC) {
    stC.innerHTML = "";
    
    STATUSES.forEach((s) => {
      const on = st === s.code;
      const dimC = wp.length > 0 && !on;
      
      const chip = document.createElement("div");
      chip.className = `chip-st${on ? " on" : ""}${dimC ? " dim" : ""}`;
      chip.style.cssText = `background:${on ? s.fg : s.bg};color:${on ? "#fff" : s.fg}`;
      chip.innerHTML = `${s.code}<span class="chip-sub">${s.label}</span>`;
      
      if (!dimC || on) {
        chip.addEventListener("click", () => {
          state.ed.st = state.ed.st === s.code ? null : s.code;
          if (state.ed.st) {
            state.ed.wp = [];
          }
          refreshEditorChips();
        });
      }
      stC.appendChild(chip);
    });
  }
  
  const dtC = document.getElementById("ed-duty");
  if (dtC) {
    dtC.innerHTML = "";
    const warnParts = [];
    
    ["D", "HG"].forEach((dc) => {
      const on = duty === dc;
      const owner = dutyOwner(y, m, day, dc);
      const taken = owner && owner !== emp;
      
      const chip = document.createElement("div");
      chip.className = `chip-duty ${on ? "duty-" + dc + "-on" : "duty-" + dc + "-off"}${taken ? " blocked" : ""}`;
      chip.innerHTML = `${dc}<span class="duty-sub">${dc === "D" ? "Bereitschaftsdienst" : "Hintergrunddienst"}</span>`;
      
      if (!taken) {
        chip.addEventListener("click", () => {
          state.ed.duty = state.ed.duty === dc ? null : dc;
          refreshEditorChips();
        });
      } else {
        warnParts.push(`${dc} bereits vergeben: ${owner}`);
      }
      dtC.appendChild(chip);
    });
    
    const warnEl = document.getElementById("ed-duty-warn");
    const nextDay = nextCalendarDay(y, m, day);
    
    if (nextDay.y !== undefined) {
      const nextCell = getCell(nextDay.y, nextDay.m, emp, nextDay.d);
      if (nextCell.assignment) {
        const codes = nextCell.assignment.split("/").map((x) => x.trim());
        if (codes.some((c) => VACATION_CODES.includes(c))) {
          warnParts.push(`⚠ Folgetag (${nextDay.d}.) ist Urlaub`);
        }
      }
    }
    
    if (warnEl) {
      if (warnParts.length) {
        warnEl.style.display = "block";
        warnEl.textContent = warnParts.join(" · ");
      } else {
        warnEl.style.display = "none";
      }
    }
  }
  
  const wishC = document.getElementById("ed-wish");
  if (wishC) {
    if (planMode) {
      wishC.style.display = "flex";
      const wishHd = document.getElementById("ed-wish-hd");
      if (wishHd) wishHd.style.display = "";
      
      wishC.innerHTML = "";
      const currentWish = getWish(emp, day);
      
      WISH_TYPES.forEach((wt) => {
        const on = currentWish === wt.code;
        const chip = document.createElement("div");
        chip.className = `chip-wish${on ? " wish-on" : ""}`;
        chip.style.cssText = on ? `background:${wt.fg};color:#fff;border-color:${wt.fg}` : `background:${wt.bg};color:${wt.fg};border-color:${wt.border}`;
        chip.innerHTML = `<span class="wish-icon">${wt.icon}</span>${wt.label}`;
        chip.addEventListener("click", () => {
          toggleWish(emp, day, wt.code);
          refreshEditorChips();
        });
        wishC.appendChild(chip);
      });
    } else {
      wishC.style.display = "none";
      const wishHd = document.getElementById("ed-wish-hd");
      if (wishHd) wishHd.style.display = "none";
    }
  }
  
  const pv = state.ed.st || (state.ed.wp.length ? state.ed.wp.join("/") : "");
  const edPreviewVal = document.getElementById("ed-preview-val");
  if (edPreviewVal) {
    edPreviewVal.textContent = pv || "—";
  }
  
  const bdg = document.getElementById("ed-preview-duties");
  if (bdg) {
    if (state.ed.duty) {
      bdg.innerHTML = `<span class="preview-duty-badge badge-${state.ed.duty}" style="background:${state.ed.duty === "D" ? "#EF4444" : "#0EA5E9"};color:#fff">${state.ed.duty}</span>`;
    } else {
      bdg.innerHTML = "";
    }
  }
}

export function saveEditor() {
  const { year: y, month: m } = state;
  const { emp, day, isRbnRow } = state.edit;
  
  if (isRbnRow) {
    if (planMode) recordPlanHistory();
    setRbnValue(y, m, day, state.ed.wp[0] || "");
    if (planMode) recordPlanHistory();
    hideOverlay("modal-editor");
    render();
    return;
  }
  
  const { wp, st, duty } = state.ed;
  const assignment = st ? st : wp.length ? wp.join("/") : null;
  
  if (planMode) recordPlanHistory();
  
  setCell(y, m, emp, day, {
    assignment: assignment || null,
    duty: duty || null,
  });
  
  if (duty === "D") {
    const next = nextCalendarDay(y, m, day);
    const ex = getCell(next.y, next.m, emp, next.d);
    if (!ex.assignment) {
      setCell(next.y, next.m, emp, next.d, {
        assignment: "F",
        duty: ex.duty || null,
      });
      showToast("F automatisch gesetzt");
    }
  }
  
  if (planMode) recordPlanHistory();
  
  hideOverlay("modal-editor");
  render();
}

export function confirmRemoveEmployee(name, refreshList = false) {
  const { year: y, month: m } = state;
  if (confirm(`„${name}" aus ${MONTHS[m]} ${y} entfernen?`)) {
    removeEmployee(y, m, name);
    render();
    if (refreshList) {
      renderEmployeeDashboard();
    } else {
      renderEmployeeDashboard();
    }
  }
}

export function openMobileDay(day) {
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const md = getMonthData(y, m);
  const wd = weekday(y, m, day);
  const hol = isHoliday(y, m, day, hols);
  const holName = hols[dateKey(y, m, day)] || "";
  const isToday = isTodayCol(y, m, day, TOD_Y, TOD_M, TOD_D);
  
  const titleEl = document.getElementById("mday-title");
  if (titleEl) {
    titleEl.textContent = `${DOW_LONG[wd]}, ${day}. ${MONTHS[m]} ${y}${holName ? " · " + holName : ""}`;
    if (isToday) {
      titleEl.style.color = "#67D4FF";
    } else if (hol) {
      titleEl.style.color = "#FCD34D";
    } else {
      titleEl.style.color = "";
    }
  }
  
  const dutyBadgesEl = document.getElementById("mday-duty-badges");
  if (dutyBadgesEl) {
    let html = "";
    const bdH = md.employees.find(e => md.assignments?.[e]?.[day]?.duty === "D");
    const hgH = md.employees.find(e => md.assignments?.[e]?.[day]?.duty === "HG");
    
    if (bdH) {
      html += `<span class="mday-duty-pill d"><span class="mday-duty-pill-letter">D</span>${bdH}</span>`;
    }
    if (hgH) {
      html += `<span class="mday-duty-pill hg"><span class="mday-duty-pill-letter">H</span>${hgH}</span>`;
    }
    dutyBadgesEl.innerHTML = html;
  }
  
  const bodyEl = document.getElementById("mday-body");
  if (!bodyEl) { 
    showOverlay("modal-mobile-day"); 
    return; 
  }
  
  const faList = md.employees.filter(e => isFacharzt(e));
  const aaList = md.employees.filter(e => isAssistenzarzt(e));
  
  const sections = [
    { label: "Fachärzte", emps: faList },
    { label: "Assistenzärzte", emps: aaList },
  ].filter(s => s.emps.length > 0);
  
  let bodyHtml = "";
  
  sections.forEach(sec => {
    bodyHtml += `<div class="mday-section-hd">${sec.label}</div>`;
    sec.emps.forEach(emp => {
      const cell = md.assignments?.[emp]?.[day] || {};
      const meta = getEmpMeta(emp);
      const pc = posColor(meta.position);
      const isEditable = planMode || !hol;
      
      let badgesHtml = "";
      if (cell.assignment) {
        cell.assignment.split("/").map(x => x.trim()).filter(Boolean).forEach(code => {
          const cm = CODE_MAP[code];
          if (cm) {
            badgesHtml += `<span class="mday-assign-badge" style="background:${cm.bg};color:${cm.fg}">${code}</span>`;
          }
        });
      }
      
      if (cell.duty) {
        badgesHtml += `<span class="mday-duty-tag ${cell.duty.toLowerCase()}">${cell.duty}</span>`;
      }
      
      if (planMode && getWish(emp, day)) {
        const w = getWish(emp, day);
        const wMap = { BD_WISH: "bd", HG_WISH: "hg", NO_DUTY: "no" };
        const wLabel = { BD_WISH: "D-Wunsch", HG_WISH: "HG-Wunsch", NO_DUTY: "Kein D" };
        badgesHtml += `<span class="mday-wish-tag ${wMap[w] || ""}">${wLabel[w] || w}</span>`;
      }
      
      if (!cell.assignment && !cell.duty) {
        badgesHtml = `<span class="mday-empty-assign">—</span>`;
      }
      
      bodyHtml += `
        <div class="mday-emp-row${isEditable ? " mday-editable" : ""}" data-emp="${emp}">
          <span class="mday-pos-dot" style="background:${pc.border}"></span>
          <div class="mday-emp-info">
            <span class="mday-emp-name">${emp}</span>
            <span class="mday-emp-sub">${meta.posLabel !== "—" ? meta.posLabel : meta.position}</span>
          </div>
          <div class="mday-badges">${badgesHtml}</div>
          ${isEditable ? `
            <span class="mday-edit-icon">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </span>
          ` : ""}
        </div>
      `;
    });
  });
  
  bodyEl.innerHTML = bodyHtml;
  
  bodyEl.querySelectorAll(".mday-editable[data-emp]").forEach(row => {
    row.addEventListener("click", () => {
      const emp = row.dataset.emp;
      hideOverlay("modal-mobile-day");
      setTimeout(() => openEditor(emp, day), 200);
    });
  });
  
  showOverlay("modal-mobile-day");
}

export function doExport() {
  const plans = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("radplan_v3_plan_")) {
      try {
        plans[k.replace("radplan_v3_plan_", "")] = JSON.parse(localStorage.getItem(k));
      } catch (e) {
      }
    }
  }
  
  const exportObj = { main: DATA, plans };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `radplan_${new Date().toISOString().slice(0, 10)}.json`,
  });
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Daten exportiert");
}

export function openImportModal() {
  const ta = document.getElementById("import-ta");
  if (ta) ta.value = "";
  
  const err = document.getElementById("import-err");
  if (err) err.style.display = "none";
  
  const dz = document.getElementById("import-dropzone");
  const fn = document.getElementById("dz-filename");
  const fi = document.getElementById("import-file-input");
  
  if (dz) dz.classList.remove("has-file", "drag-over");
  if (fn) fn.textContent = "";
  if (fi) fi.value = "";
  
  showOverlay("modal-import");
}

export function doImport() {
  const ta = document.getElementById("import-ta");
  if (!ta) return;
  
  const raw = ta.value.trim();
  const errEl = document.getElementById("import-err");
  if (errEl) errEl.style.display = "none";
  
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Ungültiges Format");
    }
    
    if (parsed.main && typeof parsed.main === "object") {
      Object.assign(DATA, parsed.main);
      if (parsed.plans && typeof parsed.plans === "object") {
        for (const [pk, pv] of Object.entries(parsed.plans)) {
          if (pv && typeof pv === "object" && !pv.rbn) {
            pv.rbn = {};
          }
          localStorage.setItem(`radplan_v3_plan_${pk}`, JSON.stringify(pv));
        }
      }
    } else {
      Object.assign(DATA, parsed);
    }
    
    saveToStorage();
    const repaired = ensurePostBDFreiDays();
    hideOverlay("modal-import");
    render();
    showToast("Daten erfolgreich importiert" + (repaired > 0 ? ` · ${repaired} Ruhetage ergänzt` : ""));
  } catch (e) {
    if (errEl) {
      errEl.style.display = "block";
      errEl.textContent = "Fehler: " + e.message;
    }
  }
}

export function initDragDrop() {
  const dz = document.getElementById("import-dropzone");
  const fi = document.getElementById("import-file-input");
  
  if (!dz || !fi) return;
  
  dz.addEventListener("click", (e) => {
    if (e.target !== fi) {
      fi.click();
    }
  });
  
  fi.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) {
      handleDroppedFile(f);
    }
    e.target.value = "";
  });
  
  dz.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dz.classList.add("drag-over");
  });
  
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.add("drag-over");
  });
  
  dz.addEventListener("dragleave", (e) => {
    if (!dz.contains(e.relatedTarget)) {
      dz.classList.remove("drag-over");
    }
  });
  
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove("drag-over");
    const f = e.dataTransfer.files[0];
    if (f) {
      handleDroppedFile(f);
    }
  });
}

export function handleDroppedFile(file) {
  const errEl = document.getElementById("import-err");
  const dz = document.getElementById("import-dropzone");
  const fnEl = document.getElementById("dz-filename");
  
  if (errEl) errEl.style.display = "none";
  if (dz) dz.classList.remove("has-file");
  
  if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
    if (errEl) {
      errEl.style.display = "block";
      errEl.textContent = "Fehler: Nur .json-Dateien";
    }
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (ev) => {
    const ta = document.getElementById("import-ta");
    if (ta) ta.value = ev.target.result;
    if (fnEl) {
      fnEl.textContent = file.name;
    }
    if (dz) dz.classList.add("has-file");
  };
  
  reader.onerror = () => {
    if (errEl) {
      errEl.style.display = "block";
      errEl.textContent = "Fehler beim Lesen der Datei";
    }
  };
  
  reader.readAsText(file, "UTF-8");
}

export function defaultBDTarget(empName) {
  if (isDutyExempt(empName)) return 0;
  if (empName === "Dr. Polednia") return 3;
  if (empName === "Dr. Becker") return 3;
  if (empName === "Hr. Sebastian") return 3;
  return 4;
}

export function openAutoPlanModal() {
  if (!planMode) return;
  const emps = [...planData.employees];
  
  if (!Object.keys(localAutoPlanTargets).length) {
    emps.forEach((e) => {
      localAutoPlanTargets[e] = defaultBDTarget(e);
    });
  }
  
  localApViewMode = "config";
  showOverlay("modal-autoplan");
  
  const body = document.getElementById("ap-body");
  if (body) {
    body.innerHTML = `
      <div class="ap-config-intro">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;color:#0EA5E9">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span>Auto-Plan-Konfiguration wird vorbereitet…</span>
      </div>
    `;
  }
  
  localAutoPlanConfigRenderToken += 1;
  const renderToken = localAutoPlanConfigRenderToken;
  
  requestAnimationFrame(() => {
    setTimeout(() => {
      renderAutoPlanModal(renderToken).catch(() => {
        showToast("Auto-Plan-Konfiguration konnte nicht geladen werden");
      });
    }, 0);
  });
}

export async function renderAutoPlanModal(renderToken = null) {
  const { year: y, month: m } = state;
  const emps = [...planData.employees];
  const dutyEmps = emps.filter((e) => !isDutyExempt(e));
  
  const apSub = document.getElementById("ap-sub");
  if (apSub) {
    apSub.textContent = `${MONTHS[m]} ${y}`;
  }
  
  const body = document.getElementById("ap-body");
  const applyBtn = document.getElementById("ap-apply");
  const reportBtn = document.getElementById("ap-report-btn");
  
  if (!body || !applyBtn) return;
  
  if (reportBtn) {
    reportBtn.style.display = "none";
  }

  if (localApViewMode === "config") {
    body.style.height = "auto";
    body.style.maxHeight = "none";
    body.style.overflowY = "auto";
    body.style.display = "block";
    applyBtn.style.display = "none";
    
    const hist = await collectHistoricalDutyStatsAsync(y, m);
    
    if (renderToken !== null && renderToken !== localAutoPlanConfigRenderToken) {
      return;
    }
    
    let html = `
      <div class="ap-config-intro">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;color:#F59E0B">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span>BD-Ziele anpassen.</span>
      </div>
    `;
    
    if (DUTY_EXEMPT.length) {
      html += `
        <div class="ap-exempt-note">
          <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Befreit: <strong>${DUTY_EXEMPT.join(", ")}</strong></span>
        </div>
      `;
    }
    
    html += `
      <div class="ap-sect-hd">
        <span class="ap-sect-badge" style="background:#EF4444;color:#fff">D</span>
        BD-Ziele
      </div>
    `;
    
    html += `
      <div class="ap-table-wrap">
        <table class="ap-table">
          <thead>
            <tr>
              <th class="ap-th-name">Mitarbeitende</th>
              <th class="ap-th">Position</th>
              <th class="ap-th">Hist. BD</th>
              <th class="ap-th">Hist. Sa-D</th>
              <th class="ap-th ap-th-target">Ziel BD</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    dutyEmps.forEach((e) => {
      const meta = getEmpMeta(e);
      const pc = posColor(meta.position);
      const h = hist[e] || { bd: 0, weDuty: 0, satBd: 0 };
      const target = localAutoPlanTargets[e] ?? defaultBDTarget(e);
      
      html += `
        <tr>
          <td class="ap-td-name" style="border-left:3px solid ${pc.border}">
            <span>${e}</span>
            <span class="ap-pos" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span>
          </td>
          <td class="ap-td ap-td-num" style="font-size:10px;color:var(--gray-500)">${meta.posLabel}</td>
          <td class="ap-td ap-td-num" style="color:var(--gray-500)">${h.bd}</td>
          <td class="ap-td ap-td-num" style="color:var(--gray-500)">${h.satBd}</td>
          <td class="ap-td ap-td-num">
            <input type="number" class="ap-target-input" data-emp="${e}" value="${target}" min="0" max="10" step="1">
          </td>
        </tr>
      `;
    });
    
    const totalTarget = dutyEmps.reduce((s, e) => s + (localAutoPlanTargets[e] ?? defaultBDTarget(e)), 0);
    
    html += `
          </tbody>
          <tfoot>
            <tr class="ap-total-row">
              <td class="ap-td-name" colspan="4" style="font-weight:700;color:var(--gray-700);padding-left:12px">Σ Gesamt-Ziel</td>
              <td class="ap-td ap-td-num" style="font-weight:800" id="ap-total-target">${totalTarget}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    
    html += `
      <div class="ap-config-actions">
        <button type="button" class="mbtn mbtn-ghost" id="ap-reset-defaults">Standard</button>
        <button type="button" class="mbtn" id="ap-compute" style="background:linear-gradient(135deg,#F59E0B,#D97706);color:#451a03;font-weight:700;cursor:pointer;-webkit-appearance:none">Berechnen</button>
      </div>
    `;
    
    body.innerHTML = html;
    
    body.querySelectorAll(".ap-target-input").forEach((inp) => {
      inp.addEventListener("change", () => {
        localAutoPlanTargets[inp.dataset.emp] = Math.max(0, Math.min(10, parseInt(inp.value, 10) || 0));
        inp.value = localAutoPlanTargets[inp.dataset.emp];
        const tot = dutyEmps.reduce((s, e) => s + (localAutoPlanTargets[e] ?? 0), 0);
        const totEl = document.getElementById("ap-total-target");
        if (totEl) {
          totEl.textContent = tot;
        }
      });
    });
    
    document.getElementById("ap-reset-defaults")?.addEventListener("click", () => {
      dutyEmps.forEach((e) => { 
        localAutoPlanTargets[e] = defaultBDTarget(e); 
      });
      body.querySelectorAll(".ap-target-input").forEach((inp) => { 
        inp.value = localAutoPlanTargets[inp.dataset.emp]; 
      });
      const totEl = document.getElementById("ap-total-target");
      if (totEl) {
        totEl.textContent = dutyEmps.reduce((s, e) => s + localAutoPlanTargets[e], 0);
      }
    });
      
    const computeBtn = document.getElementById("ap-compute");
    if (computeBtn) {
      computeBtn.addEventListener("click", () => {
        localApViewMode = "progress";
        renderProgressShell();
        
        requestAnimationFrame(() => {
          setTimeout(async () => {
            const result = await computeAutoPlan(localAutoPlanTargets);
            if (!result) { 
              showToast("Fehler bei der Berechnung"); 
              localApViewMode = "config";
              renderAutoPlanModal();
              return; 
            }
            localAutoPlanResult = result;
            await streamProgressLogs(result);
          }, 60);
        });
      });
    }
  } else if (localApViewMode === "result") {
    renderResultView();
  }
}

export function renderProgressShell() {
  const body = document.getElementById("ap-body");
  const applyBtn = document.getElementById("ap-apply");
  if (!body) return;
  
  if (applyBtn) applyBtn.style.display = "none";
  
  body.style.height = "72vh";
  body.style.maxHeight = "72vh";
  body.style.overflow = "hidden";
  body.style.padding = "10px";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  
  body.innerHTML = `
    <div class="ap-engine ap-engine-immersive ap-engine-compact" style="flex:1; min-height:0; display:flex; flex-direction:column;">
      <div class="ap-hero-shell ap-hero-shell-compact" style="flex-shrink:0;">
        <div class="ap-hero-hud">
          <div class="ap-hud-block">
            <span class="ap-hud-kicker">RadPlan Neural Scheduler</span>
            <div class="ap-hud-title" id="ap-prog-title">Constraint Analyse</div>
          </div>
          <div class="ap-hud-spectacle" aria-hidden="true" id="ap-hud-spectacle-container">
          </div>
        </div>
        
        <div class="ap-live-stats" aria-label="Live-Statistik">
          <div class="ap-ls-item"><strong class="ap-ls-val" id="ap-ls-bd">0</strong><span class="ap-ls-lbl">D-Dienste</span></div>
          <span class="ap-ls-sep" aria-hidden="true"></span>
          <div class="ap-ls-item"><strong class="ap-ls-val" id="ap-ls-hg">0</strong><span class="ap-ls-lbl">HG-Dienste</span></div>
          <span class="ap-ls-sep" aria-hidden="true"></span>
          <div class="ap-ls-item"><strong class="ap-ls-val" id="ap-ls-rules">0</strong><span class="ap-ls-lbl">Regeln</span></div>
          <span class="ap-ls-sep" aria-hidden="true"></span>
          <div class="ap-ls-item"><strong class="ap-ls-val" id="ap-ls-swaps">0</strong><span class="ap-ls-lbl">Optimierung</span></div>
        </div>

        <div class="ap-bar-wrap" id="ap-bar-wrap">
          <div class="ap-bar-track">
            <div class="ap-bar-fill" id="ap-prog-bar"></div>
            <div class="ap-bar-glow" id="ap-prog-glow"></div>
          </div>
          <div class="ap-bar-info">
            <span class="ap-bar-phase" id="ap-phase-name">Analysiere Constraints...</span>
            <span class="ap-bar-pct" id="ap-prog-pct">0%</span>
          </div>
        </div>
      </div>

      <div class="ap-engine-main" style="flex:1; min-height:0; display:flex; gap:10px;">
        <div class="ap-neural-view" style="flex:1; position:relative; min-width:0; min-height:0;">
          <div id="ap-neural-container" style="position:absolute; top:0; left:0; width:100%; height:100%;"></div>
          <div class="ap-neural-vignette" style="pointer-events:none;"></div>
          <div class="ap-neural-hud-layer" style="pointer-events:none;">
             <div class="ap-neural-hud-item"><span class="ap-nhi-lbl">Topologie</span><span class="ap-nhi-val">Neural Constellation</span></div>
             <div class="ap-neural-hud-item"><span class="ap-nhi-lbl">Status</span><span class="ap-nhi-val" id="ap-ng-status">COMPUTING</span></div>
          </div>
          <div class="ap-neural-stats" style="pointer-events:none;">
             <span class="ap-neural-stat-pill">Visualizer Active</span>
             <span class="ap-neural-stat-pill" style="color:#0EA5E9" id="ap-ng-phase-pill">INITIALIZING</span>
          </div>
        </div>

        <div class="ap-terminal ap-terminal-deep" style="flex:1; display:flex; flex-direction:column; min-width:0; min-height:0;">
          <div class="ap-term-header" style="flex-shrink:0;">
            <span class="ap-term-title">Trace Console</span>
          </div>
          <div class="ap-term-body" id="ap-term-body" style="flex:1; overflow-y:auto; min-height:0;"></div>
        </div>
      </div>
    </div>
  `;

  const container = document.getElementById("ap-neural-container");
  if (container) {
    if (neuralGraphInstance) {
      neuralGraphInstance.dispose();
    }
    neuralGraphInstance = new NeuralGraph(container);
    const daysCount = daysInMonth(state.year, state.month);
    neuralGraphInstance.initData(daysCount, planData.employees);
    document.getElementById("ap-ng-status").textContent = `${daysCount} TAGE × ${planData.employees.length} MA`;
    
    const spectacleContainer = document.getElementById("ap-hud-spectacle-container");
    if (spectacleContainer) {
      neuralGraphInstance.attachMiniMap(spectacleContainer);
    }
  }
}

export async function streamProgressLogs(result) {
  const logContainer = document.getElementById("ap-term-body");
  const barEl = document.getElementById("ap-prog-bar");
  const pctEl = document.getElementById("ap-prog-pct");
  const phaseEl = document.getElementById("ap-phase-name");
  const progTitle = document.getElementById("ap-prog-title");
  
  const log = result.log;
  const telemetry = result.ruleTelemetry?.events || [];

  let bdCount = 0;
  let hgCount = 0;
  let swapCount = 0;
  const logStarted = performance.now();

  const totalTargetDurationMs = 22000;
  const delayPerEntry = Math.max(50, totalTargetDurationMs / log.length);

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    await sleep(delayPerEntry);

    let dutyType = "D";
    if (entry.msg && entry.msg.includes("HG")) {
      dutyType = "HG";
    }

    if (entry.icon === "→" || entry.icon === "🟣") {
      if (dutyType === "HG") {
        hgCount++; 
      } else {
        bdCount++;
      }
    }
    
    if (entry.icon === "🔀" || entry.icon === "🔁" || entry.icon === "🧠") {
      swapCount++;
    }
    
    const bdEl = document.getElementById("ap-ls-bd");
    if (bdEl) bdEl.textContent = bdCount;
    
    const hgEl = document.getElementById("ap-ls-hg");
    if (hgEl) hgEl.textContent = hgCount;
    
    const swapEl = document.getElementById("ap-ls-swaps");
    if (swapEl) swapEl.textContent = swapCount;
    
    const rulesEl = document.getElementById("ap-ls-rules");
    if (rulesEl) rulesEl.textContent = telemetry.length;

    if (logContainer) {
      const div = document.createElement("div");
      div.className = "ap-log-entry";
      const t = ((performance.now() - logStarted) / 1000).toFixed(2);
      div.innerHTML = `<span class="ap-log-icon">${entry.icon}</span><span class="ap-log-msg">[${t}s] ${entry.msg}</span>`;
      logContainer.appendChild(div);
      logContainer.scrollTop = logContainer.scrollHeight;
    }

    if (neuralGraphInstance) {
      if (entry.icon === "🔀" || entry.icon === "🔁" || entry.icon === "🧠") {
        if (entry.dayIdx !== undefined && entry.oldEmpId && entry.newEmpId) {
          neuralGraphInstance.triggerSwap(entry.dayIdx, entry.oldEmpId, entry.newEmpId, dutyType);
        }
      } else if (entry.icon === "→" || entry.icon === "🟣") {
        if (entry.dayIdx !== undefined) {
          if (entry.oldEmpId && entry.newEmpId) {
            neuralGraphInstance.triggerSwap(entry.dayIdx, entry.oldEmpId, entry.newEmpId, dutyType);
          } else if (entry.newEmpId || entry.empId) {
            neuralGraphInstance.triggerAssignment(entry.dayIdx, entry.newEmpId || entry.empId, dutyType);
          }
        }
      }
      if (entry.msg.includes("KRITISCH") || entry.msg.includes("Penalty") || entry.icon === "⚠" || entry.icon === "🚨") {
        if (entry.dayIdx !== undefined) {
          neuralGraphInstance.triggerError(entry.dayIdx, entry.newEmpId || entry.empId, dutyType);
        }
      }
      
      const phasePill = document.getElementById("ap-ng-phase-pill");
      if (phasePill) {
        if (entry.phase === "deep") {
          if (i % 10 === 0) neuralGraphInstance.setPhase("deep");
          phasePill.textContent = "DEEP OPTIMIZE";
          phasePill.style.color = "#A855F7";
          if (progTitle && progTitle.textContent !== "Deep-Search Optimierung") {
            progTitle.textContent = "Deep-Search Optimierung";
          }
        } else if (entry.phase === "hg") {
          if (i % 5 === 0) neuralGraphInstance.setPhase("hg");
          phasePill.textContent = "HG BUNDLING";
          phasePill.style.color = "#38BDF8";
          if (progTitle && progTitle.textContent !== "Hintergrund-Allokation") {
            progTitle.textContent = "Hintergrund-Allokation";
          }
        } else if (entry.phase === "greedy" || entry.phase === "bd_weekend" || entry.phase === "bd_workday") {
          if (i % 5 === 0) neuralGraphInstance.setPhase("greedy");
          phasePill.textContent = "GREEDY PASS";
          phasePill.style.color = "#FBBF24";
          if (progTitle && progTitle.textContent !== "Greedy-Heuristik Pass") {
            progTitle.textContent = "Greedy-Heuristik Pass";
          }
        } else if (entry.phase === "init" || !entry.phase) {
          if (i % 5 === 0) neuralGraphInstance.setPhase("init");
          phasePill.textContent = "INITIALIZING";
          phasePill.style.color = "#0EA5E9";
          if (progTitle && progTitle.textContent !== "Constraint Analyse") {
            progTitle.textContent = "Constraint Analyse";
          }
        }
      }
    }

    if (barEl) barEl.style.width = entry.pct + "%";
    if (pctEl) pctEl.textContent = entry.pct + "%";
    if (phaseEl) phaseEl.textContent = entry.msg;
  }

  if (localApAnimationId) {
    cancelAnimationFrame(localApAnimationId);
  }

  if (neuralGraphInstance) {
     neuralGraphInstance.triggerSuccess(result.assignments);
     const phasePill = document.getElementById("ap-ng-phase-pill");
     if (phasePill) {
       phasePill.textContent = "CONVERGED";
       phasePill.style.color = "#22C55E";
     }
     if (progTitle) {
       progTitle.textContent = "Berechnung abgeschlossen";
     }
  }

  await new Promise(resolve => {
    const wrap = document.getElementById("ap-bar-wrap");
    if (wrap) {
      wrap.innerHTML = `
        <button type="button" class="mbtn" id="ap-show-result-btn" style="width:100%; justify-content:center; background:linear-gradient(135deg, #22c55e, #16a34a); color:#fff; font-weight:700; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.3); border:none; margin-top:8px;">
          Ergebnis anzeigen
        </button>
      `;
      const btn = document.getElementById("ap-show-result-btn");
      if (btn) {
        btn.addEventListener("click", resolve);
      } else {
        setTimeout(resolve, 1500);
      }
    } else {
      setTimeout(resolve, 1500);
    }
  });

  localApViewMode = "result";
  renderResultView();
}

export function renderResultView() {
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const emps = [...planData.employees];
  const dutyEmps = emps.filter((e) => !isDutyExempt(e));
  
  const { summary } = localAutoPlanResult;
  const qualityRaw = summary.quality || {};
  const quality = {
    score: String(qualityRaw.score || "0.0"),
    bdSpread: Number(qualityRaw.bdSpread) || 0,
    hgSpread: Number(qualityRaw.hgSpread) || 0,
    weekendSpread: Number(qualityRaw.weekendSpread) || 0,
    wishFulfillmentRate: Number(qualityRaw.wishFulfillmentRate) || 0,
    dutyCoverageMisses: Number(qualityRaw.dutyCoverageMisses) || 0,
    hgCoverageMisses: Number(qualityRaw.hgCoverageMisses) || 0,
    deepMoves: Number(qualityRaw.deepMoves) || 0
  };
  const qualityTooltips = {
    score: "Neural Fitness Index (NFI). Der komprimierte Wert für Abdeckung, Fairness und Regelkonformität.",
    bdSpread: "Differenz zwischen der höchsten und niedrigsten Anzahl an Bereitschaftsdiensten je Person.",
    hgSpread: "Differenz zwischen der höchsten und niedrigsten Anzahl an Hintergrunddiensten je Person.",
    weekendSpread: "Differenz der Dienstverteilung an Wochenenden/Feiertagen zwischen den Mitarbeitenden.",
    wishes: "Prozentanteil erfüllter Dienstwünsche im gewählten Monat.",
    gaps: "Summe der Tage ohne BD- oder HG-Besetzung.",
    deepMoves: "Anzahl zusätzlicher Optimierungsschritte in der finalen Suchphase."
  };
  const body = document.getElementById("ap-body");
  
  body.style.height = "auto";
  body.style.maxHeight = "72vh";
  body.style.overflowY = "auto";
  body.style.padding = "24px";
  body.style.display = "block";
  
  const applyBtn = document.getElementById("ap-apply");
  const reportBtn = document.getElementById("ap-report-btn");
  
  if (applyBtn) applyBtn.style.display = "";
  if (reportBtn) {
    reportBtn.style.display = "inline-flex";
  }

  const dayTag = (d) => {
    const wd = weekday(y, m, d);
    const hol = isHoliday(y, m, d, hols);
    const isWE = wd === 5 || wd === 6 || wd === 0;
    const cls = hol ? " ap-day-hol" : isWE ? " ap-day-we" : "";
    return `<span class="ap-day-tag${cls}">${DOW_ABBR[wd]}\u2009${d}.</span>`;
  };

  let html = `
    <div class="ap-result-hero">
      <div class="ap-result-score is-clickable" id="ap-score-trigger" data-tooltip="${qualityTooltips.score}">
        <span class="ap-result-score-kicker" title="${qualityTooltips.score}">Neural Fitness Index (NFI)</span>
        <strong>${quality.score}</strong>
        <span class="ap-result-score-sub">Maximalwert: 100.0</span>
      </div>
      <div class="ap-result-metrics">
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.bdSpread}"><span>BD-Streuung</span><strong>${quality.bdSpread}</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.hgSpread}"><span>HG-Streuung</span><strong>${quality.hgSpread}</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.weekendSpread}"><span>WE-Dienste</span><strong>${quality.weekendSpread}</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.wishes}"><span>Wünsche</span><strong>${Math.round(quality.wishFulfillmentRate * 100)}%</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.gaps}"><span>Lücken</span><strong>${quality.dutyCoverageMisses + quality.hgCoverageMisses}</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.deepMoves}"><span>Deep-Moves</span><strong>${quality.deepMoves}</strong></div>
      </div>
    </div>
  `;

  let bdHtml = `
    <div class="ap-table-wrap">
      <table class="ap-table">
        <thead>
          <tr>
            <th class="ap-th-name">Mitarbeitende</th>
            <th class="ap-th">Ziel</th>
            <th class="ap-th">Ist</th>
            <th class="ap-th-days">D-Tage</th>
            <th class="ap-th">WE-Soll</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  dutyEmps.forEach((e) => {
    const bd = summary.bd[e];
    const meta = getEmpMeta(e);
    const pc = posColor(meta.position);
    bdHtml += `
      <tr>
        <td class="ap-td-name" style="border-left:3px solid ${pc.border}">
          <span>${e}</span>
        </td>
        <td class="ap-td ap-td-num">${bd.target}</td>
        <td class="ap-td ap-td-num" style="font-weight:700;color:${bd.count >= bd.target ? '#15803D' : '#B91C1C'}">${bd.count}</td>
        <td class="ap-td ap-td-days">${bd.days.map(d => dayTag(d)).join("")}</td>
        <td class="ap-td ap-td-num">${bd.weDuty}</td>
      </tr>
    `;
  });
  
  bdHtml += `</tbody></table></div>`;
  
  html += `
    <div class="ap-collapse-wrap">
      <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')">
        <div class="ap-collapse-title">
          <span class="ap-sect-badge" style="background:#EF4444;color:#fff">D</span>
          Bereitschaftsdienst-Verteilung
        </div>
        <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="ap-collapse-content">
        <div class="ap-collapse-content-inner">
          <div class="ap-collapse-content-pad">${bdHtml}</div>
        </div>
      </div>
    </div>
  `;

  let hgHtml = `
    <div class="ap-table-wrap">
      <table class="ap-table">
        <thead>
          <tr>
            <th class="ap-th-name">Mitarbeitende</th>
            <th class="ap-th">HG-Anzahl</th>
            <th class="ap-th-days">HG-Tage</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  emps.filter(e => isFacharzt(e) && !isDutyExempt(e)).forEach((e) => {
    const hg = summary.hg[e];
    const meta = getEmpMeta(e);
    const pc = posColor(meta.position);
    hgHtml += `
      <tr>
        <td class="ap-td-name" style="border-left:3px solid ${pc.border}">
          <span>${e}</span>
        </td>
        <td class="ap-td ap-td-num" style="font-weight:700">${hg.count}</td>
        <td class="ap-td ap-td-days">${hg.days.map(d => dayTag(d)).join("")}</td>
      </tr>
    `;
  });
  
  hgHtml += `</tbody></table></div>`;

  html += `
    <div class="ap-collapse-wrap is-collapsed">
      <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')">
        <div class="ap-collapse-title">
          <span class="ap-sect-badge" style="background:#0EA5E9;color:#fff">HG</span>
          Hintergrunddienst-Verteilung
        </div>
        <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="ap-collapse-content">
        <div class="ap-collapse-content-inner">
          <div class="ap-collapse-content-pad">${hgHtml}</div>
        </div>
      </div>
    </div>
  `;

  if (summary.infos.length) {
    html += `
      <div class="ap-collapse-wrap is-collapsed">
        <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')">
          <div class="ap-collapse-title">
            <span class="ap-sect-badge" style="background:#0EA5E9;color:#fff">i</span>
            Verteilungs-Details
          </div>
          <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="ap-collapse-content">
          <div class="ap-collapse-content-inner">
            <div class="ap-collapse-content-pad">
              <div class="ap-infos">
                ${summary.infos.map(i => `<div class="ap-info-item">${i}</div>`).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (summary.warnings.length) {
    html += `
      <div class="ap-collapse-wrap">
        <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')">
          <div class="ap-collapse-title">
            <span class="ap-sect-badge" style="background:#F97316;color:#fff">!</span>
            Hinweise &amp; Warnungen
          </div>
          <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="ap-collapse-content">
          <div class="ap-collapse-content-inner">
            <div class="ap-collapse-content-pad">
              <div class="ap-warnings">
                ${summary.warnings.map(w => `<div class="ap-warn-item${w.startsWith('KRITISCH') ? ' ap-warn-item-critical' : ''}">${w}</div>`).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  html += `
    <div class="ap-config-actions" style="margin-top:20px">
      <button class="mbtn mbtn-ghost" id="ap-back-config">Konfiguration ändern &amp; neu berechnen</button>
    </div>
  `;
  
  body.innerHTML = html;
  
  document.getElementById("ap-back-config")?.addEventListener("click", () => {
    localApViewMode = "config";
    renderAutoPlanModal();
  });
  
  document.getElementById("ap-score-trigger")?.addEventListener("click", () => {
    openScoreInfoModal(localAutoPlanResult);
  });
}

export function renderReportModal() {
  if (!localAutoPlanResult || !localAutoPlanResult.report) return;
  
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const body = document.getElementById("ap-report-body");
  if (!body) return;
  
  body.innerHTML = "";
  
  const list = document.createElement("div");
  list.className = "ap-report-list";

  localAutoPlanResult.report.forEach((item) => {
    const wd = weekday(y, m, item.day);
    const dName = DOW_LONG[wd];
    const holNm = hols[dateKey(y, m, item.day)] || "";
    
    const itemEl = document.createElement("div");
    itemEl.className = "ap-report-item";
    itemEl.innerHTML = `
      <div class="ap-report-header">
        <span class="ap-report-date">${dName}, ${item.day}. ${MONTHS_SHORT[m]} ${holNm ? "(" + holNm + ")" : ""}</span>
        <span class="ap-report-duty ${item.duty}">${item.duty}</span>
        <span class="ap-report-emp">${item.emp}</span>
      </div>
      <div class="ap-report-body">${item.reason}</div>
      <div class="ap-report-tags">
        ${item.tags.map(t => `<span class="ap-report-tag">${t}</span>`).join("")}
      </div>
    `;
    list.appendChild(itemEl);
  });
  
  body.appendChild(list);
  showOverlay("modal-ap-report");
}

export function applyAutoPlan() {
  if (!localAutoPlanResult || !planMode) return;
  
  recordPlanHistory();
  planData.assignments = JSON.parse(JSON.stringify(localAutoPlanResult.assignments));
  
  const external = localAutoPlanResult.externalAssignments || {};
  let changed = false;
  
  for (const [mk, empMap] of Object.entries(external)) {
    if (!DATA[mk]) {
      DATA[mk] = { employees: [...planData.employees], assignments: {}, rbn: {} };
    }
    
    for (const [emp, dayMap] of Object.entries(empMap)) {
      if (!DATA[mk].employees.includes(emp)) {
        DATA[mk].employees.push(emp);
      }
      if (!DATA[mk].assignments[emp]) {
        DATA[mk].assignments[emp] = {};
      }
      for (const [day, patch] of Object.entries(dayMap)) {
        DATA[mk].assignments[emp][day] = { ...(DATA[mk].assignments[emp][day] || {}), ...patch };
        changed = true;
      }
    }
  }
  
  if (changed) {
    saveToStorage();
  }
  
  recordPlanHistory();
  hideOverlay("modal-autoplan");
  render();
  showToast("Auto-Plan erfolgreich übernommen");
  localAutoPlanResult = null;
}

export function wireEvents() {
  document.getElementById("btn-prev")?.addEventListener("click", () => changeMonth(-1));
  document.getElementById("btn-next")?.addEventListener("click", () => changeMonth(1));
  document.getElementById("btn-today")?.addEventListener("click", handleTodayClick);
  
  document.getElementById("btn-employees")?.addEventListener("click", () => {
    const { year: y } = state;
    const employees = getEmployeesForYear(y);
    if (!state.employeeDashboard.selectedEmp || !employees.includes(state.employeeDashboard.selectedEmp)) {
      state.employeeDashboard.selectedEmp = employees[0] || null;
    }
    const empSub = document.getElementById("emp-sub");
    if (empSub) {
      empSub.textContent = `Kalenderjahr ${y}`;
    }
    renderEmployeeDashboard();
    showOverlay("modal-emps");
    setTimeout(() => document.getElementById("emp-search")?.focus(), 80);
  });
  
  document.getElementById("month-label-btn")?.addEventListener("click", () => { 
    if (isPeriodFlyoutOpen()) {
      closePeriodFlyout(); 
    } else {
      openPeriodFlyout(); 
    }
  });
  
  document.getElementById("emp-open-period")?.addEventListener("click", openPeriodFlyout);
  document.getElementById("period-flyout-close")?.addEventListener("click", closePeriodFlyout);
  
  document.getElementById("period-month-select")?.addEventListener("change", (e) => { 
    state.periodDraft.month = parseInt(e.target.value, 10); 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-year-input")?.addEventListener("input", (e) => { 
    state.periodDraft.year = parseInt(e.target.value, 10) || state.year; 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-apply")?.addEventListener("click", applyPeriodDraft);
  
  document.getElementById("period-today")?.addEventListener("click", () => { 
    state.periodDraft = { year: TOD_Y, month: TOD_M }; 
    applyPeriodDraft(); 
    setTimeout(doScrollToToday, 150); 
  });
  
  document.getElementById("period-prev-month")?.addEventListener("click", () => { 
    const total = state.periodDraft.year * 12 + state.periodDraft.month - 1; 
    state.periodDraft.year = Math.floor(total / 12); 
    state.periodDraft.month = ((total % 12) + 12) % 12; 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-next-month")?.addEventListener("click", () => { 
    const total = state.periodDraft.year * 12 + state.periodDraft.month + 1; 
    state.periodDraft.year = Math.floor(total / 12); 
    state.periodDraft.month = ((total % 12) + 12) % 12; 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-prev-year")?.addEventListener("click", () => { 
    state.periodDraft.year -= 1; 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-next-year")?.addEventListener("click", () => { 
    state.periodDraft.year += 1; 
    syncPeriodControls(); 
  });
  
  document.getElementById("emp-search")?.addEventListener("input", (e) => { 
    state.employeeDashboard.filter = e.target.value; 
    renderEmployeeDashboard(); 
  });
  
  document.querySelectorAll(".empdash-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => { 
      state.employeeDashboard.detailView = btn.dataset.view; 
      renderEmployeeDashboard(); 
    });
  });
  
  document.addEventListener("click", (e) => {
    const flyout = document.getElementById("period-flyout");
    const trigger = document.getElementById("month-label-btn");
    const inlineBtn = document.getElementById("emp-open-period");
    
    if (!isPeriodFlyoutOpen()) return;
    if (flyout?.contains(e.target) || trigger?.contains(e.target) || inlineBtn?.contains(e.target)) {
      return;
    }
    
    closePeriodFlyout();
  });
  
  document.getElementById("btn-dept")?.addEventListener("click", () => {
    document.getElementById("btn-employees")?.click();
  });
  
  document.getElementById("btn-export")?.addEventListener("click", () => {
    doExport();
  });
  
  document.getElementById("btn-import")?.addEventListener("click", () => {
    openImportModal();
  });
  
  document.getElementById("btn-force-sync")?.addEventListener("click", async () => {
    if (!confirm("WARNUNG: Alle lokalen Entwürfe und ungespeicherten Änderungen werden gelöscht und durch den aktuellen Server-Stand ersetzt. Wirklich fortfahren?")) return;
    const success = await forceSyncWithServer();
    if (success) {
      ensurePostBDFreiDays();
      render();
      showToast("Lokale Daten verworfen und mit Server synchronisiert");
    } else {
      showToast("Fehler bei der Server-Synchronisation");
    }
  });
  
  document.getElementById("btn-plan")?.addEventListener("click", () => { 
    if (planMode) {
      closePlanMode(); 
    } else {
      enterPlanMode(); 
    }
  });
  
  document.getElementById("mnav-dept")?.addEventListener("click", () => {
    document.getElementById("btn-employees")?.click();
  });
  
  document.getElementById("mnav-plan")?.addEventListener("click", () => { 
    if (planMode) {
      closePlanMode(); 
    } else {
      enterPlanMode(); 
    }
  });
  
  document.getElementById("mnav-menu")?.addEventListener("click", () => showOverlay("modal-mobile-menu"));
  
  document.getElementById("mbtn-employees")?.addEventListener("click", () => { 
    hideOverlay("modal-mobile-menu"); 
    setTimeout(() => document.getElementById("btn-employees")?.click(), 180); 
  });
  
  document.getElementById("mbtn-today")?.addEventListener("click", () => { 
    hideOverlay("modal-mobile-menu"); 
    setTimeout(handleTodayClick, 180); 
  });
  
  document.getElementById("mbtn-export")?.addEventListener("click", () => { 
    hideOverlay("modal-mobile-menu"); 
    setTimeout(() => doExport(), 180); 
  });
  
  document.getElementById("mbtn-import")?.addEventListener("click", () => { 
    hideOverlay("modal-mobile-menu"); 
    setTimeout(() => openImportModal(), 180); 
  });

  document.getElementById("mbtn-force-sync")?.addEventListener("click", () => {
    hideOverlay("modal-mobile-menu");
    setTimeout(async () => {
      if (!confirm("WARNUNG: Alle lokalen Entwürfe und ungespeicherten Änderungen werden gelöscht und durch den aktuellen Server-Stand ersetzt. Wirklich fortfahren?")) return;
      const success = await forceSyncWithServer();
      if (success) {
        ensurePostBDFreiDays();
        render();
        showToast("Lokale Daten verworfen und mit Server synchronisiert");
      } else {
        showToast("Fehler bei der Server-Synchronisation");
      }
    }, 180);
  });
  
  document.getElementById("btn-plan-apply")?.addEventListener("click", () => { 
    if (!confirm("Planungsentwurf in den Hauptplan übernehmen?")) return; 
    applyPlanToMain(); 
  });
  
  document.getElementById("btn-plan-save")?.addEventListener("click", savePlanDraft);
  document.getElementById("btn-plan-abort")?.addEventListener("click", abortPlanChanges);
  document.getElementById("btn-plan-close")?.addEventListener("click", closePlanMode);
  document.getElementById("btn-plan-undo")?.addEventListener("click", undoPlan);
  document.getElementById("btn-plan-redo")?.addEventListener("click", redoPlan);
  document.getElementById("btn-plan-auto")?.addEventListener("click", openAutoPlanModal);
  document.getElementById("ap-apply")?.addEventListener("click", applyAutoPlan);
  
  document.getElementById("ed-save")?.addEventListener("click", () => {
    saveEditor();
  });
  
  document.getElementById("ed-cancel")?.addEventListener("click", () => hideOverlay("modal-editor"));
  
  document.getElementById("ed-clear")?.addEventListener("click", () => {
    if (planMode) recordPlanHistory();
    
    if (state.edit?.isRbnRow) {
      setRbnValue(state.year, state.month, state.edit.day, "");
    } else {
      clearCell(state.year, state.month, state.edit.emp, state.edit.day);
    }
    
    if (planMode) recordPlanHistory();
    hideOverlay("modal-editor");
    render();
  });
  
  document.getElementById("import-confirm")?.addEventListener("click", () => {
    doImport();
  });
  
  document.getElementById("dept-tab-month")?.addEventListener("click", () => {
    setDeptTab("month");
    document.querySelectorAll(".dept-tab").forEach((t) => t.classList.remove("active"));
    document.getElementById("dept-tab-month")?.classList.add("active");
    renderDeptContent();
  });
  
  document.getElementById("dept-tab-year")?.addEventListener("click", () => {
    setDeptTab("year");
    document.querySelectorAll(".dept-tab").forEach((t) => t.classList.remove("active"));
    document.getElementById("dept-tab-year")?.classList.add("active");
    renderDeptContent();
  });
  
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => hideOverlay(btn.dataset.close));
  });
  
  document.querySelectorAll(".overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => { 
      if (e.target === ov) hideOverlay(ov.id); 
    });
  });
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      [
        "modal-editor", "modal-emps", "modal-import", "modal-profile", "modal-dept", 
        "modal-autoplan", "modal-ap-report", "modal-mobile-menu", "modal-mobile-day", 
        "modal-score-info"
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.hasAttribute("hidden")) hideOverlay(id);
      });
      if (isPeriodFlyoutOpen()) closePeriodFlyout();
      return;
    }
    
    if (isEditorOpen()) {
      if (state.edit?.isRbnRow) {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === "s" || e.key === "S" || e.key === "Enter")) {
          e.preventDefault(); 
          saveEditor(); 
          return;
        }
      }
      
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (state.edit?.isRbnRow) return;
      
      if (noMod && e.key >= "1" && e.key <= "8") {
        const idx = parseInt(e.key, 10) - 1;
        if (!state.ed.st) { 
          e.preventDefault(); 
          const code = WORKPLACES[idx].code; 
          const i = state.ed.wp.indexOf(code); 
          if (i >= 0) {
            state.ed.wp.splice(i, 1); 
          } else {
            state.ed.wp.push(code); 
          }
          refreshEditorChips(); 
        }
        return;
      }
      
      if (noMod && (e.key === "d" || e.key === "D")) { 
        e.preventDefault(); 
        const owner = dutyOwner(state.year, state.month, state.edit.day, "D"); 
        if (!owner || owner === state.edit.emp) { 
          state.ed.duty = state.ed.duty === "D" ? null : "D"; 
          refreshEditorChips(); 
        } 
        return; 
      }
      
      if (noMod && (e.key === "h" || e.key === "H")) { 
        e.preventDefault(); 
        const owner = dutyOwner(state.year, state.month, state.edit.day, "HG"); 
        if (!owner || owner === state.edit.emp) { 
          state.ed.duty = state.ed.duty === "HG" ? null : "HG"; 
          refreshEditorChips(); 
        } 
        return; 
      }
      
      if (noMod && (e.key === "s" || e.key === "S")) { 
        e.preventDefault(); 
        saveEditor(); 
        return; 
      }
      
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const tag = (document.activeElement?.tagName || "").toUpperCase();
        const isCancel = ["ed-cancel", "ed-clear"].includes(document.activeElement?.id || "");
        if (tag !== "BUTTON" || (!isCancel && document.activeElement?.id === "ed-save")) { 
          if (tag !== "BUTTON") { 
            e.preventDefault(); 
            saveEditor(); 
          } 
        }
        return;
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "s") { 
      e.preventDefault(); 
      if (planMode) {
        savePlanDraft(); 
      } else {
        doExport(); 
      }
      return; 
    }
    
    if (planMode) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") { 
        e.preventDefault(); 
        undoPlan(); 
        return; 
      }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === "z") || e.key === "y")) { 
        e.preventDefault(); 
        redoPlan(); 
        return; 
      }
    }
    
    if (e.altKey && e.key === "ArrowLeft") {
      document.getElementById("btn-prev")?.click();
    }
    if (e.altKey && e.key === "ArrowRight") {
      document.getElementById("btn-next")?.click();
    }
  });
  
  const gridWrapper = document.getElementById("grid-wrapper");
  if (gridWrapper) {
    gridWrapper.addEventListener("wheel", (e) => { 
      if (e.deltaY !== 0 && Math.abs(e.deltaX) < 10) { 
        e.preventDefault(); 
        gridWrapper.scrollLeft += e.deltaY; 
      } 
    }, { passive: false });
  }
  
  initDragDrop();
  
  const apReportBtn = document.getElementById("ap-report-btn");
  if (apReportBtn) {
    apReportBtn.addEventListener("click", renderReportModal);
  }
}

export async function init() {
  await loadFromStorage();
  ensurePostBDFreiDays();
  
  if (!Object.keys(DATA).length && serverFetchSuccessful && serverLastModified === 0) {
    const k = monthKey(state.year, state.month);
    DATA[k] = {
      employees: [
        "Prof. Schäfer", "Dr. Lurz", "Dr. Polednia", "Fr. Dalitz", "Fr. Thaler", 
        "Dr. Becker", "Dr. Martin", "Hr. El Houba", "Fr. Licenji", "Hr. Torki", "Hr. Sebastian"
      ],
      assignments: {}, 
      rbn: {},
    };
    saveToStorage();
  }
  
  populatePeriodMonthSelect();
  syncPeriodControls();
  wireEvents();
  
  refreshResponsiveLayout({ forceRender: true });

  const apModal = document.getElementById("modal-autoplan");
  if (apModal) {
    new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === "hidden" && apModal.hasAttribute("hidden")) {
          if (neuralGraphInstance) {
            neuralGraphInstance.dispose();
            neuralGraphInstance = null;
          }
        }
      });
    }).observe(apModal, { attributes: true });
  }
  
  window.addEventListener("resize", () => {
    queueResponsiveRefresh();
  }, { passive: true });
  
  window.addEventListener("orientationchange", () => {
    queueResponsiveRefresh();
  }, { passive: true });
  
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      queueResponsiveRefresh();
    }, { passive: true });
  }

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
       const updated = await syncWithServer();
       if (updated) {
         ensurePostBDFreiDays();
       }
    }
  });

  window.addEventListener("radplan-sync-update", () => {
    render();
    showToast("Daten im Hintergrund aktualisiert");
  });

  window.addEventListener("radplan-sync-conflict", () => {
    render();
    showToast("Speicher-Konflikt: Aktuellster Server-Stand geladen");
  });

  window.addEventListener("radplan-save-start", () => {
    showToast("Wird gespeichert...");
  });

  window.addEventListener("radplan-save-success", () => {
    showToast("Erfolgreich gespeichert");
  });

  window.addEventListener("radplan-save-error", () => {
    showToast("Netzwerkfehler beim Speichern");
  });

  setInterval(async () => {
    if (document.visibilityState === "visible") {
      const updated = await syncWithServer();
      if (updated) {
        ensurePostBDFreiDays();
      }
    }
  }, 30000);
}

document.addEventListener("DOMContentLoaded", init);

window.openScoreInfoModal = () => {
  if (localAutoPlanResult) {
    openScoreInfoModal(localAutoPlanResult);
  }
};
