// tabs/kpi.js

// Use the same endpoint and token as data.js / charts.js
const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

let $root = null;

export async function mount(root){
  $root = root;

  // Layout: removed Self Consumption, added Avg Daily Production
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

  await loadKPIs();
}

function log(m){
  const el = $root.querySelector('#kpiLog');
  if (el) el.textContent += (typeof m === 'string' ? m : JSON.stringify(m)) + "\n";
}
function fmtKWh(v){ return `${Number(v || 0).toFixed(0)} kWh`; }
function fmtPct(v){ return `${(Number(v || 0) * 100).toFixed(0)}%`; }
function fmtUSD(v){ return `$${Number(v || 0).toFixed(0)}`; }

async function fetchQuery(sql){
  const url = `${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&query=${encodeURIComponent(sql)}`;
  const res = await fetch(url);
  const j = await res.json();
  if (!j || j.ok !== true) throw new Error((j && j.error) || 'Unknown error');
  return Array.isArray(j.rows) ? j.rows : [];
}

function lastNDatesRange(n){
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - n);
  const iso = d => d.toISOString().slice(0,10);
  return { from: iso(from), to: iso(to) };
}

async function loadKPIs(){
  try{
    // Window: last 30 days. Change n if you want.
    const { from, to } = lastNDatesRange(30);

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
          SUM(net_kwh)         AS Net,
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
          SUM(Production) + SUM(Net)   AS HomeKWh
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
        SAFE_DIVIDE(SUM(Production) - SUM(GridExport), NULLIF(SUM(HomeKWh), 0)) AS selfSufficiency
      FROM daily
    `;

    // Inline the dates
    const sqlWithParams = sql
      .replace('@from', `DATE '${from}'`)
      .replace('@to',   `DATE '${to}'`);

    const rows = await fetchQuery(sqlWithParams);
    const r = rows[0] || {};

    // Paint
    $root.querySelector('#kpiUsage').textContent           = fmtKWh(r.totalUse);
    $root.querySelector('#kpiSolar').textContent           = fmtKWh(r.totalSolar);
    $root.querySelector('#kpiImport').textContent          = fmtKWh(r.totalImp);
    $root.querySelector('#kpiExport').textContent          = fmtKWh(r.totalExp);
    $root.querySelector('#kpiSelfSufficiency').textContent = fmtPct(r.selfSufficiency);
    $root.querySelector('#kpiAvgDailyUse').textContent     = fmtKWh(r.avgDailyUse);
    $root.querySelector('#kpiAvgDailyProd').textContent    = fmtKWh(r.avgDailyProd);

    // Savings left as 0 until you provide rates to compute it
    $root.querySelector('#kpiSavings').textContent         = fmtUSD(0);

    log(`KPIs window: ${from} to ${to}`);
  }catch(err){
    log('kpi error: ' + err.message);
    console.error(err);
  }
}
