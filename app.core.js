// app.core.js
// Shared state, auth, Sheets, router, and lazy tab loader
const state = {
  sheetId: "",
  dashboardSheet: "",
  entrySheet: "",
  startDate: "2025-06-01",
  endDate: "2025-12-31",
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
  if (accessToken) { await loadDataPrivate(); return; }
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

// Entry write helpers
const $ = (id)=>document.getElementById(id);
const todayLocalYMD = ()=>{
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const toNumber = (v)=>{
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'string'){
    let s = v.trim();
    if (!s) return NaN;
    s = s.replace(/[, ]+/g,'').replace(/[^0-9.+-Ee]/g,''); const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
};
function parseISOYMD(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||'').trim());
  return m ? { y:+m[1], m:+m[2], d:+m[3] } : null;
}
function parseMDY(s){
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(String(s||'').trim());
  return m ? { y:+m[3], m:+m[1], d:+m[2] } : null;
}
function parseCellDateToParts(v){
  if (typeof v === 'string'){
    return parseISOYMD(v) || parseMDY(v);
  }
  return null;
}
const ymdToString = (p)=>`${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
function addDaysParts(p, n){
  const dt = new Date(Date.UTC(p.y, p.m-1, p.d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth()+1, d: dt.getUTCDate() };
}
const daysBetweenParts = (a,b)=> Math.round((Date.UTC(b.y,b.m-1,b.d) - Date.UTC(a.y,a.m-1,a.d))/86400000);

async function sheetsGet(rangeA1){
  const id = state.sheetId;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(rangeA1)}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sheets GET ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.values || [];
}
async function sheetsAppend(rangeA1ColsOnly, values2d){
  const id = state.sheetId;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(rangeA1ColsOnly)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ majorDimension: 'ROWS', values: values2d })
  });
  if (!res.ok) throw new Error(`Sheets APPEND ${res.status}: ${await res.text()}`);
  return res.json();
}
function findLastRowByA(values){
  if (!values || values.length < 2) return { headers: values?.[0]||[], row: null, index: 0 };
  const headers = values[0];
  for (let i = values.length - 1; i >= 1; i--){
    const row = values[i] || [];
    const a = row[0];
    if (a != null && String(a).trim() !== '') return { headers, row, index: i };
  }
  return { headers, row: null, index: 0 };
}
function buildExtrapolatedRows(valuesABC, inputDateStr, inputITD, inputProd){
  const last = findLastRowByA(valuesABC);
  if (!last.row) throw new Error('No last row found.');
  const lastITD = Number(last.row[1]);
  if (!Number.isFinite(lastITD)) throw new Error('Last ITD not numeric.');
  const lastParts = parseCellDateToParts(last.row[0]);
  if (!lastParts) throw new Error('Could not parse last date.');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(inputDateStr||'').trim());
  if (!m) throw new Error('Input date must be YYYY-MM-DD.');
  const inputParts = { y:+m[1], m:+m[2], d:+m[3] };
  const gapDays = daysBetweenParts(lastParts, inputParts);
  if (gapDays < 1) throw new Error('Input date must be after last date.');
  if (gapDays === 1) return [[ `${m[1]}-${m[2]}-${m[3]}`, Number(inputITD), Number(inputProd) ]];
  const missingCount = gapDays - 1;
  const deltaITD = Number(inputITD) - lastITD;
  const missingSum = deltaITD - Number(inputProd);
  if (!Number.isFinite(deltaITD) || !Number.isFinite(missingSum)) throw new Error('Bad numbers.');
  if (missingSum < -1e-9) throw new Error('ITD too small vs Prod.');
  const even = missingCount > 0 ? missingSum / missingCount : 0;
  const rows = [];
  let runningITD = lastITD;
  let allocated = 0;
  for (let i = 1; i <= missingCount; i++){
    let prod = i < missingCount ? even : (missingSum - allocated);
    if (Math.abs(prod) < 1e-12) prod = 0;
    runningITD += prod;
    const parts = addDaysParts(lastParts, i);
    rows.push([ ymdToString(parts), Number(runningITD), Number(prod) ]);
    allocated += prod;
  }
  rows.push([ `${m[1]}-${m[2]}-${m[3]}`, Number(inputITD), Number(inputProd) ]);
  return rows;
}

// Router — lazy load tabs
const registry = {
  kpi: () => import('./tabs/kpi.js'),
  charts: () => import('./tabs/charts.js'),
  data: () => import('./tabs/data.js'),
  entry: () => import('./tabs/entry.js'),
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
  await mod.mount(container, { state, loadData, sheetsGet, sheetsAppend, findLastRowByA, buildExtrapolatedRows, todayLocalYMD });
  document.querySelectorAll('nav [data-tab]').forEach(b => b.classList.toggle('tab-active', b.dataset.tab === key));
}
window.__showTab = showTab;

// Wire navigation
document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('nav [data-tab]').forEach(b => {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  });
  document.querySelector('.tab-fab')?.addEventListener('click', ()=> showTab('entry'));

  try{ await loadData(); } catch(e){ console.error(e); }
  showTab('kpi');
});
