export const WORKPLACES = [
  { code: "MR", label: "MRT", bg: "#DBEAFE", fg: "#1D4ED8" },
  { code: "CT", label: "CT", bg: "#FFEDD5", fg: "#C2410C" },
  { code: "US", label: "Sonographie", bg: "#CCFBF1", fg: "#0F766E" },
  { code: "AN", label: "Angiographie", bg: "#F3E8FF", fg: "#7E22CE" },
  { code: "MA", label: "Mammographie", bg: "#FCE7F3", fg: "#BE185D" },
  { code: "KUS", label: "Kinder-US", bg: "#DCFCE7", fg: "#15803D" },
  { code: "W", label: "Wermsdorf", bg: "#FEF9C3", fg: "#854D0E" },
  { code: "T", label: "Teleradiologie", bg: "#E0E7FF", fg: "#3730A3" },
];

export const STATUSES = [
  { code: "F", label: "Frei", bg: "#F1F5F9", fg: "#475569" },
  { code: "U", label: "Urlaub", bg: "#EDE9FE", fg: "#5B21B6" },
  { code: "ZU", label: "Zusatzurlaub", bg: "#DDD6FE", fg: "#4C1D95" },
  { code: "SU", label: "Sonderurlaub", bg: "#C4B5FD", fg: "#2E1065" },
  { code: "FZA", label: "FZA", bg: "#E0E7FF", fg: "#3730A3" },
  { code: "K", label: "Krank", bg: "#FEE2E2", fg: "#991B1B" },
  { code: "KK", label: "Kind Krank", bg: "#FECACA", fg: "#7F1D1D" },
  { code: "§15c", label: "§15c", bg: "#CFFAFE", fg: "#155E75" },
  { code: "WB", label: "Weiterbildung", bg: "#FEF3C7", fg: "#78350F" },
];

export const CODE_MAP = {};
[...WORKPLACES, ...STATUSES].forEach((x) => {
  CODE_MAP[x.code] = x;
});

export const RBN_ROW_KEY = "__RBN_NEURORAD__";
export const RBN_ROW_LABEL = "RD Neurorad";
export const RBN_ROW_START = { year: 2025, month: 5 };

export const RBN_OPTIONS = [
  "Prof. Schob (NRAD)",
  "Dr. Maybaum (NRAD)",
  "Dr. Bailis (NRAD)",
  "Dr. Schüngel (NRAD)",
  "Fr. Dalitz (RAD)",
  "Fr. Thaler (RAD)",
];

export const RBN_THALER_LAST_MONTH = { year: 2026, month: 2 };

export function formatRbnDisplay(name) {
  if (!name) return "";
  const match = name.match(/(?:Prof\.|Dr\.|Fr\.|Hr\.)?\s*([A-ZÄÖÜ][a-zäöüß]+)/);
  return match ? match[1] : name;
}

export function getRbnOptionsForDate(y, m) {
  const allowThaler =
    y < RBN_THALER_LAST_MONTH.year ||
    (y === RBN_THALER_LAST_MONTH.year && m <= RBN_THALER_LAST_MONTH.month);
  
  if (allowThaler) {
    return [...RBN_OPTIONS];
  }
  
  return RBN_OPTIONS.filter((opt) => opt !== "Fr. Thaler (RAD)");
}

export const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export const MONTHS_SHORT = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"
];

export const DOW_ABBR = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const DOW_LONG = [
  "Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"
];

export const STORAGE_KEY = "radplan_v3";
export const ABSENCE_CODES = ["U", "ZU", "SU", "FZA", "K", "KK", "§15c", "WB"];
export const VACATION_CODES = ["U", "ZU", "SU", "§15c"];

export const WISH_TYPES = [
  {
    code: "NO_DUTY",
    label: "Kein Dienst",
    icon: "✗",
    bg: "#FEE2E2",
    fg: "#991B1B",
    border: "#FCA5A5",
  },
  {
    code: "BD_WISH",
    label: "BD Wunsch",
    icon: "D",
    bg: "#FEE2E2",
    fg: "#B91C1C",
    border: "#F87171",
  },
  {
    code: "HG_WISH",
    label: "HG Wunsch",
    icon: "H",
    bg: "#E0F2FE",
    fg: "#0369A1",
    border: "#7DD3FC",
  },
];

export const WISH_MAP = {};
WISH_TYPES.forEach((w) => {
  WISH_MAP[w.code] = w;
});

