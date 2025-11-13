/**
 * UserFriendlyFeedback Component
 * Displays API responses in a user-friendly format with error aggregation
 */

/**
 * Translates technical field names to user-friendly labels
 */
const FIELD_LABELS = {
  production: 'Production (kWh)',
  itd_production: 'ITD Production',
  date: 'Date',
  itd: 'ITD Production',
  prod: 'Production (kWh)'
};

/**
 * Translates technical error reasons to user-friendly messages
 */
const ERROR_TRANSLATIONS = {
  invalid: 'Invalid value entered',
  'Invalid NUMERIC value': 'Value has too many decimal places (max 3 allowed)',
  'Cannot convert value to integer': 'Must be a whole number (no decimals allowed)',
  'required': 'This field is required',
  'out of range': 'Value is out of acceptable range',
  'stopped': 'Submission stopped due to errors'
};

/**
 * Parses the API response and returns structured feedback data
 */
function parseResponse(responseText) {
  if (!responseText) {
    return { type: 'error', message: 'No response received' };
  }

  try {
    // Try to parse as JSON
    const parsed = typeof responseText === 'string' ? JSON.parse(responseText) : responseText;

    // Check for success
    if (parsed.ok === true || parsed.success === true || parsed.status === 'success') {
      return {
        type: 'success',
        message: parsed.message || 'Data submitted successfully!',
        data: parsed.data || parsed
      };
    }

    // Check for errors - handle both array and string formats
    if (parsed.errors) {
      return {
        type: 'error',
        errors: Array.isArray(parsed.errors) ? parsed.errors : [parsed.errors],
        message: parsed.message || 'Errors found in submission'
      };
    }

    // Check for error string that contains BigQuery insert errors
    if (parsed.error && typeof parsed.error === 'string') {
      // Check for BigQuery insert errors pattern in the error string
      if (parsed.error.includes('BigQuery insert errors:')) {
        try {
          // Extract the JSON array from the error string
          // Format: "BigQuery insert errors: [{...}]"
          const jsonStart = parsed.error.indexOf('[');
          const jsonEnd = parsed.error.lastIndexOf(']') + 1;

          if (jsonStart !== -1 && jsonEnd > jsonStart) {
            const jsonString = parsed.error.substring(jsonStart, jsonEnd);
            console.log('Extracted JSON string from error:', jsonString);

            // Parse the escaped JSON
            const errorArray = JSON.parse(jsonString);
            console.log('Parsed BigQuery error array:', errorArray);

            return {
              type: 'error',
              errors: errorArray,
              message: 'Data validation errors found'
            };
          }
        } catch (parseError) {
          console.error('Failed to parse BigQuery errors:', parseError);
          // Fall through to return generic error
        }
      }

      // Generic error string
      return {
        type: 'error',
        errors: [{ message: parsed.error }],
        message: 'Errors found in submission'
      };
    }

    // If we can't determine the type, treat as success if no errors
    return {
      type: 'success',
      message: 'Operation completed',
      data: parsed
    };

  } catch (e) {
    // If not JSON, check for success indicators in plain text
    const lowerText = responseText.toLowerCase();
    if (lowerText.includes('success') || lowerText.includes('ok')) {
      return {
        type: 'success',
        message: responseText
      };
    }

    // Check for error indicators
    if (lowerText.includes('error') || lowerText.includes('fail')) {
      return {
        type: 'error',
        message: responseText
      };
    }

    // Default to showing the text as-is
    return {
      type: 'info',
      message: responseText
    };
  }
}

/**
 * Aggregates errors by field and reason
 */
function aggregateErrors(errors) {
  const aggregated = {};

  if (!Array.isArray(errors)) {
    return aggregated;
  }

  // Flatten errors from BigQuery format
  const flattenedErrors = [];
  errors.forEach(error => {
    if (error.errors && Array.isArray(error.errors)) {
      // BigQuery format: each entry has an errors array
      error.errors.forEach(err => {
        flattenedErrors.push(err);
      });
    } else if (error.location || error.reason || error.message) {
      // Direct error format
      flattenedErrors.push(error);
    }
  });

  // Aggregate flattened errors
  flattenedErrors.forEach(err => {
    const field = err.field || err.location || 'unknown';
    const reason = err.reason || err.message || 'Unknown error';
    const key = `${field}::${reason}`;

    if (!aggregated[key]) {
      aggregated[key] = {
        field,
        reason,
        count: 0,
        examples: []
      };
    }

    aggregated[key].count++;
    if (aggregated[key].examples.length < 3) {
      aggregated[key].examples.push(aggregated[key].count);
    }
  });

  return aggregated;
}

/**
 * Translates a technical error message to user-friendly text
 */
function translateError(reason) {
  // Check for exact match
  if (ERROR_TRANSLATIONS[reason]) {
    return ERROR_TRANSLATIONS[reason];
  }

  // Check for partial matches
  const lowerReason = reason.toLowerCase();
  for (const [key, value] of Object.entries(ERROR_TRANSLATIONS)) {
    if (lowerReason.includes(key.toLowerCase())) {
      return value;
    }
  }

  // Return original if no translation found
  return reason;
}

/**
 * Gets user-friendly field label
 */
function getFieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

/**
 * Renders the feedback component
 */
