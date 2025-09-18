// tabs/kpi.js

import { renderDateRange, getNormalizedDateRange } from './date-range.js';

/ Same endpoint and token used by data.js / charts.js
const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

let $root = null;
let rangeListener = null;

export async function mount(root, ctx){
  $root = root;

  // Layout: removed Self Consumption, added Avg Daily Production
  $root.innerHTML = `
    <section class="space-y-3" data-kpi-root>
      <div data-range-host></div>
      <div class="grid grid-cols-2 gap-3">
        <div class="card"><div class="kpi" id="kpiUsage">0 kWh</div><div class="kpi-label">Total Usage</div></div>
        <div class="card"><div class="kpi" id="kpiSolar">0 kWh</div><div class="kpi-label">Total Solar</div></div>
        <div class="card"><div class="kpi" id="kpiImport">0 kWh</div><div class="kpi-label">Grid Import</div></div>
        <div class="card"><div class="kpi" id="kpiExport">0 kWh</div><div class="kpi-label">Grid Export</div></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="card"><div class="kpi" id="kpiSelfSufficiency">0%</div><div class="kpi-label">Self Sufficiency</div></div>
        <div class="card"><div class="kpi" id="kpiAvgDailyUse">0 kWh</div><div class="kpi-label">Avg Daily Usage</div></div>
        <div class="card"><div class="kpi" id="kpiAvgDailyProd">0 kWh</div><div class="kpi-label">Avg Daily Production</div></div>
      </div>
    </section>
  `;

  const rangeHost = $root.querySelector('[data-range-host]');
  renderDateRange(rangeHost, ctx, {
    id: 'kpi-range',
    onRangeChange: () => loadKPIs(ctx),
  });

  if (rangeListener){
    document.removeEventListener('app:date-range-change', rangeListener);
  }

  rangeListener = (event) => {
    if (!$root || !$root.querySelector('[data-kpi-root]')){
      document.removeEventListener('app:date-range-change', rangeListener);
      rangeListener = null;
      return;
    }
    if (event?.detail?.source === 'kpi-range') return;
    loadKPIs(ctx);
  };

  document.addEventListener('app:date-range-change', rangeListener);

await loadKPIs(ctx);
}

function fmtKWh(v){ return `${Number(v || 0).toFixed(0)} kWh`; }
function fmtPct(v){ return `${(Number(v || 0) * 100).toFixed(0)}%`; }

async function fetchQuery(sql){
  const url = `${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&query=${encodeURIComponent(sql)}`;
  const res = await fetch(url);
  const j = await res.json();
  if (!j || j.ok !== true) throw new Error((j && j.error) || 'Unknown error');
  return Array.isArray(j.rows) ? j.rows : [];
}

async function loadKPIs(ctx){
  try{
    const { from, to } = getNormalizedDateRange(ctx?.state);

    // Embed dates directly to avoid leftover @from/@to placeholders
    const sql = `
      WITH combined AS (
        SELECT
          date,
          Production,
          NULL AS Net,
          NULL AS GridImport,
          NULL AS GridExport
        FROM \`energy.solar_production\`
        WHERE date BETWEEN DATE '${from}' AND DATE '${to}'

        UNION ALL

        SELECT
          date,
          NULL AS Production,
          SUM(net_kwh)         AS Net,
          SUM(consumption_kwh) AS GridImport,
          SUM(generation_kwh)  AS GridExport
        FROM \`energy.sdge_usage\`
        WHERE date BETWEEN DATE '${from}' AND DATE '${to}'
        GROUP BY date
      ),
      daily AS (
        SELECT
          date,
          SUM(Production)            AS Production,
          SUM(Net)                   AS Net,
          SUM(GridImport)            AS GridImport,
          SUM(GridExport)            AS GridExport,
          SUM(Production) + SUM(Net) AS HomeKWh
        FROM combined
        GROUP BY date
      )
      SELECT
        SUM(Production)                         AS totalSolar,
        SUM(HomeKWh)                            AS totalUse,
        SUM(GridImport)                         AS totalImp,
        SUM(GridExport)                         AS totalExp,
        AVG(HomeKWh)                            AS avgDailyUse,
        AVG(Production)                         AS avgDailyProd,
        SAFE_DIVIDE(SUM(Production) , NULLIF(SUM(HomeKWh), 0)) AS selfSufficiency
      FROM daily
    `;

    const rows = await fetchQuery(sql);
    const r = rows[0] || {};

    // Paint
    $root.querySelector('#kpiUsage').textContent           = fmtKWh(r.totalUse);
    $root.querySelector('#kpiSolar').textContent           = fmtKWh(r.totalSolar);
    $root.querySelector('#kpiImport').textContent          = fmtKWh(r.totalImp);
    $root.querySelector('#kpiExport').textContent          = fmtKWh(r.totalExp);
    $root.querySelector('#kpiSelfSufficiency').textContent = fmtPct(r.selfSufficiency);
    $root.querySelector('#kpiAvgDailyUse').textContent     = fmtKWh(r.avgDailyUse);
    $root.querySelector('#kpiAvgDailyProd').textContent    = fmtKWh(r.avgDailyProd);
  }catch(err){
    console.error('kpi error:', err);
    const el = document.createElement('div');
    el.className = 'text-sm text-red-600';
    el.textContent = `KPI error: ${err.message}`;
    $root.appendChild(el);
  }
}
