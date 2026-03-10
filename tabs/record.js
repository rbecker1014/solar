import { renderFeedback, injectStyles } from './UserFriendlyFeedback.js';
import { API_BASE_URL } from './cloud-config.js';

// Solar configuration - adjust for your location
const SOLAR_CONFIG = {
  // Simple mode: fixed hours
  sunriseHour: 6,    // 6 AM
  sunsetHour: 18,    // 6 PM
};

// Solar day calculation helpers
function getSunriseSunset(date) {
  const sunrise = new Date(date);
  sunrise.setHours(SOLAR_CONFIG.sunriseHour, 0, 0, 0);

  const sunset = new Date(date);
  sunset.setHours(SOLAR_CONFIG.sunsetHour, 0, 0, 0);

  return { sunrise, sunset };
}

function isDaylightHours(date) {
  const { sunrise, sunset } = getSunriseSunset(date);
  return date >= sunrise && date <= sunset;
}

function getHoursOfDaylightElapsed(date) {
  const { sunrise, sunset } = getSunriseSunset(date);

  if (date < sunrise) return 0;
  if (date > sunset) return 12;

  const elapsed = (date - sunrise) / (1000 * 60 * 60);
  return Math.max(0, Math.min(12, elapsed));
}

function getHoursOfDaylightRemaining(date) {
  const totalDaylight = 12;
  const elapsed = getHoursOfDaylightElapsed(date);
  return Math.max(0, totalDaylight - elapsed);
}

function calculateProjectedProduction(currentProduction, hoursElapsed, hoursRemaining) {
  if (hoursElapsed <= 0) return 0;
  if (hoursRemaining <= 0) return 0;

  const hourlyRate = currentProduction / hoursElapsed;
  const projectedRemaining = hourlyRate * hoursRemaining;

  return projectedRemaining;
}

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

function validateAndFormatData(formData, useProjection = false, root = null) {
  const errors = [];
  const formatted = { ...formData };

  let itdToValidate = formData.itd;
  let prodToValidate = formData.prod;

  if (useProjection && root) {
    const prodInput = root.querySelector('#prod');
    const itdInput = root.querySelector('#itd');

    if (prodInput?.hasAttribute('data-projected-total')) {
      prodToValidate = prodInput.getAttribute('data-projected-total');
    }

    if (itdInput?.hasAttribute('data-projected-itd')) {
      itdToValidate = itdInput.getAttribute('data-projected-itd');
    }
  }

  if (!formData.date || formData.date.trim() === '') {
    errors.push({ field: 'date', message: 'Date is required' });
  } else {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(formData.date)) {
      errors.push({ field: 'date', message: 'Date must be in YYYY-MM-DD format' });
    } else {
      const inputDate = new Date(formData.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (inputDate > today) {
        errors.push({ field: 'date', message: 'Date cannot be in the future' });
      }
    }
  }

  if (!itdToValidate || itdToValidate === '') {
    errors.push({ field: 'itd', message: 'ITD Production is required' });
  } else {
    const itdNum = parseFloat(itdToValidate);
    if (isNaN(itdNum)) {
      errors.push({ field: 'itd', message: 'ITD must be a valid number' });
    } else if (itdNum < 0) {
      errors.push({ field: 'itd', message: 'ITD cannot be negative' });
    } else if (itdNum > 10000000) {
      errors.push({ field: 'itd', message: 'ITD value seems too large (max 10,000,000)' });
    } else if (!Number.isInteger(itdNum)) {
      formatted.itd = Math.round(itdNum);
    } else {
      formatted.itd = itdNum;
    }
  }

  if (!prodToValidate || prodToValidate === '') {
    errors.push({ field: 'prod', message: 'Production is required' });
  } else {
    const prodNum = parseFloat(prodToValidate);
    if (isNaN(prodNum)) {
      errors.push({ field: 'prod', message: 'Production must be a valid number' });
    } else if (prodNum < 0) {
      errors.push({ field: 'prod', message: 'Production cannot be negative' });
    } else if (prodNum > 1000) {
      errors.push({ field: 'prod', message: 'Production value seems too large (max 1000 kWh/day)' });
    } else {
      formatted.prod = parseFloat(prodNum.toFixed(3));
    }
  }

  return { errors, formatted };
}

