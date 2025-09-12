// tabs/data.js

  const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
  const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

async function load(){
  const tbody = root.querySelector('#tableBody');
  tbody.innerHTML = '';

  const sql = `
    SELECT
      x.date AS Date,
      SUM(x.Production)          AS SolarkWh,
      SUM(x.Production) + SUM(x.Net) AS HomekWh,
      SUM(x.Net)                 AS NetkWh,
      SUM(x.GridImport)          AS GridImport,
      SUM(x.GridExport)          AS GridExport
    FROM (
      SELECT
        SP.date,
        SP.Production,
        NULL AS Net,
        NULL AS GridImport,
        NULL AS GridExport
      FROM \`energy.solar_production\` SP

      UNION ALL

      SELECT
        SDGE.date,
        NULL AS Production,
        SUM(net_kwh)        AS Net,
        SUM(consumption_kwh) AS GridImport,
        SUM(generation_kwh)  AS GridExport
      FROM \`energy.sdge_usage\` SDGE
      GROUP BY SDGE.date
    ) x
    GROUP BY x.date
    ORDER BY x.date DESC
  `;

  try{
    const url = `${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&query=${encodeURIComponent(sql)}`;
    const res = await fetch(url);
    const j = await res.json();

    if (!j.ok) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" class="p-2 text-red-600">${j.error || 'Unknown error'}</td>`;
      tbody.appendChild(tr);
      log('GET data error: ' + JSON.stringify(j));
      return;
    }

    const rows = j.rows || [];
    const frag = document.createDocumentFragment();

    if (rows.length === 0){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="p-2 text-center text-gray-500">No data</td>';
      frag.appendChild(tr);
    } else {
      for (const r of rows){
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="p-2 whitespace-nowrap">${r.Date}</td>
          <td class="p-2 text-right">${Number(r.SolarkWh || 0).toFixed(2)}</td>
          <td class="p-2 text-right">${Number(r.HomekWh || 0).toFixed(2)}</td>
          <td class="p-2 text-right">${Number(r.NetkWh || 0).toFixed(2)}</td>
          <td class="p-2 text-right">${Number(r.GridImport || 0).toFixed(2)}</td>
          <td class="p-2 text-right">${Number(r.GridExport || 0).toFixed(2)}</td>
        `;
        frag.appendChild(tr);
      }
    }

    tbody.appendChild(frag);
    log('GET data: ' + JSON.stringify({ ok: j.ok, count: rows.length }));
  }catch(e){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="p-2 text-red-600">Fetch error: ${e.message}</td>`;
    tbody.appendChild(tr);
    log('load error: ' + e.message);
  }
}

  
