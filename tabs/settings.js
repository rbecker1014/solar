// tabs/settings.js

import {
  CLOUD_SCOPES,
  CLOUD_STORAGE_BUCKET,
  CLOUD_STORAGE_PREFIX,
  DEFAULT_BIGQUERY_PROJECT,
  DEFAULT_BIGQUERY_LOCATION,
  DEFAULT_BIGQUERY_SQL,
  GOOGLE_OAUTH_CLIENT_ID,
} from './cloud-config.js';

const CLOUD_SCOPE_STRING = CLOUD_SCOPES.join(' ');
const GIS_SCRIPT_ID = 'google-identity-services';

let gisLoaderPromise = null;
let cloudTokenClient = null;
let cloudAccessToken = null;
let cloudTokenExpiresAt = 0;

function tokenIsValid(){
  return Boolean(cloudAccessToken) && Date.now() < (cloudTokenExpiresAt - 30000);
}

function loadGisClient(){
  if (window.google && window.google.accounts && window.google.accounts.oauth2){
    return Promise.resolve();
  }
  if (!gisLoaderPromise){
    gisLoaderPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById(GIS_SCRIPT_ID);
      if (existing){
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = GIS_SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
      document.head.appendChild(script);
    });
  }
  return gisLoaderPromise;
}

async function ensureTokenClient(){
  await loadGisClient();
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2){
    throw new Error('Google Identity Services are not available.');
  }
  if (!cloudTokenClient){
    cloudTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope: CLOUD_SCOPE_STRING,
      callback: () => {},
    });
  }
  return cloudTokenClient;
}

async function requestCloudAccessToken(prompt = ''){
  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    const previous = client.callback;
    client.callback = (response) => {
      try {
        if (response && response.access_token){
          cloudAccessToken = response.access_token;
          const expiresIn = Number(response.expires_in);
          const offset = Number.isFinite(expiresIn) ? Math.max((expiresIn - 60) * 1000, 30000) : 55 * 60 * 1000;
          cloudTokenExpiresAt = Date.now() + offset;
          resolve(cloudAccessToken);
        } else {
          const description = response?.error_description || response?.error || 'Authorization failed.';
          reject(new Error(description));
        }
      } finally {
        client.callback = previous;
      }
    };
    try {
      client.requestAccessToken({ prompt });
    } catch (err) {
      client.callback = previous;
      reject(err);
    }
  });
}

async function ensureCloudAccessToken(options = {}){
  const { promptIfNeeded = false } = options;
  if (tokenIsValid()){
    return cloudAccessToken;
  }
  try {
    return await requestCloudAccessToken('');
  } catch (err) {
    if (promptIfNeeded){
      return await requestCloudAccessToken('consent');
    }
    throw err;
  }
}

