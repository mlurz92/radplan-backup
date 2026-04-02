import { STORAGE_KEY, normalizeMonthDataShape } from './constants.js';

export let DATA = {};

export let state = {
  year: 2026,
  month: new Date().getMonth(),
  edit: null,
  ed: { 
    wp: [], 
    st: null, 
    duty: null 
  },
  employeeDashboard: {
    filter: "",
    role: "ALL",
    selectedEmp: null,
    detailView: "months",
    analyticsRange: "month",
    customStart: null,
    customEnd: null,
  },
  periodDraft: { 
    year: 2026, 
    month: new Date().getMonth() 
  },
  profileEmp: null,
};

export let deptTab = "month";
export let planMode = false;
export let planData = null;
export let planBaseline = null;
export let planHistory = [];
export let planHistoryIdx = -1;
export let planSessions = {};
export let IS_MOBILE = false;
export let responsiveLayoutRaf = 0;
export let serverLastModified = 0;
export let serverFetchSuccessful = false;

export const today = new Date();
export const TOD_Y = today.getFullYear();
export const TOD_M = today.getMonth();
export const TOD_D = today.getDate();

let saveTimeout = null;

export async function loadFromStorage() {
  let loadedData = null;
  serverFetchSuccessful = false;
  
  try {
    const res = await fetch(`/api?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    
    if (res.ok) {
      const serverData = await res.json();
      serverFetchSuccessful = true;
      if (serverData.lastModified !== undefined) {
        serverLastModified = parseInt(serverData.lastModified, 10) || 0;
      }
      if (serverData.main) {
        loadedData = serverData.main;
        if (serverData.plans) {
          for (const [pk, pv] of Object.entries(serverData.plans)) {
            localStorage.setItem(`radplan_v3_plan_${pk}`, JSON.stringify(pv));
          }
        }
      } else {
        loadedData = serverData;
      }
    } else {
      console.error("loadFromStorage HTTP Error:", res.status);
      const r = localStorage.getItem(STORAGE_KEY);
      if (r) {
        loadedData = JSON.parse(r);
      }
    }
  } catch (e) {
    console.error("loadFromStorage Network/Parse Error:", e);
    const r = localStorage.getItem(STORAGE_KEY);
    if (r) {
      loadedData = JSON.parse(r);
    }
  }
  
  if (loadedData) {
    Object.keys(DATA).forEach((k) => delete DATA[k]);
    Object.assign(DATA, loadedData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
  }
  
  Object.values(DATA).forEach((md) => {
    normalizeMonthDataShape(md);
  });
}

export function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
  
  window.dispatchEvent(new CustomEvent("radplan-save-queued"));
  
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(async () => {
    window.dispatchEvent(new CustomEvent("radplan-save-start"));
    
    try {
      const plans = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("radplan_v3_plan_")) {
          try {
            plans[k.replace("radplan_v3_plan_", "")] = JSON.parse(localStorage.getItem(k));
          } catch (err) {
            console.error("Fehler beim Parsen eines lokalen Plans:", err);
          }
        }
      }
      
      const payload = { main: DATA, plans, lastModified: serverLastModified };
      
      const res = await fetch(`/api?t=${Date.now()}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      
      if (res.status === 409) {
        const conflictData = await res.json();
        if (conflictData.latestData) {
          const sData = conflictData.latestData;
          serverLastModified = parseInt(sData.lastModified, 10) || 0;
          const newMain = sData.main ? sData.main : sData;
          
          Object.keys(DATA).forEach((k) => delete DATA[k]);
          Object.assign(DATA, newMain);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
          
          Object.values(DATA).forEach((md) => {
            normalizeMonthDataShape(md);
          });
          
          if (sData.plans) {
            for (const [pk, pv] of Object.entries(sData.plans)) {
              localStorage.setItem(`radplan_v3_plan_${pk}`, JSON.stringify(pv));
            }
          }
          
          window.dispatchEvent(new CustomEvent("radplan-sync-conflict"));
        }
        return;
      }
      
      if (res.ok) {
        const resData = await res.json();
        if (resData.lastModified) {
          serverLastModified = parseInt(resData.lastModified, 10) || 0;
          serverFetchSuccessful = true;
        }
        window.dispatchEvent(new CustomEvent("radplan-save-success"));
      } else {
        console.error("saveToStorage HTTP Error:", res.status);
        window.dispatchEvent(new CustomEvent("radplan-save-error"));
      }
    } catch (e) {
      console.error("saveToStorage Network/Parse Error:", e);
      window.dispatchEvent(new CustomEvent("radplan-save-error"));
    }
  }, 500);
}

