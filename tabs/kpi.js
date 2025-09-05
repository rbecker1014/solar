// tabs/kpi.js
export async function mount(root, ctx){
  const { state } = ctx;
  root.innerHTML = `
    <section class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div class="card"><div class="kpi" id="kpiUsage">0 kWh</div><div class="kpi-label">Total Usage</div></div>
        <div class="card"><div class="kpi" id="kpiSolar">0 kWh</div><div class="kpi-label">Total Solar</div></div>
        <div class="card"><div class="kpi" id="kpiImport">0 kWh</div><div class="kpi-label">Grid Import</div></div>
        <div class="card"><div class="kpi" id="kpiExport">0 kWh</div><div class="kpi-label">Grid Export</div></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="card"><div class="kpi" id="kpiSelfConsumption">0%</div><div class="kpi-label">Self Consumption</div></div>
        <div class="card"><div class="kpi" id="kpiSelfSufficiency">0%</div><div class="kpi-label">Self Sufficiency</div></div>
        <div class="card"><div class="kpi" id="kpiAvgDailyUse">0 kWh</div><div class="kpi-label">Avg Daily Usage</div></div>
        <div class="card"><div class="kpi" id="kpiSavings">$0</div><div class="kpi-label">Est. Savings vs grid</div></div>
      </div>
    </section>
  `;
  const rows = state.getFilteredRows();
  const k = state.calcKPIs(rows);
  document.getElementById('kpiUsage').textContent = state.fmtKWh(k.totalUse);
  document.getElementById('kpiSolar').textContent = state.fmtKWh(k.totalSolar);
  document.getElementById('kpiImport').textContent = state.fmtKWh(k.totalImp);
  document.getElementById('kpiExport').textContent = state.fmtKWh(k.totalExp);
  document.getElementById('kpiSelfConsumption').textContent = state.fmtPct(k.selfConsumption);
  document.getElementById('kpiSelfSufficiency').textContent = state.fmtPct(k.selfSufficiency);
  document.getElementById('kpiAvgDailyUse').textContent = state.fmtKWh(k.avgDailyUse);
  document.getElementById('kpiSavings').textContent = state.fmtUSD(k.savings);
}
