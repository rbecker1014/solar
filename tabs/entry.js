// tabs/entry.js
export async function mount(root, ctx){
  const { state, sheetsGet, sheetsAppend, findLastRowByA, buildExtrapolatedRows, todayLocalYMD } = ctx;
  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <h2 class="font-semibold mb-2">Append new solar readings</h2>
        <p class="text-xs text-gray-600 mb-3">Writes to Columns A–C in your Data sheet. Uses Google sign in.</p>
        <div class="grid md:grid-cols-3 gap-3">
          <label class="block"><span class="text-sm text-gray-700">Date (A)</span><input id="inDate" type="date" class="input"/></label>
          <label class="block"><span class="text-sm text-gray-700">ITD Production (B)</span><input id="inITD" type="number" step="any" class="input" placeholder="12345"/></label>
          <label class="block"><span class="text-sm text-gray-700">Daily Production (C)</span><input id="inProd" type="number" step="any" class="input" placeholder="kWh"/></label>
        </div>
        <div class="flex items-center gap-3 mt-3">
          <button id="appendBtn" class="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled>Append Row</button>
          <button id="entryRefreshBtn" class="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700">Refresh last row</button>
          <span id="status" class="text-sm"></span>
        </div>
      </div>
      <div class="card">
        <h2 class="font-semibold mb-2">Last row (Column A not blank)</h2>
        <div class="overflow-auto border border-gray-200 rounded-lg">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-100 text-gray-700"><tr id="lastHead"></tr></thead>
            <tbody><tr id="lastBody"></tr></tbody>
          </table>
        </div>
        <div id="rowMeta" class="text-xs text-gray-500 mt-2"></div>
      </div>
    </section>
  `;
  const inDate = document.getElementById('inDate');
  inDate.value = todayLocalYMD();
  document.getElementById('entryRefreshBtn').addEventListener('click', loadLast);
  document.getElementById('appendBtn').addEventListener('click', appendRow);

  async function loadLast(){
    const values = await sheetsGet(`${state.entrySheet}!A1:C10000`);
    const r = findLastRowByA(values);
    renderLast(r.headers, r.row, r.index);
  }
  function renderLast(headers, row, index){
    const thead = document.getElementById('lastHead');
    const tbody = document.getElementById('lastBody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    headers.forEach(h => {
      const th=document.createElement('th');
      th.className='p-2 text-left'; th.textContent=String(h||''); thead.appendChild(th);
    });
    if (row){
      for (let c=0;c<headers.length;c++){
        const td=document.createElement('td'); td.className='p-2 whitespace-nowrap';
        const raw=row[c];
        let v = raw == null ? '' : String(raw);
        td.textContent = v;
        tbody.appendChild(td);
      }
      document.getElementById('rowMeta').textContent = `Last data row index: ${index}`;
    } else {
      const td = document.createElement('td'); td.className='p-2 text-sm text-gray-500'; td.colSpan=headers.length||1; td.textContent='No data rows yet'; tbody.appendChild(td);
      document.getElementById('rowMeta').textContent = '';
    }
  }
  async function appendRow(){
    const inputDateStr = document.getElementById('inDate').value.trim();
    const inputITD = Number(document.getElementById('inITD').value.trim());
    const inputProd = Number(document.getElementById('inProd').value.trim());
    const status = document.getElementById('status');
    if (!inputDateStr || !Number.isFinite(inputITD) || !Number.isFinite(inputProd)){
      status.textContent = 'Enter a valid Date, ITD, and Prod'; status.className='text-sm bad'; return;
    }
    status.textContent = 'Writing…'; status.className='text-sm';
    const valuesABC = await sheetsGet(`${state.entrySheet}!A1:C10000`);
    const rowsToWrite = buildExtrapolatedRows(valuesABC, inputDateStr, inputITD, inputProd);
    await sheetsAppend(`${state.entrySheet}!A:C`, rowsToWrite);
    status.textContent = `Saved ${rowsToWrite.length} row(s)`; status.className='text-sm ok';
    document.getElementById('inDate').value = todayLocalYMD();
    document.getElementById('inITD').value=''; document.getElementById('inProd').value='';
    await loadLast();
  }
  const btn = document.getElementById('appendBtn'); if (btn) btn.disabled = false;
  try { await loadLast(); } catch(e){ console.warn(e); }
}
