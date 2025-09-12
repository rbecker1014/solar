// tabs/charts.js
export async function mount(root){
  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Monthly Usage and Solar</h2>
          <button id="refreshBtn" type="button" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm">Refresh</button>
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
  
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbz8cwcHG57A8n9XTTvwvt5pTyejqptINCjTl5BUrkUeZ9VIGIgOCYFHxJsria8xcTXj/exec";
  const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

  const data = { recent: [], monthly: [] };

  function draw(){
    const ctxMonthly = document.getElementById('chartMonthly');
    if (ctxMonthly){
      const labels = data.monthly.map(r => r.month);
      const use = data.monthly.map(r => r.usage || 0);
      const solar = data.monthly.map(r => r.prod || 0);
      if (window.__monthlyChart) window.__monthlyChart.destroy();
      window.__monthlyChart = new Chart(ctxMonthly, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Usage kWh', data: use }, { label: 'Solar kWh', data: solar }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
      });
    }

const ctxDaily = document.getElementById('chart7d');
    if (ctxDaily){
      const labels = data.recent.map(r => r.date);
      const use = data.recent.map(r => r.usage || 0);
      const solar = data.recent.map(r => r.prod || 0);
      if (window.__dailyChart) window.__dailyChart.destroy();
      window.__dailyChart = new Chart(ctxDaily, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Usage kWh', data: use }, { label: 'Solar kWh', data: solar }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
      });
    }
  }
  
    async function load(){
    try{
      const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&days=7`);
      const j = await res.json();
      data.recent = j.recent || [];
      data.monthly = j.monthly || [];
      draw();
      log('GET charts: ' + JSON.stringify(j));
    }catch(err){
      console.error('load error', err);
      log('load error: ' + err.message);
    }
  }

document.getElementById('refreshBtn').addEventListener('click', async () => {
    log('manual refresh');
    await load();
  });
  await load();
}
