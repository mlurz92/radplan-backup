import { 
  WORKPLACES, 
  STATUSES, 
  CODE_MAP, 
  MONTHS, 
  MONTHS_SHORT, 
  DOW_ABBR, 
  DOW_LONG, 
  VACATION_CODES, 
  WISH_MAP,
  RBN_ROW_KEY,
  RBN_ROW_LABEL,
  isFacharzt, 
  isAssistenzarzt, 
  getEmpMeta, 
  posColor, 
  getSaxonyHolidaysCached, 
  dateKey, 
  daysInMonth, 
  weekday, 
  isWeekend, 
  isFriday, 
  isHoliday, 
  isWorkday,
  isTodayCol, 
  isoWeekNumber, 
  cellColor, 
  empInitials, 
  MOBILE_BREAKPOINT,
  isRbnMonthVisible,
  formatRbnDisplay
} from './constants.js';

import { 
  state, 
  planMode, 
  IS_MOBILE, 
  TOD_Y, 
  TOD_M, 
  TOD_D,
  deptTab,
  setIsMobile
} from './state.js';

import { 
  getMonthData, 
  getCell, 
  getRbnValue, 
  dayCodeCount, 
  buildProfileStats, 
  buildYearlyStats, 
  getEmployeesForYear, 
  getRoleFilterBuckets, 
  getEmployeeYearCardMetrics, 
  matchRoleFilter,
  addEmployee,
  removeEmployee
} from './model.js';

import { 
  openEditor, 
  getWish,
  isPeriodFlyoutOpen,
  syncPeriodControls
} from './app.js';

import { autoPlanResult } from './autoplan.js';

const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
  if (url.includes('/api?action=save')) {
    showToast("🔄 Speichere Daten...");
    return new Response(JSON.stringify({ success: true }), { 
      status: 200, 
      statusText: "OK",
      headers: { 'Content-Type': 'application/json' }
    });
  } else if (url.includes('/api?action=load')) {
    return new Response(JSON.stringify({ error: "Lokaler Cache aktiv" }), { 
      status: 400, 
      statusText: "Bad Request",
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return originalFetch.apply(this, args);
};

export function getViewportWidth() {
  const vv = window.visualViewport?.width;
  const dw = document.documentElement?.clientWidth;
  const ww = window.innerWidth;
  return Math.min(...[vv, dw, ww].filter((v) => Number.isFinite(v) && v > 0));
}

export function getViewportHeight() {
  return window.visualViewport?.height || window.innerHeight || document.documentElement?.clientHeight || 0;
}

export function updateModalLayout(target) {
  const overlay = typeof target === "string" ? document.getElementById(target) : target;
  if (!overlay || overlay.hasAttribute("hidden")) return;
  
  const modal = overlay.querySelector(".modal");
  if (!modal) return;
  
  const viewportH = getViewportHeight();
  const viewportW = getViewportWidth();
  
  const mobileSheet = document.body.classList.contains("is-mobile") && 
                      overlay.id !== "modal-mobile-menu" && 
                      overlay.id !== "modal-mobile-day";
                      
  const pad = mobileSheet ? 0 : Math.max(10, Math.min(24, viewportW * 0.024));
  const availableH = Math.max(280, Math.floor(viewportH - pad * 2));
  
  modal.style.setProperty("--modal-max-height", `${availableH}px`);
  
  requestAnimationFrame(() => {
    const naturalHeight = modal.scrollHeight;
    const fitsViewport = naturalHeight <= availableH;
    modal.classList.toggle("modal-fit-content", fitsViewport);
    modal.classList.toggle("modal-fit-viewport", !fitsViewport);
  });
}

export function updateOpenModalLayouts() {
  document.querySelectorAll(".overlay:not([hidden])").forEach((overlay) => {
    updateModalLayout(overlay);
  });
}

export function refreshResponsiveLayout(options = {}) {
  const { forceRender = false } = options;
  const width = getViewportWidth();
  const coarsePointer = window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : false;
  const touchLike = coarsePointer || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const nextMobile = width <= MOBILE_BREAKPOINT || (touchLike && width <= 820);
  
  const changed = nextMobile !== IS_MOBILE;
  setIsMobile(nextMobile);
  document.body.classList.toggle("is-mobile", IS_MOBILE);
  
  if (!changed && !forceRender) {
    updateOpenModalLayouts();
    return false;
  }
  
  if (!IS_MOBILE) {
    hideOverlay("modal-mobile-menu");
    hideOverlay("modal-mobile-day");
  }
  
  render();
  refreshOpenContextPanels();
  updateOpenModalLayouts();
  
  return true;
}

let responsiveRefreshTimer = null;
let responsiveRefreshQueued = false;

export function queueResponsiveRefresh() {
  if (responsiveRefreshTimer) {
    clearTimeout(responsiveRefreshTimer);
  }
  if (responsiveRefreshQueued) {
    return;
  }
  responsiveRefreshQueued = true;
  responsiveRefreshTimer = setTimeout(() => {
    responsiveRefreshTimer = null;
    requestAnimationFrame(() => {
      responsiveRefreshQueued = false;
      refreshResponsiveLayout();
    });
  }, 90);
}

export function scrollToToday() {
  if (state.year !== TOD_Y || state.month !== TOD_M) {
    showToast(`Heute liegt in ${MONTHS[TOD_M]} ${TOD_Y}`);
    return;
  }

  const mobileTodayCard = document.querySelector(".mobile-day-card.mdc-today");
  if (mobileTodayCard) {
    mobileTodayCard.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    return;
  }

  const todayCol = document.querySelector("#plan-thead th.today");
  const todayCell = document.querySelector("#plan-tbody td.today-col");
  const gridWrapper = document.getElementById("grid-wrapper");

  if (todayCell) {
    todayCell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  if (gridWrapper && todayCol) {
    const targetX = todayCol.offsetLeft - Math.max(0, (gridWrapper.clientWidth - todayCol.offsetWidth) / 2);
    gridWrapper.scrollTo({ left: Math.max(0, targetX), behavior: "smooth" });
  }
}

export function refreshOpenContextPanels() {
  const deptModal = document.getElementById("modal-dept");
  if (deptModal && !deptModal.hasAttribute("hidden")) {
    renderDeptContent();
  }
  
  const empModal = document.getElementById("modal-emps");
  if (empModal && !empModal.hasAttribute("hidden")) {
    renderEmployeeDashboard();
  }
  
  const profileModal = document.getElementById("modal-profile");
  if (profileModal && !profileModal.hasAttribute("hidden") && state.profileEmp) {
    openProfileModal(state.profileEmp);
  }
}

export function render() {
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  
  const monthLabel = document.getElementById("month-label");
  if (monthLabel) {
    monthLabel.textContent = `${MONTHS[m]} ${y}`;
  }
  
  syncPeriodControls();
  
  const todayBtn = document.getElementById("btn-today");
  if (todayBtn) {
    todayBtn.classList.toggle("today-btn-active", y === TOD_Y && m === TOD_M);
  }
  
  const planBar = document.getElementById("plan-bar");
  if (planBar) {
    if (planMode) {
      planBar.removeAttribute("hidden");
      planBar.style.display = "flex";
      document.body.classList.add("plan-mode-active");
      const lbl = document.getElementById("plan-bar-month");
      if (lbl) {
        lbl.textContent = `${MONTHS[m]} ${y}`;
      }
    } else {
      planBar.setAttribute("hidden", "");
      planBar.style.display = "none";
      document.body.classList.remove("plan-mode-active");
    }
  }
  
  if (IS_MOBILE) {
    renderMobileView();
    updateOpenModalLayouts();
    return;
  }
  
  renderStatsBar(y, m, dim, md);
  renderThead(y, m, dim, hols);
  renderTbody(y, m, dim, hols, md);
  renderTfoot(y, m, dim, md);
  updateOpenModalLayouts();
}

export function renderStatsBar(y, m, dim, md) {
  const bar = document.getElementById("stats-bar");
  bar.innerHTML = "";
  
  const empCount = document.createElement("div");
  empCount.className = "stat-item stat-item-emp";
  empCount.innerHTML = `
    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
    <span class="stat-count">${md.employees.length}</span>
    <span class="stat-label-sm">MA</span>
  `;
  bar.appendChild(empCount);
  
  const totals = {};
  [...WORKPLACES.map((w) => w.code), ...STATUSES.map((s) => s.code), "D", "HG"].forEach((c) => {
    totals[c] = 0;
  });
  
  for (let d = 1; d <= dim; d++) {
    md.employees.forEach((emp) => {
      const cell = md.assignments?.[emp]?.[d] || {};
      if (cell.assignment) {
        cell.assignment.split("/").map((x) => x.trim()).forEach((c) => { 
          if (c in totals) totals[c]++; 
        });
      }
      if (cell.duty && cell.duty in totals) {
        totals[cell.duty]++;
      }
    });
  }
  
  const order = [
    ...WORKPLACES.map((w) => w.code),
    "D", "HG", "U", "K", "F", "WB", "FZA", "ZU", "SU", "KK", "§15c"
  ];
  
  let any = false;
  
  order.forEach((code) => {
    const v = totals[code];
    if (!v) return;
    any = true;
    
    const meta = CODE_MAP[code];
    const isD = code === "D";
    const isHG = code === "HG";
    
    const bg = isD ? "#EF4444" : isHG ? "#0EA5E9" : meta?.bg || "#E2E8F0";
    const fg = isD || isHG ? "#fff" : meta?.fg || "#374151";
    
    const div = document.createElement("div");
    div.className = "stat-item";
    div.innerHTML = `
      <span class="stat-code" style="background:${bg};color:${fg}">${code}</span>
      <span class="stat-count">${v}</span>
    `;
    bar.appendChild(div);
  });
  
  if (!any && !md.employees.length) {
    bar.innerHTML = `<span id="stats-empty">Keine Daten</span>`;
  }
}

export function renderThead(y, m, dim, hols) {
  const thead = document.getElementById("plan-thead");
  thead.innerHTML = "";
  
  const tr = document.createElement("tr");
  const thC = document.createElement("th");
  thC.className = "th-corner";
  thC.innerHTML = '<div class="th-corner-inner">Mitarbeitende</div>';
  tr.appendChild(thC);
  
  let prevKW = -1;
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    const hol = isHoliday(y, m, d, hols);
    const we = isWeekend(y, m, d);
    const isT = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);
    const fri = isFriday(y, m, d);
    const kw = isoWeekNumber(y, m, d);
    const showKW = (wd === 1 || (d === 1 && wd !== 1)) && kw !== prevKW;
    
    if (showKW) {
      prevKW = kw;
    }
    
    const hn = hols[dateKey(y, m, d)] || "";
    const th = document.createElement("th");
    
    let cls = "th-day ";
    cls += hol ? "hol" : we ? "we" : "wd";
    if (isT) cls += " today";
    if (fri) cls += " is-fri";
    
    th.className = cls;
    th.innerHTML = `
      <div class="th-day-inner">
        <span class="d-kw">${showKW ? "KW" + kw : ""}</span>
        <span class="d-num">${d}</span>
        <span class="d-dow">${DOW_ABBR[wd]}</span>
        ${hn ? `<span class="d-hol">${hn}</span>` : ""}
      </div>
    `;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
}

export function renderTbody(y, m, dim, hols, md) {
  const tbody = document.getElementById("plan-tbody");
  tbody.innerHTML = "";
  
  if (!md.employees.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = dim + 1;
    td.className = "td-empty";
    td.innerHTML = `<div class="empty-inner"><p class="empty-title">Keine Mitarbeitenden</p></div>`;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  
  md.employees.forEach((emp) => {
    const meta = getEmpMeta(emp);
    const pc = posColor(meta.position);
    
    const tr = document.createElement("tr");
    const tdN = document.createElement("td");
    tdN.className = "td-name";
    tdN.style.borderLeft = `3px solid ${pc.border}`;
    tdN.style.paddingLeft = "11px";
    tdN.setAttribute("role", "button");
    tdN.setAttribute("tabindex", "0");
    
    let tdNHtml = `<span class="emp-label">${emp}</span>`;
    if (meta.position !== "—") {
      tdNHtml += `<span class="emp-pos-tag" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span>`;
    }
    tdNHtml += `
      <span class="emp-profile-icon">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </span>
      <button class="emp-del">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M1 1l7 7M8 1L1 8"/>
        </svg>
      </button>
    `;
    tdN.innerHTML = tdNHtml;
    
    tdN.querySelector(".emp-del").addEventListener("click", (e) => { 
      e.stopPropagation(); 
      import('./app.js').then(module => module.confirmRemoveEmployee(emp));
    });
    
    tdN.addEventListener("click", () => openProfileModal(emp));
    tdN.addEventListener("keydown", (e) => { 
      if (e.key === "Enter" || e.key === " ") { 
        e.preventDefault(); 
        openProfileModal(emp); 
      } 
    });
    
    tr.appendChild(tdN);
    
    for (let d = 1; d <= dim; d++) {
      const cell = md.assignments?.[emp]?.[d] || {};
      const we = isWeekend(y, m, d);
      const hol = isHoliday(y, m, d, hols);
      const isT = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);
      const fri = isFriday(y, m, d);
      
      const emptyWd = !we && !hol && !cell.assignment && !cell.duty;
      const isAutoFRest = cell.assignment === "F" && (we || hol);
      const { bg, fg } = cellColor(cell.assignment);
      
      const tdEl = document.createElement("td");
      let cls = "td-cell";
      if (hol) cls += " hol";
      if (we) cls += " we";
      if (isT) cls += " today";
      if (fri) cls += " is-fri";
      if (emptyWd) cls += " empty-wd";
      if (isAutoFRest) cls += " auto-f-rest";
      
      tdEl.className = cls;
      tdEl.tabIndex = 0;
      
      if (cell.assignment && !isAutoFRest) {
        tdEl.style.backgroundColor = bg;
      }
      
      let innerHtml = `<div class="cell-inner">`;
      innerHtml += `<span class="cell-assign" style="color:${isAutoFRest ? "rgba(71,85,105,0.35)" : fg}">${cell.assignment || ""}</span>`;
      if (cell.duty) {
        innerHtml += `<span class="cell-duty badge-${cell.duty}">${cell.duty}</span>`;
      }
      if (planMode && getWish(emp, d)) {
        const wishCode = getWish(emp, d);
        const icon = WISH_MAP[wishCode]?.icon || "";
        innerHtml += `<span class="cell-wish wish-${wishCode}">${icon}</span>`;
      }
      innerHtml += `</div>`;
      tdEl.innerHTML = innerHtml;
      
      tdEl.addEventListener("click", () => openEditor(emp, d));
      tdEl.addEventListener("keydown", (e) => { 
        if (e.key === "Enter" || e.key === " ") { 
          e.preventDefault(); 
          openEditor(emp, d); 
        } 
      });
      tr.appendChild(tdEl);
    }
    tbody.appendChild(tr);
  });
  
  if (isRbnMonthVisible(y, m)) {
    const tr = document.createElement("tr");
    tr.className = "tr-rbn";
    
    const tdN = document.createElement("td");
    tdN.className = "td-name td-name-rbn";
    tdN.style.borderLeft = "3px solid #0EA5E9";
    tdN.style.paddingLeft = "11px";
    tdN.innerHTML = `<span class="emp-label">${RBN_ROW_LABEL}</span>`;
    tr.appendChild(tdN);
    
    for (let d = 1; d <= dim; d++) {
      const we = isWeekend(y, m, d);
      const hol = isHoliday(y, m, d, hols);
      const isT = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);
      const fri = isFriday(y, m, d);
      const rbnValue = getRbnValue(y, m, d);
      
      const tdEl = document.createElement("td");
      let cls = "td-cell td-cell-rbn";
      if (hol) cls += " hol";
      if (we) cls += " we";
      if (isT) cls += " today";
      if (fri) cls += " is-fri";
      
      tdEl.className = cls;
      tdEl.tabIndex = 0;
      tdEl.innerHTML = `
        <div class="cell-inner">
          <span class="cell-assign cell-assign-rbn">${formatRbnDisplay(rbnValue)}</span>
        </div>
      `;
      
      tdEl.addEventListener("click", () => openEditor(RBN_ROW_KEY, d));
      tdEl.addEventListener("keydown", (e) => { 
        if (e.key === "Enter" || e.key === " ") { 
          e.preventDefault(); 
          openEditor(RBN_ROW_KEY, d); 
        } 
      });
      tr.appendChild(tdEl);
    }
    tbody.appendChild(tr);
  }
}

export function renderTfoot(y, m, dim, md) {
  const tfoot = document.getElementById("plan-tfoot");
  tfoot.innerHTML = "";
  
  const hols = getSaxonyHolidaysCached(y);
  const rows = [
    { code: "MR", label: "MRT", meta: CODE_MAP["MR"] },
    { code: "CT", label: "CT", meta: CODE_MAP["CT"] },
    { code: "D", label: "Bereitschaftsdienst", meta: null },
    { code: "HG", label: "Hintergrunddienst", meta: null },
  ];
  
  rows.forEach(({ code, label, meta }, rowIdx) => {
    const isD = code === "D";
    const isHG = code === "HG";
    
    const bg = isD ? "#EF4444" : isHG ? "#0EA5E9" : meta.bg;
    const fg = isD || isHG ? "#fff" : meta.fg;
    
    const tr = document.createElement("tr");
    tr.className = "tr-stat" + (rowIdx === 0 ? " tr-stat-first" : "");
    
    const tdL = document.createElement("td");
    tdL.className = "td-stat-lbl";
    tdL.innerHTML = `
      <span class="stat-lbl-badge" style="background:${bg};color:${fg}">${code}</span>
      <span class="stat-lbl-text">${label}</span>
    `;
    tr.appendChild(tdL);
    
    for (let d = 1; d <= dim; d++) {
      const val = dayCodeCount(y, m, d, code);
      const we = isWeekend(y, m, d);
      const hol = isHoliday(y, m, d, hols);
      const fri = isFriday(y, m, d);
      const isT = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);
      
      const td = document.createElement("td");
      let cls = "td-stat-val";
      
      if (we || hol) {
        cls += " dim";
      } else if ((isD || isHG) && val > 1) {
        cls += " warn";
      } else if (val > 0) {
        cls += " nz";
      }
      
      if (isT) cls += " today-col";
      if (fri) cls += " is-fri";
      
      td.className = cls;
      td.textContent = val > 0 ? val : "";
      tr.appendChild(td);
    }
    tfoot.appendChild(tr);
  });
}

