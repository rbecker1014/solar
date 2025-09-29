// tabs/charts.js

import { renderDateRange, getNormalizedDateRange } from './date-range.js';
import { ensureDailyDataLoaded, selectChartSeries } from './daily-data-store.js';

let $root = null;
let state = { recent: [], monthly: [], dailyWindowStart: 0 };
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
           <div class="mt-4 space-y-2">
          <input
            id="dailyWindowSlider"
            type="range"
            min="0"
            max="0"
            value="0"
            step="1"
            class="w-full"
          />
          <div id="dailyWindowLabel" class="text-sm text-gray-600"></div>
        </div>
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

async function load(ctx){
  try {
    await ensureDailyDataLoaded(ctx?.state);
    const series = selectChartSeries(ctx?.state);
    state.recent = series.recent;
    state.monthly = series.monthly;
    const windowSize = Math.min(7, state.recent.length || 0);
    state.dailyWindowStart = Math.max(0, (state.recent.length || 0) - windowSize);

    draw();
    const { from, to } = getNormalizedDateRange(ctx?.state);
    log('charts refresh: ' + JSON.stringify({ recent: state.recent.length, monthly: state.monthly.length, from, to }));
  } catch (err) {
    console.error('load error', err);
    log('load error: ' + err.message);
  }
}

function draw(){
  drawMonthlyChart();
  drawDailyChart();
}

function drawMonthlyChart(){
  const ctxMonthly = $root.querySelector('#chartMonthly');
  if (!ctxMonthly) return;

  const labels = state.monthly.map(r => r.month);
  const use = state.monthly.map(r => Number(r.usage || 0));
  const solar = state.monthly.map(r => Number(r.prod || 0));

  if (monthlyChart && monthlyChart.canvas !== ctxMonthly){
    monthlyChart.destroy();
    monthlyChart = null;
  }

  if (!monthlyChart){
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
    return;
  }

  monthlyChart.data.labels = labels;
  if (monthlyChart.data.datasets?.[0]){
    monthlyChart.data.datasets[0].data = use;
  }
  if (monthlyChart.data.datasets?.[1]){
    monthlyChart.data.datasets[1].data = solar;
  }
  monthlyChart.update();
}

function getDailyWindow(){
  const total = state.recent.length;
  const windowSize = total > 0 ? Math.min(7, total) : 0;
  const maxStart = windowSize > 0 ? Math.max(0, total - windowSize) : 0;

  if (state.dailyWindowStart > maxStart) state.dailyWindowStart = maxStart;
  if (state.dailyWindowStart < 0) state.dailyWindowStart = 0;

  const start = windowSize > 0 ? state.dailyWindowStart : 0;
  const rows = windowSize > 0 ? state.recent.slice(start, start + windowSize) : [];

  return { rows, windowSize, maxStart, start };
}

function drawDailyChart(){
  const ctxDaily = $root.querySelector('#chart7d');
  if (!ctxDaily) return;

  const slider = $root.querySelector('#dailyWindowSlider');
  const label = $root.querySelector('#dailyWindowLabel');
  const { rows, windowSize, maxStart, start } = getDailyWindow();

  if (slider){
    slider.min = 0;
    slider.max = maxStart;
    slider.step = 1;
    slider.value = start;
    slider.disabled = maxStart === 0;
    slider.title = slider.disabled
      ? 'Not enough history to adjust the window'
      : 'Move to view earlier 7-day ranges';
    slider.classList.toggle('opacity-50', slider.disabled);

    if (!slider.dataset.bound){
      slider.addEventListener('input', handleDailySliderInput);
      slider.dataset.bound = '1';
    }
  }

  if (label){
    if (rows.length){
      const dayCount = rows.length;
      const windowLabel = dayCount === 7 ? '7-day window' : `${dayCount} day${dayCount === 1 ? '' : 's'} available`;
      label.textContent = `Showing ${rows[0].date} – ${rows[rows.length - 1].date} (${windowLabel})`;
    } else {
      label.textContent = 'No data available';
    }
  }

  const labels = rows.map(r => formatDailyLabel(r.date));
  const use = rows.map(r => Number(r.usage || 0));
  const solar = rows.map(r => Number(r.prod || 0));

  if (dailyChart && dailyChart.canvas !== ctxDaily){
    dailyChart.destroy();
    dailyChart = null;
  }

  if (!dailyChart){
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
    return;
  }

  dailyChart.data.labels = labels;
  if (dailyChart.data.datasets?.[0]){
    dailyChart.data.datasets[0].data = use;
  }
  if (dailyChart.data.datasets?.[1]){
    dailyChart.data.datasets[1].data = solar;
  }
  dailyChart.update();
}

function handleDailySliderInput(event){
  state.dailyWindowStart = Number(event.target.value) || 0;
  drawDailyChart();
}

function formatDailyLabel(dateString){
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())){
    return dateString;
  }
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  return [dateString, weekday];
}
