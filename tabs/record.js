export async function mount(root){
  root.innerHTML = `
    <style>
      body { font-family: system-ui, Arial; padding:16px; }
      label { display:block; margin:8px 0; }
      input { padding:6px 8px; }
      button { padding:8px 12px; }
      #latest { font-weight:bold; margin:12px 0; }
      #status { margin:12px 0; color: #064; font-weight: 500; }
      pre { background:#f6f6f6; border:1px solid #ddd; padding:10px; white-space:pre-wrap; }
    </style>
    <h2>Solar Production Entry</h2>

    <div id="latest">Most recent date: loading…</div>
    <div id="status">Status: idle</div>

    <label>Date <input id="date" type="date" required></label>
    <label>ITD <input id="itd" type="number" step="any" required placeholder="12345"></label>
    <label>Prod <input id="prod" type="number" step="any" required placeholder="50"></label>
    <button id="btn" type="button">Submit</button>

    <h3>Log</h3>
    <pre id="log"></pre>
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
