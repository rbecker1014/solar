// tabs/data.js

import { renderDateRange, getNormalizedDateRange } from './date-range.js';

const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

let $root = null;
let rangeListener = null;

export async function mount(root,ctx) {
  $root = root;

  // Render template first so tbody exists before load()
  $root.innerHTML = `
    <section class="space-y-3" data-data-root>
      <div data-range-host></div>
      <div class="card">
        <h2 class="font-semibold">Data</h2>
        <p class="text-xs text-gray-500 mt-1" id="dataRangeSummary"></p>
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
    </section>
  `;

   const rangeHost = $root.querySelector('[data-range-host]');
  renderDateRange(rangeHost, ctx, {
    id: 'data-range',
    onRangeChange: () => load(ctx),
  });

  if (rangeListener){
    document.removeEventListener('app:date-range-change', rangeListener);
  }

  rangeListener = (event) => {
    if (!$root || !$root.querySelector('[data-data-root]')){
      document.removeEventListener('app:date-range-change', rangeListener);
      rangeListener = null;
      return;
    }
    if (event?.detail?.source === 'data-range') return;
    load(ctx);
  };

  document.addEventListener('app:date-range-change', rangeListener);

  await load(ctx);
}

async function load(ctx) {
  const tbody = $root && $root.querySelector('#dataTable tbody');
  if (!tbody) {
    console.error('tbody not found. Check that mount(root) ran and rendered the table.');
    return;
  }
  tbody.innerHTML = '';

  const summary = $root.querySelector('#dataRangeSummary');
  const { from, to } = getNormalizedDateRange(ctx?.state);
  if (summary) {
    summary.textContent = `Showing ${from} → ${to}`;
  }

const sql = `
    WITH combined AS (
      SELECT
        SP.date,
        SP.Production,
        NULL AS Net,
        NULL AS GridImport,
        NULL AS GridExport
      FROM \`energy.solar_production\` SP
      WHERE SP.date BETWEEN DATE '${from}' AND DATE '${to}'
      
      UNION ALL

      SELECT
        SDGE.date,
        NULL AS Production,
        SUM(net_kwh)         AS Net,
        SUM(consumption_kwh) AS GridImport,
        SUM(generation_kwh)  AS GridExport
      FROM \`energy.sdge_usage\` SDGE
      WHERE SDGE.date BETWEEN DATE '${from}' AND DATE '${to}'
      GROUP BY SDGE.date
 )
    SELECT
      x.date AS Date,
      SUM(x.Production)              AS SolarkWh,
      SUM(x.Production) + SUM(x.Net) AS HomekWh,
      SUM(x.Net)                     AS NetkWh,
      SUM(x.GridImport)              AS GridImport,
      SUM(x.GridExport)              AS GridExport
    FROM combined x
    WHERE x.date BETWEEN DATE '${from}' AND DATE '${to}'
    GROUP BY x.date
    ORDER BY x.date DESC
  `;

  try {
    const url = `${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&query=${encodeURIComponent(sql)}`;
    const res = await fetch(url);
    const j = await res.json();

    if (!j || j.ok !== true) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" class="p-2 text-red-600">${(j && j.error) || 'Unknown error'}</td>`;
      tbody.appendChild(tr);
      console.error('GET data error:', j);
      return;
    }

    const rows = Array.isArray(j.rows) ? j.rows : [];
    const frag = document.createDocumentFragment();

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="p-2 text-center text-gray-500">No data</td>';
      frag.appendChild(tr);
    } else {
      for (const r of rows) {
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
    console.log('GET data:', { ok: j.ok, count: rows.length, from, to });
  } catch (e) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="p-2 text-red-600">Fetch error: ${e.message}</td>`;
    tbody.appendChild(tr);
    console.error('load error:', e);
  }
}
