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
    </section>
  `;
  
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbz8cwcHG57A8n9XTTvwvt5pTyejqptINCjTl5BUrkUeZ9VIGIgOCYFHxJsria8xcTXj/exec";
  const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

  let data = { recent: [], monthly: [] };

  async function load(){
    try {
      const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&days=7`);
      const j = await res.json();
      data.recent = j.recent || [];
      data.monthly = j.monthly || [];
      draw();
    } catch (err) {
      console.error('load error', err);
    }
  }

  function draw(){
    const ctxMonthly = document.getElementById('chartMonthly');
    const labelsM = data.monthly.map(r => r.month);
    const useM = data.monthly.map(r => r.usage || 0);
    const solarM = data.monthly.map(r => r.prod || 0);
    if (ctxMonthly) {
      if (window.__monthlyChart) window.__monthlyChart.destroy();
      window.__monthlyChart = new Chart(ctxMonthly, {
        type: 'bar',
        data: { labels: labelsM, datasets: [{ label: 'Usage kWh', data: useM }, { label: 'Solar kWh', data: solarM }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
      });
    }

    const ctx7d = document.getElementById('chart7d');
    const labels7 = data.recent.map(r => r.date);
    const use7 = data.recent.map(r => r.usage || 0);
    const solar7 = data.recent.map(r => r.prod || 0);
    if (ctx7d) {
      if (window.__dailyChart) window.__dailyChart.destroy();
      window.__dailyChart = new Chart(ctx7d, {
        type: 'bar',
        data: { labels: labels7, datasets: [{ label: 'Usage kWh', data: use7 }, { label: 'Solar kWh', data: solar7 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
      });
    }
    const labels = Array.from(monthMap.keys()).sort();
    const use = labels.map(k => monthMap.get(k).use);
    const solar = labels.map(k => monthMap.get(k).solar);
    const ctxMonthly = document.getElementById('chartMonthly');
    if (ctxMonthly) {
      if (window.__monthlyChart) window.__monthlyChart.destroy();
      window.__monthlyChart = new Chart(ctxMonthly, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Usage kWh', data: use }, { label: 'Solar kWh', data: solar }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
      });
    }

    const last7 = rows.slice(-7);
    const labels7 = last7.map(r => `${r.date.getFullYear()}-${String(r.date.getMonth()+1).padStart(2,'0')}-${String(r.date.getDate()).padStart(2,'0')}`);
    const use7 = last7.map(r => r.use || 0);
    const solar7 = last7.map(r => r.solar || 0);
    const ctx7d = document.getElementById('chart7d');
    if (ctx7d) {
      if (window.__dailyChart) window.__dailyChart.destroy();
      window.__dailyChart = new Chart(ctx7d, {
        type: 'bar',
        data: { labels: labels7, datasets: [{ label: 'Usage kWh', data: use7 }, { label: 'Solar kWh', data: solar7 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
      });
    }
  }
  draw();

  document.getElementById('refreshBtn').addEventListener('click', load);
  await load();
}