export function renderMobileView() {
  const { year: y, month: m } = state;
  document.body.classList.add("is-mobile");
  renderMobileSummary(y, m);
  renderMobileDayList(y, m);
}

export function renderMobileSummary(y, m) {
  const summaryEl = document.getElementById("mobile-month-summary");
  if (!summaryEl) return;
  
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  const totals = {};
  
  [...WORKPLACES.map(w => w.code), ...STATUSES.map(s => s.code), "D", "HG"].forEach(c => { 
    totals[c] = 0; 
  });
  
  for (let d = 1; d <= dim; d++) {
    md.employees.forEach(emp => {
      const cell = md.assignments?.[emp]?.[d] || {};
      if (cell.assignment) {
        cell.assignment.split("/").map(x => x.trim()).forEach(c => { 
          if (c in totals) totals[c]++; 
        });
      }
      if (cell.duty && cell.duty in totals) {
        totals[cell.duty]++;
      }
    });
  }
  
  const order = ["D", "HG", "U", "K", "F", "MR", "CT", "US", "WB", "FZA", "ZU", "SU", "KK", "§15c", "AN", "MA", "KUS", "W", "T"];
  
  let html = `
    <div class="mms-item mms-item-emp">
      <span class="mms-val">${md.employees.length}</span>
      <span class="mms-code">MA</span>
    </div>
  `;
  
  order.forEach(code => {
    const v = totals[code];
    if (!v) return;
    
    const meta = CODE_MAP[code];
    const isD = code === "D";
    const isHG = code === "HG";
    
    const bg = isD ? "#EF4444" : isHG ? "#0EA5E9" : meta?.bg || "#E2E8F0";
    const fg = isD || isHG ? "#fff" : meta?.fg || "#374151";
    
    html += `
      <div class="mms-item">
        <span class="mms-code" style="background:${bg};color:${fg};padding:1px 5px;border-radius:3px;font-size:8px;font-weight:700;font-family:var(--font-mono)">${code}</span>
        <span class="mms-val">${v}</span>
      </div>
    `;
  });
  
  summaryEl.innerHTML = html;
}

