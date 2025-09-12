// tabs/kpi.js

// Use the same endpoint and token as data.js / charts.js
const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

let $root = null;

export async function mount(root, ctx){
  $root = root;

  // Layout: removed "Self Consumption", added "Avg Daily Production"
  $root.innerHTML = `
    <section class="space-y-3">
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
        <div class="card"><div class="kpi" id="kpiSavings">$0</div><div class="kpi-label">Est. Savings vs grid</div></div>
      </div>
      <div class="card"><pre id="kpiLog" class="mono text-xs whitespace-pre-wrap bg-gray-100 p-2 rounded border border-gray-200"></pre></div>
    </section>
  `;

  await loadKPIs(ctx);
}

// Helpers
function log(msg){
  const el = $root.querySelector('#kpiLog');
  if (el) el.textContent += (typeof msg === 'string' ? msg : JSON.stringify(msg)) + "\n";
}
function fmtKWh(v){ return `${Number(v || 0).toFixed(0)} kWh`; }
function fmtPct(v){ return `${(Number(v || 0) * 100).toFixed(0)}%`; }
function fmtUSD(v){ return `$${Number(v || 0).toFixed(0)}`; }

// Try to honor app date filters if available; otherwise use last 30 days
function getDateRange(ctx){
  try{
    if (ctx && ctx.state && typeof ctx.state.getDateRange === 'function'){
      const r = ctx.state.getDateRange(); // expect { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
      if (r && r.from && r.to) return r;
    }
  }catch(_){}
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 30);
  const iso = d => d.toISOString().slice(0,10);
  return { from: iso(from), to: iso(to) };
}

async function fetchQuery(sql){
  const url = `${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&query=${encodeURIComponent(sql)}`;
  const res = await fetch(url);
  const j = await res.json();
  if (!j || j.ok !== true) throw new Error((j && j.error) || 'Unknown error');
  return Array.isArray(j.rows) ? j.rows : [];
}

async function loadKPIs(ctx){
  try{
    const { from, to } = getDateRange(ctx);

    // Daily rollup across both sources, then aggregate once
    const sql = `
      WITH combined AS (
        SELECT
          date,
          Production,
          NULL AS Net,
          NULL AS GridImport,
          NULL AS GridExport
        FROM \`energy.solar_production\`
        WHERE date BETWEEN @from AND @to

        UNION ALL

        SELECT
          date,
          NULL AS Production,
          SUM(net_kwh)        AS Net,
          SUM(consumption_kwh) AS GridImport,
          SUM(generation_kwh)  AS GridExport
        FROM \`energy.sdge_usage\`
        WHERE date BETWEEN @from AND @to
        GROUP BY date
      ),
      daily AS (
        SELECT
          date,
          SUM(Production)              AS Production,
          SUM(Net)                     AS Net,
          SUM(GridImport)              AS GridImport,
          SUM(GridExport)              AS GridExport,
