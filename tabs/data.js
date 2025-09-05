// tabs/data.js
export async function mount(root, ctx){
  const { state } = ctx;
  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Data</h2>
          <a id="sheetLink" href="https://docs.google.com/spreadsheets/d/${state.sheetId}/edit" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-lg bg-gray-200 text-sm">Open Sheet</a>
        </div>
        <div class="overflow-x-auto mt-2">
          <table class="min-w-full text-sm" id="dataTable">
            <thead class="bg-gray-100 text-gray-700">
              <tr>
                <th class="text-left p-2">Date</th>
                <th class="text-right p-2">Home kWh</th>
                <th class="text-right p-2">Solar kWh</th>
                <th class="text-right p-2">Grid Import</th>
                <th class="text-right p-2">Grid Export</th>
                <th class="text-right p-2">Solar → Load</th>
              </tr>
            </thead>
            <tbody id="tableBody"></tbody>
          </table>
        </div>
      </div>
    </section>
  `;
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const r of state.getFilteredRows()){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-2 whitespace-nowrap">${r.date.toISOString().split('T')[0]}</td>
      <td class="p-2 text-right">${r.use.toFixed(2)}</td>
      <td class="p-2 text-right">${r.solar.toFixed(2)}</td>
      <td class="p-2 text-right">${r.imp.toFixed(2)}</td>
      <td class="p-2 text-right">${r.exp.toFixed(2)}</td>
      <td class="p-2 text-right">${r.solarToLoad.toFixed(2)}</td>`;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}
