// tabs/cloud-config.js
// Shared constants for Google Cloud integrations used by multiple tabs.

export const GOOGLE_OAUTH_CLIENT_ID = '656801194507-ujbqhlcm5ou4nqfq25c5j657jl6gnkoo.apps.googleusercontent.com';

export const CLOUD_SCOPES = [
  'https://www.googleapis.com/auth/devstorage.read_write',
  'https://www.googleapis.com/auth/bigquery',
];

export const CLOUD_STORAGE_BUCKET = 'solar-data-api-ingest';
export const CLOUD_STORAGE_PREFIX = 'incoming';

export const DEFAULT_BIGQUERY_PROJECT = 'solar-data-api';

// BigQuery multi-regions are usually written in upper-case (e.g. US, EU). The
// SDGE ingestion dataset lives in the US multi-region, so we default to that
// value and still let the Settings tab override it when needed.
export const DEFAULT_BIGQUERY_LOCATION = 'US';


export const DEFAULT_BIGQUERY_SQL = `-- Replace this with the SQL statement that processes the uploaded SDGE file.
-- Example:
-- CALL \`solar-data-api.energy.ingest_sdge_file\`();
`;
