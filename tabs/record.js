import { renderFeedback, injectStyles } from './UserFriendlyFeedback.js';

// Solar configuration - adjust for your location
const SOLAR_CONFIG = {
  // Simple mode: fixed hours
  sunriseHour: 6,    // 6 AM
  sunsetHour: 18,    // 6 PM

  // Advanced: Use actual location (implement later)
  // latitude: 33.0,
  // longitude: -117.0,
  // useActualSunTimes: false
};

// Solar day calculation helpers
function getSunriseSunset(date) {
  // Simplified calculation - you can make this more accurate with lat/long later
  // For now, assume sunrise at 6 AM and sunset at 6 PM (12 hours of daylight)
  // TODO: Use actual sunrise/sunset API or library for user's location

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
  if (date > sunset) return 12; // Full day elapsed

  const elapsed = (date - sunrise) / (1000 * 60 * 60); // Hours
  return Math.max(0, Math.min(12, elapsed));
}

function getHoursOfDaylightRemaining(date) {
  const totalDaylight = 12; // Hours (sunrise to sunset)
  const elapsed = getHoursOfDaylightElapsed(date);
  return Math.max(0, totalDaylight - elapsed);
}

function calculateProjectedProduction(currentProduction, hoursElapsed, hoursRemaining) {
  if (hoursElapsed <= 0) return 0; // No data yet
  if (hoursRemaining <= 0) return 0; // Day is over

  // Calculate hourly rate based on what's been produced so far
  const hourlyRate = currentProduction / hoursElapsed;

  // Project remaining production
  const projectedRemaining = hourlyRate * hoursRemaining;

  return projectedRemaining;
}

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
 * @param {boolean} useProjection - Whether to validate projected values instead of raw input
 * @param {HTMLElement} root - The root element to find projected values from
 * @returns {Object} - { errors: Array, formatted: Object }
 */
function validateAndFormatData(formData, useProjection = false, root = null) {
  const errors = [];
  const formatted = { ...formData };

  // Get the actual values that will be validated and submitted
  let itdToValidate = formData.itd;
  let prodToValidate = formData.prod;

  // If using projection, get projected values from data attributes
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

  // Validate and format ITD (must be whole number) - use projected value if available
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
      // Round to nearest integer
      formatted.itd = Math.round(itdNum);
    } else {
      formatted.itd = itdNum;
    }
  }

  // Validate and format Production (max 3 decimals) - use projected value if available
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
 * @param {boolean} hasProjection - Whether projection is being used
 */
function displayValidationErrors(root, errors, hasProjection = false) {
  // Clear any existing error displays
  clearValidationErrors(root);

  // If using projection, add a note at the top of the form
  if (hasProjection) {
    const form = root.querySelector('.card');
    const existingNote = form?.querySelector('.validation-projection-note');

    if (form && !existingNote) {
      const projectionNote = document.createElement('div');
      projectionNote.className = 'validation-projection-note';
      projectionNote.style.cssText = 'background-color: #fff3cd; padding: 10px; margin-bottom: 10px; border-radius: 4px; color: #856404; font-size: 14px;';
      projectionNote.innerHTML = '📊 Validating projected end-of-day values';

      // Insert after the h2 title
      const title = form.querySelector('h2');
      if (title && title.nextSibling) {
        title.parentNode.insertBefore(projectionNote, title.nextSibling);
      }
    }
  }

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

  // Remove projection note
  root.querySelectorAll('.validation-projection-note').forEach(note => {
    note.remove();
  });
}

/**
 * Shows visual indicators that projected values are being used
 * @param {HTMLElement} root - The root element
 */
function showProjectionBadge(root) {
  const prodInput = root.querySelector('#prod');
  const itdInput = root.querySelector('#itd');

  // Add visual indicator that these are projected values
  [prodInput, itdInput].forEach(input => {
    if (input) {
      input.style.backgroundColor = '#fff3cd';
      input.style.fontWeight = '600';
    }
  });
}

/**
 * Clears visual indicators for projected values
 * @param {HTMLElement} root - The root element
 */
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

/**
 * Updates the production projection display
 * @param {HTMLElement} root - The root element
 */
