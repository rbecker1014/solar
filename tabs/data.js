// tabs/data.js
export async function mount(root, ctx){
  const { state } = ctx;
  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
          <h2 class="font-semibold">Data</h2>
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
    try {
    const rows = await runDailySummaryQuery(state.projectId, state.apiKey);
    const frag = document.createDocumentFragment();
    for (const r of rows){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="p-2 whitespace-nowrap">${r.date}</td>
        <td class="p-2 text-right">${Number(r.use || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(r.solar || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(r.imp || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(r.exp || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(r.solarToLoad || 0).toFixed(2)}</td>`;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  } catch(err){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="p-2 text-red-600">${err.message}</td>`;
    tbody.appendChild(tr);
  }
}

async function runDailySummaryQuery(projectId, apiKey){
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'SELECT * FROM DailySummary' })
  });
  if (!res.ok){
    const text = await res.text();
    throw new Error(`BigQuery API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  const rows = json.rows || [];
  return rows.map(r => {
    const f = r.f.map(c => c.v);
    return {
      date: f[0],
      use: f[1],
      solar: f[2],
      imp: f[3],
      exp: f[4],
      solarToLoad: f[5]
    };
  });
}
