export async function mount(root){
  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <h2 class="text-lg font-semibold mb-3">Solar Production Entry</h2>
        <div id="latest" class="text-sm font-medium mb-2">Most recent date: loading…</div>
        <div id="status" class="text-sm text-emerald-700 mb-4">Status: idle</div>
        <div class="grid sm:grid-cols-3 gap-4">
          <label class="block"><span class="text-sm text-gray-700">Date</span><input id="date" type="date" class="input" required></label>
          <label class="block"><span class="text-sm text-gray-700">ITD</span><input id="itd" type="number" step="any" class="input" required placeholder="12345"></label>
          <label class="block"><span class="text-sm text-gray-700">Prod</span><input id="prod" type="number" step="any" class="input" required placeholder="50"></label>
        </div>
        <button id="btn" type="button" class="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">Submit</button>
      </div>
      <div class="card">
        <h3 class="text-lg font-semibold mb-2">Log</h3>
        <pre id="log" class="mono text-xs whitespace-pre-wrap bg-gray-100 p-2 rounded border border-gray-200"></pre>
      </div>
    </section>
  `;

  const ENDPOINT = "https://script.google.com/macros/s/AKfycbz8cwcHG57A8n9XTTvwvt5pTyejqptINCjTl5BUrkUeZ9VIGIgOCYFHxJsria8xcTXj/exec";
  const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

  const log = m => {
    const el = root.querySelector('#log');
    el.textContent += (typeof m==='string' ? m : JSON.stringify(m)) + "\n";
  };

  async function refreshLatest(){
    try {
      const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(TOKEN)}`);
      const j = await res.json();
      const latestEl = root.querySelector('#latest');
      if (j?.ok && j?.last?.date) {
        latestEl.textContent = `Most recent date: ${j.last.date}`;
      } else {
        latestEl.textContent = "Most recent date: none";
      }
      log('GET latest: ' + JSON.stringify(j));
    } catch (e) {
      root.querySelector('#latest').textContent = "Error fetching latest";
      log('GET error: ' + e.message);
    }
  }

  root.querySelector('#btn').addEventListener('click', async () => {
    const date = root.querySelector('#date').value;
    const itd  = root.querySelector('#itd').value;
    const prod = root.querySelector('#prod').value;

    if (!date || !itd || !prod) {
      alert('Please fill all fields');
      return;
    }

    root.querySelector('#status').textContent = "Submitting…";

    const body = new URLSearchParams({ token: TOKEN, date, itd, prod }).toString();
    try {
      const res  = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      });
      const text = await res.text();
      log('POST response: ' + text);

      root.querySelector('#status').textContent = "Submitted OK";
      await refreshLatest();
    } catch (e) {
      root.querySelector('#status').textContent = "Submit failed";
      log('POST error: ' + e.message);
    }
  });

  refreshLatest();
}