export const EMP_META = {
  "Prof. Schäfer": {
    fullName: "Prof. Dr. Arnd-Oliver Schäfer",
    position: "CA",
    posLabel: "Chefarzt",
    type: "FA für Radiologie",
    area: "",
    deputy: "Dr. Lurz",
  },
  "Dr. Lurz": {
    fullName: "Dr. med. Markus Lurz",
    position: "LOA",
    posLabel: "Leitender Oberarzt",
    type: "FA für Radiologie",
    area: "MRT · Röntgen KV",
    deputy: "Prof. Schäfer / Dr. Polednia",
  },
  "Dr. Polednia": {
    fullName: "Dr. med. Alexander Polednia",
    position: "OA",
    posLabel: "Oberarzt",
    type: "FA für Radiologie · Kinderradiologie",
    area: "Leiter Kinderradiologie",
    deputy: "",
  },
  "Fr. Dalitz": {
    fullName: "Bettina Dalitz",
    position: "OÄ",
    posLabel: "Oberärztin",
    type: "FÄ für Radiologie · Neuroradiologie",
    area: "Leiterin Mammographie",
    deputy: "",
  },
  "Fr. Thaler": {
    fullName: "Fr. Thaler",
    position: "FÄ",
    posLabel: "Fachärztin",
    type: "FÄ für Radiologie",
    area: "",
    deputy: "",
  },
  "Dr. Becker": {
    fullName: "Dr. med. Juliane Becker",
    position: "OÄ",
    posLabel: "Oberärztin",
    type: "FÄ für Radiologie · FÄ für Nuklearmedizin",
    area: "CT",
    deputy: "Dr. Martin",
  },
  "Dr. Martin": {
    fullName: "Dr. med. Arno Martin",
    position: "FA",
    posLabel: "Facharzt",
    type: "FA für Radiologie",
    area: "",
    deputy: "",
  },
  "Hr. El Houba": {
    fullName: "Abdelilah El Houba",
    position: "AA",
    posLabel: "Assistenzarzt",
    type: "AA für Radiologie",
    area: "",
    deputy: "",
  },
  "Fr. Licenji": {
    fullName: "Johanna Licenji",
    position: "AÄ",
    posLabel: "Assistenzärztin",
    type: "AÄ für Radiologie",
    area: "",
    deputy: "",
  },
  "Hr. Torki": {
    fullName: "Mohamed Torki",
    position: "AA",
    posLabel: "Assistenzarzt",
    type: "AA für Radiologie",
    area: "",
    deputy: "",
  },
  "Hr. Sebastian": {
    fullName: "Ron Sebastian",
    position: "AA",
    posLabel: "Assistenzarzt",
    type: "AA für Radiologie",
    area: "",
    deputy: "",
  },
};

export function isFacharzt(empName) {
  const m = EMP_META[empName];
  if (m) {
    return ["CA", "LOA", "OA", "OÄ", "FA", "FÄ"].includes(m.position);
  }
  return false;
}

export function isAssistenzarzt(empName) {
  const m = EMP_META[empName];
  if (m) {
    return ["AA", "AÄ"].includes(m.position);
  }
  return true;
}

export function getEmpMeta(name) {
  return (
    EMP_META[name] || {
      fullName: name,
      position: "—",
      posLabel: "—",
      type: "—",
      area: "",
      deputy: "",
    }
  );
}

export function posColor(pos) {
  const m = {
    CA: { bg: "#F3E8FF", fg: "#7E22CE", border: "#A855F7" },
    LOA: { bg: "#DBEAFE", fg: "#1D4ED8", border: "#3B82F6" },
    OA: { bg: "#CCFBF1", fg: "#0F766E", border: "#14B8A6" },
    OÄ: { bg: "#CCFBF1", fg: "#0F766E", border: "#14B8A6" },
    FA: { bg: "#DCFCE7", fg: "#15803D", border: "#22C55E" },
    FÄ: { bg: "#DCFCE7", fg: "#15803D", border: "#22C55E" },
    AA: { bg: "#F1F5F9", fg: "#475569", border: "#94A3B8" },
    AÄ: { bg: "#F1F5F9", fg: "#475569", border: "#94A3B8" },
  };
  return m[pos] || { bg: "#F1F5F9", fg: "#6B7280", border: "#CBD5E1" };
}

export const pad2 = (n) => String(n).padStart(2, "0");

export const dateKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

export const monthKey = (y, m) => `${y}-${m}`;

export const prevMK = (y, m) => (m === 0 ? `${y - 1}-11` : `${y}-${m - 1}`);

export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

export const isRbnMonthVisible = (y, m) => {
  return y > RBN_ROW_START.year || (y === RBN_ROW_START.year && m >= RBN_ROW_START.month);
};