export function renderFeedback(container, responseText, submittedData = null) {
  if (!container) return;

  const feedback = parseResponse(responseText);

  let html = '';

  if (feedback.type === 'success') {
    html = `
      <div class="user-feedback user-feedback-success">
        <div class="user-feedback-header">
          <span class="user-feedback-icon">✓</span>
          <h3 class="user-feedback-title">Data Submitted Successfully!</h3>
        </div>
        ${submittedData ? `
          <div class="user-feedback-body">
            <p class="user-feedback-submitted-label">Submitted values:</p>
            <ul class="user-feedback-list">
              ${submittedData.date ? `<li><strong>Date:</strong> ${submittedData.date}</li>` : ''}
              ${submittedData.itd ? `<li><strong>ITD Production:</strong> ${submittedData.itd}</li>` : ''}
              ${submittedData.prod ? `<li><strong>Production:</strong> ${submittedData.prod} kWh</li>` : ''}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  } else if (feedback.type === 'error') {
    const aggregated = aggregateErrors(feedback.errors);
    const errorCount = Object.keys(aggregated).length;

    if (errorCount > 0) {
      const errorItems = Object.values(aggregated).map(err => {
        const fieldLabel = getFieldLabel(err.field);
        const errorMsg = translateError(err.reason);
        const countLabel = err.count > 1 ? ` (${err.count} entries)` : '';

        return `
          <li class="user-feedback-error-item">
            <strong>${fieldLabel}:</strong> ${errorMsg}${countLabel}
          </li>
        `;
      }).join('');

      html = `
        <div class="user-feedback user-feedback-error">
          <div class="user-feedback-header">
            <span class="user-feedback-icon">⚠</span>
            <h3 class="user-feedback-title">${errorCount} Error${errorCount > 1 ? 's' : ''} Found</h3>
          </div>
          <div class="user-feedback-body">
            <ul class="user-feedback-error-list">
              ${errorItems}
            </ul>
            <div class="user-feedback-tips">
              <p class="user-feedback-tips-title">💡 How to fix:</p>
              <ul class="user-feedback-tips-list">
                <li><strong>Production:</strong> Enter numbers with max 3 decimals (e.g., 16.426, not 16.4268)</li>
                <li><strong>ITD:</strong> Enter whole numbers only (e.g., 126753, not 126753.39)</li>
                <li><strong>Tip:</strong> Values are automatically rounded to correct precision</li>
              </ul>
            </div>
          </div>
        </div>
      `;
    } else {
      // Generic error message
      html = `
        <div class="user-feedback user-feedback-error">
          <div class="user-feedback-header">
            <span class="user-feedback-icon">⚠</span>
            <h3 class="user-feedback-title">Error</h3>
          </div>
          <div class="user-feedback-body">
            <p>${feedback.message || 'An error occurred while submitting your data.'}</p>
          </div>
        </div>
      `;
    }
  } else {
    // Info message
    html = `
      <div class="user-feedback user-feedback-info">
        <div class="user-feedback-body">
          <p>${feedback.message}</p>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

/**
 * Injects the required CSS styles into the document
 */
export function injectStyles() {
  // Check if styles already injected
  if (document.getElementById('user-feedback-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'user-feedback-styles';
  style.textContent = `
    /* User Feedback Component Styles */
    .user-feedback {
      border-radius: 0.75rem;
      padding: 1rem;
      margin-top: 1rem;
      animation: slideIn 0.3s ease-out;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .user-feedback-success {
      background-color: #d4edda;
      border: 2px solid #28a745;
      color: #155724;
    }

    .user-feedback-error {
      background-color: #f8d7da;
      border: 2px solid #dc3545;
      color: #721c24;
    }

    .user-feedback-info {
      background-color: #d1ecf1;
      border: 2px solid #17a2b8;
      color: #0c5460;
    }

    .user-feedback-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .user-feedback-icon {
      font-size: 1.5rem;
      line-height: 1;
    }

    .user-feedback-title {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0;
    }

    .user-feedback-body {
      font-size: 0.9375rem;
      line-height: 1.5;
    }

    .user-feedback-submitted-label {
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .user-feedback-list {
      list-style: none;
      padding-left: 0;
      margin: 0.5rem 0;
    }

    .user-feedback-list li {
      padding: 0.25rem 0;
    }

    .user-feedback-error-list {
      list-style: none;
      padding-left: 0;
      margin: 0.75rem 0;
      max-height: 300px;
      overflow-y: auto;
    }

    .user-feedback-error-item {
      padding: 0.5rem;
      margin-bottom: 0.5rem;
      background-color: rgba(255, 255, 255, 0.5);
      border-radius: 0.375rem;
      border-left: 3px solid #dc3545;
    }

    .user-feedback-tips {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(114, 28, 36, 0.2);
    }

    .user-feedback-tips-title {
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .user-feedback-tips-list {
      list-style: disc;
      padding-left: 1.5rem;
      margin: 0;
    }

    .user-feedback-tips-list li {
      padding: 0.25rem 0;
      font-size: 0.875rem;
    }

    /* Mobile Optimization (max-width: 768px) */
    @media (max-width: 768px) {
      .user-feedback {
        padding: 0.875rem;
        font-size: 14px;
      }

      .user-feedback-title {
        font-size: 1rem;
      }

      .user-feedback-icon {
        font-size: 1.25rem;
      }

      .user-feedback-body {
        font-size: 0.875rem;
      }

      .user-feedback-error-list {
        max-height: 250px;
      }

      .user-feedback-error-item {
        padding: 0.625rem;
        font-size: 0.875rem;
      }

      .user-feedback-tips-list li {
        font-size: 0.8125rem;
      }
    }

    /* Very small mobile devices */
    @media (max-width: 480px) {
      .user-feedback {
        padding: 0.75rem;
      }

      .user-feedback-header {
        gap: 0.375rem;
      }

      .user-feedback-title {
        font-size: 0.9375rem;
      }

      .user-feedback-error-list {
        max-height: 200px;
      }
    }
  `;

  document.head.appendChild(style);
}