export function renderMobileDayList(y, m) {
  const listEl = document.getElementById("mobile-day-list");
  if (!listEl) return;
  
  const hols = getSaxonyHolidaysCached(y);
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  
  listEl.innerHTML = "";
  let prevKW = -1;
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    const hol = isHoliday(y, m, d, hols);
    const holName = hols[dateKey(y, m, d)] || "";
    const isToday = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);
    const kw = isoWeekNumber(y, m, d);
    
    if (wd === 1 && kw !== prevKW) {
      prevKW = kw;
      const sep = document.createElement("div");
      sep.className = "mobile-week-sep";
      sep.textContent = `KW ${kw}`;
      listEl.appendChild(sep);
    }
    
    const bdHolder = md.employees.find(e => md.assignments?.[e]?.[d]?.duty === "D") || null;
    const hgHolder = md.employees.find(e => md.assignments?.[e]?.[d]?.duty === "HG") || null;
    const allAssigns = [];
    
    md.employees.forEach(emp => {
      const cell = md.assignments?.[emp]?.[d] || {};
      if (cell.assignment) {
        cell.assignment.split("/").map(x => x.trim()).filter(Boolean).forEach(code => {
          if (!allAssigns.find(a => a.code === code)) {
            const meta = CODE_MAP[code];
            if (meta) {
              allAssigns.push({ code, bg: meta.bg, fg: meta.fg });
            }
          }
        });
      }
    });
    
    const card = document.createElement("div");
    let cardCls = "mobile-day-card";
    if (hol) cardCls += " mdc-hol";
    else if (wd === 0 || wd === 6) cardCls += " mdc-we";
    if (isToday) cardCls += " mdc-today";
    
    card.className = cardCls;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    
    let dutyHtml = "";
    if (bdHolder) {
      const shortName = bdHolder.split(" ").pop();
      dutyHtml += `<span class="mdc-duty-badge mdc-d"><span class="mdc-duty-letter">D</span><span class="mdc-duty-name">${shortName}</span></span>`;
    }
    if (hgHolder) {
      const shortName = hgHolder.split(" ").pop();
      dutyHtml += `<span class="mdc-duty-badge mdc-hg"><span class="mdc-duty-letter">H</span><span class="mdc-duty-name">${shortName}</span></span>`;
    }
    if (!bdHolder && !hgHolder) {
      dutyHtml = `<span class="mdc-empty-duty">kein Dienst</span>`;
    }
    
    let assignHtml = "";
    const shown = allAssigns.slice(0, 5);
    shown.forEach(a => {
      assignHtml += `<span class="mdc-assign-chip" style="background:${a.bg};color:${a.fg}">${a.code}</span>`;
    });
    if (allAssigns.length > 5) {
      assignHtml += `<span class="mdc-assign-more">+${allAssigns.length - 5}</span>`;
    }
    
    const planWishIndicator = planMode ? `<span class="mdc-plan-badge"></span>` : "";
    
    card.innerHTML = `
      <div class="mdc-date">
        <span class="mdc-day-num">${d}</span>
        <span class="mdc-day-dow">${DOW_ABBR[wd]}</span>
        ${d === 1 || wd === 1 ? `<span class="mdc-day-kw">KW${kw}</span>` : ""}
      </div>
      <div class="mdc-divider"></div>
      <div class="mdc-content">
        ${hol ? `<div class="mdc-hol-label">${holName}</div>` : ""}
        <div class="mdc-duties">${dutyHtml}</div>
        ${allAssigns.length ? `<div class="mdc-assigns">${assignHtml}</div>` : ""}
      </div>
      <div class="mdc-arrow">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      ${planWishIndicator}
    `;
    
    card.addEventListener("click", () => import('./app.js').then(m => m.openMobileDay(d)));
    card.addEventListener("keydown", e => { 
      if (e.key === "Enter" || e.key === " ") { 
        e.preventDefault(); 
        import('./app.js').then(m => m.openMobileDay(d)); 
      } 
    });
    
    listEl.appendChild(card);
    
    if (isToday) {
      setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    }
  }
}

