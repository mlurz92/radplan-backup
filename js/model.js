import {
  WORKPLACES,
  STATUSES,
  VACATION_CODES,
  ABSENCE_CODES,
  monthKey,
  prevMK,
  daysInMonth,
  nextCalendarDay,
  normalizeMonthDataShape,
  isWorkday,
  getSaxonyHolidaysCached,
  getEmpMeta
} from './constants.js';

import {
  DATA,
  state,
  planMode,
  planData,
  planBaseline,
  planHistory,
  planHistoryIdx,
  planSessions,
  saveToStorage,
  setPlanData,
  setPlanBaseline,
  setPlanHistory,
  setPlanHistoryIdx,
  setPlanSessions
} from './state.js';

export function getMonthDataRaw(y, m) {
  const k = monthKey(y, m);
  
  if (!DATA[k]) {
    const prev = DATA[prevMK(y, m)];
    DATA[k] = {
      employees: prev && prev.employees ? [...prev.employees] : [],
      assignments: {},
      rbn: {}
    };
  }
  
  normalizeMonthDataShape(DATA[k]);
  return DATA[k];
}

export function ensurePostBDFreiDays() {
  let totalRepaired = 0;
  
  for (const [k, mData] of Object.entries(DATA)) {
    if (!mData || !mData.employees || !mData.assignments) {
      continue;
    }
    
    const parts = k.split("-");
    const ky = parseInt(parts[0], 10);
    const km = parseInt(parts[1], 10);
    const dim = daysInMonth(ky, km);
    
    for (const emp of mData.employees) {
      if (!mData.assignments[emp]) {
        continue;
      }
      
      for (let d = 1; d <= dim; d++) {
        if (mData.assignments[emp][d]?.duty !== "D") {
          continue;
        }
        
        const next = nextCalendarDay(ky, km, d);
        
        if (next.y === ky && next.m === km) {
          if (!mData.assignments[emp][next.d]) {
            mData.assignments[emp][next.d] = {};
          }
          if (!mData.assignments[emp][next.d].assignment) {
            mData.assignments[emp][next.d].assignment = "F";
            totalRepaired++;
          }
        } else {
          const nk = monthKey(next.y, next.m);
          if (DATA[nk]) {
            if (!DATA[nk].assignments) {
              DATA[nk].assignments = {};
            }
            if (!DATA[nk].assignments[emp]) {
              DATA[nk].assignments[emp] = {};
            }
            if (!DATA[nk].assignments[emp][next.d]) {
              DATA[nk].assignments[emp][next.d] = {};
            }
            if (!DATA[nk].assignments[emp][next.d].assignment) {
              DATA[nk].assignments[emp][next.d].assignment = "F";
              totalRepaired++;
            }
          }
        }
      }
    }
  }
  
  if (totalRepaired > 0) {
    saveToStorage();
  }
  
  return totalRepaired;
}

export function getMonthData(y, m) {
  if (planMode && planData && y === state.year && m === state.month) {
    return planData;
  }
  
  const md = getMonthDataRaw(y, m);
  normalizeMonthDataShape(md);
  return md;
}

export function setCell(y, m, emp, day, patch) {
  const md = getMonthData(y, m);
  
  if (!md.assignments[emp]) {
    md.assignments[emp] = {};
  }
  
  const merged = { ...(md.assignments[emp][day] || {}), ...patch };
  
  Object.keys(merged).forEach((k) => {
    if (!merged[k]) {
      delete merged[k];
    }
  });
  
  if (!Object.keys(merged).length) {
    delete md.assignments[emp][day];
  } else {
    md.assignments[emp][day] = merged;
  }
  
  if (!planMode) {
    saveToStorage();
  }
}

export function clearCell(y, m, emp, day) {
  const md = getMonthData(y, m);
  
  if (md.assignments[emp]) {
    delete md.assignments[emp][day];
  }
  
  if (!planMode) {
    saveToStorage();
  }
}

export function getCell(y, m, emp, day) {
  const md = getMonthData(y, m);
  return md.assignments?.[emp]?.[day] || {};
}

