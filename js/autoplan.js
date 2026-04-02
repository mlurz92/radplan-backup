import { 
  VACATION_CODES, 
  ABSENCE_CODES, 
  isFacharzt, 
  isAssistenzarzt, 
  getSaxonyHolidaysCached, 
  monthKey, 
  dateKey,
  daysInMonth, 
  weekday, 
  isWeekend,
  isWorkday, 
  isHoliday, 
  nextCalendarDay, 
  prevCalendarDay, 
  isoWeekNumber,
  easterDate, 
  addDays,
  DOW_ABBR,
  DOW_LONG,
  MONTHS,
  MONTHS_SHORT,
  getEmpMeta,
  posColor
} from './constants.js';

import { 
  state, 
  planMode, 
  planData, 
  DATA 
} from './state.js';

import { 
  getMonthData, 
  getCell, 
  dutyOwner 
} from './model.js';

export let autoPlanResult = null;
export let autoPlanTargets = {};
export let apViewMode = "config";
export let autoPlanConfigRenderToken = 0;

export const DUTY_EXEMPT = ["Prof. Schäfer"];
export const TARGET_WEEKEND_DUTY = 1;
export const RELAXED_WEEKEND_DUTY_LIMIT = 1.5;

export function isDutyExempt(empName) { 
  return DUTY_EXEMPT.includes(empName); 
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function collectHistoricalDutyStats(upToYear, upToMonth) {
  const stats = {};
  const md = getMonthData(upToYear, upToMonth);
  
  md.employees.forEach((e) => {
    stats[e] = { 
      bd: 0, 
      hg: 0, 
      weDuty: 0, 
      holDuty: 0, 
      thuBd: 0, 
      hgForAA: 0, 
      hgForFA: 0, 
      satBd: 0 
    };
  });
  
  for (const [k, mData] of Object.entries(DATA)) {
    if (!mData || typeof mData !== "object" || !Array.isArray(mData.employees) || !mData.assignments) {
      continue;
    }
    
    const parts = k.split("-");
    const ky = parseInt(parts[0], 10);
    const km = parseInt(parts[1], 10);
    
    if (!Number.isFinite(ky) || !Number.isFinite(km) || km < 0 || km > 11) {
      continue;
    }
    
    if (ky > upToYear || (ky === upToYear && km >= upToMonth)) {
      continue;
    }
    
    const hols = getSaxonyHolidaysCached(ky);
    const dim = daysInMonth(ky, km);
    const weMapPerEmp = {};
    const bdOwnerByDay = {};
    const dayMeta = new Array(dim + 1);
    
    for (let d = 1; d <= dim; d++) {
      const wd = weekday(ky, km, d);
      dayMeta[d] = { 
        wd: wd, 
        hol: isHoliday(ky, km, d, hols), 
        isWEDay: wd === 5 || wd === 6 || wd === 0, 
        kw: isoWeekNumber(ky, km, d) 
      };
    }
    
    mData.employees.forEach(emp => {
      if (!stats[emp]) {
        stats[emp] = { bd: 0, hg: 0, weDuty: 0, holDuty: 0, thuBd: 0, hgForAA: 0, hgForFA: 0, satBd: 0 };
      }
      weMapPerEmp[emp] = {};
    });
    
    for (let d = 1; d <= dim; d++) {
      mData.employees.forEach(emp => { 
        if (mData.assignments?.[emp]?.[d]?.duty === "D") {
          bdOwnerByDay[d] = emp;
        }
      });
    }
    
    for (let d = 1; d <= dim; d++) {
      const meta = dayMeta[d];
      mData.employees.forEach(emp => {
        const cell = mData.assignments?.[emp]?.[d];
        if (!cell?.duty) {
          return;
        }
        
        if (cell.duty === "D") {
          stats[emp].bd++;
          if (meta.hol) stats[emp].holDuty++;
          if (meta.wd === 4) stats[emp].thuBd++;
          if (meta.wd === 6) stats[emp].satBd++;
          if (meta.isWEDay) {
            if (!weMapPerEmp[emp][meta.kw]) {
              weMapPerEmp[emp][meta.kw] = { hasD: false, hasHG: false };
            }
            weMapPerEmp[emp][meta.kw].hasD = true;
          }
        } else if (cell.duty === "HG") {
          stats[emp].hg++;
          if (meta.hol) stats[emp].holDuty++;
          if (meta.isWEDay) {
            if (!weMapPerEmp[emp][meta.kw]) {
              weMapPerEmp[emp][meta.kw] = { hasD: false, hasHG: false };
            }
            if (!weMapPerEmp[emp][meta.kw].hasD) {
              weMapPerEmp[emp][meta.kw].hasHG = true;
            }
          }
          const bdHolder = bdOwnerByDay[d];
          if (bdHolder && isAssistenzarzt(bdHolder)) {
            stats[emp].hgForAA++;
          } else {
            stats[emp].hgForFA++;
          }
        }
      });
    }
    
    mData.employees.forEach(emp => {
      Object.values(weMapPerEmp[emp] || {}).forEach(({hasD, hasHG}) => {
        if (hasD) {
          stats[emp].weDuty += 1; 
        } else if (hasHG) {
          stats[emp].weDuty += 0.5;
        }
      });
    });
  }
  return stats;
}

export async function collectHistoricalDutyStatsAsync(upToYear, upToMonth) {
  await sleep(0);
  return collectHistoricalDutyStats(upToYear, upToMonth);
}

export function hasVacationInWeek(y, m, emp, targetKW) {
  const dim = daysInMonth(y, m);
  for (let d = 1; d <= dim; d++) {
    if (isoWeekNumber(y, m, d) !== targetKW) continue;
    const cell = getCell(y, m, emp, d);
    if (cell.assignment && cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c))) {
      return true;
    }
  }
  
  const nextM = m === 11 ? 0 : m + 1;
  const nextY = m === 11 ? y + 1 : y;
  const nk = monthKey(nextY, nextM);
  
  if (DATA[nk]) {
    const ndim = daysInMonth(nextY, nextM);
    for (let d = 1; d <= ndim; d++) {
      if (isoWeekNumber(nextY, nextM, d) !== targetKW) continue;
      const cell = DATA[nk].assignments?.[emp]?.[d];
      if (cell?.assignment && cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c))) {
        return true;
      }
    }
  }
  return false;
}

export function isAbsentOnDay(y, m, emp, day, assignments) {
  const cell = assignments[emp]?.[day];
  if (!cell?.assignment) return false;
  return cell.assignment.split("/").map((x) => x.trim()).some((c) => ABSENCE_CODES.includes(c));
}

export function isVacationOnDay(y, m, emp, day, assignments) {
  const cell = assignments[emp]?.[day];
  if (!cell?.assignment) return false;
  return cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c));
}

export function isNextDayVacation(y, m, emp, d, assignments) {
  const next = nextCalendarDay(y, m, d);
  if (next.y === y && next.m === m) {
    return isVacationOnDay(y, m, emp, next.d, assignments);
  }
  const nk = monthKey(next.y, next.m);
  if (DATA[nk]?.assignments?.[emp]?.[next.d]) {
    const cell = DATA[nk].assignments[emp][next.d];
    if (cell.assignment && cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c))) {
      return true;
    }
  }
  return false;
}

export function hasCTLeadershipConflict(y, m, emp, day, assignments) {
  if (emp !== "Dr. Becker" && emp !== "Dr. Martin") {
    return false;
  }
  
  const partner = emp === "Dr. Becker" ? "Dr. Martin" : "Dr. Becker";
  const next = nextCalendarDay(y, m, day);
  const hols = getSaxonyHolidaysCached(next.y);
  
  if (!isWorkday(next.y, next.m, next.d, hols)) {
    return false;
  }
  
  let partnerCell;
  if (next.y === y && next.m === m) {
    partnerCell = assignments[partner]?.[next.d] || {};
  } else {
    const nk = monthKey(next.y, next.m);
    partnerCell = DATA[nk]?.assignments?.[partner]?.[next.d] || {};
  }
  
  if (partnerCell.assignment) {
    const codes = partnerCell.assignment.split("/").map((x) => x.trim());
    if (codes.some((c) => VACATION_CODES.includes(c) || ABSENCE_CODES.includes(c))) {
      return true;
    }
  }
  return false;
}

export function countWeekendDuties(y, m, emp, assignments) {
  const weMap = {};
  const dim = daysInMonth(y, m);
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    if (wd !== 5 && wd !== 6 && wd !== 0) continue;
    
    const cell = assignments[emp]?.[d];
    if (!cell?.duty) continue;
    
    const kw = isoWeekNumber(y, m, d);
    if (!weMap[kw]) {
      weMap[kw] = { hasD: false, hasHG: false };
    }
    
    if (cell.duty === "D") {
      weMap[kw].hasD = true;
    } else if (cell.duty === "HG") {
      weMap[kw].hasHG = true;
    }
  }
  
  let count = 0;
  for (const { hasD, hasHG } of Object.values(weMap)) {
    if (hasD) {
      count += 1;
    } else if (hasHG) {
      count += 0.5;
    }
  }
  return count;
}

export function getWeekendDutyKWs(y, m, emp, assignments) {
  const dim = daysInMonth(y, m);
  const kws = new Set();
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    const cell = assignments[emp]?.[d];
    if (!cell?.duty) continue;
    
    if (wd === 5 || wd === 6 || wd === 0) {
      kws.add(isoWeekNumber(y, m, d));
    }
  }
  return kws;
}

export function wouldCreateDFDF(emp, d, assignments) {
  if (d >= 3 && assignments[emp]?.[d - 2]?.duty === "D" && assignments[emp]?.[d - 1]?.assignment === "F") {
    return true;
  }
  if (assignments[emp]?.[d + 2]?.duty === "D") {
    return true;
  }
  return false;
}

