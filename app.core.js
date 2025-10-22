// app.core.js
// Shared state, auth, Sheets, router, and lazy tab loader
import './pwa-install.js';
import { getDefaultDateRange } from './tabs/date-range.js';
import { ensureDailyDataLoaded } from './tabs/daily-data-store.js';
import {
  DEFAULT_BIGQUERY_PROJECT,
  DEFAULT_BIGQUERY_LOCATION,
  DEFAULT_BIGQUERY_SQL,
} from './tabs/cloud-config.js';

const defaultRange = getDefaultDateRange();

const state = {
  startDate: defaultRange.from,
  endDate: defaultRange.to,
  importRate: 0.35,
  exportRate: 0.05,
  bigQueryProject: DEFAULT_BIGQUERY_PROJECT,
  bigQueryLocation: DEFAULT_BIGQUERY_LOCATION,
  bigQuerySql: DEFAULT_BIGQUERY_SQL,
  lastLoadedAt: null,
  lastLoadError: null,
  dailyData: {
    key: null,
    range: null,
    rows: [],
    status: 'idle',
    lastFetched: null,
    error: null,
    promise: null,
  },
};

async function loadData(){
  const privateLoader = typeof globalThis.loadDataPrivate === 'function'
    ? globalThis.loadDataPrivate
    : null;

  state.lastLoadError = null;

  try {
    await ensureDailyDataLoaded(state);
    if (privateLoader){
      await privateLoader(state);
    }
    state.lastLoadedAt = new Date().toISOString();
  } catch (err) {
    state.lastLoadError = err;
    console.error('loadData error:', err);
    throw err;
  }
}

// Router — lazy load tabs
const registry = {
  kpi: () => import('./tabs/kpi.js'),
  charts: () => import('./tabs/charts.js'),
  data: () => import('./tabs/data.js'),
  record: () => import('./tabs/record.js'),
  settings: () => import('./tabs/settings.js'),
};
const cache = new Map();
async function showTab(key){
  const container = document.getElementById('view');
  if (!cache.has(key)){
    const mod = await registry[key]();
    cache.set(key, mod);
  }
  container.innerHTML = '';
  const mod = cache.get(key);
  await mod.mount(container, { state, loadData });
  document.querySelectorAll('nav [data-tab]').forEach((button) => {
    const isActive = button.dataset.tab === key;
    button.classList.toggle('tab-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}
window.__showTab = showTab;

// Wire navigation
document.addEventListener('DOMContentLoaded', async () => {
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingMessage = loadingOverlay?.querySelector('[data-loading-message]');
  const hideLoadingOverlay = (delay = 0) => {
    if (!loadingOverlay) return;
    const performHide = () => {
      loadingOverlay.classList.add('loading-hidden');
      loadingOverlay.setAttribute('aria-busy', 'false');
    };
    if (delay > 0) {
      setTimeout(performHide, delay);
    } else {
      performHide();
    }
  };
  const showLoadingOverlay = (message) => {
    if (!loadingOverlay) return;
    if (message && loadingMessage){
      loadingMessage.textContent = message;
    }
    loadingOverlay.classList.remove('loading-hidden');
    loadingOverlay.setAttribute('aria-busy', 'true');
  };

  document.querySelectorAll('nav [data-tab]').forEach(b => {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  });

  showLoadingOverlay('Syncing with the energy grid…');

  let loadSucceeded = false;
  try {
    await loadData();
    loadSucceeded = true;
  } catch (e) {
    console.error(e);
    showLoadingOverlay('We hit a snag getting fresh data — showing the latest saved view.');
  }
  showTab('kpi');
  hideLoadingOverlay(loadSucceeded ? 120 : 3200);
});