export function getRbnValue(y, m, day) {
  const md = getMonthData(y, m);
  return md.rbn?.[day] || "";
}

export function setRbnValue(y, m, day, value) {
  const md = getMonthData(y, m);
  
  if (!md.rbn) {
    md.rbn = {};
  }
  
  if (value) {
    md.rbn[day] = value;
  } else {
    delete md.rbn[day];
  }
  
  if (!planMode) {
    saveToStorage();
  }
}

export function addEmployee(y, m, name) {
  const md = getMonthData(y, m);
  
  if (!md.employees.includes(name)) {
    md.employees.push(name);
  }
  
  if (planMode) {
    persistPlanSessionRefs();
  } else {
    saveToStorage();
  }
}

export function removeEmployee(y, m, name) {
  const md = getMonthData(y, m);
  
  md.employees = md.employees.filter((e) => e !== name);
  delete md.assignments[name];
  
  if (planMode) {
    persistPlanSessionRefs();
  } else {
    saveToStorage();
  }
}

export function dutyOwner(y, m, day, dt) {
  const md = getMonthData(y, m);
  return md.employees.find((e) => md.assignments[e]?.[day]?.duty === dt) || null;
}

export function dayCodeCount(y, m, day, code) {
  const md = getMonthData(y, m);
  
  if (code === "D" || code === "HG") {
    return md.employees.filter((e) => md.assignments[e]?.[day]?.duty === code).length;
  }
  
  return md.employees.filter((e) => {
    const assignment = md.assignments[e]?.[day]?.assignment || "";
    const parts = assignment.split("/").map((x) => x.trim());
    return parts.includes(code);
  }).length;
}

export function buildProfileStats(y, m, emp) {
  const hols = getSaxonyHolidaysCached(y);
  const dim = daysInMonth(y, m);
  
  let totalWorkdays = 0;
  let coveredWorkdays = 0;
  
  const wpCounts = {};
  const stCounts = {};
  const dutyD = [];
  const dutyHG = [];
  
  for (let d = 1; d <= dim; d++) {
    const work = isWorkday(y, m, d, hols);
    if (work) {
      totalWorkdays++;
    }
    
    const cell = getCell(y, m, emp, d);
    let isActiveOnWorkday = false;
    
    if (cell.assignment) {
      const parts = cell.assignment.split("/").map((x) => x.trim());
      let hasWorkplace = false;
      parts.forEach((p) => {
        if (WORKPLACES.find((w) => w.code === p)) {
          wpCounts[p] = (wpCounts[p] || 0) + 1;
          hasWorkplace = true;
        } else if (STATUSES.find((s) => s.code === p)) {
          if (!VACATION_CODES.includes(p) || work) {
            stCounts[p] = (stCounts[p] || 0) + 1;
          }
        }
      });
      if (hasWorkplace && work) {
        isActiveOnWorkday = true;
      }
    }
    
    if (cell.duty === "D") {
      dutyD.push(d);
      if (work) isActiveOnWorkday = true;
    }
    if (cell.duty === "HG") {
      dutyHG.push(d);
      if (work) isActiveOnWorkday = true;
    }
    
    if (isActiveOnWorkday) {
      coveredWorkdays++;
    }
  }
  
  const totalActive = coveredWorkdays;
  const totalAbs = ABSENCE_CODES.reduce((s, c) => s + (stCounts[c] || 0), 0);
  const frei = stCounts["F"] || 0;
  const uncovered = Math.max(0, totalWorkdays - totalActive - totalAbs - frei);
  
  return {
    totalWorkdays,
    coveredWorkdays,
    uncovered,
    wpCounts,
    stCounts,
    totalActive,
    totalAbs,
    frei,
    dutyD,
    dutyHG,
    dim,
  };
}

