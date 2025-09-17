// tabs/charts.js

// Use the same endpoint and token as data.js
const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

let $root = null;
let state = { recent: [], monthly: [] };
let monthlyChart = null;
let dailyChart = null;

export async function mount(root){
  $root = root;

  // Template
  $root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Monthly Usage and Solar</h2>
        
        </div>
        <canvas id="chartMonthly" class="mt-3"></canvas>
      </div>

      <div class="card">
        <h2 class="font-semibold">Last 7 Days Usage and Solar</h2>
        <canvas id="chart7d" class="mt-3"></canvas>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-2">Log</h3>
        <pre id="log" class="mono text-xs whitespace-pre-wrap bg-gray-100 p-2 rounded border border-gray-200"></pre>
      </div>
    </section>
  `;

  // Bind
  $root.querySelector('#refreshBtn').addEventListener('click', async () => {
    log('manual refresh');
    await load();
  });

  await load();
}

function log(m){
  const el = $root.querySelector('#log');
  if (!el) return;
  el.textContent += (typeof m === 'string' ? m : JSON.stringify(m)) + "\n";
}

async function fetchQuery(sql){
  const url = `${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&query=${encodeURIComponent(sql)}`;
  const res = await fetch(url);
  const j = await res.json();
  if (!j || j.ok !== true) {
    const msg = (j && j.error) || 'Unknown error';
    throw new Error(msg);
  }
  return Array.isArray(j.rows) ? j.rows : [];
}

async function load(){
  try {
    // Build one canonical daily CTE, then derive daily and monthly
    const baseDailyCTE = `
      WITH daily AS (
        SELECT
          x.date AS Date,
          coalesce(SUM(x.Production) ,0)              AS SolarkWh,
          coalesce(SUM(x.Production) + SUM(x.Net),0)  AS HomekWh
        FROM (
          SELECT
            SP.date,
            SP.Production,
            NULL AS Net
          FROM \`energy.solar_production\` SP

          UNION ALL

          SELECT
            SDGE.date,
            NULL AS Production,
            SUM(net_kwh) AS Net
          FROM \`energy.sdge_usage\` SDGE
          GROUP BY SDGE.date
        ) x
        GROUP BY x.date
      )
    `;

    // Last 7 days (date, usage, prod) for the daily bar chart
    const sqlRecent7 = `
      ${baseDailyCTE}
      SELECT
        Date AS date,
        HomekWh AS usage,
        SolarkWh AS prod
      FROM daily
      WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      ORDER BY Date
    `;

    // Last 12 months aggregated by month label (month, usage, prod) for the monthly bar chart
    const sqlMonthly12 = `
      ${baseDailyCTE}
      SELECT
        FORMAT_DATE('%Y-%m', Date) AS month,
       coalesce( SUM(HomekWh)   ,0)            AS usage,
       coalesce(  SUM(SolarkWh)     ,0)         AS prod
      FROM daily
      WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
      GROUP BY month
      ORDER BY month
    `;

    const [recent, monthly] = await Promise.all([
      fetchQuery(sqlRecent7),
      fetchQuery(sqlMonthly12),
    ]);

    state.recent = recent;
    state.monthly = monthly;

    draw();
    log('GET charts: ' + JSON.stringify({ recent: recent.length, monthly: monthly.length }));
  } catch (err) {
    console.error('load error', err);
    log('load error: ' + err.message);
  }
}

function draw(){
  // Monthly chart
  const ctxMonthly = $root.querySelector('#chartMonthly');
  if (ctxMonthly){
    const labels = state.monthly.map(r => r.month);
    const use = state.monthly.map(r => Number(r.usage || 0));
    const solar = state.monthly.map(r => Number(r.prod || 0));

    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(ctxMonthly, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Usage kWh', data: use },
          { label: 'Solar kWh', data: solar }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Last 7 days chart
  const ctxDaily = $root.querySelector('#chart7d');
  if (ctxDaily){
    const labels = state.recent.map(r => r.date);
    const use = state.recent.map(r => Number(r.usage || 0));
    const solar = state.recent.map(r => Number(r.prod || 0));

    if (dailyChart) dailyChart.destroy();
    dailyChart = new Chart(ctxDaily, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Usage kWh', data: use },
          { label: 'Solar kWh', data: solar }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
}
