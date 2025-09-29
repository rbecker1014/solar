// tabs/kpi.js

import { renderDateRange } from './date-range.js';
import { ensureDailyDataLoaded, ensureFullDailyDataLoaded, selectKpiMetrics } from './daily-data-store.js';

let $root = null;
let rangeListener = null;

export async function mount(root, ctx){
  $root = root;

  // Layout: removed Self Consumption, added Avg Daily Production
  $root.innerHTML = `
    <section class="space-y-6" data-kpi-root>
      <div data-range-host></div>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Week To Date</h2>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="card">
            <div class="kpi" id="kpiWeekToDate">0 kWh</div>
            <div class="kpi-label">WTD Solar</div>
            <div class="text-xs text-slate-500" id="kpiWeekToDateDetail">vs PWTD</div>
          </div>
          <div class="card">
            <div class="kpi" id="kpiPrevWeekChange">0%</div>
            <div class="kpi-label">PWTD Change</div>
            <div class="text-xs text-slate-500" id="kpiPrevWeekTotal">PWTD 0 kWh</div>
          </div>
        </div>
      </section>

      <hr class="border-t border-slate-200 dark:border-slate-700" />

      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Month To Date</h2>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="card">
            <div class="kpi" id="kpiMonthToDate">0 kWh</div>
            <div class="kpi-label">MTD Solar</div>
            <div class="text-xs text-slate-500" id="kpiMonthToDateDetail">vs PMTD</div>
          </div>
          <div class="card">
            <div class="kpi" id="kpiPrevMonthChange">0%</div>
            <div class="kpi-label">PMTD Change</div>
            <div class="text-xs text-slate-500" id="kpiPrevMonthTotal">PMTD 0 kWh</div>
          </div>
        </div>
      </section>

      <hr class="border-t border-slate-200 dark:border-slate-700" />

      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Year To Date</h2>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="card">
            <div class="kpi" id="kpiYtdSolar">0 kWh</div>
            <div class="kpi-label">YTD Solar</div>
            <div class="text-xs text-slate-500" id="kpiYearToDateDetail">vs PYTD</div>
          </div>
          <div class="card">
            <div class="kpi" id="kpiPrevYearChange">0%</div>
            <div class="kpi-label">PYTD Change</div>
            <div class="text-xs text-slate-500" id="kpiPrevYearTotal">PYTD 0 kWh</div>
          </div>
        </div>
      </section>

      <hr class="border-t border-slate-200 dark:border-slate-700" />

      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">All Other</h2>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          <div class="card"><div class="kpi" id="kpiUsage">0 kWh</div><div class="kpi-label">Total Usage</div></div>
          <div class="card"><div class="kpi" id="kpiImport">0 kWh</div><div class="kpi-label">Grid Import</div></div>
          <div class="card"><div class="kpi" id="kpiExport">0 kWh</div><div class="kpi-label">Grid Export</div></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="card"><div class="kpi" id="kpiSelfSufficiency">0%</div><div class="kpi-label">Self Sufficiency</div></div>
          <div class="card"><div class="kpi" id="kpiAvgDailyUse">0 kWh</div><div class="kpi-label">Avg Daily Usage</div></div>
          <div class="card"><div class="kpi" id="kpiAvgDailyProd">0 kWh</div><div class="kpi-label">Avg Daily Production</div></div>
        </div>
        <div class="card">
          <div class="kpi" id="kpiTopProdValue">0 kWh</div>
          <div class="kpi-label">Top Production Day</div>
          <div class="text-xs text-slate-500" id="kpiTopProdDetail">No production data</div>
        </div>
      </section>
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

function fmtKWh(value){
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0 kWh';

  const abs = Math.abs(num);
  let unit = 'kWh';
  let divisor = 1;
  let fractionDigits = 0;

  if (abs >= 1_000_000){
    unit = 'GWh';
    divisor = 1_000_000;
    fractionDigits = 2;
  }else if (abs >= 1_000){
    unit = 'mWh';
    divisor = 1_000;
    fractionDigits = 2;
  }

  const scaled = num / divisor;
  const formatted = scaled.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  return `${formatted} ${unit}`;
}
function fmtPct(v){ return `${(Number(v || 0) * 100).toFixed(0)}%`; }
function fmtDate(value){
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDeltaPercent(delta = 0, previous = 0){
  const prevNum = Number(previous);
  if (!Number.isFinite(prevNum) || Math.abs(prevNum) < Number.EPSILON){
    return 'n/a';
  }
  const pct = (Number(delta) / prevNum) * 100;
  if (!Number.isFinite(pct)){
    return 'n/a';
  }
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function formatDeltaDetail({ delta = 0, previous = 0 }, label){
  const pct = formatDeltaPercent(delta, previous);
  const formattedPrevious = fmtKWh(previous);
  if (pct === 'n/a'){
    return `n/a vs ${label} ${formattedPrevious}`;
  }
  return `${pct} vs ${label} ${formattedPrevious}`;
}

async function loadKPIs(ctx){
  try{
    await Promise.all([
      ensureDailyDataLoaded(ctx?.state),
      ensureFullDailyDataLoaded(ctx?.state),
    ]);
    const metrics = selectKpiMetrics(ctx?.state);

    // Paint
    $root.querySelector('#kpiWeekToDate').textContent      = fmtKWh(metrics.weekToDate.value);
    $root.querySelector('#kpiMonthToDate').textContent     = fmtKWh(metrics.monthToDate.value);
    $root.querySelector('#kpiPrevWeekChange').textContent  = formatDeltaPercent(metrics.weekToDate.delta, metrics.weekToDate.previous);
    $root.querySelector('#kpiPrevWeekTotal').textContent   = `PWTD ${fmtKWh(metrics.weekToDate.previous)}`;
    $root.querySelector('#kpiPrevMonthChange').textContent = formatDeltaPercent(metrics.monthToDate.delta, metrics.monthToDate.previous);
    $root.querySelector('#kpiPrevMonthTotal').textContent  = `PMTD ${fmtKWh(metrics.monthToDate.previous)}`;
    $root.querySelector('#kpiUsage').textContent            = fmtKWh(metrics.totalUse);
    $root.querySelector('#kpiYtdSolar').textContent         = fmtKWh(metrics.yearToDate.value);
    $root.querySelector('#kpiPrevYearChange').textContent   = formatDeltaPercent(metrics.yearToDate.delta, metrics.yearToDate.previous);
    $root.querySelector('#kpiPrevYearTotal').textContent    = `PYTD ${fmtKWh(metrics.yearToDate.previous)}`;
    $root.querySelector('#kpiYearToDateDetail').textContent = formatDeltaDetail(metrics.yearToDate, 'PYTD');
    $root.querySelector('#kpiImport').textContent           = fmtKWh(metrics.totalImp);
    $root.querySelector('#kpiExport').textContent           = fmtKWh(metrics.totalExp);
    $root.querySelector('#kpiSelfSufficiency').textContent  = fmtPct(metrics.selfSufficiency);
    $root.querySelector('#kpiAvgDailyUse').textContent      = fmtKWh(metrics.avgDailyUse);
    $root.querySelector('#kpiAvgDailyProd').textContent     = fmtKWh(metrics.avgDailyProd);
    $root.querySelector('#kpiWeekToDateDetail').textContent   = formatDeltaDetail(metrics.weekToDate, 'PWTD');
    $root.querySelector('#kpiMonthToDateDetail').textContent  = formatDeltaDetail(metrics.monthToDate, 'PMTD');

    const top = metrics.topProductionDay;
    const topValueEl = $root.querySelector('#kpiTopProdValue');
    const topDetailEl = $root.querySelector('#kpiTopProdDetail');
    if (top?.date){
      topValueEl.textContent = fmtKWh(top.solarKWh);
      const bits = [fmtDate(top.date)].filter(Boolean);
      bits.push(`Usage ${fmtKWh(top.homeKWh)}`);
      bits.push(`Export ${fmtKWh(top.gridExport)}`);
      topDetailEl.textContent = bits.join(' · ');
    }else{
      topValueEl.textContent = fmtKWh(0);
      topDetailEl.textContent = 'No production data';
    }
  }catch(err){
    console.error('kpi error:', err);
    const el = document.createElement('div');
    el.className = 'text-sm text-red-600';
    el.textContent = `KPI error: ${err.message}`;
    $root.appendChild(el);
  }
}
