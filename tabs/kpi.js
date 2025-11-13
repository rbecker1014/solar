// tabs/kpi.js

import { renderDateRange } from './date-range.js';
import { ensureDailyDataLoaded, ensureFullDailyDataLoaded, ensureSolarProductionLoaded, selectKpiMetrics } from './daily-data-store.js';

let $root = null;
let rangeListener = null;
let hasAnnouncedReady = false;

export async function mount(root, ctx){
  $root = root;

  // Layout: removed Self Consumption, added Avg Daily Production
  $root.innerHTML = `
    <section class="space-y-6" data-kpi-root>
      <div data-range-host></div>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-baseline gap-2">
          <span>Week To Date</span>
          <span class="normal-case text-xs font-normal text-slate-400" id="kpiWeekRange"></span>
        </h2>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="card">
            <div class="kpi" id="kpiWeekToDate">0 kWh</div>
            <div class="kpi-label">WTD Solar</div>
            <div class="text-xs text-slate-500" id="kpiWeekToDateDetail">vs PWTD</div>
            <div class="text-xs text-slate-500" id="kpiWeekToDateRows">Rows used: WTD 0 · PWTD 0</div>
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
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-baseline gap-2">
          <span>Month To Date</span>
          <span class="normal-case text-xs font-normal text-slate-400" id="kpiMonthRange"></span>
        </h2>
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
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-baseline gap-2">
          <span>Year To Date</span>
          <span class="normal-case text-xs font-normal text-slate-400" id="kpiYearRange"></span>
        </h2>
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

function fmtShortDate(value){
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit' }).format(date);
}

function formatRowUsage({ currentRowCount = 0, previousRowCount = 0 } = {}){
  const current = Number.isFinite(Number(currentRowCount)) ? Number(currentRowCount) : 0;
  const previous = Number.isFinite(Number(previousRowCount)) ? Number(previousRowCount) : 0;
  return `Rows used: WTD ${current} · PWTD ${previous}`;
}

function formatCoverageRange(range = {}){
  const start = fmtShortDate(range.start);
  const end = fmtShortDate(range.end);
  if (!start && !end) return '';
  if (start && end){
    if (start === end) return `, ${start}`;
    return `, ${start} to ${end}`;
  }
  return `, ${start || end}`;
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
    // Defensive check: ensure $root exists
    if (!$root){
      console.warn('KPI loadKPIs called but $root is null - tab may not be mounted yet');
      return;
    }

    // Check if KPI container is still in the DOM
    const kpiRoot = $root.querySelector('[data-kpi-root]');
    if (!kpiRoot){
      console.warn('KPI container not found in DOM - tab may have been unmounted');
      return;
    }

    console.log('Loading KPIs...');

    await Promise.all([
      ensureDailyDataLoaded(ctx?.state),
      ensureFullDailyDataLoaded(ctx?.state),
      ensureSolarProductionLoaded(ctx?.state),
    ]);
    const metrics = selectKpiMetrics(ctx?.state);

    // Helper function to safely update DOM elements
    const safeUpdate = (selector, value) => {
      const element = $root.querySelector(selector);
      if (element){
        element.textContent = value;
      }else{
        console.warn(`KPI element not found: ${selector}`);
      }
    };

    // Safely paint all KPI values
    safeUpdate('#kpiWeekToDate', fmtKWh(metrics.weekToDate.value));
    safeUpdate('#kpiMonthToDate', fmtKWh(metrics.monthToDate.value));
    safeUpdate('#kpiPrevWeekChange', formatDeltaPercent(metrics.weekToDate.delta, metrics.weekToDate.previous));
    safeUpdate('#kpiPrevWeekTotal', `PWTD ${fmtKWh(metrics.weekToDate.previous)}`);
    safeUpdate('#kpiPrevMonthChange', formatDeltaPercent(metrics.monthToDate.delta, metrics.monthToDate.previous));
    safeUpdate('#kpiPrevMonthTotal', `PMTD ${fmtKWh(metrics.monthToDate.previous)}`);
    safeUpdate('#kpiUsage', fmtKWh(metrics.totalUse));
    safeUpdate('#kpiYtdSolar', fmtKWh(metrics.yearToDate.value));
    safeUpdate('#kpiPrevYearChange', formatDeltaPercent(metrics.yearToDate.delta, metrics.yearToDate.previous));
    safeUpdate('#kpiPrevYearTotal', `PYTD ${fmtKWh(metrics.yearToDate.previous)}`);
    safeUpdate('#kpiYearToDateDetail', formatDeltaDetail(metrics.yearToDate, 'PYTD'));
    safeUpdate('#kpiImport', fmtKWh(metrics.totalImp));
    safeUpdate('#kpiExport', fmtKWh(metrics.totalExp));
    safeUpdate('#kpiSelfSufficiency', fmtPct(metrics.selfSufficiency));
    safeUpdate('#kpiAvgDailyUse', fmtKWh(metrics.avgDailyUse));
    safeUpdate('#kpiAvgDailyProd', fmtKWh(metrics.avgDailyProd));
    safeUpdate('#kpiWeekToDateDetail', formatDeltaDetail(metrics.weekToDate, 'PWTD'));
    safeUpdate('#kpiWeekToDateRows', formatRowUsage(metrics.weekToDate));
    safeUpdate('#kpiMonthToDateDetail', formatDeltaDetail(metrics.monthToDate, 'PMTD'));
    safeUpdate('#kpiWeekRange', formatCoverageRange(metrics.weekToDate));
    safeUpdate('#kpiMonthRange', formatCoverageRange(metrics.monthToDate));
    safeUpdate('#kpiYearRange', formatCoverageRange(metrics.yearToDate));

    // Handle top production day with null checks
    const top = metrics.topProductionDay;
    const topValueEl = $root.querySelector('#kpiTopProdValue');
    const topDetailEl = $root.querySelector('#kpiTopProdDetail');

    if (topValueEl && topDetailEl){
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
    }else{
      if (!topValueEl) console.warn('KPI element not found: #kpiTopProdValue');
      if (!topDetailEl) console.warn('KPI element not found: #kpiTopProdDetail');
    }

    console.log('KPIs loaded successfully');

    if (!hasAnnouncedReady){
      hasAnnouncedReady = true;
      document.dispatchEvent(
        new CustomEvent('app:kpi-ready', {
          detail: { timestamp: Date.now() },
        }),
      );
    }
  }catch(err){
    console.error('KPI load error:', err);
    console.error('Error stack:', err.stack);

    // Only try to show error UI if $root exists
    if ($root){
      const existingError = $root.querySelector('[data-kpi-error]');
      if (existingError){
        existingError.remove();
      }

      const el = document.createElement('div');
      el.className = 'card text-sm text-red-600 mt-4';
      el.setAttribute('data-kpi-error', 'true');
      el.innerHTML = `
        <div class="font-semibold mb-1">Unable to load KPI statistics</div>
        <div class="text-xs">${err.message || 'An unexpected error occurred'}</div>
        <div class="text-xs mt-2 text-slate-500">Please refresh the page or try switching tabs.</div>
      `;
      $root.appendChild(el);
    }else{
      console.error('Cannot display error UI: $root is null');
    }
  }
}
