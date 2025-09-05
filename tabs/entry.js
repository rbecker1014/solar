// tabs/entry.js — drop-in that mirrors the standalone Data Entry HTML
// It initializes Google Identity inside the tab and uses Sheets API GET/APPEND.

const GOOGLE_CLIENT_ID = "656801194507-ujbqhlcm5ou4nqfq25c5j657jl6gnkoo.apps.googleusercontent.com";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
let accessToken = null;
let tokenClient = null;

const todayLocalYMD = ()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function toNumber(v){ if(v==null) return NaN; if(typeof v==='number') return v; if(typeof v==='string'){ let s=v.trim(); if(!s) return NaN; s=s.replace(/[, ]+/g,'').replace(/[^0-9.+-Ee]/g,''); const n=Number(s); return Number.isFinite(n)?n:NaN;} return NaN; }
function parseISOYMD(s){ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||'').trim()); return m?{y:+m[1],m:+m[2],d:+m[3]}:null; }
function parseMDY(s){ const m=/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(String(s||'').trim()); return m?{y:+m[3],m:+m[1],d:+m[2]}:null; }
function parseCellDateToParts(v){ if(typeof v==='string'){ return parseISOYMD(v)||parseMDY(v);} return null; }
const ymdToString = (p)=>`${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
function addDaysParts(p, n){ const dt=new Date(Date.UTC(p.y,p.m-1,p.d)); dt.setUTCDate(dt.getUTCDate()+n); return {y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,d:dt.getUTCDate()}; }
const daysBetweenParts = (a,b)=> Math.round((Date.UTC(b.y,b.m-1,b.d) - Date.UTC(a.y,a.m-1,a.d))/86400000);

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
  if (!last.row) throw new Error('No last row found. Ensure there is a header row and at least one data row.');
  const lastITD = toNumber(last.row[1]);
  if (!Number.isFinite(lastITD)) throw new Error('Last ITD missing or not numeric in Column B.');
  const lastParts = parseCellDateToParts(last.row[0]);
  if (!lastParts) throw new Error('Could not parse last date. Please ensure Column A is a recognizable date.');
  const inputParts = parseISOYMD(inputDateStr);
  if (!inputParts) throw new Error('Input date must be YYYY-MM-DD.');
  const gapDays = daysBetweenParts(lastParts, inputParts);
  if (gapDays < 1) throw new Error('Input date must be after the last recorded date.');
  if (gapDays === 1){
    return [[ ymdToString(inputParts), Number(inputITD), Number(inputProd) ]];
  }
  const missingCount = gapDays - 1;
  const deltaITD = Number(inputITD) - lastITD;
  const missingSum = deltaITD - Number(inputProd);
  if (!Number.isFinite(deltaITD) || !Number.isFinite(missingSum)){
    throw new Error('Input ITD or Prod is not a valid number.');
  }
  if (missingSum < -1e-9){
    throw new Error('Numbers inconsistent: input ITD is less than last ITD plus input Prod.');
  }
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
  rows.push([ ymdToString(inputParts), Number(inputITD), Number(inputProd) ]);
  return rows;
}

async function sheetsGet(sheetId, rangeA1){
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(rangeA1)}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sheets GET ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.values || [];
}
async function sheetsAppend(sheetId, rangeA1ColsOnly, values2d){
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(rangeA1ColsOnly)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ majorDimension: 'ROWS', values: values2d })
  });
  if (!res.ok) throw new Error(`Sheets APPEND ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function mount(root, ctx){
  const initialSheetId = ctx?.state?.sheetId || "";
  const initialSheetName = ctx?.state?.entrySheet || "Data";

  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <h2 class="text-lg font-semibold mb-3">Append a new row</h2>
        <div class="grid md:grid-cols-3 gap-4">
          <label class="block"><span class="text-sm text-gray-700">Date (A)</span><input id="inDate" type="date" class="input" /></label>
          <label class="block"><span class="text-sm text-gray-700">ITD Production (B)</span><input id="inITD" type="number" step="any" class="input" /></label>
          <label class="block"><span class="text-sm text-gray-700">Daily Production (C)</span><input id="inProd" type="number" step="any" class="input" /></label>
        </div>
        <div class="flex items-center gap-3 mt-4">
          <button id="appendBtn" class="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled>Append Row</button>
          <span id="status" class="text-sm"></span>
        </div>
      </div>
      <div class="card">
        <h2 class="text-lg font-semibold mb-3">Last row where Column A is not blank</h2>
        <table class="min-w-full text-sm">
          <thead class="bg-gray-100 text-gray-700"><tr id="lastHead"></tr></thead>
          <tbody><tr id="lastBody"></tr></tbody>
        </table>
        <div id="rowMeta" class="text-xs text-gray-500 mt-2"></div>
      </div>
      <div class="card">
        <h2 class="text-lg font-semibold mb-2">Diagnostics</h2>
        <pre id="diag" class="mono text-xs whitespace-pre-wrap"></pre>
      </div>
    </section>`;

  const $ = (id)=>document.getElementById(id);
  const log = (m)=>{ const d=$('diag'); d.textContent += m + "\n"; };

  $('inDate').value = todayLocalYMD();
  $('appendBtn').addEventListener('click', appendRow);

  function initGsi(){
    try{
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SHEETS_SCOPE,
        callback: (resp) => {
          if (resp && resp.access_token){
            accessToken = resp.access_token;
            document.getElementById('appendBtn').disabled = false;
            loadLast();
          }
        }
      });
      log('GIS loaded (entry.js)');
    }catch(e){
      log('GIS init error: ' + e.message);
    }
  }
  function requestSignIn(){
    if (!tokenClient){
      if (!(window.google && google.accounts && google.accounts.oauth2)){
        log('Google Identity not ready yet.'); alert('Google Identity not ready yet.'); return;
      }
      initGsi();
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }
  window.requestSignIn = requestSignIn;

  async function loadLast(){
    const sheetId = initialSheetId;
    const name = initialSheetName;
    try{
      const values = await sheetsGet(sheetId, `${name}!A1:C10000`);
      const r = findLastRowByA(values);
      renderLast(r.headers, r.row, r.index);
    }catch(e){ log('Load failed: ' + e.message); }
  }
  function renderLast(headers, row, index){
    const thead = document.getElementById('lastHead');
    const tbody = document.getElementById('lastBody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    headers.forEach(h => { const th=document.createElement('th'); th.textContent=String(h||''); thead.appendChild(th); });
    if (row){ for (let c=0;c<headers.length;c++){ const td=document.createElement('td'); td.textContent=row[c]; tbody.appendChild(td);} }
    document.getElementById('rowMeta').textContent = `Last data row index: ${index}`;
  }
  async function appendRow(){
    const sheetId = initialSheetId;
    const name = initialSheetName;
    const inputDateStr = $('inDate').value.trim();
    const inputITD = toNumber($('inITD').value.trim());
    const inputProd = toNumber($('inProd').value.trim());
    const status = $('status');
    if (!inputDateStr || !Number.isFinite(inputITD) || !Number.isFinite(inputProd)){
      status.textContent = 'Enter a valid Date, ITD, and Prod'; return;
    }
    status.textContent = 'Writing…';
    try{
      const valuesABC = await sheetsGet(sheetId, `${name}!A1:C10000`);
      const rowsToWrite = buildExtrapolatedRows(valuesABC, inputDateStr, inputITD, inputProd);
      await sheetsAppend(sheetId, `${name}!A:C`, rowsToWrite);
      status.textContent = `Saved ${rowsToWrite.length} row(s)`;
      $('inDate').value = todayLocalYMD();
      $('inITD').value=''; $('inProd').value='';
      await loadLast();
    }catch(e){ status.textContent = 'Append failed: ' + e.message; }
  }
  if (window.google && google.accounts && google.accounts.oauth2){ initGsi(); }
  else { const t=setInterval(()=>{ if (window.google && google.accounts && google.accounts.oauth2){ clearInterval(t); initGsi(); }}, 300); }
}
