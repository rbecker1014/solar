// app.core.js
// Shared state, auth, Sheets, router, and lazy tab loader
import { getDefaultDateRange } from './tabs/date-range.js';

const defaultRange = getDefaultDateRange();

const state = {
  sheetId: "",
  dashboardSheet: "",
  startDate: defaultRange.from,
  endDate: defaultRange.to,
  importRate: 0.35,
  exportRate: 0.05,
  rows: [],
  getFilteredRows(){
    const s = this.startDate ? new Date(this.startDate) : null;
    const e = this.endDate ? new Date(this.endDate) : null;
    return (this.rows||[]).filter(r => (!s || r.date >= s) && (!e || r.date <= e));
  },
  // KPI math
  calcKPIs(rows){
    if (!rows.length) return { totalUse:0,totalSolar:0,totalImp:0,totalExp:0,selfConsumption:0,selfSufficiency:0,avgDailyUse:0,savings:0 };
    const sum = k => rows.reduce((a,b)=>a+(b[k]||0),0);
    const totalUse=sum('use'), totalSolar=sum('solar'), totalImp=sum('imp'), totalExp=sum('exp');
    const solarToLoad = Math.min(totalSolar, Math.max(0, totalUse - totalImp));
    const selfConsumption = totalSolar ? solarToLoad/totalSolar : 0;
    const selfSufficiency = totalUse ? solarToLoad/totalUse : 0;
    const days = (rows[rows.length-1].date - rows[0].date)/86400000 + 1;
    const avgDailyUse = days>0 ? totalUse/days : 0;
    const costNoSolar = totalUse * Number(this.importRate||0);
    const costWithSolar = totalImp * Number(this.importRate||0) - totalExp * Number(this.exportRate||0);
    const savings = Math.max(0, costNoSolar - costWithSolar);
    return { totalUse,totalSolar,totalImp,totalExp,selfConsumption,selfSufficiency,avgDailyUse,savings };
  },
  fmtKWh:(n)=>`${(Number.isFinite(n)?n:0).toLocaleString(undefined,{maximumFractionDigits:2})} kWh`,
  fmtPct:(n)=>`${((Number.isFinite(n)?n:0)*100).toFixed(1)}%`,
  fmtUSD:(n)=>(Number.isFinite(n)?n:0).toLocaleString(undefined,{style:'currency',currency:'USD'}),
};

async function loadData(){
  const token = globalThis.accessToken;
  const privateLoader = typeof globalThis.loadDataPrivate === 'function' ? globalThis.loadDataPrivate : null;
  if (token && privateLoader) {
    await privateLoader();
    return;
  }
  if (typeof buildGvizUrl !== 'function' || typeof parseGviz !== 'function' ||
      typeof tryAutoMap !== 'function' || typeof extractRowsByIndex !== 'function') {
    console.warn('GViz helpers missing. Skipping remote sheet load.');
    state.rows = [];
    return;
  }

  const id = state.sheetId;
  const name = state.dashboardSheet;
  const url = buildGvizUrl(id, name);
  const res = await fetch(url);
  const txt = await res.text();
  const g = parseGviz(txt);
  const cols = g.table.cols.map(c=>c.label||c.id);
  const auto = tryAutoMap(cols) || { date:0, use:1, solar:2, imp:3, exp:4 };
  state.rows = extractRowsByIndex(g, auto);
}

// Router — lazy load tabs
const registry = {
  kpi: () => import('./tabs/kpi.js'),
  charts: () => import('./tabs/charts.js'),
  data: () => import('./tabs/data.js'),
  record: () => import('./tabs/record.js'),
  settings: () => import('./tabs/settings.js'),
};
const cache = new Map();
async function showTab(key){
  const container = document.getElementById('view');
  if (!cache.has(key)){
    const mod = await registry[key]();
    cache.set(key, mod);
  }
  container.innerHTML = '';
  const mod = cache.get(key);
  await mod.mount(container, { state, loadData });
  document.querySelectorAll('nav [data-tab]').forEach(b => b.classList.toggle('tab-active', b.dataset.tab === key));
}
window.__showTab = showTab;

// Wire navigation
document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('nav [data-tab]').forEach(b => {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  });
   try{ await loadData(); } catch(e){ console.error(e); }
  showTab('kpi');
});