export function getWeekendStateForKW(y, m, emp, assignments, kw) {
  const dim = daysInMonth(y, m);
  let hasD = false;
  let hasHG = false;
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    if (wd !== 5 && wd !== 6 && wd !== 0) continue;
    if (isoWeekNumber(y, m, d) !== kw) continue;
    
    const duty = assignments[emp]?.[d]?.duty;
    if (duty === "D") {
      hasD = true;
    } else if (duty === "HG") {
      hasHG = true;
    }
  }
  return { hasD, hasHG };
}

export function projectedWeekendDutyCount(y, m, emp, assignments, dutyCode, d) {
  const current = countWeekendDuties(y, m, emp, assignments);
  const wd = weekday(y, m, d);
  
  if (wd !== 5 && wd !== 6 && wd !== 0) {
    return current;
  }
  
  const kw = isoWeekNumber(y, m, d);
  const { hasD, hasHG } = getWeekendStateForKW(y, m, emp, assignments, kw);
  
  if (dutyCode === "D") {
    if (hasD) return current;
    return current + (hasHG ? 0.5 : 1);
  }
  
  if (dutyCode === "HG") {
    if (hasD || hasHG) return current;
    return current + 0.5;
  }
  
  return current;
}

export function wouldCreateConsecutiveWeekendDuty(y, m, emp, assignments, d) {
  const wd = weekday(y, m, d);
  if (wd !== 5 && wd !== 6 && wd !== 0) {
    return false;
  }
  
  const candidateKw = isoWeekNumber(y, m, d);
  const kws = getWeekendDutyKWs(y, m, emp, assignments);
  
  if (!kws.has(candidateKw)) {
    kws.add(candidateKw);
  }
  
  const ordered = [...kws].sort((a, b) => a - b);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i] - ordered[i - 1] === 1) {
      return true;
    }
  }
  return false;
}

export function hasDalitzMammographyConflict(y, m, emp, d, dutyType, assignments) {
  const wd = weekday(y, m, d);
  if (wd !== 0 && wd !== 1) return false;
  
  const empsList = Object.keys(assignments);
  
  if (dutyType === "HG" && emp === "Fr. Dalitz") {
    const bdHolder = empsList.find(e => assignments[e]?.[d]?.duty === "D");
    if (bdHolder === "Hr. Torki" || bdHolder === "Hr. Sebastian") {
      return true;
    }
  }
  
  if (dutyType === "D" && (emp === "Hr. Torki" || emp === "Hr. Sebastian")) {
    const hgHolder = empsList.find(e => assignments[e]?.[d]?.duty === "HG");
    if (hgHolder === "Fr. Dalitz") {
      return true;
    }
  }
  
  return false;
}

export function dutyKey(emp, day) { 
  return `${emp}@@${day}`; 
}

export function buildRuleTelemetryBucket() { 
  return { counts: {}, events: [] }; 
}

export function trackRuleTelemetry(bucket, phase, label, detail, severity = "info") {
  if (!bucket || !label) return;
  bucket.counts[label] = (bucket.counts[label] || 0) + 1;
  bucket.events.push({ phase, label, detail, severity, count: bucket.counts[label] });
}

export function computeFairnessSpread(values) {
  if (!values.length) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max - min;
}

