window.autoPlanResult = null;
window.autoPlanTargets = {};
window.apViewMode = "config";
window.autoPlanConfigRenderToken = 0;
window.apAnimCancel = null;

window.defaultBDTarget = function(emp) {
  const pos = getEmpMeta(emp).position;
  if (pos === "AA" || pos === "AÄ") return 4;
  if (["FA", "FÄ", "OA", "OÄ", "LOA", "CA"].includes(pos)) return 2;
  return 0;
};

window.isDutyExempt = function(emp) {
  const meta = getEmpMeta(emp);
  return meta.position === "—";
};

window.collectHistoricalDutyStats = function(y, m) {
  const hist = {};
  getEmployeesForYear(y).forEach(e => { hist[e] = { bd: 0, weDuty: 0, satBd: 0 }; });
  for (let prevM = 0; prevM < m; prevM++) {
    const mk = `${y}-${prevM}`;
    const md = DATA[mk];
    if (!md || !md.employees) continue;
    const dim = daysInMonth(y, prevM);
    const hols = getSaxonyHolidaysCached(y);
    md.employees.forEach(emp => {
      if (!hist[emp]) hist[emp] = { bd: 0, weDuty: 0, satBd: 0 };
      for (let d = 1; d <= dim; d++) {
        if (md.assignments[emp]?.[d]?.duty === "D") {
          hist[emp].bd++;
          const wd = weekday(y, prevM, d);
          if (wd === 0 || wd === 5 || wd === 6 || isHoliday(y, prevM, d, hols)) hist[emp].weDuty++;
          if (wd === 6) hist[emp].satBd++;
        }
      }
    });
  }
  return hist;
};

window.openAutoPlanModal = function() {
  if (!planMode) return;
  const emps = [...planData.employees];
  if (!Object.keys(autoPlanTargets).length) {
    emps.forEach((e) => {
      autoPlanTargets[e] = defaultBDTarget(e);
    });
  }
  apViewMode = "config";
  if (typeof showOverlay === "function") showOverlay("modal-autoplan");
  const body = document.getElementById("ap-body");
  if (body) {
    body.innerHTML = `<div class="ap-config-intro"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;color:#0EA5E9"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><span>Auto-Plan-Konfiguration wird vorbereitet…</span></div>`;
  }
  autoPlanConfigRenderToken += 1;
  const renderToken = autoPlanConfigRenderToken;
  requestAnimationFrame(() => {
    setTimeout(() => {
      renderAutoPlanModal(renderToken);
    }, 50);
  });
};

