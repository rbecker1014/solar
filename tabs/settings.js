// tabs/settings.js

import { getNormalizedDateRange, getDefaultDateRange } from './date-range.js';

let rangeListener = null;

export async function mount(root, ctx){
  const { state, loadData } = ctx;
  const normalized = getNormalizedDateRange(state);
  state.startDate = normalized.from;
  state.endDate = normalized.to;

  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <h2 class="font-semibold mb-2">Settings</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
  <label class="block">
            <span class="text-sm text-gray-700">Start date</span>
            <input id="startDate" type="date" class="input" value="${state.startDate}" />
          </label>
          <label class="block">
            <span class="text-sm text-gray-700">End date</span>
            <input id="endDate" type="date" class="input" value="${state.endDate}" />
          </label>
          <label class="block">
            <span class="text-sm text-gray-700">Import $/kWh</span>
            <input id="importRate" type="number" step="0.0001" class="input" value="${state.importRate}" />
          </label>
          <label class="block">
            <span class="text-sm text-gray-700">Export $/kWh</span>
            <input id="exportRate" type="number" step="0.0001" class="input" value="${state.exportRate}" />
          </label>
          <div class="flex gap-2 col-span-full">
            <button id="applyBtn" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm">Apply</button>
       <button id="clearBtn" class="px-3 py-1.5 rounded-lg bg-gray-100 text-sm">Last 30 days</button>
          </div>
        </div>
      </div>
    </section>
  `;
  
  const startInput = root.querySelector('#startDate');
  const endInput = root.querySelector('#endDate');
  const importInput = root.querySelector('#importRate');
  const exportInput = root.querySelector('#exportRate');
  const applyBtn = root.querySelector('#applyBtn');
  const clearBtn = root.querySelector('#clearBtn');

  const syncInputs = () => {
    if (startInput) startInput.value = state.startDate || '';
    if (endInput) endInput.value = state.endDate || '';
    if (importInput) importInput.value = state.importRate ?? '';
    if (exportInput) exportInput.value = state.exportRate ?? '';
  };

  const dispatchRangeChange = (source) => {
    document.dispatchEvent(new CustomEvent('app:date-range-change', {
      detail: { startDate: state.startDate, endDate: state.endDate, source }
    }));
  };

  if (rangeListener){
    document.removeEventListener('app:date-range-change', rangeListener);
  }

  rangeListener = (event) => {
    if (!root.isConnected){
      document.removeEventListener('app:date-range-change', rangeListener);
      rangeListener = null;
      return;
    }
    const detail = event.detail || {};
    if (detail.source === 'settings') return;
    const next = getNormalizedDateRange({ startDate: detail.startDate, endDate: detail.endDate });
    state.startDate = next.from;
    state.endDate = next.to;
    syncInputs();
  };

  document.addEventListener('app:date-range-change', rangeListener);

  applyBtn?.addEventListener('click', async () => {
    const rawStart = (startInput?.value || '').trim();
    const rawEnd = (endInput?.value || '').trim();
    const next = getNormalizedDateRange({
      startDate: rawStart,
      endDate: rawEnd,
    });
    state.startDate = next.from;
    state.endDate = next.to;
    state.importRate = Number(importInput?.value);
    state.exportRate = Number(exportInput?.value);
    syncInputs();

    try {
      await loadData();
    } catch (err) {
      console.error('loadData error:', err);
    }

    dispatchRangeChange('settings');
    window.__showTab('kpi');
  });
  
  clearBtn?.addEventListener('click', async () => {
    const fallback = getDefaultDateRange();
    state.startDate = fallback.from;
    state.endDate = fallback.to;
    syncInputs();

    try {
      await loadData();
    } catch (err) {
      console.error('loadData error:', err);
    }

    dispatchRangeChange('settings');
    window.__showTab('kpi');
  });

  syncInputs();
}
