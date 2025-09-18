// tabs/charts.js

import { renderDateRange, getNormalizedDateRange } from './date-range.js';

// Use the same endpoint and token as data.js
const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

let $root = null;
let state = { recent: [], monthly: [] };
let monthlyChart = null;
let dailyChart = null;
let rangeListener = null;

export async function mount(root,ctx){
  $root = root;

  // Template
  $root.innerHTML = `
    <section class="space-y-3" data-charts-root>
      <div data-range-host></div>
      <div class="card">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Monthly Usage and Solar</h2>
          <button id="refreshBtn" type="button" class="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">Refresh</button>
        </div>
        <canvas id="chartMonthly" class="mt-3"></canvas>
      </div>

      <div class="card">
        <h2 class="font-semibold">Daily Usage and Solar</h2>
        <canvas id="chart7d" class="mt-3"></canvas>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-2">Log</h3>
        <pre id="log" class="mono text-xs whitespace-pre-wrap bg-gray-100 p-2 rounded border border-gray-200"></pre>
      </div>
    </section>
  `;

  // Bind safely
  const rangeHost = $root.querySelector('[data-range-host]');
  renderDateRange(rangeHost, ctx, {
    id: 'charts-range',
    onRangeChange: () => load(ctx),
  });

  if (rangeListener){
    document.removeEventListener('app:date-range-change', rangeListener);
  }

  rangeListener = (event) => {
    if (!$root || !$root.querySelector('[data-charts-root]')){
      document.removeEventListener('app:date-range-change', rangeListener);
      rangeListener = null;
      return;
    }
    if (event?.detail?.source === 'charts-range') return;
    load(ctx);
  };

  document.addEventListener('app:date-range-change', rangeListener);

  const btn = $root.querySelector('#refreshBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      log('manual refresh');
      await load(ctx);
    });
  }

  await load(ctx);
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

async function load(ctx){
  try {
      const { from, to } = getNormalizedDateRange(ctx?.state);

    // Build one canonical daily CTE scoped to the active range
    const baseDailyCTE = `
      WITH daily AS (
        SELECT
          x.date AS Date,
          COALESCE(SUM(x.Production), 0)              AS SolarkWh,
          COALESCE(SUM(x.Production) + SUM(x.Net), 0) AS HomeKWh
        FROM (
          SELECT
            SP.date,
            SP.Production,
            NULL AS Net
          FROM \`energy.solar_production\` SP
          WHERE SP.date BETWEEN DATE '${from}' AND DATE '${to}'
          
          UNION ALL

          SELECT
            SDGE.date,
            NULL AS Production,
            SUM(net_kwh) AS Net
          FROM \`energy.sdge_usage\` SDGE
          WHERE SDGE.date BETWEEN DATE '${from}' AND DATE '${to}'
          GROUP BY SDGE.date
        ) x
          WHERE x.date BETWEEN DATE '${from}' AND DATE '${to}'
          GROUP BY x.date
      )
    `;

    const sqlDailyRange = `
      ${baseDailyCTE}
      SELECT
        Date AS date,
        HomeKWh AS usage,
        SolarkWh AS prod
      FROM daily
      ORDER BY Date
    `;

      const sqlMonthlyRange = `
      ${baseDailyCTE}
      SELECT
        FORMAT_DATE('%Y-%m', Date) AS month,
        COALESCE(SUM(HomeKWh), 0)  AS usage,
        COALESCE(SUM(SolarkWh), 0) AS prod
      FROM daily
      GROUP BY month
      ORDER BY month
    `;

    const [recent, monthly] = await Promise.all([
      fetchQuery(sqlDailyRange),
      fetchQuery(sqlMonthlyRange),
    ]);

    state.recent = recent;
    state.monthly = monthly;

    draw();
    log('GET charts: ' + JSON.stringify({ recent: recent.length, monthly: monthly.length, from, to }));
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

  // Daily chart for the selected range
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
