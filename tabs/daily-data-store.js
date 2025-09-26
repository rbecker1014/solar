// tabs/daily-data-store.js
// Shared loader and selectors for the combined daily dataset
import { getNormalizedDateRange } from './date-range.js';

const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

function buildRangeKey(range){
  return `${range.from}::${range.to}`;
}

async function fetchCombinedDaily(range){
  const sql = `
    WITH combined AS (
      SELECT
        SP.date,
        SP.Production,
        NULL AS Net,
        NULL AS GridImport,
        NULL AS GridExport
      FROM \`energy.solar_production\` SP
      WHERE SP.date BETWEEN DATE '${range.from}' AND DATE '${range.to}'

      UNION ALL

      SELECT
        SDGE.date,
        NULL AS Production,
        SUM(net_kwh)         AS Net,
        SUM(consumption_kwh) AS GridImport,
        SUM(generation_kwh)  AS GridExport
      FROM \`energy.sdge_usage\` SDGE
      WHERE SDGE.date BETWEEN DATE '${range.from}' AND DATE '${range.to}'
      GROUP BY SDGE.date
    )
    SELECT
      x.date AS Date,
      SUM(x.Production)              AS SolarkWh,
      SUM(x.Production) + SUM(x.Net) AS HomekWh,
      SUM(x.Net)                     AS NetkWh,
      SUM(x.GridImport)              AS GridImport,
      SUM(x.GridExport)              AS GridExport
    FROM combined x
    WHERE x.date BETWEEN DATE '${range.from}' AND DATE '${range.to}'
    GROUP BY x.date
    ORDER BY x.date
  `;

  const url = `${ENDPOINT}?token=${encodeURIComponent(TOKEN)}&query=${encodeURIComponent(sql)}`;
  const res = await fetch(url);
  const j = await res.json();
  if (!j || j.ok !== true){
    const message = (j && j.error) || 'Unknown error';
    throw new Error(message);
  }
  const rows = Array.isArray(j.rows) ? j.rows : [];
  return rows.map((row) => ({
    date: row.Date,
    solarKWh: Number(row.SolarkWh || 0),
    homeKWh: Number(row.HomekWh || 0),
    netKWh: Number(row.NetkWh || 0),
    gridImport: Number(row.GridImport || 0),
    gridExport: Number(row.GridExport || 0),
  }));
}

function getStore(state){
  if (!state.dailyData){
    state.dailyData = {
      key: null,
      range: null,
      rows: [],
      status: 'idle',
      lastFetched: null,
      error: null,
      promise: null,
    };
  }
  return state.dailyData;
}

export async function ensureDailyDataLoaded(state){
  if (!state){
    throw new Error('Shared state is required to load daily data.');
  }
  const range = getNormalizedDateRange(state);
  const key = buildRangeKey(range);
  const store = getStore(state);

  if (store.key === key){
    if (store.status === 'ready'){ return store.rows; }
    if (store.status === 'loading' && store.promise){ return store.promise; }
  }

  store.key = key;
  store.range = range;
  store.rows = [];
  store.status = 'loading';
  store.error = null;

  const promise = fetchCombinedDaily(range)
    .then((rows) => {
      store.rows = rows;
      store.status = 'ready';
      store.lastFetched = new Date().toISOString();
      return rows;
    })
    .catch((err) => {
      store.status = 'error';
      store.error = err;
      throw err;
    })
    .finally(() => {
      store.promise = null;
    });

  store.promise = promise;
  return promise;
}

export function selectKpiMetrics(state){
  const rows = state?.dailyData?.rows || [];
  let topProductionDay = null;
  const totals = rows.reduce((acc, row) => {
    acc.totalSolar += row.solarKWh;
    acc.totalUse += row.homeKWh;
    acc.totalImp += row.gridImport;
    acc.totalExp += row.gridExport;
    acc.dayCount += 1;

    if (!topProductionDay || row.solarKWh > topProductionDay.solarKWh || (row.solarKWh === topProductionDay.solarKWh && row.date > topProductionDay.date)){
      topProductionDay = {
        date: row.date,
        solarKWh: row.solarKWh,
        homeKWh: row.homeKWh,
        gridExport: row.gridExport,
      };
    }
    return acc;
  }, {
    totalSolar: 0,
    totalUse: 0,
    totalImp: 0,
    totalExp: 0,
    dayCount: 0,
  });

  const avgDailyUse = totals.dayCount > 0 ? totals.totalUse / totals.dayCount : 0;
  const avgDailyProd = totals.dayCount > 0 ? totals.totalSolar / totals.dayCount : 0;
  const selfSufficiency = totals.totalUse > 0 ? totals.totalSolar / totals.totalUse : 0;

  return {
    totalSolar: totals.totalSolar,
    totalUse: totals.totalUse,
    totalImp: totals.totalImp,
    totalExp: totals.totalExp,
    avgDailyUse,
    avgDailyProd,
    selfSufficiency,
    topProductionDay,
  };
}

export function selectChartSeries(state){
  const rows = state?.dailyData?.rows || [];
  const sortedDaily = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sortedDaily.map((row) => ({
    date: row.date,
    usage: row.homeKWh,
    prod: row.solarKWh,
  }));

  const monthlyMap = new Map();
  for (const row of sortedDaily){
    const month = row.date ? row.date.slice(0, 7) : '';
    if (!monthlyMap.has(month)){
      monthlyMap.set(month, { usage: 0, prod: 0 });
    }
    const current = monthlyMap.get(month);
    current.usage += row.homeKWh;
    current.prod += row.solarKWh;
  }

  const monthly = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, values]) => ({
      month,
      usage: values.usage,
      prod: values.prod,
    }));

  return { recent, monthly };
}

export function selectTableRows(state){
  const rows = state?.dailyData?.rows || [];
  return [...rows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((row) => ({
      Date: row.date,
      SolarkWh: row.solarKWh,
      HomekWh: row.homeKWh,
      NetkWh: row.netKWh,
      GridImport: row.gridImport,
      GridExport: row.gridExport,
    }));
}

export function getDailyDataStatus(state){
  return state?.dailyData?.status || 'idle';
}

export function getDailyDataError(state){
  return state?.dailyData?.error || null;
}
