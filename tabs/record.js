import { renderFeedback, injectStyles } from './UserFriendlyFeedback.js';

/**
 * Validates and formats form data before submission
 * @param {Object} formData - Raw form data { date, itd, prod }
 * @returns {Object} - { errors: Array, formatted: Object }
 */
function validateAndFormatData(formData) {
  const errors = [];
  const formatted = { ...formData };

  // Validate Date
  if (!formData.date) {
    errors.push({ field: 'date', message: 'Date is required' });
  }

  // Validate and format Production (max 3 decimals)
  if (formData.prod) {
    const prodNum = parseFloat(formData.prod);
    if (isNaN(prodNum)) {
      errors.push({ field: 'prod', message: 'Production must be a number' });
    } else if (prodNum < 0) {
      errors.push({ field: 'prod', message: 'Production cannot be negative' });
    } else {
      // Round to 3 decimal places
      formatted.prod = parseFloat(prodNum.toFixed(3));
    }
  } else {
    errors.push({ field: 'prod', message: 'Production is required' });
  }

  // Validate and format ITD (must be whole number)
  if (formData.itd) {
    const itdNum = parseFloat(formData.itd);
    if (isNaN(itdNum)) {
      errors.push({ field: 'itd', message: 'ITD must be a number' });
    } else if (itdNum < 0) {
      errors.push({ field: 'itd', message: 'ITD cannot be negative' });
    } else if (!Number.isInteger(itdNum)) {
      // Round to nearest integer
      formatted.itd = Math.round(itdNum);
    } else {
      formatted.itd = itdNum;
    }
  } else {
    errors.push({ field: 'itd', message: 'ITD is required' });
  }

  return { errors, formatted };
}

export async function mount(root){
  // Inject feedback component styles
  injectStyles();

  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <h2 class="text-lg font-semibold mb-3">Solar Production Entry</h2>
        <div id="latest-date" class="text-sm font-medium">Most recent date: loading…</div>
        <div id="latest-itd" class="text-sm font-medium">ITD Production: loading…</div>
        <div id="latest-prod" class="text-sm font-medium mb-2">Production: loading…</div>
        <div id="status" class="text-sm text-emerald-700 mb-4">Status: idle</div>
        <div class="grid sm:grid-cols-3 gap-4">
          <label class="block"><span class="text-sm text-gray-700">Date</span><input id="date" type="date" class="input" required></label>
          <label class="block"><span class="text-sm text-gray-700">ITD</span><input id="itd" type="number" step="1" min="0" class="input" required placeholder="126753"></label>
          <label class="block"><span class="text-sm text-gray-700">Prod</span><input id="prod" type="number" step="0.001" min="0" class="input" required placeholder="16.426"></label>
        </div>
        <button id="btn" type="button" class="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">Submit</button>
      </div>
      <div class="card">
        <h3 class="text-lg font-semibold mb-2">Submission Feedback</h3>
        <div id="feedback-container"></div>
      </div>
    </section>
  `;

  const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
  const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

  async function refreshLatest(){
    try {
      const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(TOKEN)}`);
      const j = await res.json();
      const latestDateEl = root.querySelector('#latest-date');
      const latestItdEl  = root.querySelector('#latest-itd');
      const latestProdEl = root.querySelector('#latest-prod');
      if (j?.ok && j?.last) {
        latestDateEl.textContent = `Most recent date: ${j.last.date ?? 'none'}`;
        latestItdEl.textContent  = `ITD Production: ${j.last.itd ?? 'none'}`;
        latestProdEl.textContent = `Production: ${j.last.prod ?? 'none'}`;
      } else {
        latestDateEl.textContent = 'Most recent date: none';
        latestItdEl.textContent  = 'ITD Production: none';
        latestProdEl.textContent = 'Production: none';
      }
    } catch (e) {
      root.querySelector('#latest-date').textContent = 'Error fetching latest';
      root.querySelector('#latest-itd').textContent  = '';
      root.querySelector('#latest-prod').textContent = '';
    }
  }

  root.querySelector('#btn').addEventListener('click', async () => {
    const date = root.querySelector('#date').value;
    const itd  = root.querySelector('#itd').value;
    const prod = root.querySelector('#prod').value;

    const feedbackContainer = root.querySelector('#feedback-container');

    // Validate and format data
    const { errors, formatted } = validateAndFormatData({ date, itd, prod });

    if (errors.length > 0) {
      // Show validation errors using the feedback component
      renderFeedback(feedbackContainer, JSON.stringify({
        ok: false,
        errors: errors.map(err => ({
          errors: [{
            location: err.field,
            reason: 'invalid',
            message: err.message
          }]
        }))
      }));
      root.querySelector('#status').textContent = "Validation failed";
      return;
    }

    root.querySelector('#status').textContent = "Submitting…";

    // Clear previous feedback
    feedbackContainer.innerHTML = '';

    // Use formatted data for submission
    const body = new URLSearchParams({
      token: TOKEN,
      date: formatted.date,
      itd: formatted.itd,
      prod: formatted.prod
    }).toString();

    const submittedData = {
      date: formatted.date,
      itd: formatted.itd,
      prod: formatted.prod
    };

    console.log('Submitting formatted data:', submittedData);

    try {
      const res  = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      });
      const text = await res.text();

      console.log('API Response:', text);

      // Render user-friendly feedback
      renderFeedback(feedbackContainer, text, submittedData);

      root.querySelector('#status').textContent = "Submitted OK";

      // Clear form on success
      const responseObj = typeof text === 'string' ? JSON.parse(text) : text;
      if (responseObj.ok === true) {
        root.querySelector('#date').value = '';
        root.querySelector('#itd').value = '';
        root.querySelector('#prod').value = '';
      }

      await refreshLatest();
    } catch (e) {
      root.querySelector('#status').textContent = "Submit failed";

      console.error('Submit error:', e);

      // Render error feedback
      renderFeedback(feedbackContainer, JSON.stringify({
        ok: false,
        error: `Network error: ${e.message}`
      }));
    }
  });

  refreshLatest();
}
