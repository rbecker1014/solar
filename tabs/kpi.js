// tabs/kpi.js

import { renderDateRange } from './date-range.js';
import { ensureDailyDataLoaded, selectKpiMetrics } from './daily-data-store.js';

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
      <div class="card">
        <div class="kpi" id="kpiTopProdValue">0 kWh</div>
        <div class="kpi-label">Top Production Day</div>
        <div class="text-xs text-slate-500" id="kpiTopProdDetail">No production data</div>
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
function fmtDate(value){
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

async function loadKPIs(ctx){
  try{
    await ensureDailyDataLoaded(ctx?.state);
    const metrics = selectKpiMetrics(ctx?.state);

    // Paint
    $root.querySelector('#kpiUsage').textContent           = fmtKWh(metrics.totalUse);
    $root.querySelector('#kpiSolar').textContent           = fmtKWh(metrics.totalSolar);
    $root.querySelector('#kpiImport').textContent          = fmtKWh(metrics.totalImp);
    $root.querySelector('#kpiExport').textContent          = fmtKWh(metrics.totalExp);
    $root.querySelector('#kpiSelfSufficiency').textContent = fmtPct(metrics.selfSufficiency);
    $root.querySelector('#kpiAvgDailyUse').textContent     = fmtKWh(metrics.avgDailyUse);
    $root.querySelector('#kpiAvgDailyProd').textContent    = fmtKWh(metrics.avgDailyProd);

    const top = metrics.topProductionDay;
    const topValueEl = $root.querySelector('#kpiTopProdValue');
    const topDetailEl = $root.querySelector('#kpiTopProdDetail');
    if (top?.date){
      topValueEl.textContent = fmtKWh(top.solarKWh);
      const bits = [fmtDate(top.date)].filter(Boolean);
      bits.push(`Usage ${Number(top.homeKWh || 0).toFixed(0)} kWh`);
      bits.push(`Export ${Number(top.gridExport || 0).toFixed(0)} kWh`);
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