window.renderAutoPlanModal = function(renderToken = null) {
  const { year: y, month: m } = state;
  const emps = [...planData.employees];
  const dutyEmps = emps.filter((e) => !isDutyExempt(e));
  const exemptEmps = emps.filter((e) => isDutyExempt(e));
  const apSub = document.getElementById("ap-sub");
  if (apSub) apSub.textContent = `${MONTHS[m]} ${y}`;
  const body = document.getElementById("ap-body");
  const applyBtn = document.getElementById("ap-apply");
  const reportBtn = document.getElementById("ap-report-btn");
  if (!body || !applyBtn) return;
  if (reportBtn) reportBtn.style.display = "none";

  if (apViewMode === "config") {
    body.style.height = "auto";
    body.style.maxHeight = "none";
    body.style.overflowY = "auto";
    applyBtn.style.display = "none";
    
    const hist = collectHistoricalDutyStats(y, m);
    if (renderToken !== null && renderToken !== autoPlanConfigRenderToken) return;
    
    let html = `<div class="ap-config-intro"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;color:#F59E0B"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><span>Die manuellen Zielwerte steuern den Kernalgorithmus. Der Neural Scheduler optimiert die finale Verteilung eigenständig.</span></div>`;
    if (exemptEmps.length > 0) {
      html += `<div class="ap-exempt-note" data-tooltip="Diese Personen sind von Diensten befreit"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>Dienstbefreit: <strong>${exemptEmps.join(", ")}</strong></span></div>`;
    }
    html += `<div class="ap-sect-hd"><span class="ap-sect-badge" style="background:#EF4444;color:#fff">D</span>BD-Ziele</div>`;
    html += `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th class="ap-th-name" data-tooltip="Name der ärztlichen Fachkraft">Mitarbeitende</th><th class="ap-th" data-tooltip="Qualifikationsstufe laut Stammdaten">Position</th><th class="ap-th" data-tooltip="Kumulierte Anzahl der Bereitschaftsdienste im bisherigen Kalenderjahr">Hist. BD</th><th class="ap-th" data-tooltip="Anzahl der bisherigen Samstag-Dienste">Hist. Sa-D</th><th class="ap-th ap-th-target" data-tooltip="Manuell konfiguriertes Ziel für Bereitschaftsdienste">Ziel BD</th></tr></thead><tbody>`;
    dutyEmps.forEach((e) => {
      const meta = getEmpMeta(e);
      const pc = posColor(meta.position);
      const h = hist[e] || { bd: 0, weDuty: 0, satBd: 0 };
      const target = autoPlanTargets[e] ?? defaultBDTarget(e);
      html += `<tr><td class="ap-td-name" style="border-left:3px solid ${pc.border}"><span>${e}</span><span class="ap-pos" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span></td><td class="ap-td ap-td-num" style="font-size:10px;color:var(--gray-500)">${meta.posLabel}</td><td class="ap-td ap-td-num" style="color:var(--gray-500)">${h.bd}</td><td class="ap-td ap-td-num" style="color:var(--gray-500)">${h.satBd}</td><td class="ap-td ap-td-num"><input type="number" class="ap-target-input" data-emp="${e}" value="${target}" min="0" max="15" step="1"></td></tr>`;
    });
    const totalTarget = dutyEmps.reduce((s, e) => s + (autoPlanTargets[e] ?? defaultBDTarget(e)), 0);
    const dim = daysInMonth(y, m);
    const diff = totalTarget - dim;
    const diffStr = diff > 0 ? ` (+${diff})` : diff < 0 ? ` (${diff})` : " (Exakt)";
    const diffColor = diff < 0 ? "var(--red)" : "var(--green)";

    html += `</tbody><tfoot><tr class="ap-total-row"><td class="ap-td-name" colspan="4" style="font-weight:700;color:var(--gray-700);padding-left:12px" data-tooltip="Summierte Anzahl der Monatsziele. Sollte idealerweise den Tagen im Monat entsprechen.">Σ Gesamt-Ziel für ${dim} Tage</td><td class="ap-td ap-td-num" style="font-weight:800;white-space:nowrap" id="ap-total-target" data-tooltip="Abweichung vom Idealwert">${totalTarget} <span style="font-size:10px;color:${diffColor}">${diffStr}</span></td></tr></tfoot></table></div>`;
    html += `<div class="ap-config-actions"><button type="button" class="mbtn mbtn-ghost" id="ap-reset-defaults" data-tooltip="Setzt die Werte auf empfohlene Standards zurück">Standardwerte</button><button type="button" class="mbtn" id="ap-compute" style="background:linear-gradient(135deg,#F59E0B,#D97706);color:#451a03;font-weight:700;cursor:pointer;-webkit-appearance:none" data-tooltip="Startet den iterativen Optimierungs-Algorithmus">Scheduler initialisieren</button></div>`;
    body.innerHTML = html;
    
    body.querySelectorAll(".ap-target-input").forEach((inp) => {
      inp.addEventListener("change", () => {
        autoPlanTargets[inp.dataset.emp] = Math.max(0, Math.min(15, parseInt(inp.value, 10) || 0));
        inp.value = autoPlanTargets[inp.dataset.emp];
        const tot = dutyEmps.reduce((s, e) => s + (autoPlanTargets[e] ?? 0), 0);
        const totEl = document.getElementById("ap-total-target");
        if (totEl) {
          const newDiff = tot - dim;
          const newDiffStr = newDiff > 0 ? ` (+${newDiff})` : newDiff < 0 ? ` (${newDiff})` : " (Exakt)";
          const newDiffColor = newDiff < 0 ? "var(--red)" : "var(--green)";
          totEl.innerHTML = `${tot} <span style="font-size:10px;color:${newDiffColor}">${newDiffStr}</span>`;
        }
      });
    });
    
    document.getElementById("ap-reset-defaults")?.addEventListener("click", () => {
        dutyEmps.forEach((e) => { autoPlanTargets[e] = defaultBDTarget(e); });
        body.querySelectorAll(".ap-target-input").forEach((inp) => { inp.value = autoPlanTargets[inp.dataset.emp]; });
        const tot = dutyEmps.reduce((s, e) => s + autoPlanTargets[e], 0);
        const totEl = document.getElementById("ap-total-target");
        if (totEl) {
          const newDiff = tot - dim;
          const newDiffStr = newDiff > 0 ? ` (+${newDiff})` : newDiff < 0 ? ` (${newDiff})` : " (Exakt)";
          const newDiffColor = newDiff < 0 ? "var(--red)" : "var(--green)";
          totEl.innerHTML = `${tot} <span style="font-size:10px;color:${newDiffColor}">${newDiffStr}</span>`;
        }
    });
      
    const computeBtn = document.getElementById("ap-compute");
    if (computeBtn) {
      computeBtn.addEventListener("click", () => {
        if (typeof window.computeAutoPlan === "function") {
          const result = window.computeAutoPlan(autoPlanTargets);
          if (!result) { if(typeof showToast==="function") showToast("Fehler bei der Berechnung"); return; }
          autoPlanResult = result;
          apViewMode = "progress";
          renderProgressAndThenResult(result);
        } else {
          if(typeof showToast==="function") showToast("Algorithmus-Modul nicht gefunden.");
        }
      });
    }
  } else if (apViewMode === "result") {
    renderResultView();
  }
};

