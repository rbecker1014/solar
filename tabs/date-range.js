const DAY_MS = 86400000;
export const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_SLIDER_MAX = 730;

function toDate(value){
  if (!value) return null;
  const iso = String(value).slice(0, 10);
  const d = new Date(`${iso}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDate(d){
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '';
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function differenceInDays(start, end){
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return DEFAULT_WINDOW_DAYS;
  const diff = Math.round((e - s) / DAY_MS) + 1;
  return diff > 0 ? diff : DEFAULT_WINDOW_DAYS;
}

export function getDefaultDateRange(){
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (DEFAULT_WINDOW_DAYS - 1));
  return { from: formatDate(start), to: formatDate(end) };
}

export function getNormalizedDateRange(source){
  const rawStart = source?.startDate ?? source?.from;
  const rawEnd = source?.endDate ?? source?.to;
  let start = toDate(rawStart);
  let end = toDate(rawEnd);

  if (!start && !end){
    const fallback = getDefaultDateRange();
    start = toDate(fallback.from);
    end = toDate(fallback.to);
  } else if (!start && end){
    start = new Date(end);
    start.setDate(end.getDate() - (DEFAULT_WINDOW_DAYS - 1));
  } else if (start && !end){
    end = new Date(start);
    end.setDate(start.getDate() + (DEFAULT_WINDOW_DAYS - 1));
  }

  if (start && end && start > end){
    const tmp = start;
    start = end;
    end = tmp;
  }

  return {
    from: formatDate(start),
    to: formatDate(end),
  };
}

export function renderDateRange(container, ctx, options = {}){
  const { state } = ctx || {};
  const id = options.id || `range-${Math.random().toString(36).slice(2)}`;
  const normalized = getNormalizedDateRange(state);

  if (state){
    if (state.startDate !== normalized.from) state.startDate = normalized.from;
    if (state.endDate !== normalized.to) state.endDate = normalized.to;
  }

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.rangeCard = id;
  card.innerHTML = `
    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div class="flex-1 min-w-[140px]">
        <label class="text-sm text-gray-700 block" for="${id}-start">Start date</label>
        <input id="${id}-start" type="date" class="input" data-role="start" />
      </div>
      <div class="flex-1 min-w-[140px]">
        <label class="text-sm text-gray-700 block" for="${id}-end">End date</label>
        <input id="${id}-end" type="date" class="input" data-role="end" />
      </div>
      <div class="flex-1 min-w-[200px]">
        <label class="text-sm text-gray-700 block" for="${id}-slider">Window (days)</label>
        <input id="${id}-slider" type="range" min="1" max="${DEFAULT_SLIDER_MAX}" step="1" class="input" data-role="slider" />
        <div class="text-xs text-gray-500 mt-1" data-role="sliderValue"></div>
      </div>
      <div class="flex items-center">
        <button type="button" class="px-3 py-1.5 rounded-lg bg-gray-100 text-sm" data-role="clear">Last 30 days</button>
      </div>
    </div>
    <p class="text-xs text-gray-500 mt-2" data-role="summary"></p>
  `;

  if (container){
    container.innerHTML = '';
    container.appendChild(card);
  }

  const startInput = card.querySelector('[data-role="start"]');
  const endInput = card.querySelector('[data-role="end"]');
  const slider = card.querySelector('[data-role="slider"]');
  const sliderValue = card.querySelector('[data-role="sliderValue"]');
  const summary = card.querySelector('[data-role="summary"]');
  const clearBtn = card.querySelector('[data-role="clear"]');

  function updateSummary(range){
    const spanDays = differenceInDays(range.from, range.to);
    sliderValue.textContent = `${spanDays} day${spanDays === 1 ? '' : 's'}`;
    summary.textContent = `Showing ${range.from} → ${range.to} (${spanDays} day${spanDays === 1 ? '' : 's'})`;
  }

  function syncInputs(range){
    const spanDays = differenceInDays(range.from, range.to);
    const max = Number(slider.max) || DEFAULT_SLIDER_MAX;
    if (spanDays > max) slider.max = String(spanDays);
    if (startInput.value !== range.from) startInput.value = range.from;
    if (endInput.value !== range.to) endInput.value = range.to;
    if (slider.value !== String(spanDays)) slider.value = String(spanDays);
    updateSummary(range);
  }

  syncInputs(normalized);

  let syncing = false;

  async function commitRange(range, source = id){
    const normalizedRange = getNormalizedDateRange(range);
    if (state){
      const same = state.startDate === normalizedRange.from && state.endDate === normalizedRange.to;
      state.startDate = normalizedRange.from;
      state.endDate = normalizedRange.to;
      if (same){
        syncInputs(normalizedRange);
        return;
      }
    }

    syncInputs(normalizedRange);

    syncing = true;
    document.dispatchEvent(new CustomEvent('app:date-range-change', {
      detail: { startDate: normalizedRange.from, endDate: normalizedRange.to, source }
    }));
    syncing = false;

    if (ctx && typeof ctx.loadData === 'function' && options.invokeLoadData !== false){
      try{
        await ctx.loadData();
      }catch(err){
        console.error('loadData error:', err);
      }
    }

    if (typeof options.onRangeChange === 'function'){
      try{
        await options.onRangeChange(normalizedRange);
      }catch(err){
        console.error('onRangeChange error:', err);
      }
    }
  }

  function handleSliderInput(event){
    const days = Number(event.target.value) || DEFAULT_WINDOW_DAYS;
    const current = getNormalizedDateRange({ startDate: startInput.value, endDate: endInput.value });
    const endDate = toDate(current.to);
    if (!endDate) return;
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (days - 1));
    const nextRange = { from: formatDate(startDate), to: current.to };
    syncInputs(nextRange);
  }

  slider.addEventListener('input', handleSliderInput);
  slider.addEventListener('change', (event) => {
    const days = Number(event.target.value) || DEFAULT_WINDOW_DAYS;
    const current = getNormalizedDateRange({ startDate: startInput.value, endDate: endInput.value });
    const endDate = toDate(current.to);
    if (!endDate) return;
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (days - 1));
    commitRange({ startDate: formatDate(startDate), endDate: current.to });
  });

  function handleInputChange(){
    commitRange({ startDate: startInput.value, endDate: endInput.value });
  }

  startInput.addEventListener('change', handleInputChange);
  endInput.addEventListener('change', handleInputChange);

  clearBtn.addEventListener('click', (event) => {
    event.preventDefault();
    commitRange(getDefaultDateRange(), id);
  });

  const syncListener = (event) => {
    if (!card.isConnected){
      document.removeEventListener('app:date-range-change', syncListener);
      return;
    }
    if (syncing) return;
    const detail = event.detail || {};
    if (detail.source === id) return;
    const range = getNormalizedDateRange({ startDate: detail.startDate, endDate: detail.endDate });
    syncInputs(range);
  };

  document.addEventListener('app:date-range-change', syncListener);

  return {
    update(range){
      const normalizedRange = getNormalizedDateRange(range);
      syncInputs(normalizedRange);
    }
  };
}
