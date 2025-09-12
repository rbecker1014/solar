// tabs/data.js
export async function mount(root){
  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <h2 class="font-semibold">Data</h2>
        <div class="overflow-x-auto mt-2">
          <table class="min-w-full text-sm" id="dataTable">
            <thead class="bg-gray-100 text-gray-700">
              <tr>
                <th class="text-left p-2">Date</th>
                <th class="text-right p-2">Solar kWh</th>
                <th class="text-right p-2">Home kWh</th>
                <th class="text-right p-2">Net kWh</th>
                <th class="text-right p-2">Grid Import</th>
                <th class="text-right p-2">Grid Export</th>
              </tr>
            </thead>
            <tbody id="tableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3 class="text-lg font-semibold mb-2">Log</h3>
        <pre id="log" class="mono text-xs whitespace-pre-wrap bg-gray-100 p-2 rounded border border-gray-200"></pre>
      </div>
    </section>
  `;

  const ENDPOINT = "https://script.google.com/macros/s/AKfycby3z6qAj0H8D5Lpu9kC6TgJyneSpArmxzbWiKUYCMI-tNwQarcotZFz1QmFJjAcxRzO";
  const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

  const log = m => {
    const el = root.querySelector('#log');
    el.textContent += (typeof m === 'string' ? m : JSON.stringify(m)) + "\n";
  };

  async function load(){
    const tbody = root.querySelector('#tableBody');
    tbody.innerHTML = '';
    const sql = `
Select
x.Date
,sum(x.Production) as SolarkWh
,sum(x.Production)+sum(X.Net) as HomekWh
,sum(X.Net) as NetkWh
,sum(x.GridImport) as GridImport
,sum(x.GridExport) as GridExport
from(
select
SP.date
,Production
,null as Usage
,null as Net
,null as GridImport
,null as GridExport
from \`energy.solar_production\` SP

UNION ALL

Select
SDGE.date
,null as Production
,null as Usage
,sum(net_kwh) as Net
,sum(consumption_kwh) as GridImport
,sum(generation_kwh) as GridExport
FROM \`energy.sdge_usage\` SDGE 
Group by SDGE.date
)x
group by x.date
order by x.date desc
`;
    try{
      const url = `${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&query=${encodeURIComponent(sql)}`;
      const res = await fetch(url);
      const j = await res.json();
      const rows = j.rows || [];
      const frag = document.createDocumentFragment();
      for(const r of rows){
        const tr = document.createElement('tr');
              tr.innerHTML = `<td colspan="6" class="p-2 text-red-600">${err.message}</td>`;
      tbody.appendChild(tr);
      log('load error: ' + err.message);
      }
      if(rows.length === 0){
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="6" class="p-2 text-center text-gray-500">No data</td>';
        frag.appendChild(tr);
      }
      tbody.appendChild(frag);
      log('GET data: ' + JSON.stringify(j));
    }catch(err){
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
    }
  await load();
}
