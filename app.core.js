// app.core.js
// Shared state, auth, Sheets, router, and lazy tab loader
const state = {
  sheetId: "193i7rsk2zTJwrF9ahcGn5DDWuZqb2zsNL5oZ6y2XVac",
  dashboardSheet: "FullReport",
  entrySheet: "Data",
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

// GViz helpers
const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'').trim();
const aliasMap = {
  date:['date','day','timestamp','readingdate','reading'],
  use:['homekwh','usage','usagekwh','home','load','consumption','energyuse','housekwh','totalconsumption','kwhused','usekwh','consumed'],
  solar:['solarkwh','solar','pv','pvkwh','production','generation','generated','energyproduced','solargeneration'],
  imp:['gridimportkwh','import','fromgrid','gridin','importkwh','gridpurchase','purchased','gridusage','gridconsumption','pulledfromgrid'],
  exp:['gridexportkwh','export','togrid','gridout','exportkwh','backtogrid','feedin','excess','exported']
};
function buildGvizUrl(id,sheet){
  const base = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq`;
  const params = new URLSearchParams(sheet?{sheet}:{}) ;
  return `${base}?${params.toString()}`;
}
function sanitizeAntiXSSI(text){
  return text.replace(/^\)\]\}'\n/, '').replace(/^\/\*O_o\*\/\n/, '');
}
function parseGviz(text){
  const raw = sanitizeAntiXSSI(text);
  const m = raw.match(/google\.visualization\.Query\.setResponse\((.*)\);?/s);
  if (!m) throw new Error('Unexpected GViz format');
  return JSON.parse(m[1]);
}
function parseDateCell(dCell){
  if (!dCell) return null;
  const v = dCell.v;
  const f = dCell.f;
  if (typeof v === 'string' && /^Date\(/.test(v)){
    const m = v.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
    if (m){
      const [_, Y, M, D, h='0', mnt='0', s='0'] = m;
      const dt = new Date(Number(Y), Number(M), Number(D), Number(h), Number(mnt), Number(s));
      if (!isNaN(dt)) return dt;
    }
  }
  if (typeof f === 'string'){
    const dt = new Date(f);
    if (!isNaN(dt)) return dt;
  }
  if (v && typeof v === 'object' && v.year != null){
    const dt = new Date(v.year, v.month || 0, v.day || 1);
    if (!isNaN(dt)) return dt;
  }
  if (typeof v === 'number'){
    if (v > 20000 && v < 60000){
      const epoch = new Date(Date.UTC(1899,11,30));
      const ms = v * 86400000;
      const dt = new Date(epoch.getTime() + ms);
      if (!isNaN(dt)) return dt;
    } else {
      const dt = new Date(v);
      if (!isNaN(dt)) return dt;
    }
  }
  if (typeof v === 'string'){
    const dt = new Date(v);
    if (!isNaN(dt)) return dt;
  }
  return null;
}
function tryAutoMap(cols){
  const ncols = cols.map(norm);
  function pick(key){
    for (const alias of aliasMap[key]){
      const i = ncols.findIndex(c=>c===alias);
      if (i !== -1) return i;
    }
    for (const alias of aliasMap[key]){
      const i = ncols.findIndex(c=>c.includes(alias));
      if (i !== -1) return i;
    }
    const tokens = aliasMap[key];
    const scored = ncols.map((c,i)=>({i,score:tokens.reduce((a,t)=>a+(c.includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score);
    if (scored[0] && scored[0].score>0) return scored[0].i;
    return null;
  }
  return { date:pick('date'), use:pick('use'), solar:pick('solar'), imp:pick('imp'), exp:pick('exp') };
}
function extractRowsByIndex(gviz, idx){
  const rows = (gviz.table.rows||[]).filter(r=>r.c).map(r=>{
    const date = parseDateCell(r.c[idx.date]);
    if (!date) return null;
    const getNum = i => (i==null || !r.c[i] || r.c[i].v==null || r.c[i].v==='') ? 0 : Number(r.c[i].v);
    const use=getNum(idx.use); const solar=idx.solar!=null?getNum(idx.solar):0; const imp=idx.imp!=null?getNum(idx.imp):0; const exp=idx.exp!=null?getNum(idx.exp):0;
    const solarToLoad = Math.max(0, Math.min(solar, Math.max(0, use - imp)));
    return { date, use, solar, imp, exp, solarToLoad };
  }).filter(Boolean).sort((a,b)=>a.date-b.date);
  return rows;
}

// Auth and Sheets
const GOOGLE_CLIENT_ID = "656801194507-ujbqhlcm5ou4nqfq25c5j657jl6gnkoo.apps.googleusercontent.com";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
let accessToken = null;
let tokenClient = null;
let tokenExpiresAt = 0;

function valuesToGviz(values){
  if (!values || !values.length) return { table: { cols: [], rows: [] } };
  const headers = values[0];
  const body = values.slice(1);
  return {
    table: {
      cols: headers.map(h => ({ label: String(h || '').trim() })),
      rows: body.map(r => ({ c: headers.map((_, i) => ({ v: r[i] !== undefined ? r[i] : '' })) }))
    }
  };
}

async function fetchSheetValues(spreadsheetId, sheetName){
  const now = Date.now(); if (accessToken && now > tokenExpiresAt - 10000) { try { tokenClient.requestAccessToken({ prompt: '' }); } catch(_){} }
  const range = encodeURIComponent(`${sheetName}!A1:Z10000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) { const t = await res.text(); throw new Error(`Sheets API error ${res.status}: ${t}`); }
  return res.json();
}