function displayValidationErrors(root, errors, hasProjection = false) {
  clearValidationErrors(root);

  if (hasProjection) {
    const form = root.querySelector('.card');
    const existingNote = form?.querySelector('.validation-projection-note');

    if (form && !existingNote) {
      const projectionNote = document.createElement('div');
      projectionNote.className = 'validation-projection-note';
      projectionNote.style.cssText = 'background-color: #fff3cd; padding: 10px; margin-bottom: 10px; border-radius: 4px; color: #856404; font-size: 14px;';
      projectionNote.innerHTML = '📊 Validating projected end-of-day values';

      const title = form.querySelector('h2');
      if (title && title.nextSibling) {
        title.parentNode.insertBefore(projectionNote, title.nextSibling);
      }
    }
  }

  errors.forEach(error => {
    const input = root.querySelector(`#${error.field}`);

    if (input) {
      input.classList.add('input-error');
      input.style.borderColor = '#dc3545';
      input.style.borderWidth = '2px';

      const errorDiv = document.createElement('div');
      errorDiv.className = 'field-error-message';
      errorDiv.style.color = '#dc3545';
      errorDiv.style.fontSize = '14px';
      errorDiv.style.marginTop = '4px';
      errorDiv.style.fontWeight = '500';
      errorDiv.textContent = error.message;

      const label = input.closest('label');
      if (label && label.parentNode) {
        label.parentNode.insertBefore(errorDiv, label.nextSibling);
      }
    }
  });
}

function clearValidationErrors(root) {
  root.querySelectorAll('.input-error').forEach(input => {
    input.classList.remove('input-error');
    input.style.borderColor = '';
    input.style.borderWidth = '';
  });

  root.querySelectorAll('.field-error-message').forEach(msg => {
    msg.remove();
  });

  root.querySelectorAll('.validation-projection-note').forEach(note => {
    note.remove();
  });
}

function showProjectionBadge(root) {
  const prodInput = root.querySelector('#prod');
  const itdInput = root.querySelector('#itd');

  [prodInput, itdInput].forEach(input => {
    if (input) {
      input.style.backgroundColor = '#fff3cd';
      input.style.fontWeight = '600';
    }
  });
}

function clearProjectionBadge(root) {
  const prodInput = root.querySelector('#prod');
  const itdInput = root.querySelector('#itd');

  [prodInput, itdInput].forEach(input => {
    if (input) {
      input.style.backgroundColor = '';
      input.style.fontWeight = '';
    }
  });
}

function updateProductionProjection(root) {
  const prodInput = root.querySelector('#prod');
  const itdInput = root.querySelector('#itd');
  const projectionSection = root.querySelector('#projection-section');
  const projectionDetails = root.querySelector('#projection-details');
  const projectionHelp = root.querySelector('#projection-help');

  if (!prodInput || !itdInput || !projectionSection || !projectionDetails) return;

  const currentProduction = parseFloat(prodInput.value);
  const currentITD = parseFloat(itdInput.value);

  if (isNaN(currentProduction) || isNaN(currentITD) || currentProduction <= 0) {
    projectionSection.style.display = 'none';
    if (projectionHelp) projectionHelp.style.display = 'none';
    clearProjectionBadge(root);
    return;
  }

  const now = new Date();

  if (!isDaylightHours(now)) {
    projectionSection.style.display = 'none';
    if (projectionHelp) projectionHelp.style.display = 'none';
    clearProjectionBadge(root);
    return;
  }

  const hoursElapsed = getHoursOfDaylightElapsed(now);
  const hoursRemaining = getHoursOfDaylightRemaining(now);

  if (hoursRemaining < 0.5 || hoursElapsed < 0.5) {
    projectionSection.style.display = 'none';
    if (projectionHelp) projectionHelp.style.display = 'none';
    clearProjectionBadge(root);
    return;
  }

  const projectedRemaining = calculateProjectedProduction(
    currentProduction,
    hoursElapsed,
    hoursRemaining
  );

  const roundedProjection = Math.round(projectedRemaining * 1000) / 1000;
  const projectedTotal = Math.round((currentProduction + projectedRemaining) * 1000) / 1000;
  const projectedITD = Math.round(currentITD + projectedRemaining);

  projectionSection.style.display = 'block';
  if (projectionHelp) projectionHelp.style.display = 'block';
  projectionDetails.innerHTML = `
    <div style="margin-bottom: 6px;">
      <strong>Current time:</strong> ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
    </div>
    <div style="margin-bottom: 6px;">
      <strong>Daylight elapsed:</strong> ${hoursElapsed.toFixed(1)} hours
    </div>
    <div style="margin-bottom: 6px;">
      <strong>Daylight remaining:</strong> ${hoursRemaining.toFixed(1)} hours
    </div>
    <div style="margin-bottom: 6px;">
      <strong>Hourly rate:</strong> ${(currentProduction / hoursElapsed).toFixed(3)} kWh/hour
    </div>
    <hr style="margin: 8px 0; border: none; border-top: 1px solid #856404; opacity: 0.3;">
    <div style="margin-bottom: 6px;">
      <strong>Estimated remaining:</strong> +${roundedProjection} kWh
    </div>
    <div style="margin-bottom: 6px; font-size: 16px; background-color: rgba(255,255,255,0.5); padding: 8px; border-radius: 4px;">
      <strong>✅ Projected daily total:</strong> ${projectedTotal} kWh<br>
      <span style="font-size: 13px; color: #666;">(This will be submitted as Production)</span>
    </div>
    <div style="font-size: 16px; background-color: rgba(255,255,255,0.5); padding: 8px; border-radius: 4px;">
      <strong>✅ Projected ITD:</strong> ${projectedITD.toLocaleString()}<br>
      <span style="font-size: 13px; color: #666;">(This will be submitted as ITD Production)</span>
    </div>
    <div style="margin-top: 8px; font-size: 13px; font-style: italic;">
      💡 When you click Submit, these projected values will be validated and sent to the database
    </div>
  `;

  prodInput.setAttribute('data-projected-total', projectedTotal);
  prodInput.setAttribute('data-projected-itd', projectedITD);
  itdInput.setAttribute('data-projected-itd', projectedITD);
  itdInput.setAttribute('data-has-projection', 'true');

  showProjectionBadge(root);
}