export function openProfileModal(empName) {
  const { year: y, month: m } = state;
  const meta = getEmpMeta(empName);
  const pc = posColor(meta.position);
  const ini = empInitials(empName);
  const hols = getSaxonyHolidaysCached(y);
  
  const s = buildProfileStats(y, m, empName);
  const ys = buildYearlyStats(empName, y);
  
  const avatarEl = document.getElementById("pm-avatar");
  if (avatarEl) {
    avatarEl.textContent = ini;
    avatarEl.style.background = `linear-gradient(135deg,${pc.border},${pc.fg})`;
  }
  
  state.profileEmp = empName;
  
  const nameEl = document.getElementById("pm-name");
  if (nameEl) {
    nameEl.textContent = meta.fullName !== empName ? meta.fullName : empName;
  }
  
  const subEl = document.getElementById("pm-sub");
  if (subEl) {
    subEl.textContent = `${MONTHS[m]} ${y} · ${s.totalWorkdays} Werktage`;
  }
  
  const metaRow = document.getElementById("pm-meta-row");
  if (metaRow) {
    let metaHtml = "";
    if (meta.position !== "—") {
      metaHtml += `<span class="pm-pos-pill" style="background:${pc.bg};color:${pc.fg}">${meta.position} · ${meta.posLabel}</span>`;
    }
    if (meta.area) {
      metaHtml += `<span class="pm-meta-chip pm-chip-area">${meta.area}</span>`;
    }
    if (meta.deputy) {
      metaHtml += `<span class="pm-meta-chip pm-chip-deputy">V: ${meta.deputy}</span>`;
    }
    metaRow.innerHTML = metaHtml;
  }
  
  const kpiEl = document.getElementById("pm-kpi");
  if (kpiEl) {
    const vac = VACATION_CODES.reduce((sum, c) => sum + (s.stCounts[c] || 0), 0);
    const sick = (s.stCounts["K"] || 0) + (s.stCounts["KK"] || 0);
    const fza = s.stCounts["FZA"] || 0;
    
    const requiredWorkdays = Math.max(0, s.totalWorkdays - s.totalAbs - s.frei);
    const covPct = requiredWorkdays > 0 ? Math.min(100, Math.round((s.totalActive / requiredWorkdays) * 100)) : 0;
    
    const kpis = [
      { label: "Werktage", val: s.totalWorkdays, sub: `${s.totalActive} Aktiv`, color: "#1D4ED8", pct: covPct },
      { label: "Nicht geplant", val: s.uncovered, sub: "offen", color: s.uncovered > 0 ? "#F97316" : "#15803D", pct: 0 },
      { label: "D-Dienste", val: s.dutyD.length, sub: `${s.dutyD.map(d => d + ".").join(" ") || "—"}`, color: "#EF4444", pct: 0 },
      { label: "HG-Dienste", val: s.dutyHG.length, sub: `${s.dutyHG.map(d => d + ".").join(" ") || "—"}`, color: "#0EA5E9", pct: 0 },
      { label: "Urlaub", val: vac, sub: "U/ZU/SU/§15c", color: "#7C3AED", pct: 0 },
      { label: "Krank", val: sick, sub: "K / KK", color: "#DC2626", pct: 0 },
      { label: "FZA", val: fza, sub: "Freizeitausgleich", color: "#3730A3", pct: 0 },
      { label: "Frei", val: s.frei, sub: "F-Tage", color: "#475569", pct: 0 },
    ];
    
    kpiEl.innerHTML = kpis.map(k => `
      <div class="kpi-card" style="border-top-color:${k.color}">
        <div class="kpi-head">
          <span class="kpi-label">${k.label}</span>
          <span class="kpi-icon">
            <svg width="12" height="12" fill="none" stroke="${k.color}" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9"/>
            </svg>
          </span>
        </div>
        <div class="kpi-value" style="color:${k.color}">${k.val}</div>
        <div class="kpi-sub">${k.sub}</div>
        ${k.pct > 0 ? `<div class="kpi-bar-wrap"><div class="kpi-bar-fill" style="width:${k.pct}%;background:${k.color}"></div></div>` : ""}
      </div>
    `).join("");
  }
  
  const wpChartEl = document.getElementById("pm-wp-chart");
  const wpHdEl = document.getElementById("pm-wp-hd");
  if (wpChartEl) {
    const wpEntries = Object.entries(s.wpCounts).sort((a, b) => b[1] - a[1]);
    if (wpEntries.length) {
      if (wpHdEl) wpHdEl.style.display = "";
      const maxV = wpEntries[0][1];
      const totalWP = s.totalActive;
      wpChartEl.innerHTML = wpEntries.map(([code, cnt]) => {
        const meta2 = CODE_MAP[code];
        const pct = totalWP > 0 ? Math.round((cnt/totalWP)*100) : 0;
        return `
          <div class="dist-row">
            <span class="dist-code" style="background:${meta2?.bg||"#f1f5f9"};color:${meta2?.fg||"#475569"}">${code}</span>
            <div class="dist-bar-bg">
              <div class="dist-bar-fill" style="width:${Math.round((cnt/maxV)*100)}%;background:${meta2?.fg||"#94a3b8"}"></div>
            </div>
            <span class="dist-count">${cnt}</span>
            <span class="dist-pct">${pct}%</span>
          </div>
        `;
      }).join("");
    } else {
      if (wpHdEl) wpHdEl.style.display = "none";
      wpChartEl.innerHTML = "";
    }
  }
  
  const stChartEl = document.getElementById("pm-st-chart");
  const stHdEl = document.getElementById("pm-st-hd");
  if (stChartEl) {
    const stEntries = Object.entries(s.stCounts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (stEntries.length) {
      if (stHdEl) stHdEl.style.display = "";
      const maxSt = stEntries[0][1];
      stChartEl.innerHTML = stEntries.map(([code, cnt]) => {
        const meta2 = CODE_MAP[code];
        return `
          <div class="dist-row">
            <span class="dist-code" style="background:${meta2?.bg||"#f1f5f9"};color:${meta2?.fg||"#475569"}">${code}</span>
            <div class="dist-bar-bg">
              <div class="dist-bar-fill" style="width:${Math.round((cnt/maxSt)*100)}%;background:${meta2?.fg||"#94a3b8"}"></div>
            </div>
            <span class="dist-count">${cnt}</span>
            <span class="dist-pct"></span>
          </div>
        `;
      }).join("");
    } else {
      if (stHdEl) stHdEl.style.display = "none";
      stChartEl.innerHTML = "";
    }
  }
  
  const dutyDetailEl = document.getElementById("pm-duty-detail");
  const dutyHdEl = document.getElementById("pm-duty-hd");
  if (dutyDetailEl) {
    if (s.dutyD.length || s.dutyHG.length) {
      if (dutyHdEl) dutyHdEl.style.display = "";
      let dHtml = "";
      
      if (s.dutyD.length) {
        const dayBadges = s.dutyD.map(d => {
          const wd = weekday(y, m, d);
          const hol = isHoliday(y, m, d, hols);
          const isWeOrHol = wd === 5 || wd === 6 || wd === 0 || hol;
          const cls = isWeOrHol ? ` style="background:#FEF3C7;color:#78350F;border-color:#FDE68A"` : "";
          return `<span class="duty-day-badge"${cls}>${DOW_ABBR[wd]} ${d}.</span>`;
        }).join("");
        dHtml += `
          <div class="duty-detail-group">
            <span class="duty-group-lbl badge-D">D</span>
            <div>
              <div class="duty-group-label">Bereitschaftsdienst</div>
              <div class="duty-group-days">${dayBadges}</div>
            </div>
          </div>
        `;
      }
      
      if (s.dutyHG.length) {
        const dayBadges = s.dutyHG.map(d => {
          const wd = weekday(y, m, d);
          const hol = isHoliday(y, m, d, hols);
          const isWeOrHol = wd === 5 || wd === 6 || wd === 0 || hol;
          const cls = isWeOrHol ? ` style="background:#E0F2FE;color:#0369A1;border-color:#7DD3FC"` : "";
          return `<span class="duty-day-badge"${cls}>${DOW_ABBR[wd]} ${d}.</span>`;
        }).join("");
        dHtml += `
          <div class="duty-detail-group">
            <span class="duty-group-lbl badge-HG">HG</span>
            <div>
              <div class="duty-group-label">Hintergrunddienst</div>
              <div class="duty-group-days">${dayBadges}</div>
            </div>
          </div>
        `;
      }
      dutyDetailEl.innerHTML = dHtml;
    } else {
      if (dutyHdEl) dutyHdEl.style.display = "none";
      dutyDetailEl.innerHTML = "";
    }
  }
  
  const calEl = document.getElementById("pm-cal");
  if (calEl) {
    const dim = daysInMonth(y, m);
    const firstWd = weekday(y, m, 1);
    
    let calHtml = `<div class="mcd-grid">`;
    DOW_ABBR.forEach((d, i) => {
      calHtml += `<div class="mcd-dow${(i === 0 || i === 6) ? " is-we" : ""}">${d}</div>`;
    });
    
    for (let i = 0; i < firstWd; i++) {
      calHtml += `<div class="mcd-ph"></div>`;
    }
    
    for (let d = 1; d <= dim; d++) {
      const wd = weekday(y, m, d);
      const hol = isHoliday(y, m, d, hols);
      const cell = getCell(y, m, empName, d);
      const isToday = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);
      
      let cls = "mcd";
      if (hol) cls += " mcd-hol";
      else if (wd === 0 || wd === 6) cls += " mcd-we";
      else if (!cell.assignment && !cell.duty) cls += " mcd-empty";
      
      if (isToday) cls += " mcd-today";
      
      const assign = cell.assignment || "";
      const duty = cell.duty || "";
      const { bg: cbg, fg: cfg } = cellColor(assign);
      const bgStyle = assign ? `background:${cbg}` : "";
      const interactive = (!hol && wd !== 0 && wd !== 6) ? ` role="button" tabindex="0"` : "";
      
      calHtml += `
        <div class="${cls}" style="${bgStyle}"${interactive} data-day="${d}">
          <span class="mcd-num">${d}</span>
          <span class="mcd-assign" style="color:${cfg}">${assign}</span>
          ${duty ? `<span class="mcd-duty badge-${duty}">${duty}</span>` : ""}
        </div>
      `;
    }
    calHtml += `</div>`;
    calEl.innerHTML = calHtml;
    
    calEl.querySelectorAll(".mcd[data-day]").forEach(el => {
      const dayNum = parseInt(el.dataset.day);
      const wd = weekday(y, m, dayNum);
      const hol = isHoliday(y, m, dayNum, hols);
      
      if (!hol && wd !== 0 && wd !== 6) {
        el.addEventListener("click", () => {
          hideOverlay("modal-profile");
          setTimeout(() => openEditor(empName, dayNum), 180);
        });
      }
    });
  }
  
  const yrEl = document.getElementById("pm-yearly");
  if (yrEl) {
    const kpiVals = [
      { lbl: "Aktiv", val: ys.totals.totalActive, color: "#1D4ED8" },
      { lbl: "Urlaub", val: ys.totals.vacationDays, color: "#7C3AED" },
      { lbl: "Krank", val: ys.totals.sickDays, color: "#DC2626" },
      { lbl: "FZA", val: ys.totals.fzaDays, color: "#3730A3" },
      { lbl: "D", val: ys.totals.dutyD, color: "#EF4444" },
      { lbl: "HG", val: ys.totals.dutyHG, color: "#0EA5E9" },
    ];
    
    let yrHtml = `<div class="yr-kpi-strip">`;
    kpiVals.forEach((k, i) => {
      if (i > 0) yrHtml += `<div class="yr-kpi-div"></div>`;
      yrHtml += `
        <div class="yr-kpi-item">
          <div class="yr-kpi-val" style="color:${k.color}">${k.val}</div>
          <div class="yr-kpi-lbl">${k.lbl}</div>
        </div>
      `;
    });
    yrHtml += `</div>`;
    
    yrHtml += `
      <div class="yr-table-wrap">
        <table class="yr-table">
          <thead>
            <tr>
              <th class="yr-th yr-th-month">Monat</th>
              <th class="yr-th">Aktiv</th>
              <th class="yr-th yr-th-vac">U</th>
              <th class="yr-th yr-th-sick">K</th>
              <th class="yr-th">FZA</th>
              <th class="yr-th">WB</th>
              <th class="yr-th yr-th-d">D</th>
              <th class="yr-th yr-th-hg">HG</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    ys.months.forEach(mon => {
      const isCur = mon.m === m;
      const vac = VACATION_CODES.reduce((s2, c) => s2 + (mon.stCounts[c] || 0), 0);
      const sick = (mon.stCounts["K"] || 0) + (mon.stCounts["KK"] || 0);
      const fza2 = mon.stCounts["FZA"] || 0;
      const wb = mon.stCounts["WB"] || 0;
      const rc = mon.hasData ? "" : " yr-row-empty";
      const totalActive = mon.totalActive;
      
      yrHtml += `
        <tr class="yr-row${isCur ? " yr-row-current" : ""}${rc}">
          <td class="yr-td-month">${MONTHS_SHORT[mon.m]}</td>
          <td class="yr-td yr-td-num">${mon.hasData && mon.totalWorkdays > 0 ? (totalActive || "—") : "—"}</td>
          <td class="yr-td yr-td-num yr-vac">${mon.hasData && vac ? vac : "—"}</td>
          <td class="yr-td yr-td-num yr-sick">${mon.hasData && sick ? sick : "—"}</td>
          <td class="yr-td yr-td-num">${mon.hasData && fza2 ? fza2 : "—"}</td>
          <td class="yr-td yr-td-num">${mon.hasData && wb ? wb : "—"}</td>
          <td class="yr-td yr-td-num yr-duty-d">${mon.hasData && mon.dutyD ? mon.dutyD : "—"}</td>
          <td class="yr-td yr-td-num yr-duty-hg">${mon.hasData && mon.dutyHG ? mon.dutyHG : "—"}</td>
        </tr>
      `;
    });
    
    yrHtml += `
          <tr class="yr-total-row">
            <td class="yr-total-lbl">Gesamt</td>
            <td class="yr-td yr-td-num yr-total">${ys.totals.totalActive || "—"}</td>
            <td class="yr-td yr-td-num yr-vac yr-total">${ys.totals.vacationDays || "—"}</td>
            <td class="yr-td yr-td-num yr-sick yr-total">${ys.totals.sickDays || "—"}</td>
            <td class="yr-td yr-td-num yr-total">${ys.totals.fzaDays || "—"}</td>
            <td class="yr-td yr-td-num yr-total">${ys.totals.wbDays || "—"}</td>
            <td class="yr-td yr-td-num yr-duty-d yr-total">${ys.totals.dutyD || "—"}</td>
            <td class="yr-td yr-td-num yr-duty-hg yr-total">${ys.totals.dutyHG || "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
    `;
    
    yrEl.innerHTML = yrHtml;
  }
  
  showOverlay("modal-profile");
}

export function showOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  
  el.removeAttribute("hidden");
  el.style.display = "flex";
  
  const mEl = el.querySelector(".modal");
  if (mEl) {
    mEl.classList.remove("modal-closing");
  }
  
  document.body.classList.add("modal-open");
  updateModalLayout(el);
  setTimeout(() => updateModalLayout(el), 60);
  
  const first = el.querySelector('[autofocus],[tabindex="0"],button:not([disabled]),input,textarea');
  if (first) {
    setTimeout(() => first.focus(), 60);
  }
}

export function hideOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  
  const mEl = el.querySelector(".modal");
  if (mEl) {
    mEl.classList.add("modal-closing");
    setTimeout(() => {
      el.setAttribute("hidden", "");
      el.style.display = "none";
      mEl.classList.remove("modal-closing");
      if (!document.querySelector(".overlay:not([hidden])")) {
        document.body.classList.remove("modal-open");
      }
    }, 160);
  } else {
    el.setAttribute("hidden", "");
    el.style.display = "none";
    if (!document.querySelector(".overlay:not([hidden])")) {
      document.body.classList.remove("modal-open");
    }
  }
}

export function openScoreInfoModal(resultData = autoPlanResult) {
  const body = document.getElementById("score-info-body");
  if (!body) return;

  const q = {
    score: Number(resultData?.summary?.quality?.score ?? resultData?.quality?.score) || 0,
    dutyGaps: Number(resultData?.summary?.quality?.dutyCoverageMisses ?? resultData?.quality?.dutyCoverageMisses) || 0,
    hgGaps: Number(resultData?.summary?.quality?.hgCoverageMisses ?? resultData?.quality?.hgCoverageMisses) || 0,
    bdSpread: Number(resultData?.summary?.quality?.bdSpread ?? resultData?.quality?.bdSpread) || 0,
    hgSpread: Number(resultData?.summary?.quality?.hgSpread ?? resultData?.quality?.hgSpread) || 0,
    weSpread: Number(resultData?.summary?.quality?.weekendSpread ?? resultData?.quality?.weekendSpread) || 0,
    wishes: Number(resultData?.summary?.quality?.wishFulfillmentRate ?? resultData?.quality?.wishFulfillmentRate) || 0,
    deepMoves: Number(resultData?.summary?.quality?.deepMoves ?? resultData?.quality?.deepMoves) || 0
  };

  const getRating = (s) => s >= 90 ? "Exzellent" : s >= 80 ? "Sehr Gut" : s >= 70 ? "Gut" : s >= 50 ? "Befriedigend" : "Optimierung empfohlen";
  const getTone = (s) => s >= 80 ? "#22C55E" : s >= 60 ? "#F59E0B" : "#EF4444";
  
  const metrics = [
    { label: "D-Abdeckung", val: q.dutyGaps === 0 ? "100%" : `${q.dutyGaps} Lücken`, weight: "D-Prio", hint: "Jede Lücke im Bereitschaftsdienst führt zu massiven Penalty-Abzügen (-15 Punkte pro fehlendem Dienst).", pct: Math.max(0, 100 - q.dutyGaps * 20), color: q.dutyGaps === 0 ? "#22C55E" : "#EF4444" },
    { label: "HG-Abdeckung", val: q.hgGaps === 0 ? "100%" : `${q.hgGaps} Lücken`, weight: "HG-Prio", hint: "Jede Lücke im Hintergrunddienst bestraft den Score (-10 Punkte pro fehlendem Dienst).", pct: Math.max(0, 100 - q.hgGaps * 20), color: q.hgGaps === 0 ? "#22C55E" : "#EF4444" },
    { label: "BD-Gerechtigkeit", val: `Δ ${q.bdSpread}`, weight: "Spread", hint: "Unterschied zwischen der Person mit den meisten und wenigsten Bereitschaftsdiensten. Exponentieller Abzug ab Δ > 1.", pct: Math.max(0, 100 - q.bdSpread * 15), color: q.bdSpread <= 1 ? "#22C55E" : "#F59E0B" },
    { label: "HG-Balance", val: `Δ ${q.hgSpread}`, weight: "Spread", hint: "Gleichmäßige Verteilung im Hintergrunddienst. Strafen skalieren mit zunehmender Ungerechtigkeit.", pct: Math.max(0, 100 - q.hgSpread * 20), color: q.hgSpread <= 1 ? "#22C55E" : "#F59E0B" },
    { label: "WE-Streuung", val: `Δ ${q.weSpread}`, weight: "Spread", hint: "Fairness der Wochenend- und Feiertagsdienste. Diese Dienste sind hoch gewichtet und müssen fair rotieren.", pct: Math.max(0, 100 - q.weSpread * 25), color: q.weSpread <= 1 ? "#22C55E" : "#F59E0B" },
    { label: "Wunscherfüllung", val: `${Math.round(q.wishes * 100)}%`, weight: "Bonus", hint: "Erfolgsrate der eingetragenen BD/HG-Wünsche. Erfüllte Wünsche generieren Bonuspunkte (bis zu +5.0 auf den Score).", pct: Math.round(q.wishes * 100), color: q.wishes >= 0.8 ? "#22C55E" : "#93C5FD" }
  ];

  let reasoningHtml = "";
  
  if (q.dutyGaps === 0) {
    reasoningHtml += `<div class="score-reasoning-item pos"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#22C55E" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><div class="score-r-text">Vollständige Bereitschaftsdienst-Abdeckung ohne Lücken.</div><span class="score-r-pts pos">±0.0</span></div>`;
  } else {
    reasoningHtml += `<div class="score-reasoning-item neg"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#EF4444" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div class="score-r-text"><strong>Kritisch:</strong> ${q.dutyGaps} unbesetzte D-Schichten. Der Algorithmus konnte keine passenden Kandidaten ohne Verletzung harter Constraints finden.</div><span class="score-r-pts neg">-${(q.dutyGaps * 15.0).toFixed(1)}</span></div>`;
  }
  
  if (q.hgGaps === 0) {
    reasoningHtml += `<div class="score-reasoning-item pos"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#22C55E" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><div class="score-r-text">Vollständige Hintergrunddienst-Abdeckung ohne Lücken.</div><span class="score-r-pts pos">±0.0</span></div>`;
  } else {
    reasoningHtml += `<div class="score-reasoning-item neg"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#EF4444" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div class="score-r-text"><strong>Kritisch:</strong> ${q.hgGaps} unbesetzte HG-Schichten. Möglicher Mangel an verfügbaren Fachärzten.</div><span class="score-r-pts neg">-${(q.hgGaps * 10.0).toFixed(1)}</span></div>`;
  }

  if (q.bdSpread <= 1) {
    reasoningHtml += `<div class="score-reasoning-item pos"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#22C55E" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><div class="score-r-text">Optimale Gleichverteilung der D-Dienste (Spread &le; 1). Höchstmögliche Fairness erreicht.</div><span class="score-r-pts pos">-${(q.bdSpread * 2.5).toFixed(1)}</span></div>`;
  } else {
    reasoningHtml += `<div class="score-reasoning-item neg"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#F59E0B" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><div class="score-r-text">Ungleiche Verteilung der D-Dienste detektiert. Die Varianz (Spread ${q.bdSpread}) führt zu exponentiellen Penalty-Abzügen.</div><span class="score-r-pts neg">-${(q.bdSpread * 2.5).toFixed(1)}</span></div>`;
  }
  
  if (q.hgSpread > 1) {
    reasoningHtml += `<div class="score-reasoning-item neg"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#F59E0B" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><div class="score-r-text">Suboptimale Hintergrund-Balance (Spread ${q.hgSpread}) unter den Fachärzten festgestellt.</div><span class="score-r-pts neg">-${(q.hgSpread * 1.5).toFixed(1)}</span></div>`;
  }
  
  if (q.wishes > 0) {
    reasoningHtml += `<div class="score-reasoning-item pos"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#22C55E" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><div class="score-r-text">Bonus für erfüllte Dienstwünsche (${Math.round(q.wishes * 100)}%). Dienstplanung berücksichtigt Präferenzen.</div><span class="score-r-pts pos">+${(q.wishes * 5.0).toFixed(1)}</span></div>`;
  }
  
  reasoningHtml += `<div class="score-reasoning-item neu"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#38BDF8" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><div class="score-r-text">Rechenkosten-Penalty für komplexe Umverteilungen. Der Algorithmus benötigte ${q.deepMoves} Deep-Moves zur Konvergenz.</div><span class="score-r-pts neg">-${(q.deepMoves * 0.005).toFixed(1)}</span></div>`;

  body.innerHTML = `
    <div class="score-dashboard">
      <header class="score-dash-head">
        <div class="score-main-circle" style="--score-color: ${getTone(q.score)}">
          <svg viewBox="0 0 36 36" class="score-ring">
            <path class="score-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <path class="score-ring-fill" stroke-dasharray="${q.score}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          </svg>
          <div class="score-val-box">
            <span class="score-num">${q.score.toFixed(1)}</span>
            <span class="score-pct-sign">NFI</span>
          </div>
        </div>
        <div class="score-dash-info">
          <h3 class="score-dash-rating" style="color: ${getTone(q.score)}">${getRating(q.score)}</h3>
          <p class="score-dash-desc">Der RadPlan Neural Scheduler hat <strong>${q.deepMoves}</strong> Optimierungs-Schritte durchgeführt, um die harte und weiche Constraint-Matrix in dieses lokale Minimum zu transformieren.</p>
        </div>
      </header>

      <div class="score-grid-enhanced">
        ${metrics.map(m => `
          <div class="score-card-enhanced" data-tooltip="${m.hint}" data-tooltip-pos="bottom">
            <div class="score-card-top">
              <span class="score-card-lbl">
                ${m.label}
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="opacity:0.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
              <span class="score-card-weight">${m.weight}</span>
            </div>
            <div class="score-card-mid">
              <span class="score-card-val" style="color: ${m.color}">${m.val}</span>
              <div class="score-card-bar"><div class="score-card-fill" style="width: ${m.pct}%; background: ${m.color}"></div></div>
            </div>
          </div>
        `).join("")}
      </div>

      <div class="score-math-box-enhanced">
        <div class="score-math-title">Punkte-Analyse &amp; Penalty-Metriken</div>
        <p class="score-math-text" style="margin-bottom:12px;">Der Algorithmus startet mit einem Basis-Score von 100.0 Punkten. Harte Regelverletzungen sind blockiert (Penalty = &infin;). Weiche Regelverletzungen werden mit spezifischen Gewichten abgezogen.</p>
        <div class="score-reasoning-list">
          ${reasoningHtml}
        </div>
      </div>
      
      <div class="score-formula-display">
        <span class="formula-lbl">Berechnungs-Basis (NFI):</span>
        <code>Fitness = 100 - (Lücken × G) - (Spread × G) + (Wünsche × G) - (Rechenkosten)</code>
      </div>
    </div>
  `;

  showOverlay("modal-score-info");
}

let toastTimer = null;

export function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  
  el.textContent = msg;
  el.classList.remove("visible");
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add("visible");
    });
  });
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("visible");
  }, 3400);
}