async function loadDataPrivate(){
  const id = state.sheetId;
  const name = state.dashboardSheet;
  const j = await fetchSheetValues(id, name);
  const g = valuesToGviz(j.values||[]);
  const cols = (g.table&&g.table.cols?g.table.cols:[]).map(c=>(c.label||'').trim());
  const auto = tryAutoMap(cols) || { date:0, use:1, solar:2, imp:3, exp:4 };
  state.rows = extractRowsByIndex(g, auto);
}

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

// Auth UI and wiring
function initGsi(){
  if (!(window.google && google.accounts && google.accounts.oauth2)) return false;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SHEETS_SCOPE,
    callback: async (resp)=>{
      if (resp && resp.access_token){
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + 55*60*1000;
        setAuthUI(true);
        await loadDataPrivate();
        const active = document.querySelector('nav .tab-active')?.dataset.tab || 'kpi';
        showTab(active);
        const btn = document.getElementById('appendBtn');
        if (btn) btn.disabled = false;
      }
    }
  });
  return true;
}
function setAuthUI(signedIn){
  const inBtn = document.getElementById('signInBtn');
  const outBtn = document.getElementById('signOutBtn');
  if (signedIn){ outBtn.classList.remove('hidden'); inBtn.classList.add('hidden'); }
  else { outBtn.classList.add('hidden'); inBtn.classList.remove('hidden'); }
}

// Wire navigation
document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('nav [data-tab]').forEach(b => {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  });
  document.querySelector('.tab-fab')?.addEventListener('click', ()=> showTab('entry'));

  document.getElementById('signInBtn').addEventListener('click', ()=>{
    if (!tokenClient){
      if (!initGsi()){ alert('Google Identity not ready. Try again in a moment.'); return; }
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
  document.getElementById('signOutBtn').addEventListener('click', ()=>{
    accessToken = null; tokenExpiresAt = 0; setAuthUI(false);
  });

  try{ await loadData(); } catch(e){ console.error(e); }
  showTab('kpi');

  window.__gisLoaded = function(){ try{ initGsi(); } catch(e){ console.error('GIS init error', e);} };
  const t = setInterval(()=>{
    if (window.google && google.accounts && google.accounts.oauth2){
      clearInterval(t);
      if (!tokenClient) initGsi();
    }
  }, 300);
});