export function buildYearlyStats(emp, year) {
  const months = [];
  const totals = {
    totalWorkdays: 0,
    coveredWorkdays: 0,
    totalActive: 0,
    wpCounts: {},
    stCounts: {},
    dutyD: 0,
    dutyHG: 0,
  };
  
  for (let m = 0; m < 12; m++) {
    const k = monthKey(year, m);
    
    if (!DATA[k] || !DATA[k].employees.includes(emp)) {
      months.push({
        m,
        hasData: false,
        totalWorkdays: 0,
        coveredWorkdays: 0,
        totalActive: 0,
        wpCounts: {},
        stCounts: {},
        dutyD: 0,
        dutyHG: 0,
      });
      continue;
    }
    
    const hols = getSaxonyHolidaysCached(year);
    const dim = daysInMonth(year, m);
    
    let wd = 0;
    let cov = 0;
    let dutyD = 0;
    let dutyHG = 0;
    
    const wpc = {};
    const stc = {};
    
    for (let d = 1; d <= dim; d++) {
      const wdDay = isWorkday(year, m, d, hols);
      if (wdDay) {
        wd++;
      }
      
      const cell = getCell(year, m, emp, d);
      let isActiveOnWorkday = false;
      
      if (cell.assignment) {
        const parts = cell.assignment.split("/").map((x) => x.trim());
        let hasWorkplace = false;
        parts.forEach((p) => {
          if (WORKPLACES.find((w) => w.code === p)) {
            wpc[p] = (wpc[p] || 0) + 1;
            hasWorkplace = true;
          } else if (STATUSES.find((s) => s.code === p)) {
            if (!VACATION_CODES.includes(p) || wdDay) {
              stc[p] = (stc[p] || 0) + 1;
            }
          }
        });
        if (hasWorkplace && wdDay) {
          isActiveOnWorkday = true;
        }
      }
      
      if (cell.duty === "D") {
        dutyD++;
        if (wdDay) isActiveOnWorkday = true;
      }
      if (cell.duty === "HG") {
        dutyHG++;
        if (wdDay) isActiveOnWorkday = true;
      }
      
      if (isActiveOnWorkday) {
        cov++;
      }
    }
    
    totals.totalWorkdays += wd;
    totals.coveredWorkdays += cov;
    totals.totalActive += cov;
    totals.dutyD += dutyD;
    totals.dutyHG += dutyHG;
    
    Object.entries(wpc).forEach(([c, v]) => {
      totals.wpCounts[c] = (totals.wpCounts[c] || 0) + v;
    });
    
    Object.entries(stc).forEach(([c, v]) => {
      totals.stCounts[c] = (totals.stCounts[c] || 0) + v;
    });
    
    months.push({
      m,
      hasData: true,
      totalWorkdays: wd,
      coveredWorkdays: cov,
      totalActive: cov,
      wpCounts: wpc,
      stCounts: stc,
      dutyD,
      dutyHG,
    });
  }
  
  totals.vacationDays = VACATION_CODES.reduce((s, c) => s + (totals.stCounts[c] || 0), 0);
  totals.sickDays = (totals.stCounts["K"] || 0) + (totals.stCounts["KK"] || 0);
  totals.fzaDays = totals.stCounts["FZA"] || 0;
  totals.wbDays = totals.stCounts["WB"] || 0;
  totals.freiDays = totals.stCounts["F"] || 0;
  
  return { months, totals, year };
}

export function getEmployeesForYear(year) {
  const emps = new Set();
  
  Object.entries(DATA).forEach(([key, md]) => {
    if (!key.startsWith(`${year}-`) || !md?.employees) {
      return;
    }
    md.employees.forEach((emp) => emps.add(emp));
  });
  
  getMonthDataRaw(year, state.month).employees.forEach((emp) => emps.add(emp));
  
  if (planMode) {
    Object.keys(planSessions).forEach((key) => {
      if (!key.startsWith(`${year}-`)) {
        return;
      }
      planSessions[key].employees.forEach((emp) => emps.add(emp));
    });
  }
  
  return [...emps].sort((a, b) => a.localeCompare(b, 'de'));
}