window.startNeuralAnimation = function(canvas) {
  const ctx = canvas.getContext("2d");
  let cw = canvas.width = canvas.offsetWidth;
  let ch = canvas.height = canvas.offsetHeight;
  
  const nodes = Array.from({length: 40}, () => ({
    x: Math.random() * cw,
    y: Math.random() * ch,
    vx: (Math.random() - 0.5) * 1.5,
    vy: (Math.random() - 0.5) * 1.5,
    r: Math.random() * 1.5 + 0.5,
    pulse: Math.random() * Math.PI * 2
  }));

  let animId;
  function draw() {
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "rgba(4, 10, 24, 0.6)";
    ctx.fillRect(0, 0, cw, ch);
    
    for(let i = 0; i < nodes.length; i++) {
      nodes[i].x += nodes[i].vx;
      nodes[i].y += nodes[i].vy;
      nodes[i].pulse += 0.05;
      
      if(nodes[i].x < 0 || nodes[i].x > cw) nodes[i].vx *= -1;
      if(nodes[i].y < 0 || nodes[i].y > ch) nodes[i].vy *= -1;
      
      for(let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if(dist < 55) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(14, 165, 233, ${0.8 - (dist/55)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
      
      const rad = nodes[i].r + Math.sin(nodes[i].pulse) * 0.5;
      ctx.beginPath();
      ctx.arc(nodes[i].x, nodes[i].y, Math.max(0.1, rad), 0, Math.PI*2);
      ctx.fillStyle = "#38BDF8";
      ctx.fill();
    }
    animId = requestAnimationFrame(draw);
  }
  draw();
  return () => cancelAnimationFrame(animId);
};

window.renderProgressAndThenResult = async function(result) {
  const body = document.getElementById("ap-body");
  const applyBtn = document.getElementById("ap-apply");
  if (!body || !applyBtn) return;
  
  applyBtn.style.display = "none";
  body.style.height = "100%";
  body.style.maxHeight = "100%";
  body.style.overflow = "hidden";
  body.style.padding = "10px";
  
  body.innerHTML = `
    <div class="ap-engine ap-engine-immersive ap-engine-compact">
      <div class="ap-hero-shell ap-hero-shell-compact">
        <div class="ap-hero-hud">
          <div class="ap-hud-block">
            <span class="ap-hud-kicker">RadPlan Neural Scheduler</span>
            <div class="ap-hud-title" id="ap-prog-title">Initialisierung des Datenstroms</div>
          </div>
          <div class="ap-hud-spectacle" aria-hidden="true" data-tooltip="Live-Berechnungsmatrix">
            <canvas class="ap-hud-canvas" id="ap-hud-canvas"></canvas>
          </div>
        </div>
        
        <div class="ap-live-stats" aria-label="Live-Statistik">
          <div class="ap-ls-item" data-tooltip="Bisher evaluierte Bereitschaftsdienste"><strong class="ap-ls-val" id="ap-ls-bd">0</strong><span class="ap-ls-lbl">D-Dienste</span></div>
          <span class="ap-ls-sep" aria-hidden="true"></span>
          <div class="ap-ls-item" data-tooltip="Bisher evaluierte Hintergrunddienste"><strong class="ap-ls-val" id="ap-ls-hg">0</strong><span class="ap-ls-lbl">HG-Dienste</span></div>
          <span class="ap-ls-sep" aria-hidden="true"></span>
          <div class="ap-ls-item" data-tooltip="Anzahl verarbeiteter Planungs-Constraints"><strong class="ap-ls-val" id="ap-ls-rules">0</strong><span class="ap-ls-lbl">Regeln</span></div>
          <span class="ap-ls-sep" aria-hidden="true"></span>
          <div class="ap-ls-item" data-tooltip="Durchgeführte iterative Optimierungstausche"><strong class="ap-ls-val" id="ap-ls-swaps">0</strong><span class="ap-ls-lbl">Deep-Moves</span></div>
        </div>

        <div class="ap-bar-wrap">
          <div class="ap-bar-track"><div class="ap-bar-fill" id="ap-prog-bar"></div><div class="ap-bar-glow" id="ap-prog-glow"></div></div>
          <div class="ap-bar-info"><span class="ap-bar-phase" id="ap-phase-name">Analysiere Constraints...</span><span class="ap-bar-pct" id="ap-prog-pct">0%</span></div>
        </div>
      </div>

      <div class="ap-engine-main">
        <div class="ap-terminal ap-terminal-deep" style="grid-column: 1 / -1;">
          <div class="ap-term-header"><span class="ap-term-title">System Trace Console</span></div>
          <div class="ap-term-body" id="ap-term-body"></div>
        </div>
      </div>
    </div>`;

  const canvas = document.getElementById("ap-hud-canvas");
  if (canvas) {
    if (apAnimCancel) apAnimCancel();
    apAnimCancel = startNeuralAnimation(canvas);
  }

  const logContainer = document.getElementById("ap-term-body");
  const barEl = document.getElementById("ap-prog-bar");
  const pctEl = document.getElementById("ap-prog-pct");
  const phaseEl = document.getElementById("ap-phase-name");
  
  const log = result.log || [];
  let bdCount = 0, hgCount = 0, swapCount = 0;
  const logStarted = performance.now();

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    const delay = Math.max(25, 1800 / log.length);
    await sleep(delay);

    if (entry.icon === "→" || entry.icon === "✓") {
        if (entry.msg.includes("HG")) hgCount++; else bdCount++;
    }
    if (entry.icon === "🔀" || entry.icon === "🔁" || entry.icon === "🧠") swapCount++;
    
    document.getElementById("ap-ls-bd").textContent = bdCount;
    document.getElementById("ap-ls-hg").textContent = hgCount;
    document.getElementById("ap-ls-swaps").textContent = swapCount;
    document.getElementById("ap-ls-rules").textContent = Math.floor(i * 1.5);

    if (logContainer) {
      const div = document.createElement("div");
      div.className = "ap-log-entry";
      const t = ((performance.now() - logStarted) / 1000).toFixed(2);
      div.innerHTML = `<span class="ap-log-icon">${entry.icon}</span><span class="ap-log-msg">[${t}s] ${entry.msg}</span>`;
      logContainer.appendChild(div);
      logContainer.scrollTop = logContainer.scrollHeight;
    }

    if (barEl) barEl.style.width = entry.pct + "%";
    if (pctEl) pctEl.textContent = entry.pct + "%";
    if (phaseEl) phaseEl.textContent = entry.msg;
  }

  if (apAnimCancel) {
    apAnimCancel();
    apAnimCancel = null;
  }
  await sleep(400);
  apViewMode = "result";
  renderResultView();
};

window.renderResultView = function() {
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const emps = [...planData.employees];
  const dutyEmps = emps.filter((e) => !isDutyExempt(e));
  const { summary } = autoPlanResult;
  const quality = summary.quality || {};
  const body = document.getElementById("ap-body");
  
  body.style.height = "auto";
  body.style.maxHeight = "72vh";
  body.style.overflowY = "auto";
  body.style.padding = "24px";
  
  const applyBtn = document.getElementById("ap-apply");
  const reportBtn = document.getElementById("ap-report-btn");
  if (applyBtn) applyBtn.style.display = "";
  if (reportBtn) reportBtn.style.display = "inline-flex";

  const dayTag = (d) => {
    const wd = weekday(y, m, d);
    const hol = isHoliday(y, m, d, hols);
    const isWE = wd === 5 || wd === 6 || wd === 0;
    const cls = hol ? " ap-day-hol" : isWE ? " ap-day-we" : "";
    return `<span class="ap-day-tag${cls}">${DOW_ABBR[wd]}\u2009${d}.</span>`;
  };

  let html = `
    <div class="ap-result-hero">
      <div class="ap-result-score is-clickable" onclick="if(typeof openScoreInfoModal === 'function') openScoreInfoModal()" data-tooltip="Aggregierter Qualitäts-Score der automatischen Planung (0-100)">
        <span class="ap-result-score-kicker">Planungs-Qualität</span>
        <strong>${quality.score ?? 0}</strong>
        <span class="ap-result-score-sub">von 100 Fitness-Punkten</span>
      </div>
      <div class="ap-result-metrics">
        <div class="ap-result-metric" data-tooltip="Maximale Abweichung der Bereitschaftsdienste zwischen den Mitarbeitenden"><span>BD-Streuung</span><strong>${quality.bdSpread ?? 0}</strong></div>
        <div class="ap-result-metric" data-tooltip="Maximale Abweichung der Hintergrunddienste zwischen den Fachärzten"><span>HG-Streuung</span><strong>${quality.hgSpread ?? 0}</strong></div>
        <div class="ap-result-metric" data-tooltip="Maximale Abweichung der Wochenenddienste zwischen den Mitarbeitenden"><span>WE-Dienste</span><strong>${quality.weekendSpread ?? 0}</strong></div>
        <div class="ap-result-metric" data-tooltip="Prozentualer Anteil der algorithmisch erfüllten Dienstwünsche (positiv/negativ)"><span>Wünsche</span><strong>${Math.round((quality.wishFulfillmentRate ?? 0) * 100)}%</strong></div>
        <div class="ap-result-metric" data-tooltip="Anzahl der unbesetzten Pflicht- und Hintergrunddienste im Monat"><span>Lücken</span><strong>${(quality.dutyCoverageMisses ?? 0) + (quality.hgCoverageMisses ?? 0)}</strong></div>
        <div class="ap-result-metric" data-tooltip="Anzahl der algorithmischen Tauschoperationen zur Optimierung der Planungsqualität"><span>Deep-Moves</span><strong>${quality.deepMoves ?? 0}</strong></div>
      </div>
    </div>`;

  let bdHtml = `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th class="ap-th-name" data-tooltip="Name der ärztlichen Fachkraft">Mitarbeitende</th><th class="ap-th" data-tooltip="Manuell konfiguriertes Ziel für Bereitschaftsdienste">Ziel</th><th class="ap-th" data-tooltip="Vom Algorithmus tatsächlich zugewiesene Anzahl an Bereitschaftsdiensten">Ist</th><th class="ap-th-days" data-tooltip="Die genauen Tage der Zuweisung im Monatsverlauf">D-Tage</th><th class="ap-th" data-tooltip="Anzahl der Dienste an Wochenenden oder gesetzlichen Feiertagen">WE-Soll</th></tr></thead><tbody>`;
  dutyEmps.forEach((e) => {
    const bd = summary.bd[e] || { target: 0, count: 0, days: [], weDuty: 0 };
    const meta = getEmpMeta(e);
    const pc = posColor(meta.position);
    bdHtml += `<tr><td class="ap-td-name" style="border-left:3px solid ${pc.border}"><span>${e}</span></td><td class="ap-td ap-td-num">${bd.target}</td><td class="ap-td ap-td-num" style="font-weight:700;color:${bd.count >= bd.target ? '#15803D' : '#B91C1C'}">${bd.count}</td><td class="ap-td ap-td-days">${bd.days.map(d => dayTag(d)).join("")}</td><td class="ap-td ap-td-num">${bd.weDuty}</td></tr>`;
  });
  bdHtml += `</tbody></table></div>`;
  
  html += `
  <div class="ap-collapse-wrap">
    <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')" data-tooltip="Zusammenfassung der Bereitschaftsdienste anzeigen/ausblenden">
      <div class="ap-collapse-title"><span class="ap-sect-badge" style="background:#EF4444;color:#fff">D</span> Bereitschaftsdienst-Verteilung</div>
      <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="ap-collapse-content"><div class="ap-collapse-content-inner"><div class="ap-collapse-content-pad">${bdHtml}</div></div></div>
  </div>`;

  let hgHtml = `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th class="ap-th-name" data-tooltip="Name der ärztlichen Fachkraft">Mitarbeitende</th><th class="ap-th" data-tooltip="Anzahl der zugewiesenen Hintergrunddienste">HG-Anzahl</th><th class="ap-th-days" data-tooltip="Die genauen Tage der HG-Zuweisung im Monatsverlauf">HG-Tage</th></tr></thead><tbody>`;
  emps.filter(e => isFacharzt(e) && !isDutyExempt(e)).forEach((e) => {
    const hg = summary.hg[e] || { count: 0, days: [] };
    const meta = getEmpMeta(e);
    const pc = posColor(meta.position);
    hgHtml += `<tr><td class="ap-td-name" style="border-left:3px solid ${pc.border}"><span>${e}</span></td><td class="ap-td ap-td-num" style="font-weight:700">${hg.count}</td><td class="ap-td ap-td-days">${hg.days.map(d => dayTag(d)).join("")}</td></tr>`;
  });
  hgHtml += `</tbody></table></div>`;

  html += `
  <div class="ap-collapse-wrap is-collapsed">
    <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')" data-tooltip="Zusammenfassung der Hintergrunddienste anzeigen/ausblenden">
      <div class="ap-collapse-title"><span class="ap-sect-badge" style="background:#0EA5E9;color:#fff">HG</span> Hintergrunddienst-Verteilung</div>
      <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="ap-collapse-content"><div class="ap-collapse-content-inner"><div class="ap-collapse-content-pad">${hgHtml}</div></div></div>
  </div>`;

  if (summary.infos && summary.infos.length) {
    html += `
    <div class="ap-collapse-wrap is-collapsed">
      <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')" data-tooltip="Generelle Planungs-Strategien und Logiken einsehen">
        <div class="ap-collapse-title"><span class="ap-sect-badge" style="background:#0EA5E9;color:#fff">i</span> Verteilungs-Details</div>
        <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="ap-collapse-content"><div class="ap-collapse-content-inner"><div class="ap-collapse-content-pad">
        <div class="ap-infos">${summary.infos.map(i => `<div class="ap-info-item">${i}</div>`).join("")}</div>
      </div></div></div>
    </div>`;
  }

  if (summary.warnings && summary.warnings.length) {
    html += `
    <div class="ap-collapse-wrap">
      <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')" data-tooltip="Übersicht aller Konflikte, Fehler und Warnungen des Algorithmus">
        <div class="ap-collapse-title"><span class="ap-sect-badge" style="background:#F97316;color:#fff">!</span> Hinweise &amp; Warnungen</div>
        <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="ap-collapse-content"><div class="ap-collapse-content-inner"><div class="ap-collapse-content-pad">
        <div class="ap-warnings">${summary.warnings.map(w => `<div class="ap-warn-item${w.startsWith('KRITISCH') ? ' ap-warn-item-critical' : ''}">${w}</div>`).join("")}</div>
      </div></div></div>
    </div>`;
  }

  html += `<div class="ap-config-actions" style="margin-top:20px"><button class="mbtn mbtn-ghost" id="ap-back-config" data-tooltip="Ziele anpassen und Algorithmus erneut laufen lassen">Konfiguration ändern &amp; neu berechnen</button></div>`;
  
  body.innerHTML = html;
  document.getElementById("ap-back-config")?.addEventListener("click", () => {
    apViewMode = "config";
    renderAutoPlanModal();
  });
};

window.renderReportModal = function() {
  if (!autoPlanResult || !autoPlanResult.report) return;
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const body = document.getElementById("ap-report-body");
  if (!body) return;
  body.innerHTML = "";
  const list = document.createElement("div");
  list.className = "ap-report-list";

  autoPlanResult.report.forEach((item) => {
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
      <div class="ap-report-tags">${item.tags.map(t => `<span class="ap-report-tag">${t}</span>`).join("")}</div>
    `;
    list.appendChild(itemEl);
  });
  body.appendChild(list);
  if(typeof showOverlay === "function") showOverlay("modal-ap-report");
};

window.applyAutoPlan = function() {
  if (!autoPlanResult || !planMode) return;
  if(typeof recordPlanHistory === "function") recordPlanHistory();
  planData.assignments = JSON.parse(JSON.stringify(autoPlanResult.assignments));
  const external = autoPlanResult.externalAssignments || {};
  let changed = false;
  for (const [mk, empMap] of Object.entries(external)) {
    if (!DATA[mk]) DATA[mk] = { employees: [...planData.employees], assignments: {}, rbn: {} };
    normalizeMonthDataShape(DATA[mk]);
    for (const [emp, dayMap] of Object.entries(empMap)) {
      if (!DATA[mk].employees.includes(emp)) DATA[mk].employees.push(emp);
      if (!DATA[mk].assignments[emp]) DATA[mk].assignments[emp] = {};
      for (const [day, patch] of Object.entries(dayMap)) {
        DATA[mk].assignments[emp][day] = { ...(DATA[mk].assignments[emp][day] || {}), ...patch };
        changed = true;
      }
    }
  }
  if (changed && typeof saveToStorage === "function") saveToStorage();
  if(typeof recordPlanHistory === "function") recordPlanHistory();
  if(typeof hideOverlay === "function") hideOverlay("modal-autoplan");
  if(typeof render === "function") render();
  if(typeof showToast === "function") showToast("Auto-Plan erfolgreich übernommen");
  autoPlanResult = null;
};

window.openScoreInfoModal = function() {
  if (!autoPlanResult || !autoPlanResult.summary || !autoPlanResult.summary.quality) return;
  const q = autoPlanResult.summary.quality;
  const dim = daysInMonth(state.year, state.month);

  const f1 = Math.max(0, Math.min(1, 1 - (q.dutyCoverageMisses || 0) / Math.max(1, dim)));
  const f2 = Math.max(0, Math.min(1, 1 - (q.hgCoverageMisses || 0) / Math.max(1, dim)));
  const f3 = Math.max(0, Math.min(1, 1 - (q.bdSpread || 0) / 4));
  const f4 = Math.max(0, Math.min(1, 1 - (q.hgSpread || 0) / 3));
  const f5 = Math.max(0, Math.min(1, 1 - (q.weekendSpread || 0) / 1.5));
  const f6 = q.wishFulfillmentRate || 0;

  const body = document.getElementById("score-info-body");
  if (!body) return;

  let html = `<div class="score-info-intro" style="margin-bottom:20px;font-size:12.5px;line-height:1.5;color:var(--gray-300);">Die Planungs-Qualität (Fitness-Score) misst die Güte des generierten Dienstplans anhand von sechs gewichteten Kriterien. Ein Wert von 100 bedeutet perfekte Abdeckung, absolute Fairness und Erfüllung aller Dienstwünsche.</div>`;

  html += `<div class="score-detail-list" style="display:flex;flex-direction:column;gap:16px;">`;

  const rows = [
    { lbl: "BD-Abdeckung", weight: 36, val: f1, desc: `${dim - (q.dutyCoverageMisses || 0)} von ${dim} Tagen besetzt` },
    { lbl: "HG-Abdeckung", weight: 24, val: f2, desc: `${dim - (q.hgCoverageMisses || 0)} von ${dim} Tagen besetzt` },
    { lbl: "BD-Fairness", weight: 16, val: f3, desc: `Max. Differenz zwischen MA: ${q.bdSpread || 0} Dienste (Toleranz: 4)` },
    { lbl: "HG-Fairness", weight: 10, val: f4, desc: `Max. Differenz zwischen FAs: ${q.hgSpread || 0} Dienste (Toleranz: 3)` },
    { lbl: "WE-Fairness", weight: 8, val: f5, desc: `Max. Differenz (Wochenenden): ${q.weekendSpread || 0} (Toleranz: 1.5)` },
    { lbl: "Wunscherfüllung", weight: 10, val: f6, desc: `${Math.round(f6 * 100)}% der Dienstwünsche erfüllt` }
  ];

  rows.forEach(r => {
    const pct = Math.round(r.val * 100);
    const pts = (r.weight * r.val).toFixed(1);
    const color = pct >= 90 ? "#22C55E" : pct >= 60 ? "#F59E0B" : "#EF4444";
    html += `
      <div class="score-detail-item" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;">
        <div class="score-detail-main" style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <span class="score-detail-lbl" style="width:110px;font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;">${r.lbl} (${r.weight}%)</span>
          <div class="score-detail-bar-wrap" style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;"><div class="score-detail-bar-fill" style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 1s ease-out;"></div></div>
          <span class="score-detail-val" style="width:36px;text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;color:${color}">${pts}</span>
        </div>
        <div class="score-detail-desc" style="font-size:11.5px;color:var(--gray-500);padding-left:122px;">${r.desc}</div>
      </div>
    `;
  });

  html += `</div>`;

  html += `
    <div class="score-math-box" style="margin-top:20px;padding:16px;background:rgba(14,165,233,0.05);border:1px dashed rgba(14,165,233,0.25);border-radius:12px;">
      <div class="score-math-title" style="font-size:11px;font-weight:700;color:#38BDF8;text-transform:uppercase;margin-bottom:8px;">Mathematische Funktion</div>
      <div class="score-math-formula" style="font-family:var(--font-mono);font-size:11.5px;color:#94A3B8;line-height:1.6;">Score = &Sigma; (Gewicht &times; Normierter Faktor)<br><br>= (36 &times; ${f1.toFixed(2)}) + (24 &times; ${f2.toFixed(2)}) + (16 &times; ${f3.toFixed(2)}) + (10 &times; ${f4.toFixed(2)}) + (8 &times; ${f5.toFixed(2)}) + (10 &times; ${f6.toFixed(2)})<br><br>= <span style="color:#FBBF24;font-size:14px;font-weight:700;">${q.score ?? 0} Punkte</span></div>
    </div>
  `;

  body.innerHTML = html;
  if(typeof showOverlay === "function") showOverlay("modal-score-info");

  setTimeout(() => {
    const bars = body.querySelectorAll(".score-detail-bar-fill");
    bars.forEach(b => {
      const w = b.style.width;
      b.style.width = "0%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          b.style.width = w;
        });
      });
    });
  }, 50);
};