function updateProductionProjection(root) {
  const prodInput = root.querySelector('#prod');
  const itdInput = root.querySelector('#itd');
  const projectionSection = root.querySelector('#projection-section');
  const projectionDetails = root.querySelector('#projection-details');
  const projectionHelp = root.querySelector('#projection-help');

  if (!prodInput || !itdInput || !projectionSection || !projectionDetails) return;

  const currentProduction = parseFloat(prodInput.value);
  const currentITD = parseFloat(itdInput.value);

  // Only show projection if we have valid numbers
  if (isNaN(currentProduction) || isNaN(currentITD) || currentProduction <= 0) {
    projectionSection.style.display = 'none';
    if (projectionHelp) projectionHelp.style.display = 'none';
    clearProjectionBadge(root);
    return;
  }

  const now = new Date();

  // Check if we're in daylight hours
  if (!isDaylightHours(now)) {
    projectionSection.style.display = 'none';
    if (projectionHelp) projectionHelp.style.display = 'none';
    clearProjectionBadge(root);
    return;
  }

  const hoursElapsed = getHoursOfDaylightElapsed(now);
  const hoursRemaining = getHoursOfDaylightRemaining(now);

  // If day is over or just started, don't project
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

  // Round to 3 decimals
  const roundedProjection = Math.round(projectedRemaining * 1000) / 1000;
  const projectedTotal = Math.round((currentProduction + projectedRemaining) * 1000) / 1000;
  const projectedITD = Math.round(currentITD + projectedRemaining);

  // Show the projection
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

  // Store projection in BOTH inputs' data attributes for easier access
  prodInput.setAttribute('data-projected-total', projectedTotal);
  prodInput.setAttribute('data-projected-itd', projectedITD);
  itdInput.setAttribute('data-projected-itd', projectedITD);
  itdInput.setAttribute('data-has-projection', 'true');

  // Show visual indicators
  showProjectionBadge(root);
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
        <!-- Projection Display Section -->
        <div id="projection-section" style="display: none; margin-top: 16px; padding: 12px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: #856404;">
            📊 Mid-Day Projection
          </div>
          <div id="projection-details" style="font-size: 14px; color: #856404;">
            <!-- Projection details will be inserted here -->
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
    const prodInput = root.querySelector('#prod');
    const itdInput = root.querySelector('#itd');
    const dateInput = root.querySelector('#date');

    // Check if we have projected values
    const hasProjection = prodInput.hasAttribute('data-projected-total');

    // Get RAW form data (what user entered)
    const rawFormData = {
      date: dateInput.value,
      itd: itdInput.value,
      prod: prodInput.value
    };

    // Get the values that will actually be submitted
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

    // Clear any previous validation errors
    clearValidationErrors(root);

    // Debug logging
    console.log('=== VALIDATION & SUBMISSION DEBUG ===');
    console.log('Raw input values:', rawFormData);
    console.log('Has projection:', hasProjection);

    if (hasProjection) {
      console.log('Projected values:', {
        itd: prodInput.getAttribute('data-projected-itd'),
        prod: prodInput.getAttribute('data-projected-total')
      });
    }

    console.log('Validating with projection:', hasProjection);

    // Validate the VALUES THAT WILL BE SUBMITTED (projected if available)
    const { errors, formatted } = validateAndFormatData(submissionData, hasProjection, root);

    console.log('Validation errors:', errors);
    console.log('Final submission data:', formatted);
    console.log('=====================================');

    if (errors.length > 0) {
      // Show inline validation errors
      displayValidationErrors(root, errors, hasProjection);

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

        // Clear projection data attributes
        const prodInputClear = root.querySelector('#prod');
        const itdInputClear = root.querySelector('#itd');
        if (prodInputClear) {
          prodInputClear.removeAttribute('data-projected-total');
        }
        if (itdInputClear) {
          itdInputClear.removeAttribute('data-projected-itd');
        }

        // Hide projection section and clear visual indicators
        const projectionSection = root.querySelector('#projection-section');
        const projectionHelp = root.querySelector('#projection-help');
        if (projectionSection) projectionSection.style.display = 'none';
        if (projectionHelp) projectionHelp.style.display = 'none';
        clearProjectionBadge(root);
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

  // Add projection update listeners
  if (prodInput) {
    prodInput.addEventListener('input', () => updateProductionProjection(root));
  }

  if (itdInput) {
    itdInput.addEventListener('input', () => updateProductionProjection(root));
  }

  // Update projection every minute (in case time crosses threshold)
  setInterval(() => updateProductionProjection(root), 60000);

  // Initial projection update
  updateProductionProjection(root);

  refreshLatest();
}