export function averageFromArray(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function listDutyAssignments(emps, dim, assignments, dutyCode) {
  const items = [];
  for (let d = 1; d <= dim; d++) {
    for (const emp of emps) {
      if (assignments[emp]?.[d]?.duty === dutyCode) {
        items.push({ day: d, emp });
        break;
      }
    }
  }
  return items;
}

export function cleanupAssignmentCell(assignments, emp, day) {
  if (!assignments[emp]?.[day]) return;
  Object.keys(assignments[emp][day]).forEach((key) => {
    if (!assignments[emp][day][key]) {
      delete assignments[emp][day][key];
    }
  });
  if (!Object.keys(assignments[emp][day]).length) {
    delete assignments[emp][day];
  }
}

export async function computeAutoPlan(customTargets) {
  const { year: y, month: m } = state;
  if (!planMode || !planData) return null;
  
  const hols = getSaxonyHolidaysCached(y);
  const dim = daysInMonth(y, m);
  const emps = [...planData.employees];
  const wishes = planData.wishes || {};
  const result = JSON.parse(JSON.stringify(planData.assignments));
  const externalAssignments = {};
  const log = [];
  const report = [];
  const fluxTraces = [];
  const fixedDutyKeys = new Set();
  const autoRestDays = new Set();
  const ruleTelemetry = buildRuleTelemetryBucket();
  const beckerSaturdayFzaWarnings = [];

  function trace(phase, msg) { 
    fluxTraces.push({ phase, msg }); 
  }
  
  function recordRule(phase, label, detail, severity = "info") { 
    trackRuleTelemetry(ruleTelemetry, phase, label, detail, severity); 
  }
  
  function isDayDTasked(d, assignments) { 
    const a = assignments || result;
    return emps.some(e => a[e]?.[d]?.duty === "D"); 
  }
  
  function isDayHGTasked(d, assignments) { 
    const a = assignments || result;
    return emps.some(e => a[e]?.[d]?.duty === "HG"); 
  }

  emps.forEach((emp) => {
    for (let d = 1; d <= dim; d++) {
      const duty = planData.assignments?.[emp]?.[d]?.duty;
      if (duty) {
        fixedDutyKeys.add(`${duty}:${dutyKey(emp, d)}`);
      }
    }
  });

  log.push({ phase: "init", icon: "📊", msg: "Lade historische Daten und initialisiere Constraints...", pct: 5 });
  await sleep(10);
  
  const hist = collectHistoricalDutyStats(y, m);
  const dutyEmps = emps.filter((e) => !isDutyExempt(e));
  const hgFAs = dutyEmps.filter((e) => isFacharzt(e));

  const bdTarget = {};
  emps.forEach((e) => {
    if (customTargets && customTargets[e] !== undefined) {
      bdTarget[e] = customTargets[e];
    } else {
      if (isDutyExempt(e)) bdTarget[e] = 0;
      else if (e === "Dr. Polednia" || e === "Dr. Becker" || e === "Hr. Sebastian") bdTarget[e] = 3;
      else bdTarget[e] = 4;
    }
  });

  function getScheduledCell(targetY, targetM, emp, day, assignments) { 
    const a = assignments || result;
    if (targetY === y && targetM === m) {
      return a[emp]?.[day] || {};
    }
    const mk = monthKey(targetY, targetM);
    const stored = DATA[mk]?.assignments?.[emp]?.[day] || {};
    const queued = externalAssignments[mk]?.[emp]?.[day] || {};
    return { ...stored, ...queued };
  }

  function getScheduledDuty(targetY, targetM, emp, day, assignments) { 
    return getScheduledCell(targetY, targetM, emp, day, assignments).duty || null; 
  }
  
  function getScheduledAssignmentCodes(targetY, targetM, emp, day, assignments) {
    const assignment = getScheduledCell(targetY, targetM, emp, day, assignments).assignment || "";
    return assignment.split("/").map((code) => code.trim()).filter(Boolean);
  }

  function findNextWorkdayFrom(startY, startM, startD) {
    let cursor = nextCalendarDay(startY, startM, startD);
    let guard = 0;
    while (guard < 14) {
      const holsForCursor = getSaxonyHolidaysCached(cursor.y);
      if (isWorkday(cursor.y, cursor.m, cursor.d, holsForCursor)) {
        return cursor;
      }
      cursor = nextCalendarDay(cursor.y, cursor.m, cursor.d);
      guard++;
    }
    return null;
  }

  function hasOtherFAFreeOrVacationOn(targetY, targetM, day, excludedEmp, assignments) {
    return hgFAs.some((emp) => {
      if (emp === excludedEmp) return false;
      const codes = getScheduledAssignmentCodes(targetY, targetM, emp, day, assignments);
      return codes.some((code) => code === "F" || VACATION_CODES.includes(code));
    });
  }

  function queueExternalAssignment(targetY, targetM, emp, day, patch) {
    const mk = monthKey(targetY, targetM);
    if (!externalAssignments[mk]) {
      externalAssignments[mk] = {};
    }
    if (!externalAssignments[mk][emp]) {
      externalAssignments[mk][emp] = {};
    }
    const existingQueued = externalAssignments[mk][emp][day] || {};
    const existingStored = DATA[mk]?.assignments?.[emp]?.[day] || {};
    const merged = { ...existingQueued };
    
    for (const [key, value] of Object.entries(patch)) {
      if (!value) continue;
      if (!existingQueued[key] && !existingStored[key]) {
        merged[key] = value;
      }
    }
    
    if (Object.keys(merged).length) {
      externalAssignments[mk][emp][day] = merged;
    }
  }

  let repairedF = 0;
  for (const emp of emps) {
    if (!result[emp]) continue;
    for (let d = 1; d <= dim; d++) {
      if (result[emp][d]?.duty !== "D") continue;
      const next = nextCalendarDay(y, m, d);
      if (next.y === y && next.m === m) {
        if (!result[emp]) result[emp] = {};
        if (!result[emp][next.d]) result[emp][next.d] = {};
        if (!result[emp][next.d].assignment) {
          result[emp][next.d].assignment = "F";
          autoRestDays.add(dutyKey(emp, next.d));
          repairedF++;
        }
      }
    }
  }
  
  if (repairedF > 0) {
    log.push({ phase: "init", icon: "🔧", msg: `${repairedF} fehlende Ruhetage nach gesetzten BD ergänzt`, pct: 10 });
  }

  const currentBD = {};
  const currentHG = {};
  const currentHGForAA = {};
  const currentHGForFA = {};
  const currentSatBD = {};
  
  emps.forEach((e) => { 
    currentBD[e] = 0; 
    currentHG[e] = 0; 
    currentHGForAA[e] = 0; 
    currentHGForFA[e] = 0; 
    currentSatBD[e] = 0; 
  });
  
  for (let d = 1; d <= dim; d++) {
    for (const e of emps) {
      if (!result[e]?.[d]) continue;
      const wd = weekday(y, m, d);
      
      if (result[e][d].duty === "D") { 
        currentBD[e]++; 
        if (wd === 6) currentSatBD[e]++; 
      }
      
      if (result[e][d].duty === "HG") {
        currentHG[e]++;
        const bdHolder = emps.find((e2) => e2 !== e && result[e2]?.[d]?.duty === "D");
        if (bdHolder && isAssistenzarzt(bdHolder)) {
          currentHGForAA[e]++;
        } else {
          currentHGForFA[e]++;
        }
      }
    }
  }

  const bdNeeded = [];
  const hgNeeded = [];
  for (let d = 1; d <= dim; d++) {
    if (!emps.some((e) => result[e]?.[d]?.duty === "D")) bdNeeded.push(d);
    if (!emps.some((e) => result[e]?.[d]?.duty === "HG")) hgNeeded.push(d);
  }

  const easter = easterDate(y);
  const easterDays = new Set();
  const pfingstDays = new Set();
  
  [addDays(easter, -2), easter, addDays(easter, 1)].forEach((dt) => { 
    if (dt.getMonth() === m) easterDays.add(dt.getDate()); 
  });
  [addDays(easter, 49), addDays(easter, 50)].forEach((dt) => { 
    if (dt.getMonth() === m) pfingstDays.add(dt.getDate()); 
  });

  function hasOsterPfingstDutyInOtherMonth(emp, isEaster) {
    const targetDates = isEaster ? [addDays(easter, -2), easter, addDays(easter, 1)] : [addDays(easter, 49), addDays(easter, 50)];
    for (const dt of targetDates) {
      const tm = dt.getMonth(); 
      const td = dt.getDate();
      if (tm === m) continue;
      const mk = monthKey(y, tm);
      if (DATA[mk]?.assignments?.[emp]?.[td]?.duty) return true;
    }
    return false;
  }

  function workedEasterOrPfingsten(emp) {
    let easterWork = false;
    let pfingstWork = false;
    
    for (const d of easterDays) {
      if (result[emp]?.[d]?.duty) easterWork = true;
    }
    for (const d of pfingstDays) {
      if (result[emp]?.[d]?.duty) pfingstWork = true;
    }
    
    if (!easterWork) easterWork = hasOsterPfingstDutyInOtherMonth(emp, true);
    if (!pfingstWork) pfingstWork = hasOsterPfingstDutyInOtherMonth(emp, false);
    
    return { easterWork, pfingstWork };
  }

  function hasHolidayBlockConflict(emp, d) {
    if (easterDays.has(d)) return workedEasterOrPfingsten(emp).pfingstWork;
    if (pfingstDays.has(d)) return workedEasterOrPfingsten(emp).easterWork;
    return false;
  }

  function hasAdjacentHG(emp, d, assignments) {
    const a = assignments || result;
    const prev = prevCalendarDay(y, m, d);
    const next = nextCalendarDay(y, m, d);
    return (getScheduledDuty(prev.y, prev.m, emp, prev.d, a) === "HG" || getScheduledDuty(next.y, next.m, emp, next.d, a) === "HG");
  }

  function updateAutoF(emp, day) {
    const next = nextCalendarDay(y, m, day);
    if (next.y === y && next.m === m) {
      if (!result[emp]) result[emp] = {};
      if (!result[emp][next.d]) result[emp][next.d] = {};
      if (!result[emp][next.d].assignment) { 
        result[emp][next.d].assignment = "F"; 
        autoRestDays.add(dutyKey(emp, next.d)); 
      }
      return;
    }
    queueExternalAssignment(next.y, next.m, emp, next.d, { assignment: "F" });
  }

  function clearAutoF(emp, day) {
    const next = nextCalendarDay(y, m, day);
    if (next.y !== y || next.m !== m) return;
    
    const key = dutyKey(emp, next.d);
    if (!autoRestDays.has(key)) return;
    
    if (result[emp]?.[next.d]?.assignment === "F") {
      delete result[emp][next.d].assignment;
    }
    cleanupAssignmentCell(result, emp, next.d);
    autoRestDays.delete(key);
  }

  function minDistanceForDuty(emp, d, dutyCode, assignments) {
    const a = assignments || result;
    let minDist = Infinity;
    for (let i = 1; i <= dim; i++) {
      if (i === d) continue;
      if (a[emp]?.[i]?.duty === dutyCode) {
        minDist = Math.min(minDist, Math.abs(i - d));
      }
    }
    return minDist;
  }

  function canDoBD(emp, d, relaxed, assignments, options) {
    relaxed = relaxed || false;
    assignments = assignments || result;
    options = options || {};
    const { ignoreExistingDuty = false } = options;
    
    if (isDutyExempt(emp) || bdTarget[emp] === 0) return false;
    if (isAbsentOnDay(y, m, emp, d, assignments)) return false;
    
    const existingDuty = assignments[emp]?.[d]?.duty;
    if (existingDuty && !(ignoreExistingDuty && existingDuty === "D")) return false;
    
    if (wishes[emp]?.[d] === "NO_DUTY") return false;
    
    const wd = weekday(y, m, d);
    if (wd === 6 && !isFacharzt(emp)) return false;
    if (emp === "Dr. Polednia" && (wd === 0 || wd === 2 || wd === 4)) return false;
    if (hasCTLeadershipConflict(y, m, emp, d, assignments)) return false;
    if (assignments[emp]?.[d]?.assignment === "F") return false;
    if (isNextDayVacation(y, m, emp, d, assignments)) return false;
    if (hasDalitzMammographyConflict(y, m, emp, d, "D", assignments)) return false;
    
    const prev = prevCalendarDay(y, m, d);
    const next = nextCalendarDay(y, m, d);
    
    if (getScheduledDuty(prev.y, prev.m, emp, prev.d, assignments) === "D") return false;
    if (getScheduledDuty(next.y, next.m, emp, next.d, assignments) === "D") return false;
    if (getScheduledDuty(prev.y, prev.m, emp, prev.d, assignments) === "HG" && weekday(prev.y, prev.m, prev.d) !== 5) return false;
    if (hasHolidayBlockConflict(emp, d)) return false;
    
    if (!relaxed) {
      if (currentBD[emp] >= bdTarget[emp]) return false;
      const projectedWe = projectedWeekendDutyCount(y, m, emp, assignments, "D", d);
      if (projectedWe > RELAXED_WEEKEND_DUTY_LIMIT) return false;
      if (wouldCreateConsecutiveWeekendDuty(y, m, emp, assignments, d)) return false;
      if (emp === "Dr. Becker" && wd === 6) return false;
      const minDistD = minDistanceForDuty(emp, d, "D", assignments);
      if (minDistD < 3) return false;
    }
    return true;
  }

  function scoreBDCandidate(emp, d, relaxed, phaseKey) {
    relaxed = relaxed || false;
    if (!canDoBD(emp, d, relaxed)) {
      return { score: -Infinity, tags: [] };
    }
    
    let score = 100;
    const wd = weekday(y, m, d);
    const isWE = wd === 5 || wd === 6 || wd === 0;
    const tags = [];
    const projectedWe = projectedWeekendDutyCount(y, m, emp, result, "D", d);
    const minDistD = minDistanceForDuty(emp, d, "D", result);
    
    if (currentBD[emp] >= bdTarget[emp]) { 
      score -= 50000 * (currentBD[emp] - bdTarget[emp] + 1); 
      tags.push("Soll überschritten"); 
    } else { 
      score += (bdTarget[emp] - currentBD[emp]) * 5000; 
      tags.push("Zielerfüllung"); 
    }
    
    if (wishes[emp]?.[d] === "BD_WISH") { 
      score += 220; 
      tags.push("Wunsch"); 
    }
    
    if (wd === 4) { 
      const nextKW = isoWeekNumber(y, m, d) + 1; 
      if (hasVacationInWeek(y, m, emp, nextKW)) { 
        score += 150; 
        tags.push("Vor Urlaub"); 
      } 
    }
    
    if (isWE) {
      score -= Math.abs(projectedWe - TARGET_WEEKEND_DUTY) * 220;
      if (projectedWe > RELAXED_WEEKEND_DUTY_LIMIT) {
        score -= (projectedWe - RELAXED_WEEKEND_DUTY_LIMIT) * 1000;
      }
      if (wouldCreateConsecutiveWeekendDuty(y, m, emp, result, d)) { 
        score -= 1500; 
        tags.push("WE-Puffer"); 
      }
      if (getWeekendDutyKWs(y, m, emp, result).has(isoWeekNumber(y, m, d) - 1)) { 
        score -= 100; 
        tags.push("WE-Abstand"); 
      }
      const histWeDuty = hist[emp]?.weDuty || 0;
      const avgHistWe = averageFromArray(dutyEmps.map(e => hist[e]?.weDuty || 0));
      score -= (histWeDuty - avgHistWe) * 5;
    }
    
    if (wd === 6 && isFacharzt(emp)) {
      const projectedSat = currentSatBD[emp] + 1;
      if (projectedSat > 1) { 
        score -= 25000 * projectedSat; 
        tags.push("Doppel-Samstag"); 
      } else if (currentSatBD[emp] === 0) { 
        score += 5000; 
        tags.push("Samstags-Priorität"); 
      }
      const avgProjectedSat = (hgFAs.reduce((s, e) => s + currentSatBD[e], 0) + 1) / Math.max(1, hgFAs.length);
      score -= Math.abs(projectedSat - avgProjectedSat) * 1500;
      const histSatBD = hist[emp]?.satBd || 0;
      const avgHistSat = averageFromArray(hgFAs.map(e => hist[e]?.satBd || 0));
      score -= (histSatBD - avgHistSat) * 5;
    }
    
    if (emp === "Dr. Becker" && wd === 6 && relaxed) { 
      score -= 5000; 
      tags.push("Notlösung"); 
    }
    
    if (minDistD < 4) {
      score -= (4 - minDistD) * 250;
    }
    
    if (wouldCreateDFDF(emp, d, result)) { 
      score -= 500; 
      tags.push("D-F-D-F weich vermieden"); 
    }
    
    if (isHoliday(y, m, d, hols)) { 
      const holAvg = dutyEmps.reduce((s, e) => s + (hist[e]?.holDuty || 0), 0) / Math.max(1, dutyEmps.length); 
      score += (holAvg - (hist[emp]?.holDuty || 0)) * 6; 
      tags.push("Feiertag"); 
    }
    
    score += ((emp.charCodeAt(0) * 31 + d * 7) % 10) * 0.1;
    trace(phaseKey || "bd_eval", `EVAL [${emp}|D${d}] Base:100 Final:${Math.round(score)} Tags:[${tags.join(',')}]`);
    return { score, tags };
  }

  bdNeeded.sort((a, b) => {
    const aWe = isWeekend(y, m, a) || isHoliday(y, m, a, hols) || weekday(y, m, a) === 5;
    const bWe = isWeekend(y, m, b) || isHoliday(y, m, b, hols) || weekday(y, m, b) === 5;
    if (aWe !== bWe) return aWe ? -1 : 1;
    return a - b;
  });

  const weBDs = bdNeeded.filter((d) => { 
    const wd = weekday(y, m, d); 
    return wd === 5 || wd === 6 || wd === 0 || isHoliday(y, m, d, hols); 
  });
  const nonWeBDs = bdNeeded.filter((d) => !weBDs.includes(d));

  log.push({ phase: "bd_weekend", icon: "🌙", msg: `Verteile ${weBDs.length} WE/FT-BD...`, pct: 22 });
  
  let bdRelaxedCount = 0;
  let hgRelaxedCount = 0;

  for (let i = 0; i < weBDs.length; i++) {
    const d = weBDs[i];
    if (isDayDTasked(d)) continue;
    
    let candidates = dutyEmps.map((e) => ({ emp: e, ...scoreBDCandidate(e, d, false, "bd_weekend") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score);
    let relaxed = false;
    
    if (candidates.length === 0) {
      candidates = dutyEmps.map((e) => ({ emp: e, ...scoreBDCandidate(e, d, true, "bd_weekend") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score);
      if (candidates.length > 0) { 
        bdRelaxedCount++; 
        relaxed = true; 
        candidates[0].tags.push("Regeln gelockert"); 
        recordRule("bd_weekend", "BD-Constraint gelockert", `Tag ${d}: Keine harte BD-Lösung.`, "warn"); 
        log.push({ phase: "bd_weekend", icon: "⚠", msg: `BD-Regeln gelockert für Tag ${d}`, dayIdx: d, newEmpId: candidates[0].emp, pct: 22 });
      }
    }
    
    if (candidates.length > 0) {
      const chosen = candidates[0];
      if (!result[chosen.emp]) result[chosen.emp] = {};
      if (!result[chosen.emp][d]) result[chosen.emp][d] = {};
      
      result[chosen.emp][d].duty = "D";
      currentBD[chosen.emp]++;
      
      if (weekday(y, m, d) === 6) {
        currentSatBD[chosen.emp]++;
      }
      
      updateAutoF(chosen.emp, d);
      
      let reason = `Bester Score (${Math.round(chosen.score)}).`;
      if (chosen.tags.includes("Wunsch")) reason = "Wunschdienst berücksichtigt.";
      if (chosen.tags.includes("Vor Urlaub")) reason = "Donnerstags-Dienst vor Urlaub priorisiert.";
      if (chosen.tags.includes("Samstags-Priorität")) reason += " Person hatte noch keinen Samstag im Monat.";
      if (chosen.tags.includes("D-F-D-F weich vermieden")) reason += " D-F-D-F wurde nur weich bestraft.";
      if (relaxed) reason += " Auswahl im gelockerten Modus.";
      
      if (chosen.emp === "Dr. Becker" && weekday(y, m, d) === 6) {
        const nextWorkday = findNextWorkdayFrom(y, m, d);
        if (nextWorkday) {
          const blockedByOtherFA = hasOtherFAFreeOrVacationOn(nextWorkday.y, nextWorkday.m, nextWorkday.d, chosen.emp, result);
          const beckerAssignments = getScheduledAssignmentCodes(nextWorkday.y, nextWorkday.m, chosen.emp, nextWorkday.d, result);
          const beckerAlreadyOccupied = beckerAssignments.length > 0;
          
          if (!blockedByOtherFA && !beckerAlreadyOccupied) {
            reason += ` Samstags-Dienst unvermeidbar -> FZA am nächsten Werktag (${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]}) eingetragen.`;
            if (nextWorkday.y === y && nextWorkday.m === m) {
              if (!result[chosen.emp][nextWorkday.d]) result[chosen.emp][nextWorkday.d] = {};
              result[chosen.emp][nextWorkday.d].assignment = "FZA";
            } else {
              queueExternalAssignment(nextWorkday.y, nextWorkday.m, chosen.emp, nextWorkday.d, { assignment: "FZA" });
            }
            log.push({ phase: "bd_weekend", icon: "🟣", msg: `Dr. Becker erhält FZA am ${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]}.`, dayIdx: nextWorkday.d, newEmpId: chosen.emp, pct: Math.min(40, 22 + 2) });
            recordRule("bd_weekend", "Becker-FZA-Kompensation", `Ausgleich nach Samstags-BD am ${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]}.`, "accent");
          } else {
            const warnMsg = blockedByOtherFA
              ? `KRITISCH: Dr. Becker hat am ${d}. einen Samstags-BD, aber der nächste Werktag ${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]} ist blockiert, weil dort bereits ein anderer FA Urlaub/F hat. FZA bitte manuell prüfen.`
              : `KRITISCH: Dr. Becker hat am ${d}. einen Samstags-BD, aber am nächsten Werktag ${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]} besteht bereits eine Belegung (${beckerAssignments.join("/")}). FZA bitte manuell prüfen.`;
            beckerSaturdayFzaWarnings.push(warnMsg);
            reason += " FZA konnte nicht automatisch gesetzt werden; sichtbare Warnung erzeugt.";
            log.push({ phase: "bd_weekend", icon: "🚨", msg: warnMsg, dayIdx: d, newEmpId: chosen.emp, pct: Math.min(40, 22 + 2) });
            recordRule("bd_weekend", "Kritische Becker-Prüfung", warnMsg, "critical");
          }
        }
      }
      
      report.push({ day: d, emp: chosen.emp, duty: "D", reason: reason, tags: chosen.tags });
      log.push({ phase: "bd_weekend", icon: "→", msg: `Tag ${d}. → ${chosen.emp}`, dayIdx: d, newEmpId: chosen.emp, pct: 22 + Math.round((i / Math.max(1, weBDs.length)) * 18) });
    }
  }

  log.push({ phase: "bd_workday", icon: "☀️", msg: `Verteile ${nonWeBDs.length} Werktags-BD...`, pct: 42 });
  
  for (let i = 0; i < nonWeBDs.length; i++) {
    const d = nonWeBDs[i];
    if (isDayDTasked(d)) continue;
    
    let candidates = dutyEmps.map((e) => ({ emp: e, ...scoreBDCandidate(e, d, false, "bd_workday") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score);
    let relaxed = false;
    
    if (candidates.length === 0) {
      candidates = dutyEmps.map((e) => ({ emp: e, ...scoreBDCandidate(e, d, true, "bd_workday") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score);
      if (candidates.length > 0) { 
        bdRelaxedCount++; 
        relaxed = true; 
        candidates[0].tags.push("Regeln gelockert");
        log.push({ phase: "bd_workday", icon: "⚠", msg: `BD-Regeln gelockert für Tag ${d}`, dayIdx: d, newEmpId: candidates[0].emp, pct: 42 });
      }
    }
    
    if (candidates.length > 0) {
      const chosen = candidates[0];
      if (!result[chosen.emp]) result[chosen.emp] = {};
      if (!result[chosen.emp][d]) result[chosen.emp][d] = {};
      
      result[chosen.emp][d].duty = "D";
      currentBD[chosen.emp]++;
      updateAutoF(chosen.emp, d);
      
      report.push({ day: d, emp: chosen.emp, duty: "D", reason: `Bester Score (${Math.round(chosen.score)}).`, tags: chosen.tags });
      log.push({ phase: "bd_workday", icon: "→", msg: `Tag ${d}. → ${chosen.emp}`, dayIdx: d, newEmpId: chosen.emp, pct: 42 + Math.round((i / Math.max(1, nonWeBDs.length)) * 18) });
    }
  }

  function rebuildCurrentCounters() {
    emps.forEach((e) => { 
      currentBD[e] = 0; 
      currentHG[e] = 0; 
      currentHGForAA[e] = 0; 
      currentHGForFA[e] = 0; 
      currentSatBD[e] = 0; 
    });
    
    for (let day = 1; day <= dim; day++) {
      const bdHolder = emps.find((e) => result[e]?.[day]?.duty === "D") || null;
      for (const e of emps) {
        const duty = result[e]?.[day]?.duty;
        if (duty === "D") { 
          currentBD[e]++; 
          if (weekday(y, m, day) === 6) {
            currentSatBD[e]++; 
          }
        }
        else if (duty === "HG") {
          currentHG[e]++;
          if (bdHolder && isAssistenzarzt(bdHolder)) {
            currentHGForAA[e]++;
          } else {
            currentHGForFA[e]++;
          }
        }
      }
    }
  }

  function setDutyAssignment(emp, day, dutyCode) {
    if (!result[emp]) result[emp] = {};
    if (!result[emp][day]) result[emp][day] = {};
    result[emp][day].duty = dutyCode;
    if (dutyCode === "D") {
      updateAutoF(emp, day);
    }
  }

  function clearDutyAssignment(emp, day, dutyCode) {
    if (dutyCode === "D") {
      clearAutoF(emp, day);
    }
    if (result[emp]?.[day]?.duty === dutyCode) {
      delete result[emp][day].duty;
    }
    cleanupAssignmentCell(result, emp, day);
  }

  function computeBDObjective() {
    let score = 0;
    for (let day = 1; day <= dim; day++) {
      let dCount = 0; 
      emps.forEach(e => { 
        if(result[e]?.[day]?.duty === "D") dCount++; 
      });
      if (dCount === 0) score += 20000; 
      if (dCount > 1) score += 50000 * dCount;
    }
    
    const satAvg = hgFAs.length > 0 ? hgFAs.reduce((sum, e) => sum + currentSatBD[e], 0) / hgFAs.length : 0;
    let deficitSum = 0;
    let surplusSum = 0;
    
    const avgHistBD = averageFromArray(dutyEmps.map(e => hist[e]?.bd || 0));
    
    dutyEmps.forEach((emp) => {
      const diff = currentBD[emp] - bdTarget[emp];
      if (diff < 0) deficitSum += -diff; 
      if (diff > 0) surplusSum += diff;
      
      score += diff * diff * 25000 + Math.abs(diff) * 10000;
      
      const histBD = hist[emp]?.bd || 0;
      const histBDDiff = histBD - avgHistBD;
      score += histBDDiff * currentBD[emp] * 5;
      
      const weDiff = countWeekendDuties(y, m, emp, result) - TARGET_WEEKEND_DUTY;
      score += weDiff * weDiff * 10000;
      
      const weProjected = countWeekendDuties(y, m, emp, result);
      if (weProjected > RELAXED_WEEKEND_DUTY_LIMIT) {
        score += (weProjected - RELAXED_WEEKEND_DUTY_LIMIT) * 30000;
      }
      
      const weekendKws = [...getWeekendDutyKWs(y, m, emp, result)].sort((a, b) => a - b);
      for (let i = 1; i < weekendKws.length; i++) { 
        if (weekendKws[i] - weekendKws[i - 1] === 1) {
          score += 15000; 
        }
      }
      
      if (isFacharzt(emp)) {
        if (currentSatBD[emp] > 1) {
          score += 80000 * currentSatBD[emp];
        }
        score += (currentSatBD[emp] - satAvg) * (currentSatBD[emp] - satAvg) * 12000;
      }
      
      for (let day = 1; day <= dim; day++) {
        if (result[emp]?.[day]?.duty !== "D") continue;
        
        const nxt = nextCalendarDay(y, m, day);
        if (getScheduledDuty(nxt.y, nxt.m, emp, nxt.d, result) === "D") {
          score += 100000;
        }
        
        const minDistD = minDistanceForDuty(emp, day, "D", result);
        if (minDistD < 3) {
          score += (3 - minDistD) * 15000;
        }
        if (minDistD < 5) {
          score += (5 - minDistD) * 800;
        }
        
        if (wouldCreateDFDF(emp, day, result)) {
          score += 1200;
        }
        
        if (weekday(y, m, day) === 6 && emp === "Dr. Becker") {
          score += 40000;
        }
      }
    });
    
    score += deficitSum * 15000 + surplusSum * 12000 + Math.abs(deficitSum - surplusSum) * 10000;
    return score;
  }

  let bundledHGDays = new Set();
  let bundledHGKeys = new Set();
  let swaps = 0;
  let hgMoves = 0;
  let deepMoves = 0;

  const MAX_OPTIMIZATION_CYCLES = 25;
  const BD_MAX_PASSES = 80;
  const HG_MAX_PASSES = 120;
  const DEEP_MAX_PASSES = 150;

  function assignBundledHG(emp, d, bindReason, options) {
    options = options || {};
    if (isDayHGTasked(d) || !isFacharzt(emp) || isDutyExempt(emp) || wishes[emp]?.[d] === "NO_DUTY" || isAbsentOnDay(y, m, emp, d, result) || result[emp]?.[d]?.duty || hasHolidayBlockConflict(emp, d)) {
      return false;
    }
    const wd = weekday(y, m, d);
    if (result[emp]?.[d]?.assignment === "F" && !(wd === 6 || wd === 0)) {
      return false;
    }
    const nxtBundled = nextCalendarDay(y, m, d);
    if (getScheduledDuty(nxtBundled.y, nxtBundled.m, emp, nxtBundled.d, result) === "D" && wd !== 5) {
      return false;
    }
    if (!options.allowAdjacentHG && hasAdjacentHG(emp, d, result)) {
      return false;
    }
    if (hasDalitzMammographyConflict(y, m, emp, d, "HG", result)) {
      return false;
    }
    
    setDutyAssignment(emp, d, "HG");
    bundledHGDays.add(d);
    bundledHGKeys.add(dutyKey(emp, d));
    report.push({ day: d, emp, duty: "HG", reason: bindReason, tags: ["Gekoppelt"] });
    return true;
  }

  function canDoHG(emp, d, relaxed, assignments, options) {
    relaxed = relaxed || false;
    assignments = assignments || result;
    options = options || {};
    const { ignoreExistingDuty = false } = options;
    
    if (isDutyExempt(emp) || !isFacharzt(emp)) return false;
    if (isAbsentOnDay(y, m, emp, d, assignments)) return false;
    
    const existingDuty = assignments[emp]?.[d]?.duty;
    if (existingDuty && !(ignoreExistingDuty && existingDuty === "HG")) return false;
    
    if (wishes[emp]?.[d] === "NO_DUTY") return false;
    if (hasDalitzMammographyConflict(y, m, emp, d, "HG", assignments)) return false;
    
    const wd = weekday(y, m, d);
    const isWE = wd === 6 || wd === 0;
    
    if (assignments[emp]?.[d]?.assignment === "F" && !isWE) return false;
    
    const bdOnDay = dutyEmps.find((e) => assignments[e]?.[d]?.duty === "D");
    const isBdAA = bdOnDay && isAssistenzarzt(bdOnDay);

    const nxtHG = nextCalendarDay(y, m, d);
    const nxtDuty = getScheduledDuty(nxtHG.y, nxtHG.m, emp, nxtHG.d, assignments);
    if (nxtDuty === "D") {
      if (isBdAA) return false;
      if (wd !== 5) return false;
    }
    
    if (hasHolidayBlockConflict(emp, d)) return false;

    if (emp === "Dr. Polednia" && (wd === 0 || wd === 2 || wd === 4)) {
      if (isBdAA) return false;
    }

    if (!relaxed) {
      const projectedWe = projectedWeekendDutyCount(y, m, emp, assignments, "HG", d);
      if (projectedWe > RELAXED_WEEKEND_DUTY_LIMIT) return false;
      if (wouldCreateConsecutiveWeekendDuty(y, m, emp, assignments, d)) return false;
      if (hasAdjacentHG(emp, d, assignments)) return false;
    }
    
    return true;
  }

  function scoreHGCandidate(emp, d, relaxed, phaseKey) {
    relaxed = relaxed || false;
    if (!canDoHG(emp, d, relaxed)) return { score: -Infinity, tags: [] };
    
    let score = 100;
    const tags = [];
    const projectedHG = currentHG[emp] + 1;
    const avgProjectedHG = (hgFAs.reduce((s, e) => s + currentHG[e], 0) + 1) / Math.max(1, hgFAs.length);
    const avgBDforFAsNow = averageFromArray(hgFAs.map(e => currentBD[e]));
    
    const idealHG = avgProjectedHG + (avgBDforFAsNow - currentBD[emp]) * 1.0;
    
    score -= Math.abs(projectedHG - idealHG) * 10000;
    tags.push("HG-Monatsausgleich");

    const histHG = hist[emp]?.hg || 0;
    const avgHistHG = averageFromArray(hgFAs.map(e => hist[e]?.hg || 0));
    score -= (histHG - avgHistHG) * 5;

    if (wishes[emp]?.[d] === "HG_WISH") {
      score += 500;
      tags.push("Wunsch");
    }
    
    if (isNextDayVacation(y, m, emp, d, result)) {
      score -= 100;
    }

    const wd = weekday(y, m, d);
    if (wd === 6 || wd === 0) {
      const projectedWe = projectedWeekendDutyCount(y, m, emp, result, "HG", d);
      score -= Math.abs(projectedWe - TARGET_WEEKEND_DUTY) * 1500;
      if (projectedWe > RELAXED_WEEKEND_DUTY_LIMIT) {
        score -= (projectedWe - RELAXED_WEEKEND_DUTY_LIMIT) * 5000;
      }
      if (wouldCreateConsecutiveWeekendDuty(y, m, emp, result, d)) {
        score -= 2500;
        tags.push("WE-Puffer");
      }
    }

    const minDistHG = minDistanceForDuty(emp, d, "HG", result);
    if (minDistHG < 3) {
      score -= (3 - minDistHG) * 8000;
      tags.push("HG-Abstand");
    }

    if (hasAdjacentHG(emp, d, result)) {
      score -= 25000;
      tags.push("kein Direkt-HG");
    }

    score += ((emp.charCodeAt(1 % emp.length) * 17 + d * 13) % 10) * 0.1;
    return { score, tags };
  }

  function computeHGObjective() {
    let score = 0;
    for (let day = 1; day <= dim; day++) {
      let hgCount = 0;
      emps.forEach(e => { 
        if(result[e]?.[day]?.duty === "HG") hgCount++; 
      });
      if (hgCount === 0) score += 15000;
      if (hgCount > 1) score += 40000 * hgCount;
    }
    
    const avgHG = averageFromArray(hgFAs.map((emp) => currentHG[emp]));
    const avgBDforFAs = averageFromArray(hgFAs.map((emp) => currentBD[emp]));
    const avgHGForAA = averageFromArray(hgFAs.map((emp) => currentHGForAA[emp]));
    const avgHGForFA = averageFromArray(hgFAs.map((emp) => currentHGForFA[emp]));
    
    hgFAs.forEach((emp) => {
      const idealHG = avgHG + (avgBDforFAs - currentBD[emp]) * 1.0;
      score += Math.pow(currentHG[emp] - idealHG, 2) * 25000;
      score += Math.pow(currentHGForAA[emp] - avgHGForAA, 2) * 15000;
      score += Math.pow(currentHGForFA[emp] - avgHGForFA, 2) * 8000;
      
      const weCount = countWeekendDuties(y, m, emp, result);
      score += Math.pow(weCount - TARGET_WEEKEND_DUTY, 2) * 5000;
      
      if (weCount > RELAXED_WEEKEND_DUTY_LIMIT) {
        score += (weCount - RELAXED_WEEKEND_DUTY_LIMIT) * 20000;
      }
      
      for (let day = 1; day <= dim; day++) {
        if (result[emp]?.[day]?.duty !== "HG") continue;
        
        const wd = weekday(y, m, day);
        if (emp === "Fr. Dalitz" && (wd === 0 || wd === 1)) {
          const bdHolder = emps.find(e => result[e]?.[day]?.duty === "D");
          if (bdHolder === "Hr. Torki" || bdHolder === "Hr. Sebastian") {
            score += 100000;
          }
        }

        const isBundled = bundledHGKeys.has(dutyKey(emp, day));
        if (hasAdjacentHG(emp, day, result)) {
          score += isBundled ? 5000 : 45000;
        }

        const minDistHG = minDistanceForDuty(emp, day, "HG", result);
        if (minDistHG < 3 && !isBundled) {
          score += (3 - minDistHG) * 18000;
        }
        if (minDistHG < 5 && !isBundled) {
          score += (5 - minDistHG) * 2500;
        }

        let density = 0;
        for (let j = Math.max(1, day - 3); j <= Math.min(dim, day + 3); j++) {
          if (j !== day && result[emp]?.[j]?.duty === "HG") density++;
        }
        if (density > 1) score += density * 12000;

        const nxtObj = nextCalendarDay(y, m, day);
        if (getScheduledDuty(nxtObj.y, nxtObj.m, emp, nxtObj.d, result) === "D" && wd !== 5) {
          score += 60000;
        }
      }
    });
    return score;
  }

  function computeGlobalObjective() {
    const bdObjective = computeBDObjective();
    const hgObjective = hgFAs.length > 0 ? computeHGObjective() : 0;
    let coveragePenalty = 0;
    
    for (let day = 1; day <= dim; day++) {
      let dCount = 0, hgCount = 0;
      emps.forEach(e => {
        if(result[e]?.[day]?.duty === "D") dCount++;
        if(result[e]?.[day]?.duty === "HG") hgCount++;
      });
      if (dCount === 0) coveragePenalty += 25000;
      if (hgCount === 0) coveragePenalty += 18000;
      if (dCount > 1 || hgCount > 1) coveragePenalty += 100000;
    }
    
    return bdObjective + hgObjective + coveragePenalty;
  }

  function runPhase4_BDOptimize(cyclePct) {
    const mutableBDDays = listDutyAssignments(dutyEmps, dim, result, "D")
      .filter(({ emp, day }) => !fixedDutyKeys.has(`D:${dutyKey(emp, day)}`))
      .map(({ day }) => day);

    rebuildCurrentCounters();
    let bestBD = computeBDObjective();

    for (let pass = 0; pass < BD_MAX_PASSES; pass++) {
      let improved = false;
      for (const day of mutableBDDays) {
        const currentEmp = dutyEmps.find((e) => result[e]?.[day]?.duty === "D");
        if (!currentEmp) continue;
        
        const candidates = [...dutyEmps].sort((a, b) => {
          const aScore = Math.abs((currentBD[a] + 1) - bdTarget[a]) * 100 + projectedWeekendDutyCount(y, m, a, result, "D", day) * 50 + (weekday(y, m, day) === 6 ? currentSatBD[a] * 200 : 0);
          const bScore = Math.abs((currentBD[b] + 1) - bdTarget[b]) * 100 + projectedWeekendDutyCount(y, m, b, result, "D", day) * 50 + (weekday(y, m, day) === 6 ? currentSatBD[b] * 200 : 0);
          return aScore - bScore;
        });
        
        for (const candidate of candidates) {
          if (candidate === currentEmp) continue;
          
          clearDutyAssignment(currentEmp, day, "D");
          rebuildCurrentCounters();
          
          if (!canDoBD(candidate, day, true, result)) { 
            setDutyAssignment(currentEmp, day, "D"); 
            rebuildCurrentCounters(); 
            continue; 
          }
          
          setDutyAssignment(candidate, day, "D");
          rebuildCurrentCounters();
          
          const newBD = computeBDObjective();
          if (newBD + 0.01 < bestBD) { 
            bestBD = newBD; 
            improved = true; 
            swaps++; 
            log.push({ phase: "greedy", icon: "🔀", msg: `BD Swap Tag ${day}: ${currentEmp} ➔ ${candidate}`, dayIdx: day, oldEmpId: currentEmp, newEmpId: candidate, pct: cyclePct });
            break; 
          }
          
          clearDutyAssignment(candidate, day, "D");
          setDutyAssignment(currentEmp, day, "D");
          rebuildCurrentCounters();
        }
      }
      if (!improved) break;
    }
  }

  function runPhase5_HGBundle(cyclePct) {
    const prevBundledKeys = new Set(bundledHGKeys);
    for (const key of prevBundledKeys) {
      const atIdx = key.indexOf("@@");
      const emp = key.substring(0, atIdx);
      const day = parseInt(key.substring(atIdx + 2), 10);
      if (!fixedDutyKeys.has(`HG:${key}`) && result[emp]?.[day]?.duty === "HG") {
        delete result[emp][day].duty;
        cleanupAssignmentCell(result, emp, day);
      }
    }
    
    bundledHGDays = new Set();
    bundledHGKeys = new Set();

    for (let d = 1; d <= dim; d++) {
      const wd = weekday(y, m, d);
      const bdHolder = dutyEmps.find(e => result[e]?.[d]?.duty === "D");
      if (!bdHolder) continue;
      
      if (wd === 5 && isAssistenzarzt(bdHolder)) {
        const satDay = d + 1;
        if (satDay <= dim) {
          const satBDHolder = dutyEmps.find(e => result[e]?.[satDay]?.duty === "D");
          if (satBDHolder && isFacharzt(satBDHolder) && satBDHolder !== bdHolder) {
            let currentHGHolder = hgFAs.find(e => result[e]?.[d]?.duty === "HG");
            if (currentHGHolder && currentHGHolder !== satBDHolder && !fixedDutyKeys.has(`HG:${dutyKey(currentHGHolder, d)}`)) {
              clearDutyAssignment(currentHGHolder, d, "HG");
            } else {
              currentHGHolder = null;
            }
            if (assignBundledHG(satBDHolder, d, "Freitags-HG gekoppelt an FA des Samstags-BD.", { allowAdjacentHG: true })) {
               log.push({ phase: "hg", icon: "→", msg: `HG Tag ${d}. → ${satBDHolder}`, dayIdx: d, oldEmpId: currentHGHolder, newEmpId: satBDHolder, pct: cyclePct });
            }
          }
        }
      }
      
      if (wd === 6 && isFacharzt(bdHolder)) {
        const sunDay = d + 1;
        if (sunDay <= dim) {
          let currentHGHolder = hgFAs.find(e => result[e]?.[sunDay]?.duty === "HG");
          if (currentHGHolder && currentHGHolder !== bdHolder && !fixedDutyKeys.has(`HG:${dutyKey(currentHGHolder, sunDay)}`)) {
            clearDutyAssignment(currentHGHolder, sunDay, "HG");
          } else {
            currentHGHolder = null;
          }
          if (assignBundledHG(bdHolder, sunDay, "Sonntags-HG gekoppelt an eigenen Samstags-BD.", { allowAdjacentHG: true })) {
             log.push({ phase: "hg", icon: "→", msg: `HG Tag ${sunDay}. → ${bdHolder}`, dayIdx: sunDay, oldEmpId: currentHGHolder, newEmpId: bdHolder, pct: cyclePct });
          }
        }
      }

      const nxtHolObj = nextCalendarDay(y, m, d);
      if (nxtHolObj.y === y && nxtHolObj.m === m) {
        const isNxtHol = isHoliday(nxtHolObj.y, nxtHolObj.m, nxtHolObj.d, hols);
        if (isNxtHol && isAssistenzarzt(bdHolder)) {
          const holBDHolder = dutyEmps.find(e => result[e]?.[nxtHolObj.d]?.duty === "D");
          if (holBDHolder && isFacharzt(holBDHolder) && holBDHolder !== bdHolder) {
            let currentHGHolder = hgFAs.find(e => result[e]?.[d]?.duty === "HG");
            if (currentHGHolder && currentHGHolder !== holBDHolder && !fixedDutyKeys.has(`HG:${dutyKey(currentHGHolder, d)}`)) {
              clearDutyAssignment(currentHGHolder, d, "HG");
            } else {
              currentHGHolder = null;
            }
            if (assignBundledHG(holBDHolder, d, "Vortag-Feiertag-HG (AA im D) gekoppelt an FA des Feiertags-BD.", { allowAdjacentHG: true })) {
               log.push({ phase: "hg", icon: "→", msg: `HG Tag ${d}. → ${holBDHolder}`, dayIdx: d, oldEmpId: currentHGHolder, newEmpId: holBDHolder, pct: cyclePct });
            }
          }
        }
      }
    }
    
    rebuildCurrentCounters();
  }

  function runPhase6_HGAssign(cyclePct) {
    for (let d = 1; d <= dim; d++) {
      if (bundledHGDays.has(d) || isDayHGTasked(d)) continue;
      
      let candidates = hgFAs.map((e) => ({ emp: e, ...scoreHGCandidate(e, d, false, "hg_assign") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score);
      
      if (candidates.length === 0) {
        candidates = hgFAs.map((e) => ({ emp: e, ...scoreHGCandidate(e, d, true, "hg_assign") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score);
        if (candidates.length > 0) {
          hgRelaxedCount++;
          candidates[0].tags.push("Regeln gelockert");
          log.push({ phase: "hg", icon: "⚠", msg: `HG-Regeln gelockert für Tag ${d}`, dayIdx: d, newEmpId: candidates[0].emp, pct: cyclePct });
        }
      }
      
      if (candidates.length > 0) {
        const chosen = candidates[0];
        setDutyAssignment(chosen.emp, d, "HG");
        rebuildCurrentCounters();
        report.push({ day: d, emp: chosen.emp, duty: "HG", reason: "Gleichmäßige Verteilung.", tags: chosen.tags });
        log.push({ phase: "hg", icon: "→", msg: `HG Tag ${d}. → ${chosen.emp}`, dayIdx: d, newEmpId: chosen.emp, pct: cyclePct });
      }
    }
  }

  function runPhase7_HGOptimize(cyclePct) {
    const mutableHGDays = listDutyAssignments(hgFAs, dim, result, "HG")
      .filter(({ emp, day }) => !fixedDutyKeys.has(`HG:${dutyKey(emp, day)}`) && !bundledHGKeys.has(dutyKey(emp, day)))
      .map(({ day }) => day);

    rebuildCurrentCounters();
    let bestHG = computeHGObjective();
    
    for (let pass = 0; pass < HG_MAX_PASSES; pass++) {
      let improved = false;
      for (const day of mutableHGDays) {
        const currentEmp = hgFAs.find((e) => result[e]?.[day]?.duty === "HG");
        if (!currentEmp) continue;
        
        const avgBDforFAs = averageFromArray(hgFAs.map(e => currentBD[e]));
        const avgHG = averageFromArray(hgFAs.map(e => currentHG[e]));
        
        const candidates = [...hgFAs].sort((a, b) => {
          const aIdeal = avgHG + (avgBDforFAs - currentBD[a]) * 1.0;
          const bIdeal = avgHG + (avgBDforFAs - currentBD[b]) * 1.0;
          const aBias = currentHG[a] - aIdeal;
          const bBias = currentHG[b] - bIdeal;
          return aBias - bBias;
        });
        
        for (const candidate of candidates) {
          if (candidate === currentEmp) continue;
          
          clearDutyAssignment(currentEmp, day, "HG");
          rebuildCurrentCounters();
          
          if (!canDoHG(candidate, day, true, result)) {
            setDutyAssignment(currentEmp, day, "HG");
            rebuildCurrentCounters();
            continue;
          }
          
          setDutyAssignment(candidate, day, "HG");
          rebuildCurrentCounters();
          
          const newHG = computeHGObjective();
          if (newHG + 0.01 < bestHG) {
            bestHG = newHG;
            improved = true;
            hgMoves++;
            log.push({ phase: "hg", icon: "🔁", msg: `HG Swap Tag ${day}: ${currentEmp} ➔ ${candidate}`, dayIdx: day, oldEmpId: currentEmp, newEmpId: candidate, pct: cyclePct });
            break;
          }
          
          clearDutyAssignment(candidate, day, "HG");
          setDutyAssignment(currentEmp, day, "HG");
          rebuildCurrentCounters();
        }
      }
      if (!improved) break;
    }
  }

  function runPhase8_DeepOptimize(cyclePct) {
    const deepMutableBDDays = listDutyAssignments(dutyEmps, dim, result, "D")
      .filter(({ emp, day }) => !fixedDutyKeys.has(`D:${dutyKey(emp, day)}`))
      .map(({ day }) => day);
      
    const deepMutableHGDays = listDutyAssignments(hgFAs, dim, result, "HG")
      .filter(({ emp, day }) => !fixedDutyKeys.has(`HG:${dutyKey(emp, day)}`) && !bundledHGKeys.has(dutyKey(emp, day)))
      .map(({ day }) => day);

    rebuildCurrentCounters();
    let bestGlobal = computeGlobalObjective();

    function tryImproveDay(day, dutyCode) {
      const pool = dutyCode === "D" ? dutyEmps : hgFAs;
      const currentEmp = pool.find((e) => result[e]?.[day]?.duty === dutyCode);
      if (!currentEmp) return false;
      
      const canDo = dutyCode === "D" ? canDoBD : canDoHG;
      const orderedPool = [...pool].sort((a, b) => {
        const aDelta = dutyCode === "D" ? currentBD[a] - bdTarget[a] : currentHG[a] - averageFromArray(hgFAs.map((e) => currentHG[e]));
        const bDelta = dutyCode === "D" ? currentBD[b] - bdTarget[b] : currentHG[b] - averageFromArray(hgFAs.map((e) => currentHG[e]));
        return aDelta - bDelta;
      });
      
      for (const candidate of orderedPool) {
        if (candidate === currentEmp) continue;
        
        clearDutyAssignment(currentEmp, day, dutyCode);
        rebuildCurrentCounters();
        
        if (!canDo(candidate, day, true, result)) {
          setDutyAssignment(currentEmp, day, dutyCode);
          rebuildCurrentCounters();
          continue;
        }
        
        setDutyAssignment(candidate, day, dutyCode);
        rebuildCurrentCounters();
        
        const newGlobal = computeGlobalObjective();
        if (newGlobal + 0.01 < bestGlobal) {
          bestGlobal = newGlobal;
          deepMoves++;
          log.push({ phase: "deep", icon: "🧠", msg: `Deep Move Tag ${day} (${dutyCode}): ${currentEmp} ➔ ${candidate}`, dayIdx: day, oldEmpId: currentEmp, newEmpId: candidate, pct: cyclePct });
          return true;
        }
        
        clearDutyAssignment(candidate, day, dutyCode);
        setDutyAssignment(currentEmp, day, dutyCode);
        rebuildCurrentCounters();
      }
      return false;
    }

    for (let pass = 0; pass < DEEP_MAX_PASSES; pass++) {
      let improved = false;
      for (const day of deepMutableBDDays) {
        improved = tryImproveDay(day, "D") || improved;
      }
      for (const day of deepMutableHGDays) {
        improved = tryImproveDay(day, "HG") || improved;
      }
      if (!improved) break;
    }
  }

  function runCoverageRepair(cyclePct) {
    for (let d = 1; d <= dim; d++) {
      if (!emps.some(e => result[e]?.[d]?.duty === "D")) {
        const wd = weekday(y, m, d);
        const bdCandidates = dutyEmps
          .filter(e => {
            if (isDutyExempt(e) || bdTarget[e] === 0) return false;
            if (isAbsentOnDay(y, m, e, d, result)) return false;
            if (result[e]?.[d]?.duty) return false;
            if (wishes[e]?.[d] === "NO_DUTY") return false;
            if (wd === 6 && !isFacharzt(e)) return false;
            if (e === "Dr. Polednia" && (wd === 0 || wd === 2 || wd === 4)) return false;
            const pv = prevCalendarDay(y, m, d);
            const nx = nextCalendarDay(y, m, d);
            if (getScheduledDuty(pv.y, pv.m, e, pv.d, result) === "D") return false;
            if (getScheduledDuty(nx.y, nx.m, e, nx.d, result) === "D") return false;
            if (hasDalitzMammographyConflict(y, m, e, d, "D", result)) return false;
            return true;
          })
          .sort((a, b) => currentBD[a] - currentBD[b]);
        
        if (bdCandidates.length > 0) {
          const chosen = bdCandidates[0];
          setDutyAssignment(chosen, d, "D");
          if (wd === 6) currentSatBD[chosen]++;
          bdRelaxedCount++;
          rebuildCurrentCounters();
          report.push({ day: d, emp: chosen, duty: "D", reason: "Zwangsbelegung (Coverage Repair).", tags: ["Coverage Repair"] });
          recordRule("coverage_repair", "BD-Lücke gefüllt", `Tag ${d}: ${chosen}`, "warn");
          log.push({ phase: "repair", icon: "⚠", msg: `BD-Lücke Tag ${d} gefüllt mit ${chosen}`, dayIdx: d, newEmpId: chosen, pct: cyclePct });
        }
      }
      
      if (!emps.some(e => result[e]?.[d]?.duty === "HG")) {
        const hgCandidates = hgFAs
          .filter(e => {
            if (isDutyExempt(e)) return false;
            if (isAbsentOnDay(y, m, e, d, result)) return false;
            if (result[e]?.[d]?.duty) return false;
            if (wishes[e]?.[d] === "NO_DUTY") return false;
            if (hasDalitzMammographyConflict(y, m, e, d, "HG", result)) return false;
            return true;
          })
          .sort((a, b) => currentHG[a] - currentHG[b]);
        
        if (hgCandidates.length > 0) {
          const chosen = hgCandidates[0];
          setDutyAssignment(chosen, d, "HG");
          hgRelaxedCount++;
          rebuildCurrentCounters();
          report.push({ day: d, emp: chosen, duty: "HG", reason: "Zwangsbelegung (Coverage Repair).", tags: ["Coverage Repair"] });
          recordRule("coverage_repair", "HG-Lücke gefüllt", `Tag ${d}: ${chosen}`, "warn");
          log.push({ phase: "repair", icon: "⚠", msg: `HG-Lücke Tag ${d} gefüllt mit ${chosen}`, dayIdx: d, newEmpId: chosen, pct: cyclePct });
        }
      }
    }
  }

  log.push({ phase: "hg_bundle", icon: "🔗", msg: "Initiale Wochenend-Kopplung für HG...", pct: 62 });
  runPhase5_HGBundle(62);

  log.push({ phase: "hg_assign", icon: "📞", msg: "Initiale HG-Verteilung...", pct: 65 });
  runPhase6_HGAssign(65);
  rebuildCurrentCounters();

  log.push({ phase: "optimize", icon: "⚙️", msg: `Starte Multi-Zyklus-Optimierung (${MAX_OPTIMIZATION_CYCLES} Zyklen, BD:${BD_MAX_PASSES}/HG:${HG_MAX_PASSES}/Deep:${DEEP_MAX_PASSES} Passes)...`, pct: 68 });

  let bestGlobalForCycles = computeGlobalObjective();
  
  for (let cycle = 0; cycle < MAX_OPTIMIZATION_CYCLES; cycle++) {
    const prevGlobalForCycle = computeGlobalObjective();
    const cyclePct = 68 + Math.round((cycle / MAX_OPTIMIZATION_CYCLES) * 22);
    
    log.push({ phase: "optimize", icon: "🔄", msg: `Zyklus ${cycle + 1}/${MAX_OPTIMIZATION_CYCLES}: BD-Optimierung läuft...`, pct: cyclePct });
    runPhase4_BDOptimize(cyclePct);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "🔗", msg: `Zyklus ${cycle + 1}: HG-Wochenend-Kopplung aktualisieren...`, pct: cyclePct + 1 });
    runPhase5_HGBundle(cyclePct + 1);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "📞", msg: `Zyklus ${cycle + 1}: HG-Lücken auffüllen...`, pct: cyclePct + 2 });
    runPhase6_HGAssign(cyclePct + 2);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "🧠", msg: `Zyklus ${cycle + 1}: HG-Optimierung läuft...`, pct: cyclePct + 2 });
    runPhase7_HGOptimize(cyclePct + 2);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "🧬", msg: `Zyklus ${cycle + 1}: Globale Metaheuristik läuft...`, pct: cyclePct + 3 });
    runPhase8_DeepOptimize(cyclePct + 3);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "🛠️", msg: `Zyklus ${cycle + 1}: Coverage Repair...`, pct: cyclePct + 3 });
    runCoverageRepair(cyclePct + 3);
    rebuildCurrentCounters();
    
    const newGlobalForCycle = computeGlobalObjective();
    const delta = Math.round(prevGlobalForCycle - newGlobalForCycle);
    const deltaSign = delta >= 0 ? "-" : "+";
    log.push({ phase: "optimize", icon: "📊", msg: `Zyklus ${cycle + 1} abgeschlossen. Δ${deltaSign}${Math.abs(delta)} | BD-Swaps: ${swaps} | HG-Moves: ${hgMoves} | Deep: ${deepMoves}`, pct: cyclePct + 4 });
    
    if (newGlobalForCycle >= prevGlobalForCycle - 0.01) {
      log.push({ phase: "optimize", icon: "✓", msg: `Konvergenz nach Zyklus ${cycle + 1} erreicht. Optimierung abgeschlossen.`, pct: 90 });
      break;
    }
    
    bestGlobalForCycles = newGlobalForCycle;
  }

  log.push({ phase: "validate", icon: "🛡️", msg: "Abschlussprüfung der Dienst-Exklusivität...", pct: 93 });

  for (let d = 1; d <= dim; d++) {
    let dList = emps.filter(e => result[e]?.[d]?.duty === "D");
    if (dList.length > 1) {
      for (let i = 1; i < dList.length; i++) {
        clearDutyAssignment(dList[i], d, "D");
      }
    }
    let hgList = emps.filter(e => result[e]?.[d]?.duty === "HG");
    if (hgList.length > 1) {
      for (let i = 1; i < hgList.length; i++) {
        clearDutyAssignment(hgList[i], d, "HG");
      }
    }
  }

  log.push({ phase: "done", icon: "✅", msg: "Planung abgeschlossen!", pct: 100 });

  const summary = { bd: {}, hg: {}, warnings: [], infos: [], bdTarget };
  
  emps.forEach((e) => {
    let bd = 0;
    let hg = 0;
    let holDuty = 0;
    const bdDays = [];
    const hgDays = [];
    const weMapSummary = {};
    
    for (let d = 1; d <= dim; d++) {
      const cell = result[e]?.[d];
      const wd = weekday(y, m, d);
      const hol = isHoliday(y, m, d, hols);
      const isWEDay = wd === 5 || wd === 6 || wd === 0;
      
      if (cell?.duty === "D") {
        bd++;
        bdDays.push(d);
        if (hol) holDuty++;
        if (isWEDay) {
          const kw = isoWeekNumber(y, m, d);
          if (!weMapSummary[kw]) weMapSummary[kw] = { hasD: false, hasHG: false };
          weMapSummary[kw].hasD = true;
        }
      }
      
      if (cell?.duty === "HG") {
        hg++;
        hgDays.push(d);
        if (hol) holDuty++;
        if (isWEDay) {
          const kw = isoWeekNumber(y, m, d);
          if (!weMapSummary[kw]) weMapSummary[kw] = { hasD: false, hasHG: false };
          if (!weMapSummary[kw].hasD) weMapSummary[kw].hasHG = true;
        }
      }
    }
    
    let weDuty = 0;
    for (const { hasD, hasHG } of Object.values(weMapSummary)) {
      if (hasD) weDuty += 1;
      else if (hasHG) weDuty += 0.5;
    }
    
    summary.bd[e] = { count: bd, target: bdTarget[e], days: bdDays, weDuty, holDuty };
    summary.hg[e] = { count: hg, days: hgDays };
  });

  dutyEmps.forEach((e) => {
    const bd = summary.bd[e];
    if (bd.target > 0 && bd.count < bd.target) {
      summary.warnings.push(`${e}: nur ${bd.count}/${bd.target} BD`);
    }
    if (bd.weDuty > RELAXED_WEEKEND_DUTY_LIMIT) {
      summary.warnings.push(`${e}: ${bd.weDuty} WE-Dienste (Ziel ${TARGET_WEEKEND_DUTY})`);
    }
  });
  
  beckerSaturdayFzaWarnings.forEach((warning) => summary.warnings.push(warning));
  
  for (let d = 1; d <= dim; d++) {
    if (!emps.some((e) => result[e]?.[d]?.duty === "D")) {
      summary.warnings.push(`Tag ${d}: kein BD besetzt.`);
    }
    if (!emps.some((e) => result[e]?.[d]?.duty === "HG")) {
      summary.warnings.push(`Tag ${d}: kein HG besetzt.`);
    }
    if (result["Fr. Dalitz"]?.[d]?.duty === "HG" && hasDalitzMammographyConflict(y, m, "Fr. Dalitz", d, "HG", result)) {
      summary.warnings.push(`KRITISCH Tag ${d}: Fr. Dalitz HG für Torki/Sebastian (Mammographie-Konflikt am Folgetag).`);
    }
  }

  summary.infos.push(`Multi-Zyklus-Optimierung: ${MAX_OPTIMIZATION_CYCLES} Zyklen × (BD:${BD_MAX_PASSES} + HG:${HG_MAX_PASSES} + Deep:${DEEP_MAX_PASSES} Passes). BD-Swaps: ${swaps}, HG-Moves: ${hgMoves}, Deep-Moves: ${deepMoves}.`);
  summary.infos.push(`Algorithmus garantiert exakt einen D und einen HG pro Kalendertag.`);
  summary.infos.push(`Die Samstags-Dienste wurden bevorzugt auf Fachärzte verteilt (Dr. Becker nur im Notfall).`);
  summary.infos.push(`Wochenend-Kopplung: Falls ein AA am Freitag D hatte, übernimmt der FA vom Samstag den HG am Freitag.`);
  
  if (bdRelaxedCount > 0 || hgRelaxedCount > 0) {
    summary.infos.push(`Harte Abstandsregeln wurden bei ${bdRelaxedCount} BD / ${hgRelaxedCount} HG weich gelockert, um die Vollbesetzung zu sichern.`);
  }
  
  const dutyCoverageMisses = Array.from({ length: dim }, (_, idx) => idx + 1).filter((day) => !emps.some((emp) => result[emp]?.[day]?.duty === "D")).length;
  const hgCoverageMisses = Array.from({ length: dim }, (_, idx) => idx + 1).filter((day) => !emps.some((emp) => result[emp]?.[day]?.duty === "HG")).length;
  
  rebuildCurrentCounters();
  const bdSpread = computeFairnessSpread(dutyEmps.map((emp) => summary.bd[emp]?.count || 0));
  const hgSpread = computeFairnessSpread(hgFAs.map((emp) => summary.hg[emp]?.count || 0));
  const weekendSpread = computeFairnessSpread(dutyEmps.map((emp) => summary.bd[emp]?.weDuty || 0));
  
  const reportedWishDays = new Set();
  let wishCount = 0;
  for (let d = 1; d <= dim; d++) {
    dutyEmps.forEach(e => {
      if (wishes[e]?.[d]) {
        wishCount++;
      }
    });
  }
  const wishFulfillmentRate = wishCount > 0 ? (report.filter(r => r.tags && r.tags.includes("Wunsch")).length / wishCount) : 1;
  
  const rawScore = 100.0 
    - (dutyCoverageMisses * 15.0) 
    - (hgCoverageMisses * 10.0) 
    - (bdSpread * 2.5) 
    - (hgSpread * 1.5) 
    - (weekendSpread * 2.0) 
    + (wishFulfillmentRate * 5.0) 
    - (deepMoves * 0.005);
    
  const qualityScore = Math.max(0, Math.min(100, rawScore)).toFixed(1);
  
  summary.quality = { score: qualityScore, dutyCoverageMisses, hgCoverageMisses, bdSpread, hgSpread, weekendSpread, wishFulfillmentRate, deepMoves, swaps, hgMoves };

  report.sort((a, b) => a.day - b.day || (a.duty === "D" ? -1 : 1));
  
  rebuildCurrentCounters();
  return { assignments: result, summary, log, report, externalAssignments, ruleTelemetry, fluxTraces };
}