export function getRoleFilterBuckets(year, employees) {
  const buckets = { ALL: employees.length, CA: 0, OA: 0, FA: 0, AA: 0, OHNE: 0 };
  
  employees.forEach((emp) => {
    const pos = getEmpMeta(emp).position;
    if (pos === "CA") {
      buckets.CA++;
    } else if (["LOA", "OA", "OÄ"].includes(pos)) {
      buckets.OA++;
    } else if (["FA", "FÄ"].includes(pos)) {
      buckets.FA++;
    } else if (["AA", "AÄ"].includes(pos)) {
      buckets.AA++;
    } else {
      buckets.OHNE++;
    }
  });
  
  return buckets;
}

export function getEmployeeYearCardMetrics(emp, year) {
  const ys = buildYearlyStats(emp, year);
  const meta = getEmpMeta(emp);
  const activeMonths = ys.months.filter((mon) => mon.hasData).length;
  const totalAbs = ys.totals.vacationDays + ys.totals.sickDays + ys.totals.fzaDays + ys.totals.wbDays + ys.totals.freiDays;
  const requiredWorkdays = Math.max(0, ys.totals.totalWorkdays - totalAbs);
  const coverage = requiredWorkdays > 0 
    ? Math.min(100, Math.round((ys.totals.totalActive / requiredWorkdays) * 100)) 
    : 0;
    
  return { emp, ys, meta, activeMonths, coverage };
}

export function matchRoleFilter(emp, role) {
  if (role === "ALL") {
    return true;
  }
  
  const pos = getEmpMeta(emp).position;
  
  if (role === "CA") {
    return pos === "CA";
  }
  if (role === "OA") {
    return ["LOA", "OA", "OÄ"].includes(pos);
  }
  if (role === "FA") {
    return ["FA", "FÄ"].includes(pos);
  }
  if (role === "AA") {
    return ["AA", "AÄ"].includes(pos);
  }
  if (role === "OHNE") {
    return pos === "—";
  }
  
  return true;
}

export function cloneData(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function getStoredPlanDraft(key) {
  try {
    const raw = localStorage.getItem(`radplan_v3_plan_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function persistPlanSessionRefs() {
  if (!planData) {
    return;
  }
  planData.baseline = planBaseline;
  planData.history = planHistory;
  planData.historyIdx = planHistoryIdx;
}

export function syncPlanSessionRefs(session) {
  setPlanData(session);
  setPlanBaseline(session.baseline);
  setPlanHistory(session.history);
  setPlanHistoryIdx(session.historyIdx);
}

export function createPlanSession(y, m) {
  const key = monthKey(y, m);
  const stored = getStoredPlanDraft(key);
  
  const source = stored && stored.assignments
    ? stored
    : {
        employees: [...getMonthDataRaw(y, m).employees],
        assignments: cloneData(getMonthDataRaw(y, m).assignments || {}),
        rbn: cloneData(getMonthDataRaw(y, m).rbn || {}),
        wishes: {},
      };
      
  const sourceRbn = cloneData(source.rbn || {});
  
  return {
    key,
    employees: [...(source.employees || [])],
    assignments: cloneData(source.assignments || {}),
    rbn: sourceRbn,
    wishes: cloneData(source.wishes || {}),
    baseline: {
      assignments: cloneData(source.assignments || {}),
      rbn: cloneData(sourceRbn),
    },
    history: [
      {
        assignments: cloneData(source.assignments || {}),
        rbn: cloneData(sourceRbn),
      },
    ],
    historyIdx: 0,
  };
}

export function hasSessionChanges(session) {
  const currentStr = JSON.stringify({ 
    assignments: session.assignments, 
    rbn: session.rbn || {} 
  });
  const baselineStr = JSON.stringify(session.baseline);
  
  return currentStr !== baselineStr;
}

export function hasAnyPlanChanges() {
  return Object.values(planSessions).some(hasSessionChanges);
}

export function ensurePlanSession(y, m) {
  const key = monthKey(y, m);
  
  if (!planSessions[key]) {
    const sessionsCopy = { ...planSessions };
    sessionsCopy[key] = createPlanSession(y, m);
    setPlanSessions(sessionsCopy);
  }
  
  normalizeMonthDataShape(planSessions[key]);
  return planSessions[key];
}

export function loadPlanSessionForState(y, m) {
  const session = ensurePlanSession(y, m);
  syncPlanSessionRefs(session);
  return session;
}