export function normalizeMonthDataShape(md) {
  if (!md || typeof md !== "object") return;
  if (!Array.isArray(md.employees)) md.employees = [];
  if (!md.assignments || typeof md.assignments !== "object") md.assignments = {};
  if (!md.rbn || typeof md.rbn !== "object") md.rbn = {};
}

export const weekday = (y, m, d) => new Date(y, m, d).getDay();

export const isWeekend = (y, m, d) => {
  const w = weekday(y, m, d);
  return w === 0 || w === 6;
};

export const isFriday = (y, m, d) => weekday(y, m, d) === 5;

export function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m2 = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m2 + 114) / 31);
  const dy = ((h + l - 7 * m2 + 114) % 31) + 1;
  
  return new Date(year, mo - 1, dy);
}

export const addDays = (dt, n) => {
  const d = new Date(dt);
  d.setDate(d.getDate() + n);
  return d;
};

export const dateToDK = (dt) => dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());

export function getSaxonyHolidays(year) {
  const e = easterDate(year);
  const nov22 = new Date(year, 10, 22);
  while (nov22.getDay() !== 3) {
    nov22.setDate(nov22.getDate() - 1);
  }
  
  return {
    [dateKey(year, 0, 1)]: "Neujahr",
    [dateToDK(addDays(e, -2))]: "Karfreitag",
    [dateToDK(addDays(e, 1))]: "Ostermontag",
    [dateKey(year, 4, 1)]: "Tag der Arbeit",
    [dateToDK(addDays(e, 39))]: "Christi Himmelfahrt",
    [dateToDK(addDays(e, 50))]: "Pfingstmontag",
    [dateKey(year, 9, 3)]: "Tag der Deutschen Einheit",
    [dateKey(year, 9, 31)]: "Reformationstag",
    [dateToDK(nov22)]: "Buß- und Bettag",
    [dateKey(year, 11, 25)]: "1. Weihnachtstag",
    [dateKey(year, 11, 26)]: "2. Weihnachtstag",
  };
}

const HOLIDAY_CACHE = new Map();

export function getSaxonyHolidaysCached(year) {
  if (!HOLIDAY_CACHE.has(year)) {
    HOLIDAY_CACHE.set(year, getSaxonyHolidays(year));
  }
  return HOLIDAY_CACHE.get(year);
}

export const isHoliday = (y, m, d, hols) => !!hols[dateKey(y, m, d)];

export const isWorkday = (y, m, d, hols) => !isWeekend(y, m, d) && !isHoliday(y, m, d, hols);

export const isTodayCol = (y, m, d, TOD_Y, TOD_M, TOD_D) => {
  return y === TOD_Y && m === TOD_M && d === TOD_D;
};

export function isoWeekNumber(y, m, d) {
  const dt = new Date(y, m, d);
  const thu = new Date(dt);
  thu.setDate(dt.getDate() - (dt.getDay() === 0 ? 6 : dt.getDay() - 1) + 3);
  const ft = new Date(thu.getFullYear(), 0, 4);
  ft.setDate(4 - (ft.getDay() === 0 ? 6 : ft.getDay() - 1));
  return 1 + Math.round((thu - ft) / 604800000);
}

export function nextCalendarDay(y, m, d) {
  const dim = daysInMonth(y, m);
  if (d < dim) {
    return { y, m, d: d + 1 };
  }
  if (m < 11) {
    return { y, m: m + 1, d: 1 };
  }
  return { y: y + 1, m: 0, d: 1 };
}

export function prevCalendarDay(y, m, d) {
  if (d > 1) {
    return { y, m, d: d - 1 };
  }
  if (m > 0) {
    return { y, m: m - 1, d: daysInMonth(y, m - 1) };
  }
  return { y: y - 1, m: 11, d: daysInMonth(y - 1, 11) };
}

export function cellColor(assignment) {
  if (!assignment) {
    return { bg: "transparent", fg: "#374151" };
  }
  const meta = CODE_MAP[assignment.split("/")[0].trim()];
  if (meta) {
    return { bg: meta.bg, fg: meta.fg };
  }
  return { bg: "#F9FAFB", fg: "#374151" };
}

export function empInitials(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  const caps = parts.filter((p) => p.length > 0 && /[A-ZÄÖÜ]/.test(p[0]));
  if (caps.length >= 2) {
    return caps.map((p) => p[0]).slice(0, 2).join("");
  }
  return name.slice(0, 2).toUpperCase();
}

export const MOBILE_BREAKPOINT = 768;
export const TOUCH_DEVICE_RE = /iPhone|iPad|iPod|Android/i;