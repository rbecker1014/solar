const DAY_MS = 86400000;
export const DEFAULT_WINDOW_DAYS = 30;
// Default to the beginning of the prior year so that KPIs such as
// year-to-date (YTD) and prior year-to-date (PYTD) have the full
// historical window they need to render meaningful comparisons.
// Without this wider aperture the KPI tab only had access to data
// from mid-2025 onward, which caused the YTD tile to under-report
// production and left the PYTD change card with "n/a".  Loading the
// full trailing 21 months gives both metrics the correct totals.
const INITIAL_START_DATE = '2024-01-01';

function getToday(){
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getTrailingDaysRange(days){
  const end = getToday();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { from: formatDate(start), to: formatDate(end) };
}

function getTrailingMonthsRange(months){
  const end = getToday();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  return { from: formatDate(start), to: formatDate(end) };
}
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
 const start = toDate(INITIAL_START_DATE);
  const end = getToday();
  if (!start){
    return getTrailingDaysRange(DEFAULT_WINDOW_DAYS);
  }
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
 const quickPicks = [
    { key: '30d', label: 'Last 30 Days', getRange: () => getTrailingDaysRange(30) },
    { key: 'quarter', label: 'Last Qtr', getRange: () => getTrailingMonthsRange(3) },
    { key: '6mo', label: 'Last 6 Mo', getRange: () => getTrailingMonthsRange(6) },
    { key: '12mo', label: 'Last 12 Mo', getRange: () => getTrailingMonthsRange(12) },
  ];
  const quickPickMarkup = quickPicks
    .map((pick) => `<button type="button" class="px-2 py-1 rounded-lg bg-gray-100 text-xs font-medium whitespace-nowrap" data-role="quickRange" data-range="${pick.key}">${pick.label}</button>`)
    .join('');
  if (state){
    if (state.startDate !== normalized.from) state.startDate = normalized.from;
    if (state.endDate !== normalized.to) state.endDate = normalized.to;
  }

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.rangeCard = id;
  card.innerHTML = `
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <div class="flex flex-col gap-1 w-[128px] flex-shrink-0">
        <label class="text-xs font-medium text-gray-600" for="${id}-start">Start</label>
        <input id="${id}-start" type="date" class="input input-compact" data-role="start" />
      </div>
      <div class="flex flex-col gap-1 w-[128px] flex-shrink-0">
        <label class="text-xs font-medium text-gray-600" for="${id}-end">End</label>
        <input id="${id}-end" type="date" class="input input-compact" data-role="end" />
      </div>
      <div class="flex flex-wrap items-center gap-1 sm:gap-2 text-xs">
        ${quickPickMarkup}
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
  const summary = card.querySelector('[data-role="summary"]');
  const quickButtons = card.querySelectorAll('[data-role="quickRange"]');

  function updateSummary(range){
    const spanDays = differenceInDays(range.from, range.to);
    summary.textContent = `Showing ${range.from} → ${range.to} • ${spanDays} day${spanDays === 1 ? '' : 's'}`;
  }

  function syncInputs(range){
    if (startInput.value !== range.from) startInput.value = range.from;
    if (endInput.value !== range.to) endInput.value = range.to;
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

  function handleInputChange(){
    commitRange({ startDate: startInput.value, endDate: endInput.value });
  }

  startInput.addEventListener('change', handleInputChange);
  endInput.addEventListener('change', handleInputChange);

  quickButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const key = event.currentTarget?.dataset?.range;
      const pick = quickPicks.find((item) => item.key === key);
      if (!pick) return;
      const range = pick.getRange();
      commitRange(range, `${id}-${key}`);
    });
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
