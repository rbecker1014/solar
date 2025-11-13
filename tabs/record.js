import { renderFeedback, injectStyles } from './UserFriendlyFeedback.js';

/**
 * Updates the time display every second
 */
function updateEntryTime() {
  const timeInput = document.getElementById('entry-time');
  if (timeInput) {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    timeInput.value = timeString;
  }
}

/**
 * Validates and formats form data before submission
 * @param {Object} formData - Raw form data { date, itd, prod }
 * @returns {Object} - { errors: Array, formatted: Object }
 */
function validateAndFormatData(formData) {
  const errors = [];
  const formatted = { ...formData };

  // Validate Date
  if (!formData.date || formData.date.trim() === '') {
    errors.push({ field: 'date', message: 'Date is required' });
  } else {
    // Check if date is valid format (YYYY-MM-DD)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(formData.date)) {
      errors.push({ field: 'date', message: 'Date must be in YYYY-MM-DD format' });
    } else {
      // Check if date is not in the future
      const inputDate = new Date(formData.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (inputDate > today) {
        errors.push({ field: 'date', message: 'Date cannot be in the future' });
      }
    }
  }

  // Validate and format ITD (must be whole number)
  if (!formData.itd || formData.itd === '') {
    errors.push({ field: 'itd', message: 'ITD Production is required' });
  } else {
    const itdNum = parseFloat(formData.itd);
    if (isNaN(itdNum)) {
      errors.push({ field: 'itd', message: 'ITD must be a valid number' });
    } else if (itdNum < 0) {
      errors.push({ field: 'itd', message: 'ITD cannot be negative' });
    } else if (itdNum > 10000000) {
      errors.push({ field: 'itd', message: 'ITD value seems too large (max 10,000,000)' });
    } else if (!Number.isInteger(itdNum)) {
      // Round to nearest integer
      formatted.itd = Math.round(itdNum);
    } else {
      formatted.itd = itdNum;
    }
  }

  // Validate and format Production (max 3 decimals)
  if (!formData.prod || formData.prod === '') {
    errors.push({ field: 'prod', message: 'Production is required' });
  } else {
    const prodNum = parseFloat(formData.prod);
    if (isNaN(prodNum)) {
      errors.push({ field: 'prod', message: 'Production must be a valid number' });
    } else if (prodNum < 0) {
      errors.push({ field: 'prod', message: 'Production cannot be negative' });
    } else if (prodNum > 1000) {
      errors.push({ field: 'prod', message: 'Production value seems too large (max 1000 kWh/day)' });
    } else {
      // Round to 3 decimal places
      formatted.prod = parseFloat(prodNum.toFixed(3));
    }
  }

  return { errors, formatted };
}

/**
 * Displays validation errors inline on the form
 * @param {HTMLElement} root - The root element
 * @param {Array} errors - Array of error objects { field, message }
 */
function displayValidationErrors(root, errors) {
  // Clear any existing error displays
  clearValidationErrors(root);

  errors.forEach(error => {
    // Find the input field
    const input = root.querySelector(`#${error.field}`);

    if (input) {
      // Add error class to input
      input.classList.add('input-error');
      input.style.borderColor = '#dc3545';
      input.style.borderWidth = '2px';

      // Create and insert error message
      const errorDiv = document.createElement('div');
      errorDiv.className = 'field-error-message';
      errorDiv.style.color = '#dc3545';
      errorDiv.style.fontSize = '14px';
      errorDiv.style.marginTop = '4px';
      errorDiv.style.fontWeight = '500';
      errorDiv.textContent = error.message;

      // Insert after the input's parent label
      const label = input.closest('label');
      if (label && label.parentNode) {
        label.parentNode.insertBefore(errorDiv, label.nextSibling);
      }
    }
  });
}

/**
 * Clears all validation error displays
 * @param {HTMLElement} root - The root element
 */
function clearValidationErrors(root) {
  // Remove error styling from inputs
  root.querySelectorAll('.input-error').forEach(input => {
    input.classList.remove('input-error');
    input.style.borderColor = '';
    input.style.borderWidth = '';
  });

  // Remove error messages
  root.querySelectorAll('.field-error-message').forEach(msg => {
    msg.remove();
  });
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
        <div class="mb-4">
          <label class="block"><span class="text-sm text-gray-700">Time of Entry</span><input id="entry-time" type="text" class="input" readonly style="background-color: #f0f0f0; cursor: default;" placeholder="--:-- --"></label>
        </div>
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

    // Clear any previous validation errors
    clearValidationErrors(root);

    // Validate and format data
    const { errors, formatted } = validateAndFormatData({ date, itd, prod });

    if (errors.length > 0) {
      // Show inline validation errors
      displayValidationErrors(root, errors);

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

  // Initialize and update time display
  updateEntryTime();
  setInterval(updateEntryTime, 1000);

  // Add real-time error clearing on input
  const dateInput = root.querySelector('#date');
  const itdInput = root.querySelector('#itd');
  const prodInput = root.querySelector('#prod');

  [dateInput, itdInput, prodInput].forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        // Clear error styling for this field
        input.classList.remove('input-error');
        input.style.borderColor = '';
        input.style.borderWidth = '';

        // Remove error message for this field
        const label = input.closest('label');
        if (label && label.nextSibling && label.nextSibling.classList?.contains('field-error-message')) {
          label.nextSibling.remove();
        }
      });
    }
  });

  refreshLatest();
}
