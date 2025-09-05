// tabs/charts.js
export async function mount(root, ctx){
  const { state } = ctx;
  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Monthly Usage and Solar</h2>
          <button id="refreshBtn" type="button" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm">Refresh</button>
        </div>
        <canvas id="chartMonthly" class="mt-3"></canvas>
      </div>
    </section>
  `;
  document.getElementById('refreshBtn').addEventListener('click', async ()=>{
    await ctx.loadData(); draw();
  });
  function draw(){
    const rows = state.getFilteredRows();
    const monthMap = new Map();
    for (const r of rows){
      const key = r.date.getFullYear() + '-' + String(r.date.getMonth()+1).padStart(2,'0');
      const agg = monthMap.get(key) || { use:0, solar:0 };
      agg.use += (r.use||0); agg.solar += (r.solar||0);
      monthMap.set(key, agg);
    }
    const labels = Array.from(monthMap.keys()).sort();
    const use = labels.map(k => monthMap.get(k).use);
    const solar = labels.map(k => monthMap.get(k).solar);
    const ctx2d = document.getElementById('chartMonthly');
    if (!ctx2d) return;
    if (window.__monthlyChart) window.__monthlyChart.destroy();
    window.__monthlyChart = new Chart(ctx2d, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Usage kWh', data: use }, { label: 'Solar kWh', data: solar }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
  }
  draw();
}