export function renderDeptContent() {
  const { year: y, month: m } = state;
  if (deptTab === "month") {
    renderDeptMonth(y, m);
  } else {
    renderDeptYear(y);
  }
}

export function renderDeptMonth(y, m) {
  const body = document.getElementById("dept-body");
  if (!body) return;
  
  const hols = getSaxonyHolidaysCached(y);
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  
  const deptHeadLine = document.getElementById("dept-context-line");
  if (deptHeadLine) {
    deptHeadLine.textContent = `${MONTHS[m]} ${y}`;
  }
  
  if (!md.employees.length) {
    body.innerHTML = `<div class="dept-empty"><p>Keine Daten</p></div>`;
    return;
  }
  
  let workdayCount = 0;
  let mrCov = 0;
  let ctCov = 0;
  let dCov = 0;
  let hgCov = 0;
  
  for (let d = 1; d <= dim; d++) {
    if (!isWorkday(y, m, d, hols)) continue;
    workdayCount++;
    
    let hasMR = false, hasCT = false, hasD = false, hasHG = false;
    
    md.employees.forEach((emp) => {
      const cell = md.assignments?.[emp]?.[d] || {};
      const assign = (cell.assignment || "").split("/").map((x) => x.trim());
      if (assign.includes("MR")) hasMR = true;
      if (assign.includes("CT")) hasCT = true;
      if (cell.duty === "D") hasD = true;
      if (cell.duty === "HG") hasHG = true;
    });
    
    if (hasMR) mrCov++;
    if (hasCT) ctCov++;
    if (hasD) dCov++;
    if (hasHG) hgCov++;
  }
  
  const pct = (v) => workdayCount > 0 ? Math.round((v / workdayCount) * 100) : 0;
  
  const covItems = [
    { label: "MR", val: mrCov, pct: pct(mrCov), color: "#1D4ED8", bg: "#DBEAFE" },
    { label: "CT", val: ctCov, pct: pct(ctCov), color: "#C2410C", bg: "#FFEDD5" },
    { label: "D", val: dCov, pct: pct(dCov), color: "#EF4444", bg: "#FEE2E2" },
    { label: "HG", val: hgCov, pct: pct(hgCov), color: "#0EA5E9", bg: "#E0F2FE" },
  ];
  
  let stripHtml = `
    <div class="dept-cov-strip">
      <div class="dept-cov-meta">
        <span class="dept-cov-meta-val">${workdayCount}</span>
        <span class="dept-cov-meta-lbl">Werktage</span>
      </div>
      <div class="dept-cov-meta">
        <span class="dept-cov-meta-val">${md.employees.length}</span>
        <span class="dept-cov-meta-lbl">Mitarbeitende</span>
      </div>
      <div class="dept-cov-bars">
  `;
  
  covItems.forEach((item) => {
    stripHtml += `
      <div class="dept-cov-bar-item">
        <div class="dept-cov-bar-head">
          <span class="dept-cov-code" style="background:${item.bg};color:${item.color}">${item.label}</span>
          <span class="dept-cov-fraction">${item.val}/${workdayCount}</span>
          <span class="dept-cov-pct" style="color:${item.pct >= 80 ? item.color : "#94A3B8"}">${item.pct}%</span>
        </div>
        <div class="dept-cov-bar-bg">
          <div class="dept-cov-bar-fill" style="width:${item.pct}%;background:${item.color}"></div>
        </div>
      </div>
    `;
  });
  
  stripHtml += `</div></div>`;
  
  const empStats = md.employees.map((emp) => {
    const s = buildProfileStats(y, m, emp);
    const meta = getEmpMeta(emp);
    const pc = posColor(meta.position);
    const vac = VACATION_CODES.reduce((sum, c) => sum + (s.stCounts[c] || 0), 0);
    const sick = (s.stCounts["K"] || 0) + (s.stCounts["KK"] || 0);
    const fza = s.stCounts["FZA"] || 0;
    const frei = s.stCounts["F"] || 0;
    return { emp, s, meta, pc, vac, sick, fza, frei };
  });
  
  const team = empStats.reduce((acc, { s, vac, sick, fza, frei }) => {
    acc.wp += s.totalActive;
    acc.vac += vac;
    acc.sick += sick;
    acc.fza += fza;
    acc.d += s.dutyD.length;
    acc.hg += s.dutyHG.length;
    acc.frei += frei;
    acc.offen += s.uncovered;
    return acc;
  }, { wp: 0, vac: 0, sick: 0, fza: 0, d: 0, hg: 0, frei: 0, offen: 0 });
  
  let rowsHtml = "";
  empStats.forEach(({ emp, s, meta, pc, vac, sick, fza, frei }) => {
    rowsHtml += `
      <tr class="dept-tr">
        <td class="dept-td-name" style="border-left:3px solid ${pc.border}">
          <span class="dept-emp-name">${emp}</span>
          ${meta.position !== "—" ? `<span class="dept-pos-badge" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span>` : ""}
        </td>
        <td class="dept-td dept-td-num">${s.totalActive || "—"}</td>
        <td class="dept-td dept-td-num">${s.wpCounts["MR"] || ""}</td>
        <td class="dept-td dept-td-num">${s.wpCounts["CT"] || ""}</td>
        <td class="dept-td dept-td-num dept-vac">${vac || ""}</td>
        <td class="dept-td dept-td-num dept-sick">${sick || ""}</td>
        <td class="dept-td dept-td-num">${fza || ""}</td>
        <td class="dept-td dept-td-num dept-duty-d">${s.dutyD.length || ""}</td>
        <td class="dept-td dept-td-num dept-duty-hg">${s.dutyHG.length || ""}</td>
        <td class="dept-td dept-td-num dept-frei">${frei || ""}</td>
        <td class="dept-td dept-td-num ${s.uncovered > 0 ? "dept-offen" : ""}">${s.uncovered || ""}</td>
      </tr>
    `;
  });
  
  const tableHtml = `
    <div class="dept-table-wrap">
      <table class="dept-table">
        <thead>
          <tr>
            <th class="dept-th-name">Mitarbeitende</th>
            <th class="dept-th">Aktiv</th>
            <th class="dept-th">MR</th>
            <th class="dept-th">CT</th>
            <th class="dept-th dept-th-vac">Urlaub</th>
            <th class="dept-th dept-th-sick">Krank</th>
            <th class="dept-th">FZA</th>
            <th class="dept-th dept-th-d">D</th>
            <th class="dept-th dept-th-hg">HG</th>
            <th class="dept-th">Frei</th>
            <th class="dept-th dept-th-offen">Offen</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="dept-total-row">
            <td class="dept-td-name dept-total-lbl">Gesamt&ensp;(${md.employees.length}&thinsp;MA)</td>
            <td class="dept-td dept-td-num dept-total">${team.wp || "—"}</td>
            <td class="dept-td dept-td-num dept-total" colspan="2"></td>
            <td class="dept-td dept-td-num dept-total dept-vac">${team.vac || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-sick">${team.sick || "—"}</td>
            <td class="dept-td dept-td-num dept-total">${team.fza || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-duty-d">${team.d || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-duty-hg">${team.hg || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-frei">${team.frei || "—"}</td>
            <td class="dept-td dept-td-num dept-total ${team.offen > 0 ? "dept-offen" : ""}">${team.offen || "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
  
  body.innerHTML = stripHtml + tableHtml;
}

export function renderDeptYear(year) {
  const body = document.getElementById("dept-body");
  if (!body) return;
  
  const deptHeadLine = document.getElementById("dept-context-line");
  if (deptHeadLine) {
    deptHeadLine.textContent = `Jahresübersicht ${year}`;
  }
  
  const allEmpsList = getEmployeesForYear(year);
  
  if (!allEmpsList.length) {
    body.innerHTML = `<div class="dept-empty"><p>Keine Daten für ${year}</p></div>`;
    return;
  }
  
  const empYS = allEmpsList.map((emp) => {
    return { 
      emp, 
      ys: buildYearlyStats(emp, year), 
      meta: getEmpMeta(emp) 
    };
  }).filter(({ ys }) => {
    return ys.totals.totalWorkdays > 0 || ys.totals.dutyD > 0 || ys.totals.dutyHG > 0;
  });
  
  if (!empYS.length) {
    body.innerHTML = `<div class="dept-empty"><p>Keine Daten</p></div>`;
    return;
  }
  
  const team = empYS.reduce((acc, { ys }) => {
    acc.wd += ys.totals.totalWorkdays;
    acc.cov += ys.totals.coveredWorkdays;
    acc.wp += ys.totals.totalActive;
    acc.vac += ys.totals.vacationDays;
    acc.sick += ys.totals.sickDays;
    acc.fza += ys.totals.fzaDays;
    acc.wb += ys.totals.wbDays;
    acc.d += ys.totals.dutyD;
    acc.hg += ys.totals.dutyHG;
    return acc;
  }, { wd: 0, cov: 0, wp: 0, vac: 0, sick: 0, fza: 0, wb: 0, d: 0, hg: 0 });
  
  const teamCovPct = team.wd > 0 ? Math.round((team.cov / team.wd) * 100) : 0;
  
  const stripHtml = `
    <div class="dept-yr-strip">
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val">${empYS.length}</span>
        <span class="dept-yr-kpi-lbl">Mitarbeitende</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val" style="color:#1D4ED8">${team.wp}</span>
        <span class="dept-yr-kpi-lbl">Aktiv-Tage</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val" style="color:#5B21B6">${team.vac}</span>
        <span class="dept-yr-kpi-lbl">Urlaub</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val" style="color:#991B1B">${team.sick}</span>
        <span class="dept-yr-kpi-lbl">Krank</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val">
          <span style="color:#EF4444">${team.d}</span>&thinsp;/&thinsp;<span style="color:#0EA5E9">${team.hg}</span>
        </span>
        <span class="dept-yr-kpi-lbl">D/HG</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val" style="color:${teamCovPct >= 80 ? "#15803D" : teamCovPct >= 60 ? "#854D0E" : "#991B1B"}">${teamCovPct}%</span>
        <span class="dept-yr-kpi-lbl">Abdeckung</span>
      </div>
    </div>
  `;
  
  let rowsHtml = "";
  empYS.forEach(({ emp, ys, meta }) => {
    const t = ys.totals;
    const pc = posColor(meta.position);
    
    const requiredWorkdays = Math.max(0, t.totalWorkdays - t.vacationDays - t.sickDays - t.fzaDays - t.wbDays - t.freiDays);
    const cov = requiredWorkdays > 0 ? Math.min(100, Math.round((t.totalActive / requiredWorkdays) * 100)) : 0;
    const covCls = cov >= 80 ? "dept-cov-good" : cov >= 60 ? "dept-cov-mid" : cov > 0 ? "dept-cov-low" : "";
    
    rowsHtml += `
      <tr class="dept-tr">
        <td class="dept-td-name" style="border-left:3px solid ${pc.border}">
          <span class="dept-emp-name">${emp}</span>
          ${meta.position !== "—" ? `<span class="dept-pos-badge" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span>` : ""}
        </td>
        <td class="dept-td dept-td-num">${t.totalActive || "—"}</td>
        <td class="dept-td dept-td-num dept-vac">${t.vacationDays || "—"}</td>
        <td class="dept-td dept-td-num dept-sick">${t.sickDays || "—"}</td>
        <td class="dept-td dept-td-num">${t.fzaDays || "—"}</td>
        <td class="dept-td dept-td-num">${t.wbDays || "—"}</td>
        <td class="dept-td dept-td-num dept-duty-d">${t.dutyD || "—"}</td>
        <td class="dept-td dept-td-num dept-duty-hg">${t.dutyHG || "—"}</td>
        <td class="dept-td dept-td-num ${covCls}">${t.totalWorkdays > 0 ? cov + "%" : "—"}</td>
      </tr>
    `;
  });
  
  const tableHtml = `
    <div class="dept-table-wrap">
      <table class="dept-table">
        <thead>
          <tr>
            <th class="dept-th-name">Mitarbeitende</th>
            <th class="dept-th">Aktiv-Tage</th>
            <th class="dept-th dept-th-vac">Urlaub</th>
            <th class="dept-th dept-th-sick">Krank</th>
            <th class="dept-th">FZA</th>
            <th class="dept-th">WB</th>
            <th class="dept-th dept-th-d">D</th>
            <th class="dept-th dept-th-hg">HG</th>
            <th class="dept-th">Abdeckung</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="dept-total-row">
            <td class="dept-td-name dept-total-lbl">Gesamt&ensp;(${empYS.length}&thinsp;MA)</td>
            <td class="dept-td dept-td-num dept-total">${team.wp || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-vac">${team.vac || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-sick">${team.sick || "—"}</td>
            <td class="dept-td dept-td-num dept-total">${team.fza || "—"}</td>
            <td class="dept-td dept-td-num dept-total">${team.wb || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-duty-d">${team.d || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-duty-hg">${team.hg || "—"}</td>
            <td class="dept-td dept-td-num dept-total ${teamCovPct >= 80 ? "dept-cov-good" : teamCovPct >= 60 ? "dept-cov-mid" : "dept-cov-low"}">${teamCovPct}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
  
  body.innerHTML = stripHtml + tableHtml;
}

export function renderEmployeeDashboard() {
  const { year: y, month: m } = state;
  const dash = state.employeeDashboard;
  const employees = getEmployeesForYear(y);
  
  const summaryEl = document.getElementById("emp-summary-grid");
  const gridEl = document.getElementById("emp-year-grid");
  const detailEl = document.getElementById("emp-detail-panel");
  const detailSub = document.getElementById("emp-detail-sub");
  const countEl = document.getElementById("emp-visible-count");
  const contextEl = document.getElementById("emp-context-line");
  const teamPanelEl = document.getElementById("emp-team-panel");
  const teamControlsEl = document.getElementById("emp-team-controls");
  
  if (!summaryEl || !gridEl || !detailEl) return;
  
  const currentMonthData = getMonthData(y, m);
  
  if (contextEl) {
    contextEl.textContent = `${MONTHS[m]} ${y} · ${currentMonthData.employees.length} Mitarbeitende im aktuellen Monat · ${employees.length} eindeutige Mitarbeitende im Jahr`;
  }
  
  if (!employees.length) {
    summaryEl.innerHTML = `<div class="empdash-empty">Keine Mitarbeitendendaten für ${y} vorhanden.</div>`;
    gridEl.innerHTML = "";
    detailEl.innerHTML = `<div class="empdash-empty">Bitte zuerst Mitarbeitende anlegen.</div>`;
    if (countEl) countEl.textContent = "0 sichtbar";
    renderRoleFilters(employees);
    return;
  }
  
  const metrics = employees.map((emp) => getEmployeeYearCardMetrics(emp, y));
  const activeCount = metrics.filter((item) => item.activeMonths > 0).length;
  const dutyCount = metrics.reduce((sum, item) => sum + item.ys.totals.dutyD + item.ys.totals.dutyHG, 0);
  
  const roles = metrics.reduce((acc, item) => {
    const pos = item.meta.position;
    if (["CA", "LOA", "OA", "OÄ"].includes(pos)) acc.lead++;
    else if (["FA", "FÄ"].includes(pos)) acc.fa++;
    else if (["AA", "AÄ"].includes(pos)) acc.aa++;
    else acc.other++;
    return acc;
  }, { lead: 0, fa: 0, aa: 0, other: 0 });
  
  const kpiItems = [
    { label: "Mitarbeitende im Jahr", value: employees.length, sub: `${activeCount} mit Aktivität`, tone: "#0EA5E9" },
    { label: "Aktueller Monatsbestand", value: currentMonthData.employees.length, sub: `${MONTHS[m]} ${y}`, tone: "#22C55E" },
    { label: "Dienste im Jahr", value: dutyCount, sub: "D + HG kumuliert", tone: "#F97316" },
    { label: "Rollenmix", value: `${roles.lead}/${roles.fa}/${roles.aa}`, sub: "Leitung · FA · AA", tone: "#A855F7" },
  ];
  
  summaryEl.innerHTML = kpiItems.map((item) => `
    <article class="empdash-kpi">
      <div class="empdash-kpi-label">${item.label}</div>
      <div class="empdash-kpi-value" style="color:${item.tone}">${item.value}</div>
      <div class="empdash-kpi-sub">${item.sub}</div>
    </article>
  `).join("");

  renderEmployeeTeamAnalytics(teamPanelEl, teamControlsEl);
  
  renderRoleFilters(employees);
  
  const query = dash.filter.trim().toLowerCase();
  const filtered = metrics.filter((item) => {
    if (!matchRoleFilter(item.emp, dash.role)) return false;
    if (!query) return true;
    const hay = [item.emp, item.meta.fullName, item.meta.posLabel, item.meta.position, item.meta.area].join(" ").toLowerCase();
    return hay.includes(query);
  });
  
  if (!dash.selectedEmp || !employees.includes(dash.selectedEmp)) {
    dash.selectedEmp = filtered[0]?.emp || null;
  }
  
  if (countEl) {
    countEl.textContent = `${filtered.length} von ${employees.length} sichtbar`;
  }
  
  if (filtered.length === 0) {
    gridEl.innerHTML = `<div class="empdash-empty">Keine Mitarbeitenden entsprechen dem Filter.</div>`;
  } else {
    gridEl.innerHTML = filtered.map((item) => {
      const pc = posColor(item.meta.position);
      const vac = item.ys.totals.vacationDays || 0;
      const sick = item.ys.totals.sickDays || 0;
      const selectedCls = dash.selectedEmp === item.emp ? " active" : "";
      
      return `
        <button type="button" class="empdash-card${selectedCls}" data-emp="${item.emp}" role="listitem">
          <div class="empdash-card-top">
            <span class="empdash-avatar" style="background:linear-gradient(135deg,${pc.border},${pc.fg})">${empInitials(item.emp)}</span>
            <div class="empdash-card-meta">
              <span class="empdash-card-name">${item.emp}</span>
              <span class="empdash-card-sub">${item.meta.posLabel !== "—" ? item.meta.posLabel : "ohne Stammdaten"}</span>
            </div>
            <span class="empdash-pos" style="background:${pc.bg};color:${pc.fg}">${item.meta.position}</span>
          </div>
          <div class="empdash-card-stats">
            <span><strong>${item.ys.totals.totalActive || 0}</strong><small>Aktiv</small></span>
            <span><strong>${item.ys.totals.dutyD || 0}</strong><small>D</small></span>
            <span><strong>${item.ys.totals.dutyHG || 0}</strong><small>HG</small></span>
            <span><strong>${item.coverage}%</strong><small>Abdeckung</small></span>
          </div>
          <div class="empdash-card-foot">
            <span>${item.activeMonths}/12 Monate</span>
            <span>U ${vac} · K ${sick}</span>
          </div>
        </button>
      `;
    }).join("");
    
    gridEl.querySelectorAll("[data-emp]").forEach((btn) => {
      btn.addEventListener("click", () => {
        dash.selectedEmp = btn.dataset.emp;
        renderEmployeeDashboard();
      });
    });
  }
  
  if (!dash.selectedEmp) {
    detailEl.innerHTML = `<div class="empdash-empty">Bitte eine Person auswählen.</div>`;
    if (detailSub) {
      detailSub.textContent = "Bitte eine Person auswählen.";
    }
    return;
  }
  
  renderEmployeeDetailDashboard(dash.selectedEmp, y);
  
  if (detailSub) {
    const viewName = dash.detailView === "months" ? "Monatsverlauf" : dash.detailView === "calendar" ? "Jahreskalender" : "Verwaltung";
    detailSub.textContent = `${dash.selectedEmp} · Kalenderjahr ${y} · Detailansicht ${viewName}`;
  }
}

function getRangeMonths(range, year, month, customStart, customEnd) {
  if (range === "month") return [{ year, month }];
  if (range === "quarter") {
    const start = Math.floor(month / 3) * 3;
    return Array.from({ length: 3 }, (_, i) => ({ year, month: start + i }));
  }
  if (range === "year") {
    return Array.from({ length: 12 }, (_, i) => ({ year, month: i }));
  }
  if (range === "rolling12") {
    return Array.from({ length: 12 }, (_, idx) => {
      const total = year * 12 + month - (11 - idx);
      return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
    });
  }
  if (range === "custom" && customStart && customEnd) {
    let from = customStart.year * 12 + customStart.month;
    let to = customEnd.year * 12 + customEnd.month;
    if (from > to) [from, to] = [to, from];
    const months = [];
    for (let t = from; t <= to; t++) {
      months.push({ year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 });
    }
    return months;
  }
  return [{ year, month }];
}

function renderEmployeeTeamAnalytics(teamPanelEl, teamControlsEl) {
  if (!teamPanelEl || !teamControlsEl) return;
  const dash = state.employeeDashboard;
  const { year, month } = state;
  if (!dash.customStart) dash.customStart = { year, month: Math.max(0, month - 2) };
  if (!dash.customEnd) dash.customEnd = { year, month };
  
  const rangeDefs = [
    ["month", "Monat"],
    ["quarter", "Quartal"],
    ["year", "Jahr"],
    ["rolling12", "Rolling 12M"],
    ["custom", "Custom"]
  ];
  
  teamControlsEl.innerHTML = `
    <div class="empdash-team-pills">
      ${rangeDefs.map(([key, label]) => `<button type="button" class="empdash-filter-btn${dash.analyticsRange === key ? " active" : ""}" data-range="${key}">${label}</button>`).join("")}
    </div>
    <div class="empdash-custom-range"${dash.analyticsRange === "custom" ? "" : " style='display:none'"}>
      <label>Von <input type="month" id="emp-custom-start" value="${dash.customStart.year}-${String(dash.customStart.month + 1).padStart(2, "0")}"></label>
      <label>Bis <input type="month" id="emp-custom-end" value="${dash.customEnd.year}-${String(dash.customEnd.month + 1).padStart(2, "0")}"></label>
    </div>
  `;
  
  teamControlsEl.querySelectorAll("[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      dash.analyticsRange = btn.dataset.range;
      renderEmployeeDashboard();
    });
  });
  
  teamControlsEl.querySelector("#emp-custom-start")?.addEventListener("change", (e) => {
    const [y, m] = e.target.value.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      dash.customStart = { year: y, month: m - 1 };
      renderEmployeeDashboard();
    }
  });
  
  teamControlsEl.querySelector("#emp-custom-end")?.addEventListener("change", (e) => {
    const [y, m] = e.target.value.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      dash.customEnd = { year: y, month: m - 1 };
      renderEmployeeDashboard();
    }
  });
  
  const rangeMonths = getRangeMonths(dash.analyticsRange, year, month, dash.customStart, dash.customEnd);
  const allEmployees = getEmployeesForYear(year);
  if (!allEmployees.length || !rangeMonths.length) {
    teamPanelEl.innerHTML = `<div class="empdash-empty">Keine Teamdaten verfügbar.</div>`;
    return;
  }
  
  const agg = {
    active: 0, vac: 0, sick: 0, fza: 0, wb: 0, d: 0, hg: 0, uncovered: 0, required: 0
  };
  const perEmp = new Map();
  
  allEmployees.forEach((emp) => perEmp.set(emp, { emp, active: 0, d: 0, hg: 0, vac: 0, sick: 0, uncovered: 0, required: 0 }));
  
  rangeMonths.forEach(({ year: y, month: m }) => {
    const md = getMonthData(y, m);
    const dim = daysInMonth(y, m);
    const hols = getSaxonyHolidaysCached(y);
    md.employees.forEach((emp) => {
      const s = buildProfileStats(y, m, emp);
      const row = perEmp.get(emp) || { emp, active: 0, d: 0, hg: 0, vac: 0, sick: 0, uncovered: 0, required: 0 };
      const vac = VACATION_CODES.reduce((sum, c) => sum + (s.stCounts[c] || 0), 0);
      const sick = (s.stCounts["K"] || 0) + (s.stCounts["KK"] || 0);
      const requiredDays = (s.totalActive || 0) + (s.uncovered || 0);
      row.active += s.totalActive || 0;
      row.d += s.dutyD.length || 0;
      row.hg += s.dutyHG.length || 0;
      row.vac += vac;
      row.sick += sick;
      row.uncovered += s.uncovered || 0;
      row.required += requiredDays;
      perEmp.set(emp, row);
      
      agg.active += s.totalActive || 0;
      agg.vac += vac;
      agg.sick += sick;
      agg.fza += s.stCounts["FZA"] || 0;
      agg.wb += s.stCounts["WB"] || 0;
      agg.d += s.dutyD.length || 0;
      agg.hg += s.dutyHG.length || 0;
      agg.uncovered += s.uncovered || 0;
      agg.required += requiredDays;
    });
  });
  
  const rows = [...perEmp.values()].filter((x) => x.active || x.d || x.hg || x.vac || x.sick || x.required);
  rows.sort((a, b) => (b.active - a.active) || (b.d + b.hg - (a.d + a.hg)));
  const topRows = rows.slice(0, 8);
  const teamCoverage = agg.required > 0 ? Math.round((agg.active / agg.required) * 100) : 0;
  const busiest = rows[0]?.emp || "—";
  const dutyLeader = rows.slice().sort((a, b) => (b.d + b.hg) - (a.d + a.hg))[0]?.emp || "—";
  
  teamPanelEl.innerHTML = `
    <div class="empdash-team-kpis">
      <article class="empdash-kpi"><div class="empdash-kpi-label">Zeitraum</div><div class="empdash-kpi-value" style="color:#0EA5E9">${rangeMonths.length} M</div><div class="empdash-kpi-sub">${MONTHS[rangeMonths[0].month]} ${rangeMonths[0].year} – ${MONTHS[rangeMonths.at(-1).month]} ${rangeMonths.at(-1).year}</div></article>
      <article class="empdash-kpi"><div class="empdash-kpi-label">Team-Abdeckung</div><div class="empdash-kpi-value" style="color:${teamCoverage >= 80 ? "#22C55E" : teamCoverage >= 60 ? "#F59E0B" : "#EF4444"}">${teamCoverage}%</div><div class="empdash-kpi-sub">${agg.active} aktiv / ${agg.required} erforderlich</div></article>
      <article class="empdash-kpi"><div class="empdash-kpi-label">Dienste D/HG</div><div class="empdash-kpi-value" style="color:#F97316">${agg.d}/${agg.hg}</div><div class="empdash-kpi-sub">Gesamt im Zeitraum</div></article>
      <article class="empdash-kpi"><div class="empdash-kpi-label">Ausfalltage</div><div class="empdash-kpi-value" style="color:#A855F7">${agg.vac + agg.sick + agg.fza + agg.wb}</div><div class="empdash-kpi-sub">U/K/FZA/WB kumuliert</div></article>
    </div>
    <div class="empdash-team-insights">
      <div class="empdash-team-note"><strong>Top Aktivität:</strong> ${busiest}</div>
      <div class="empdash-team-note"><strong>Dienst-Fokus:</strong> ${dutyLeader}</div>
      <div class="empdash-team-note"><strong>Offene Abdeckung:</strong> ${agg.uncovered} Tage</div>
    </div>
    <div class="dept-table-wrap">
      <table class="dept-table">
        <thead>
          <tr>
            <th class="dept-th-name">Mitarbeitende</th>
            <th class="dept-th">Aktiv</th>
            <th class="dept-th dept-th-d">D</th>
            <th class="dept-th dept-th-hg">HG</th>
            <th class="dept-th dept-th-vac">Urlaub</th>
            <th class="dept-th dept-th-sick">Krank</th>
            <th class="dept-th dept-th-offen">Offen</th>
            <th class="dept-th">Abdeckung</th>
          </tr>
        </thead>
        <tbody>
          ${topRows.map((row) => {
            const cov = row.required > 0 ? Math.round((row.active / row.required) * 100) : 0;
            const covCls = cov >= 80 ? "dept-cov-good" : cov >= 60 ? "dept-cov-mid" : "dept-cov-low";
            return `
            <tr class="dept-tr" data-team-emp="${row.emp}">
              <td class="dept-td-name"><span class="dept-emp-name">${row.emp}</span></td>
              <td class="dept-td dept-td-num">${row.active || "—"}</td>
              <td class="dept-td dept-td-num dept-duty-d">${row.d || "—"}</td>
              <td class="dept-td dept-td-num dept-duty-hg">${row.hg || "—"}</td>
              <td class="dept-td dept-td-num dept-vac">${row.vac || "—"}</td>
              <td class="dept-td dept-td-num dept-sick">${row.sick || "—"}</td>
              <td class="dept-td dept-td-num dept-offen">${row.uncovered || "—"}</td>
              <td class="dept-td dept-td-num ${covCls}">${cov}%</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  
  teamPanelEl.querySelectorAll("[data-team-emp]").forEach((row) => {
    row.addEventListener("click", () => {
      state.employeeDashboard.selectedEmp = row.dataset.teamEmp;
      renderEmployeeDashboard();
      const detailPanel = document.getElementById("emp-detail-panel");
      detailPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

export function renderRoleFilters(employees) {
  const el = document.getElementById("emp-role-filters");
  if (!el) return;
  
  const buckets = getRoleFilterBuckets(state.year, employees);
  const defs = [
    ["ALL", "Alle"], 
    ["CA", "Chefärzte"], 
    ["OA", "Oberärzte"], 
    ["FA", "Fachärzte"], 
    ["AA", "Assistenz"], 
    ["OHNE", "Ohne Profil"]
  ];
  
  el.innerHTML = defs.map(([code, label]) => {
    const isActive = state.employeeDashboard.role === code;
    return `
      <button type="button" class="empdash-filter-btn${isActive ? " active" : ""}" data-role="${code}">
        ${label}<span>${buckets[code] || 0}</span>
      </button>
    `;
  }).join("");
  
  el.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.employeeDashboard.role = btn.dataset.role;
      renderEmployeeDashboard();
    });
  });
}