function sleep(ms){
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeObjectName(name = ''){
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'upload';
}

function buildObjectName(file){
  const baseName = sanitizeObjectName(file?.name || 'upload');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = CLOUD_STORAGE_PREFIX ? `${CLOUD_STORAGE_PREFIX.replace(/\/+$/, '')}/` : '';
  return `${prefix}${timestamp}-${baseName}`;
}

function normalizeLocation(value){
  const trimmed = (value || '').trim();
  return trimmed ? trimmed.toUpperCase() : '';
}

async function uploadFileToBucket(token, file){
  const objectName = buildObjectName(file);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(CLOUD_STORAGE_BUCKET)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  if (!res.ok){
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  const payload = await res.json();
  return { objectName, payload };
}

async function pollBigQueryJob(token, projectId, location, jobId, updateStatus){
  const jobUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}?location=${encodeURIComponent(location)}`;
  for (let attempt = 0; attempt < 20; attempt += 1){
    if (attempt > 0){
      await sleep(Math.min(1500 + attempt * 250, 4000));
    }
    const res = await fetch(jobUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok){
      const text = await res.text();
      throw new Error(`Failed to poll BigQuery job (${res.status}): ${text}`);
    }
    const job = await res.json();
    const status = job.status || {};
    if (status.state === 'DONE'){
      if (status.errorResult){
        throw new Error(status.errorResult.message || `BigQuery job failed: ${status.errorResult.reason || 'Unknown error'}`);
      }
      return job;
    }
    if (typeof updateStatus === 'function'){
      updateStatus(`Job status: ${status.state || 'RUNNING'}…`);
    }
  }
  throw new Error('Timed out waiting for BigQuery job to finish.');
}

async function runBigQueryQuery(token, projectId, location, sql, updateStatus){
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      location,
    }),
  });
  if (!res.ok){
    const text = await res.text();
    throw new Error(`BigQuery request failed (${res.status}): ${text}`);
  }
  const payload = await res.json();
  if (payload.error){
    const topError = payload.error.message || payload.error.errors?.[0]?.message;
    throw new Error(`BigQuery error: ${topError || 'Unknown error'}`);
  }
  const jobReference = payload.jobReference || {};
  if (payload.jobComplete === false){
    if (typeof updateStatus === 'function'){
      updateStatus('BigQuery job submitted. Waiting for completion…');
    }
    const job = await pollBigQueryJob(token, projectId, location, jobReference.jobId, updateStatus);
    return { jobReference, job };
  }
  const status = payload.status || {};
  if (status.errorResult){
    throw new Error(status.errorResult.message || `BigQuery error: ${status.errorResult.reason || 'Unknown error'}`);
  }
  if (typeof updateStatus === 'function'){
    updateStatus('BigQuery job completed.');
  }
  return { jobReference, job: payload };
}

function appendProgress(container, message, variant = 'info'){
  if (!container) return null;
  const line = document.createElement('div');
  line.className = 'text-xs';
  if (variant === 'success') line.classList.add('ok');
  else if (variant === 'error') line.classList.add('bad');
  else line.classList.add('text-gray-600');
  line.textContent = message;
  container.appendChild(line);
  return line;
}

function setStatus(el, message, variant = 'info'){
  if (!el) return;
  el.textContent = message;
  el.className = 'text-sm';
  if (variant === 'success') el.classList.add('ok');
  else if (variant === 'error') el.classList.add('bad');
  else el.classList.add('text-gray-700');
}

export async function mount(root, ctx){
  const { state, loadData } = ctx || {};
  if (state){
    state.bigQueryProject = state.bigQueryProject || DEFAULT_BIGQUERY_PROJECT;
    state.bigQueryLocation = normalizeLocation(state.bigQueryLocation) || DEFAULT_BIGQUERY_LOCATION;
    state.bigQuerySql = state.bigQuerySql || DEFAULT_BIGQUERY_SQL;

  }

  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <h2 class="font-semibold mb-2">Rates</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-sm text-gray-700">Import $/kWh</span>
            <input id="importRate" type="number" step="0.0001" class="input" />
          </label>
          <label class="block">
            <span class="text-sm text-gray-700">Export $/kWh</span>
            <input id="exportRate" type="number" step="0.0001" class="input" />
          </label>
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button id="saveRatesBtn" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm">Save &amp; Refresh</button>
          <span id="rateStatus" class="text-sm text-gray-700"></span>
        </div>
      </div>

      <div class="card">
        <h2 class="font-semibold mb-2">SDGE File Processing</h2>
        <p class="text-sm text-gray-600">Upload your SDGE export to <code>gs://${CLOUD_STORAGE_BUCKET}/${CLOUD_STORAGE_PREFIX}/</code> and run the BigQuery query that ingests it.</p>
        <div class="mt-3 flex flex-col gap-3">
          <label class="block">
            <span class="text-sm text-gray-700">SDGE file</span>
            <input id="cloudFileInput" type="file" class="input" accept=".csv,.txt,.xls,.xlsx" />
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="text-sm text-gray-700">BigQuery project ID</span>
              <input id="bigQueryProject" class="input" />
            </label>
            <label class="block">
              <span class="text-sm text-gray-700">BigQuery location</span>
              <input id="bigQueryLocation" class="input" />
            </label>
          </div>
          <label class="block">
            <span class="text-sm text-gray-700">SQL to run</span>
            <textarea id="bigQuerySql" class="input min-h-[140px]" spellcheck="false"></textarea>
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <button id="authorizeCloudBtn" class="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm">Authorize Google Cloud</button>
            <button id="uploadRunBtn" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm" disabled>Upload &amp; Run</button>
            <span id="cloudStatus" class="text-sm text-gray-700"></span>
          </div>
          <div id="cloudProgress" class="text-xs text-gray-600 space-y-1"></div>
        </div>
      </div>
    </section>
  `;

  const importInput = root.querySelector('#importRate');
  const exportInput = root.querySelector('#exportRate');
  const saveRatesBtn = root.querySelector('#saveRatesBtn');
  const rateStatus = root.querySelector('#rateStatus');

  const fileInput = root.querySelector('#cloudFileInput');
  const projectInput = root.querySelector('#bigQueryProject');
  const locationInput = root.querySelector('#bigQueryLocation');
  const sqlInput = root.querySelector('#bigQuerySql');
  const authorizeBtn = root.querySelector('#authorizeCloudBtn');
  const uploadBtn = root.querySelector('#uploadRunBtn');
  const cloudStatus = root.querySelector('#cloudStatus');
  const cloudProgress = root.querySelector('#cloudProgress');

  if (importInput) importInput.value = state?.importRate ?? '';
  if (exportInput) exportInput.value = state?.exportRate ?? '';
  if (projectInput) projectInput.value = state?.bigQueryProject || DEFAULT_BIGQUERY_PROJECT;
  if (locationInput) locationInput.value = state?.bigQueryLocation || DEFAULT_BIGQUERY_LOCATION;
  if (sqlInput) sqlInput.value = state?.bigQuerySql || DEFAULT_BIGQUERY_SQL;

  function updateUploadButtonState(){
    const hasFile = Boolean(fileInput?.files && fileInput.files.length);
    const hasSql = Boolean((sqlInput?.value || '').trim());
    if (uploadBtn) uploadBtn.disabled = !(hasFile && hasSql);
  }

  updateUploadButtonState();

  if (tokenIsValid()){
    setStatus(cloudStatus, 'Google Cloud access ready.', 'success');
    if (authorizeBtn) authorizeBtn.textContent = 'Re-authorize Google Cloud';
  } else {
    setStatus(cloudStatus, 'Authorize to enable Cloud Storage and BigQuery actions.', 'info');
  }

  saveRatesBtn?.addEventListener('click', async () => {
    if (!state) return;
    if (rateStatus){
      rateStatus.textContent = 'Saving…';
      rateStatus.className = 'text-sm text-gray-700';
    }
    const nextImport = Number(importInput?.value);
    const nextExport = Number(exportInput?.value);
    if (Number.isFinite(nextImport)) state.importRate = nextImport;
    if (Number.isFinite(nextExport)) state.exportRate = nextExport;
    try {
      if (typeof loadData === 'function'){
        await loadData();
      }
      if (rateStatus){
        rateStatus.textContent = 'Rates updated.';
        rateStatus.className = 'text-sm ok';
      }
    } catch (err) {
      console.error('loadData error:', err);
      if (rateStatus){
        rateStatus.textContent = 'Failed to refresh data.';
        rateStatus.className = 'text-sm bad';
      }
    }
    if (typeof window !== 'undefined' && typeof window.__showTab === 'function'){
      window.__showTab('kpi');
    }
  });

  projectInput?.addEventListener('input', () => {
    if (state) state.bigQueryProject = projectInput.value;
  });
  locationInput?.addEventListener('input', () => {
    if (state) state.bigQueryLocation = normalizeLocation(locationInput.value);
  });
  locationInput?.addEventListener('blur', () => {
    const normalized = normalizeLocation(locationInput.value);
    if (state) state.bigQueryLocation = normalized;
    if (normalized) locationInput.value = normalized;

  });
  sqlInput?.addEventListener('input', () => {
    if (state) state.bigQuerySql = sqlInput.value;
    updateUploadButtonState();

  });

  fileInput?.addEventListener('change', () => {
    updateUploadButtonState();
    if (fileInput.files && fileInput.files.length){
      setStatus(cloudStatus, `Selected ${fileInput.files[0].name}.`, tokenIsValid() ? 'success' : 'info');
    }
  });

  authorizeBtn?.addEventListener('click', async () => {
    if (!authorizeBtn) return;
    authorizeBtn.disabled = true;
    setStatus(cloudStatus, 'Requesting Google Cloud access…', 'info');
    try {
      await requestCloudAccessToken('consent');
      setStatus(cloudStatus, 'Google Cloud access granted.', 'success');
      authorizeBtn.textContent = 'Re-authorize Google Cloud';
    } catch (err) {
      console.error('Authorization error:', err);
      setStatus(cloudStatus, err?.message || 'Authorization failed.', 'error');
    } finally {
      authorizeBtn.disabled = false;
      updateUploadButtonState();
    }
  });

  uploadBtn?.addEventListener('click', async () => {
    if (!fileInput?.files?.length){
      setStatus(cloudStatus, 'Select a file to upload.', 'error');
      return;
    }
    const projectId = (projectInput?.value || DEFAULT_BIGQUERY_PROJECT).trim() || DEFAULT_BIGQUERY_PROJECT;
    const location = normalizeLocation(locationInput?.value || state?.bigQueryLocation || DEFAULT_BIGQUERY_LOCATION) || DEFAULT_BIGQUERY_LOCATION;
    const sql = (sqlInput?.value || '').trim();
    if (!sql){
      setStatus(cloudStatus, 'Enter the SQL to run after upload.', 'error');
      return;
    }
    if (state){
      state.bigQueryProject = projectId;
      state.bigQueryLocation = location;
      state.bigQuerySql = sql;
    }

    if (cloudProgress) cloudProgress.innerHTML = '';
    setStatus(cloudStatus, 'Starting upload…', 'info');

    if (authorizeBtn) authorizeBtn.disabled = true;
    if (uploadBtn) uploadBtn.disabled = true;

    let statusLine = null;

    try {
      await loadGisClient();
      const token = await ensureCloudAccessToken({ promptIfNeeded: true });
      const file = fileInput.files[0];
      const { objectName } = await uploadFileToBucket(token, file);
      const uploadLine = appendProgress(cloudProgress, `Uploaded to gs://${CLOUD_STORAGE_BUCKET}/${objectName}`, 'success');
      if (uploadLine){
        const parts = objectName.split('/').map((part) => encodeURIComponent(part));
        const link = document.createElement('a');
        link.href = `https://console.cloud.google.com/storage/browser/_details/${CLOUD_STORAGE_BUCKET}/${parts.join('/')}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'ml-2 text-blue-600 underline';
        link.textContent = 'View file';
        uploadLine.appendChild(link);
      }

      statusLine = appendProgress(cloudProgress, 'Running BigQuery job…', 'info');

      const result = await runBigQueryQuery(token, projectId, location, sql, (message) => {
        if (statusLine) statusLine.textContent = message;
      });

      const jobId = result.jobReference?.jobId || result.job?.jobReference?.jobId;
      let jobMessage = 'BigQuery job completed successfully.';
      if (jobId){
        jobMessage = `BigQuery job ${jobId} completed successfully.`;
      }
      const jobLine = appendProgress(cloudProgress, jobMessage, 'success');
      if (jobLine && jobId){
        const jobLink = document.createElement('a');
        const consoleJobId = `${projectId}:${location}.${jobId}`;
        jobLink.href = `https://console.cloud.google.com/bigquery?project=${encodeURIComponent(projectId)}&j=${encodeURIComponent(consoleJobId)}&page=queryresults`;
        jobLink.target = '_blank';
        jobLink.rel = 'noopener noreferrer';
        jobLink.className = 'ml-2 text-blue-600 underline';
        jobLink.textContent = 'View job';
        jobLine.appendChild(jobLink);
      }

      setStatus(cloudStatus, 'Upload and BigQuery run completed.', 'success');
    } catch (err) {
      console.error('Cloud ingest error:', err);

      let message = err?.message || 'Upload or query failed.';
      if (/Dataset [^ ]+ was not found in location/i.test(message)){
        message = `${message} Confirm that the BigQuery location matches your dataset region (e.g. US, EU, US-WEST2).`;
      }
      if (statusLine){
        statusLine.classList.remove('text-gray-600');
        statusLine.classList.add('bad');
        statusLine.textContent = message;
      } else {
        appendProgress(cloudProgress, message, 'error');
      }
      setStatus(cloudStatus, message, 'error');
    } finally {
      if (authorizeBtn) authorizeBtn.disabled = false;
      if (uploadBtn) uploadBtn.disabled = false;
      updateUploadButtonState();
      if (tokenIsValid() && authorizeBtn) authorizeBtn.textContent = 'Re-authorize Google Cloud';
    }
  });

  loadGisClient().catch((err) => console.error('GIS load error:', err));
}