export async function syncWithServer() {
  try {
    const res = await fetch(`/api?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    
    if (!res.ok) {
      console.error("syncWithServer HTTP Error:", res.status);
      return false;
    }
    
    const serverData = await res.json();
    serverFetchSuccessful = true;
    const incomingMod = parseInt(serverData.lastModified, 10) || 0;
    
    if (incomingMod > 0 && incomingMod > serverLastModified) {
      serverLastModified = incomingMod;
      const newMain = serverData.main ? serverData.main : serverData;
      
      Object.keys(DATA).forEach((k) => delete DATA[k]);
      Object.assign(DATA, newMain);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
      
      Object.values(DATA).forEach((md) => {
        normalizeMonthDataShape(md);
      });
      
      if (serverData.plans) {
        for (const [pk, pv] of Object.entries(serverData.plans)) {
          localStorage.setItem(`radplan_v3_plan_${pk}`, JSON.stringify(pv));
        }
      }
      
      window.dispatchEvent(new CustomEvent("radplan-sync-update"));
      return true;
    }
    
    return false;
  } catch (e) {
    console.error("syncWithServer Network/Parse Error:", e);
    return false;
  }
}

export async function forceSyncWithServer() {
  try {
    const res = await fetch(`/api?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    
    if (!res.ok) {
      console.error("forceSyncWithServer HTTP Error:", res.status);
      return false;
    }
    
    const text = await res.text();
    if (!text) {
      console.error("forceSyncWithServer Error: Empty response body");
      return false;
    }
    
    const serverData = JSON.parse(text);
    serverFetchSuccessful = true;
    serverLastModified = parseInt(serverData.lastModified, 10) || 0;
    const newMain = serverData.main ? serverData.main : serverData;
    
    Object.keys(DATA).forEach((k) => delete DATA[k]);
    Object.assign(DATA, newMain);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
    
    Object.values(DATA).forEach((md) => {
      normalizeMonthDataShape(md);
    });
    
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith("radplan_v3_plan_")) {
        localStorage.removeItem(key);
      }
    }
    
    if (serverData.plans) {
      for (const [pk, pv] of Object.entries(serverData.plans)) {
        localStorage.setItem(`radplan_v3_plan_${pk}`, JSON.stringify(pv));
      }
    }
    
    window.dispatchEvent(new CustomEvent("radplan-sync-update"));
    return true;
  } catch (e) {
    console.error("forceSyncWithServer Network/Parse Error:", e);
    return false;
  }
}

export function setDeptTab(val) { 
  deptTab = val; 
}

export function setPlanMode(val) { 
  planMode = val; 
}

export function setPlanData(val) { 
  planData = val; 
}

export function setPlanBaseline(val) { 
  planBaseline = val; 
}

export function setPlanHistory(val) { 
  planHistory = val; 
}

export function setPlanHistoryIdx(val) { 
  planHistoryIdx = val; 
}

export function setPlanSessions(val) { 
  planSessions = val; 
}

export function setIsMobile(val) { 
  IS_MOBILE = val; 
}

export function setResponsiveLayoutRaf(val) { 
  responsiveLayoutRaf = val; 
}
