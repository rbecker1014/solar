// tabs/daily-data-store.js
// Shared loader and selectors for the combined daily dataset
import { getDefaultDateRange, getNormalizedDateRange } from './date-range.js';

const ENDPOINT = "https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec";
const TOKEN    = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";
const DAY_MS   = 86_400_000;

function toDateKey(date){
  if (!(date instanceof Date)) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toFiniteNumber(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasCompleteData(row = {}){
  const fields = ['solarKWh', 'homeKWh', 'gridImport', 'gridExport', 'netKWh'];
  return fields.some((field) => Math.abs(toFiniteNumber(row[field])) > 0);
}

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

async function fetchSolarProduction(range){
  const sql = `
    SELECT
      date AS Date,
      Production AS SolarKWh
    FROM \`solar-data-api.energy.solar_production\`
    WHERE date BETWEEN DATE '${range.from}' AND DATE '${range.to}'
    ORDER BY Date
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
    solarKWh: Number(row.SolarKWh ?? row.Production ?? 0),
    homeKWh: 0,
    netKWh: 0,
    gridImport: 0,
    gridExport: 0,
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

function getFullStore(state){
  if (!state.dailyDataFull){
    state.dailyDataFull = {
      key: null,
      range: null,
      rows: [],
      status: 'idle',
      lastFetched: null,
      error: null,
      promise: null,
    };
  }
  return state.dailyDataFull;
}

function getSolarStore(state){
  if (!state.dailySolarData){
    state.dailySolarData = {
      key: null,
      range: null,
      rows: [],
      status: 'idle',
      lastFetched: null,
      error: null,
      promise: null,
    };
  }
  return state.dailySolarData;
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

export async function ensureFullDailyDataLoaded(state){
  if (!state){
    throw new Error('Shared state is required to load daily data.');
  }

  const range = getDefaultDateRange();
  const key = buildRangeKey(range);
  const store = getFullStore(state);

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

export async function ensureSolarProductionLoaded(state){
  if (!state){
    throw new Error('Shared state is required to load solar production data.');
  }

  const range = getDefaultDateRange();
  const key = buildRangeKey(range);
  const store = getSolarStore(state);

  if (store.key === key){
    if (store.status === 'ready'){ return store.rows; }
    if (store.status === 'loading' && store.promise){ return store.promise; }
  }

  store.key = key;
  store.range = range;
  store.rows = [];
  store.status = 'loading';
  store.error = null;

  const promise = fetchSolarProduction(range)
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
  const filteredRows = state?.dailyData?.rows || [];
  const parsedRows = filteredRows.map((row) => ({
    ...row,
    dateObj: row?.date ? new Date(`${row.date}T00:00:00`) : null,
  }));
  const allRows = state?.dailyDataFull?.rows || filteredRows;
  const parsedAllRows = allRows.map((row) => ({
    ...row,
    dateObj: row?.date ? new Date(`${row.date}T00:00:00`) : null,
  }));
  const rowsByDate = new Map(parsedAllRows.map((row) => [row.date, row]));
  const solarRows = state?.dailySolarData?.rows || [];
  const parsedSolarRows = solarRows.map((row) => ({
    ...row,
    dateObj: row?.date ? new Date(`${row.date}T00:00:00`) : null,
  }));
  const solarSourceRows = parsedSolarRows.length > 0 ? parsedSolarRows : parsedAllRows;
  const solarRowsByDate = new Map(solarSourceRows.map((row) => [row.date, row]));
  const useSolarData = parsedSolarRows.length > 0;
  let topProductionDay = null;
  const totals = parsedRows.reduce((acc, row) => {
    const solar = toFiniteNumber(row.solarKWh);
    const home = toFiniteNumber(row.homeKWh);
    const imp = toFiniteNumber(row.gridImport);
    const exp = toFiniteNumber(row.gridExport);

    acc.totalSolar += solar;
    acc.totalUse += home;
    acc.totalImp += imp;
    acc.totalExp += exp;
    acc.dayCount += 1;

    if (!topProductionDay || solar > topProductionDay.solarKWh || (solar === topProductionDay.solarKWh && row.date > topProductionDay.date)){
      topProductionDay = {
        date: row.date,
        solarKWh: solar,
        homeKWh: home,
        gridExport: toFiniteNumber(row.gridExport),
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

  function sumProductionBetween(rows, startDate, endDate){
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return 0;
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
    return rows.reduce((sum, row) => {
      const rowTime = row.dateObj?.getTime();
      if (!Number.isFinite(rowTime)) return sum;
      return (rowTime >= startTime && rowTime <= endTime)
        ? sum + row.solarKWh
        : sum;
    }, 0);
  }

  let weekToDate = { value: 0, previous: 0, delta: 0, currentRowCount: 0, previousRowCount: 0 };
  let monthToDate = { value: 0, previous: 0, delta: 0 };
  let yearToDate = { value: 0, previous: 0, delta: 0 };

  const latestRow = solarSourceRows.reduce((latest, row) => {
    if (!row.dateObj) return latest;
    if (!latest || row.dateObj > latest.dateObj) return row;
    return latest;
  }, null);

  const latestCompleteRow = useSolarData
    ? latestRow
    : solarSourceRows.reduce((latest, row) => {
        if (!row.dateObj || !hasCompleteData(row)) return latest;
        if (!latest || row.dateObj > latest.dateObj) return row;
        return latest;
      }, null);

  const effectiveCurrentRow = latestCompleteRow || latestRow;

  if (effectiveCurrentRow?.dateObj){
    const currentDate = new Date(effectiveCurrentRow.dateObj);
    currentDate.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weekRowsRaw = solarSourceRows
      .filter((row) => row.dateObj && row.dateObj >= startOfWeek && row.dateObj <= currentDate);
    const sortedWeekRows = [...weekRowsRaw].sort((a, b) => a.dateObj - b.dateObj);
    let rowsUsedForWeekTotals = sortedWeekRows;
    if (!useSolarData){
      const weekRows = sortedWeekRows.filter((row) => hasCompleteData(row));
      if (weekRows.length > 0){
        rowsUsedForWeekTotals = weekRows;
      }
    }

    const currentWeekAggregation = rowsUsedForWeekTotals.reduce((acc, row) => {
      if (!row) return acc;
      const value = toFiniteNumber(row.solarKWh);
      if (Number.isFinite(value)){
        acc.total += value;
        acc.count += 1;
      }
      return acc;
    }, { total: 0, count: 0 });

    const prevWeekAggregation = rowsUsedForWeekTotals.reduce((acc, row) => {
      if (!row?.dateObj) return acc;
      const prevDate = new Date(row.dateObj);
      prevDate.setDate(prevDate.getDate() - 7);
      prevDate.setHours(0, 0, 0, 0);
      const match = solarRowsByDate.get(toDateKey(prevDate));
      const value = toFiniteNumber(match?.solarKWh);
      if (Number.isFinite(value)){
        acc.total += value;
        acc.count += 1;
      }
      return acc;
    }, { total: 0, count: 0 });

    const currentWeekTotal = currentWeekAggregation.total;
    const prevWeekTotal = prevWeekAggregation.total;

    const coverageStart = rowsUsedForWeekTotals[0]?.dateObj || startOfWeek;
    const coverageEnd = rowsUsedForWeekTotals[rowsUsedForWeekTotals.length - 1]?.dateObj || currentDate;

    weekToDate = {
      value: currentWeekTotal,
      previous: prevWeekTotal,
      delta: currentWeekTotal - prevWeekTotal,
      start: new Date(coverageStart),
      end: new Date(coverageEnd),
      currentRowCount: currentWeekAggregation.count,
      previousRowCount: prevWeekAggregation.count,
    };

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthToDateDays = currentDate.getDate();
    const currentMonthTotal = sumProductionBetween(solarSourceRows, startOfMonth, currentDate);
    const prevMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const prevMonthDays = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0).getDate();
    const comparableMonthDays = Math.min(monthToDateDays, prevMonthDays);
    const prevMonthEnd = new Date(prevMonthStart);
    prevMonthEnd.setDate(prevMonthStart.getDate() + (comparableMonthDays - 1));
    const prevMonthTotal = sumProductionBetween(solarSourceRows, prevMonthStart, prevMonthEnd);
    monthToDate = {
      value: currentMonthTotal,
      previous: prevMonthTotal,
      delta: currentMonthTotal - prevMonthTotal,
      start: new Date(startOfMonth),
      end: new Date(currentDate),
    };

    const startOfYear = new Date(currentDate.getFullYear(), 0, 1);
    const ytdDays = Math.max(1, Math.round((currentDate - startOfYear) / 86400000) + 1);
    const currentYearTotal = sumProductionBetween(solarSourceRows, startOfYear, currentDate);
    const prevYearStart = new Date(currentDate.getFullYear() - 1, 0, 1);
    const prevYearEnd = new Date(prevYearStart);
    prevYearEnd.setDate(prevYearStart.getDate() + (ytdDays - 1));
    const prevYearTotal = sumProductionBetween(solarSourceRows, prevYearStart, prevYearEnd);
    yearToDate = {
      value: currentYearTotal,
      previous: prevYearTotal,
      delta: currentYearTotal - prevYearTotal,
      start: new Date(startOfYear),
      end: new Date(currentDate),
    };
  }

  return {
    totalSolar: totals.totalSolar,
    totalUse: totals.totalUse,
    totalImp: totals.totalImp,
    totalExp: totals.totalExp,
    avgDailyUse,
    avgDailyProd,
    selfSufficiency,
    topProductionDay,
    weekToDate,
    monthToDate,
    yearToDate,
  };
}

export function selectChartSeries(state){
  const rows = state?.dailyData?.rows || [];
  const sortedDaily = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sortedDaily.map((row) => ({
    date: row.date,
    usage: toFiniteNumber(row.homeKWh),
    prod: toFiniteNumber(row.solarKWh),
  }));

  const monthlyMap = new Map();
  for (const row of sortedDaily){
    const month = row.date ? row.date.slice(0, 7) : '';
    if (!monthlyMap.has(month)){
      monthlyMap.set(month, { usage: 0, prod: 0 });
    }
    const current = monthlyMap.get(month);
    current.usage += toFiniteNumber(row.homeKWh);
    current.prod += toFiniteNumber(row.solarKWh);
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