export function renderEmployeeDetailDashboard(emp, year) {
  const detailEl = document.getElementById("emp-detail-panel");
  if (!detailEl) return;
  
  const meta = getEmpMeta(emp);
  const pc = posColor(meta.position);
  const ys = buildYearlyStats(emp, year);
  const currentMonthData = getMonthData(state.year, state.month);
  
  document.querySelectorAll('.empdash-view-btn').forEach((btn) => {
    const active = btn.dataset.view === state.employeeDashboard.detailView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  
  if (state.employeeDashboard.detailView === 'months') {
    let html = `
      <div class="empdash-detail-profile">
        <div class="empdash-detail-profile-head">
          <span class="empdash-avatar lg" style="background:linear-gradient(135deg,${pc.border},${pc.fg})">${empInitials(emp)}</span>
          <div>
            <div class="empdash-detail-name">${meta.fullName !== emp ? meta.fullName : emp}</div>
            <div class="empdash-detail-meta">${meta.posLabel} · ${meta.type}</div>
          </div>
        </div>
      </div>
      <div class="empdash-month-table-wrap">
        <table class="empdash-month-table">
          <thead>
            <tr>
              <th>Monat</th>
              <th>Aktiv</th>
              <th>Urlaub</th>
              <th>Krank</th>
              <th>FZA</th>
              <th>WB</th>
              <th>D</th>
              <th>HG</th>
              <th>Abdeckung</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    ys.months.forEach((mon) => {
      const vac = VACATION_CODES.reduce((sum, c) => sum + (mon.stCounts[c] || 0), 0);
      const sick = (mon.stCounts['K'] || 0) + (mon.stCounts['KK'] || 0);
      
      const reqWd = Math.max(0, mon.totalWorkdays - vac - sick - (mon.stCounts['FZA'] || 0) - (mon.stCounts['WB'] || 0) - (mon.stCounts['F'] || 0));
      const cov = reqWd > 0 ? Math.min(100, Math.round((mon.totalActive / reqWd) * 100)) : 0;
      
      const isCur = mon.m === state.month;
      const covCls = cov >= 80 ? 'good' : cov >= 60 ? 'mid' : 'low';
      
      html += `
        <tr class="${isCur ? 'is-current' : ''}">
          <td>${MONTHS_SHORT[mon.m]}</td>
          <td>${mon.totalActive || '—'}</td>
          <td>${vac || '—'}</td>
          <td>${sick || '—'}</td>
          <td>${mon.stCounts['FZA'] || '—'}</td>
          <td>${mon.stCounts['WB'] || '—'}</td>
          <td>${mon.dutyD || '—'}</td>
          <td>${mon.dutyHG || '—'}</td>
          <td><span class="empdash-cov ${covCls}">${mon.totalWorkdays ? cov + '%' : '—'}</span></td>
        </tr>
      `;
    });
    
    const reqWdTotal = Math.max(0, ys.totals.totalWorkdays - ys.totals.vacationDays - ys.totals.sickDays - ys.totals.fzaDays - ys.totals.wbDays - ys.totals.freiDays);
    const totalCov = reqWdTotal > 0 ? Math.min(100, Math.round((ys.totals.totalActive / reqWdTotal) * 100)) : 0;
    
    html += `
          </tbody>
          <tfoot>
            <tr>
              <td>Gesamt</td>
              <td>${ys.totals.totalActive || '—'}</td>
              <td>${ys.totals.vacationDays || '—'}</td>
              <td>${ys.totals.sickDays || '—'}</td>
              <td>${ys.totals.fzaDays || '—'}</td>
              <td>${ys.totals.wbDays || '—'}</td>
              <td>${ys.totals.dutyD || '—'}</td>
              <td>${ys.totals.dutyHG || '—'}</td>
              <td>${reqWdTotal ? totalCov + '%' : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    detailEl.innerHTML = html;
    return;
  }
  
  if (state.employeeDashboard.detailView === 'calendar') {
    const cards = ys.months.map((mon) => {
      const vac = VACATION_CODES.reduce((sum, c) => sum + (mon.stCounts[c] || 0), 0);
      const sick = (mon.stCounts['K'] || 0) + (mon.stCounts['KK'] || 0);
      const items = [];
      
      Object.entries(mon.wpCounts).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0,4).forEach(([code,val]) => {
        items.push(`<span class="empdash-mini-chip">${code} ${val}</span>`);
      });
      
      if (mon.dutyD) items.push(`<span class="empdash-mini-chip duty">D ${mon.dutyD}</span>`);
      if (mon.dutyHG) items.push(`<span class="empdash-mini-chip hg">HG ${mon.dutyHG}</span>`);
      if (vac) items.push(`<span class="empdash-mini-chip vac">U ${vac}</span>`);
      if (sick) items.push(`<span class="empdash-mini-chip sick">K ${sick}</span>`);
      
      const reqWd = Math.max(0, mon.totalWorkdays - vac - sick - (mon.stCounts['FZA'] || 0) - (mon.stCounts['WB'] || 0) - (mon.stCounts['F'] || 0));
      const cov = reqWd > 0 ? Math.min(100, Math.round((mon.totalActive / reqWd) * 100)) : 0;
      const isActive = mon.m === state.month;
      
      return `
        <article class="empdash-mini-month ${isActive ? 'active' : ''}">
          <header>
            <strong>${MONTHS[mon.m]}</strong>
            <span>${mon.totalWorkdays || 0} WT</span>
          </header>
          <div class="empdash-mini-body">
            ${items.join('') || '<span class="empdash-mini-empty">Keine Einträge</span>'}
          </div>
          <footer>${cov}% Abdeckung</footer>
        </article>
      `;
    }).join('');
    
    detailEl.innerHTML = `<div class="empdash-mini-grid">${cards}</div>`;
    return;
  }
  
  const currentIncluded = currentMonthData.employees.includes(emp);
  
  const monthList = currentMonthData.employees.map((name) => {
    const metaItem = getEmpMeta(name);
    const pos = posColor(metaItem.position);
    return `
      <div class="emp-row">
        <div class="emp-row-left">
          <span class="emp-avatar" style="background:linear-gradient(135deg,${pos.border},${pos.fg})">${empInitials(name)}</span>
          <div class="emp-row-info">
            <span class="emp-row-name">${name}</span>
            <span class="emp-row-meta">${metaItem.posLabel}</span>
          </div>
        </div>
        <button type="button" class="emp-row-del" data-remove="${name}" aria-label="${name} entfernen">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M1 1l9 9M10 1L1 10"/>
          </svg>
        </button>
      </div>
    `;
  }).join('') || `<div class="emp-none">Keine Mitarbeitenden im aktuellen Monat</div>`;
  
  detailEl.innerHTML = `
    <div class="empdash-admin-layout">
      <div class="empdash-admin-card">
        <div class="empdash-admin-title">Ausgewählte Person</div>
        <div class="empdash-admin-meta">
          <span class="empdash-pos" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span>
          <span>${meta.posLabel}</span>
          <span>${meta.area || 'kein Bereich hinterlegt'}</span>
        </div>
        <div class="empdash-admin-actions">
          <button type="button" class="mbtn ${currentIncluded ? 'mbtn-ghost' : 'mbtn-primary'}" id="emp-toggle-current">
            ${currentIncluded ? 'Aus aktuellem Monat entfernen' : 'Zum aktuellen Monat hinzufügen'}
          </button>
        </div>
      </div>
      <div class="empdash-admin-card">
        <div class="empdash-admin-title">Monatsliste ${MONTHS[state.month]} ${state.year}</div>
        <div class="emp-list-inner" id="emp-list">${monthList}</div>
        <div class="emp-add-row">
          <input type="text" class="text-input" id="emp-input" placeholder="Name (z.B. Dr. Müller)…" autocomplete="off" spellcheck="false" maxlength="80" aria-label="Name des neuen Mitarbeiters eingeben">
          <button type="button" class="mbtn mbtn-primary" id="emp-add-btn">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  `;
  
  detailEl.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      import('./app.js').then(m => m.confirmRemoveEmployee(btn.dataset.remove, false));
    });
  });
  
  document.getElementById('emp-toggle-current')?.addEventListener('click', () => {
    if (currentIncluded) {
      removeEmployee(state.year, state.month, emp);
    } else {
      addEmployee(state.year, state.month, emp);
    }
    render();
    renderEmployeeDashboard();
  });
  
  document.getElementById('emp-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('emp-input');
    const name = input.value.trim();
    if (!name) return;
    addEmployee(state.year, state.month, name);
    input.value = '';
    state.employeeDashboard.selectedEmp = name;
    render();
    renderEmployeeDashboard();
    input.focus();
  });
  
  document.getElementById('emp-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('emp-add-btn')?.click();
    }
  });
}