export async function mount(root){
  injectStyles();
  const today = new Date().toISOString().slice(0, 10);

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
          <label class="block"><span class="text-sm text-gray-700">Date</span><input id="date" type="date" class="input" required value="${today}"></label>
          <label class="block"><span class="text-sm text-gray-700">ITD</span><input id="itd" type="number" step="1" min="0" class="input" required placeholder="126753"></label>
          <label class="block"><span class="text-sm text-gray-700">Prod</span><input id="prod" type="number" step="0.001" min="0" class="input" required placeholder="16.426"></label>
        </div>
        <!-- Projection Display Section -->
        <div id="projection-section" style="display: none; margin-top: 16px; padding: 12px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: #856404;">
            📊 Mid-Day Projection
          </div>
          <div id="projection-details" style="font-size: 14px; color: #856404;">
          </div>
        </div>
        <div style="font-size: 13px; color: #666; margin-top: 12px; display: none;" id="projection-help">
          <strong>ℹ️ How it works:</strong> When you enter data during the day,
          we calculate your current production rate and project what you'll produce
          by sunset. This gives you a complete daily total in the database.
        </div>
        <button id="btn" type="button" class="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">Submit</button>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-2">Inverter Photos</h3>
        <p class="text-sm text-gray-500 mb-3">Snap a photo and the value will be read automatically.</p>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ITD Screen</label>
            <label class="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-4 cursor-pointer hover:border-emerald-400 transition-colors">
              <svg class="w-8 h-8 text-gray-400 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span class="text-xs text-gray-500" id="itd-capture-text">Tap to capture</span>
              <input type="file" accept="image/*" capture="environment" class="hidden" id="itd-photo">
            </label>
            <img id="itd-preview" class="mt-2 rounded-lg w-full hidden" alt="ITD screen capture">
            <div id="itd-ocr-status" class="text-xs mt-1 text-gray-400"></div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Daily Production</label>
            <label class="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-4 cursor-pointer hover:border-emerald-400 transition-colors">
              <svg class="w-8 h-8 text-gray-400 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span class="text-xs text-gray-500" id="prod-capture-text">Tap to capture</span>
              <input type="file" accept="image/*" capture="environment" class="hidden" id="prod-photo">
            </label>
            <img id="prod-preview" class="mt-2 rounded-lg w-full hidden" alt="Daily production capture">
            <div id="prod-ocr-status" class="text-xs mt-1 text-gray-400"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-2">Submission Feedback</h3>
        <div id="feedback-container"></div>
      </div>
    </section>
  `;

  const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
  const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

  const $ = id => root.querySelector(`#${id}`);

  // --- OCR via Claude Vision ---
  async function readValueFromPhoto(dataUrl, field){
    const res = await fetch(`${API_BASE_URL}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, field }),
    });
    if (!res.ok) throw new Error(`OCR request failed: ${res.status}`);
    return res.json();
  }

  function resizeImage(file, maxDim = 1024){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // --- Photo capture + OCR ---
  function setupCapture(inputId, previewId, labelTextId, statusId, field, targetInputId){
    const input = $(inputId);
    const preview = $(previewId);
    const labelText = $(labelTextId);
    const statusEl = $(statusId);

    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;

      const dataUrl = await resizeImage(file);
      preview.src = dataUrl;
      preview.classList.remove('hidden');
      labelText.textContent = 'Captured';

      statusEl.textContent = 'Reading value…';
      statusEl.className = 'text-xs mt-1 text-sky-600';
      try {
        const result = await readValueFromPhoto(dataUrl, field);
        if (result.value != null){
          $(targetInputId).value = result.value;
          statusEl.textContent = `Read: ${result.value}`;
          statusEl.className = 'text-xs mt-1 text-emerald-600 font-medium';
          // Trigger projection update after OCR fills a value
          updateProductionProjection(root);
        } else {
          statusEl.textContent = `Could not read value (raw: "${result.raw}")`;
          statusEl.className = 'text-xs mt-1 text-amber-600';
        }
      } catch (e) {
        statusEl.textContent = 'OCR failed — enter manually';
        statusEl.className = 'text-xs mt-1 text-red-500';
      }
    });
  }

  setupCapture('itd-photo', 'itd-preview', 'itd-capture-text', 'itd-ocr-status', 'itd', 'itd');
  setupCapture('prod-photo', 'prod-preview', 'prod-capture-text', 'prod-ocr-status', 'prod', 'prod');

  // --- Latest entry display ---
  async function refreshLatest(){
    try {
      const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(TOKEN)}`);
      const j = await res.json();
      if (j?.ok && j?.last) {
        $('latest-date').textContent = `Most recent date: ${j.last.date ?? 'none'}`;
        $('latest-itd').textContent  = `ITD Production: ${j.last.itd ?? 'none'}`;
        $('latest-prod').textContent = `Production: ${j.last.prod ?? 'none'}`;
      } else {
        $('latest-date').textContent = 'Most recent date: none';
        $('latest-itd').textContent  = 'ITD Production: none';
        $('latest-prod').textContent = 'Production: none';
      }
    } catch (e) {
      $('latest-date').textContent = 'Error fetching latest';
      $('latest-itd').textContent  = '';
      $('latest-prod').textContent = '';
    }
  }

  // --- Submit ---
  root.querySelector('#btn').addEventListener('click', async () => {
    const prodInput = root.querySelector('#prod');
    const itdInput = root.querySelector('#itd');
    const dateInput = root.querySelector('#date');

    const hasProjection = prodInput.hasAttribute('data-projected-total');

    const rawFormData = {
      date: dateInput.value,
      itd: itdInput.value,
      prod: prodInput.value
    };

    const submissionData = {
      date: dateInput.value,
      itd: hasProjection
        ? prodInput.getAttribute('data-projected-itd')
        : itdInput.value,
      prod: hasProjection
        ? prodInput.getAttribute('data-projected-total')
        : prodInput.value
    };

    const feedbackContainer = root.querySelector('#feedback-container');

    clearValidationErrors(root);

    const { errors, formatted } = validateAndFormatData(submissionData, hasProjection, root);

    if (errors.length > 0) {
      displayValidationErrors(root, errors, hasProjection);

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

    $('status').textContent = "Submitting…";

    feedbackContainer.innerHTML = '';

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

    try {
      const res  = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      });
      const text = await res.text();

      renderFeedback(feedbackContainer, text, submittedData);

      root.querySelector('#status').textContent = "Submitted OK";

      const responseObj = typeof text === 'string' ? JSON.parse(text) : text;
      if (responseObj.ok === true) {
        root.querySelector('#date').value = '';
        root.querySelector('#itd').value = '';
        root.querySelector('#prod').value = '';

        const prodInputClear = root.querySelector('#prod');
        const itdInputClear = root.querySelector('#itd');
        if (prodInputClear) {
          prodInputClear.removeAttribute('data-projected-total');
        }
        if (itdInputClear) {
          itdInputClear.removeAttribute('data-projected-itd');
        }

        const projectionSection = root.querySelector('#projection-section');
        const projectionHelp = root.querySelector('#projection-help');
        if (projectionSection) projectionSection.style.display = 'none';
        if (projectionHelp) projectionHelp.style.display = 'none';
        clearProjectionBadge(root);
      }

      await refreshLatest();
    } catch (e) {
      root.querySelector('#status').textContent = "Submit failed";

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
        input.classList.remove('input-error');
        input.style.borderColor = '';
        input.style.borderWidth = '';

        const label = input.closest('label');
        if (label && label.nextSibling && label.nextSibling.classList?.contains('field-error-message')) {
          label.nextSibling.remove();
        }
      });
    }
  });

  // Add projection update listeners
  if (prodInput) {
    prodInput.addEventListener('input', () => updateProductionProjection(root));
  }

  if (itdInput) {
    itdInput.addEventListener('input', () => updateProductionProjection(root));
  }

  setInterval(() => updateProductionProjection(root), 60000);

  updateProductionProjection(root);

  refreshLatest();
}
