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

export const DEFAULT_BIGQUERY_SQL = `CREATE OR REPLACE EXTERNAL TABLE \`solar-data-api.energy.sdge_ext_raw\`
(
  meter_number    STRING,
  date_str        STRING,
  start_time_str  STRING,
  duration_str    STRING,
  consumption_str STRING,
  generation_str  STRING,
  net_str         STRING
)
OPTIONS (
  format = 'CSV',
  uris = ['gs://solar-data-api-ingest/incoming/*.csv'],
  skip_leading_rows = 14,
  field_delimiter = ',',
  quote = '"',
  allow_quoted_newlines = true
);

-- Insert parsed, de-duped rows
INSERT INTO \`solar-data-api.energy.sdge_usage\` (
  meter_number, date, start_time, duration_minutes,
  consumption_kwh, generation_kwh, net_kwh
)
SELECT
  U.meter_number, U.date, U.start_time, U.duration_minutes,
  U.consumption_kwh, U.generation_kwh, U.net_kwh
FROM (
  SELECT
    CAST(REGEXP_EXTRACT(meter_number, r'^\\s*(\\d+)') AS INT64) AS meter_number,
    SAFE.PARSE_DATE('%m/%d/%Y', date_str)       AS date,
    SAFE.PARSE_TIME('%I:%M %p', start_time_str) AS start_time,
    CAST(NULLIF(TRIM(duration_str), '') AS INT64) AS duration_minutes,
    CAST(NULLIF(REPLACE(consumption_str, ',', ''), '') AS NUMERIC) AS consumption_kwh,
    CAST(NULLIF(REPLACE(generation_str,  ',', ''), '') AS NUMERIC) AS generation_kwh,
    CAST(NULLIF(REPLACE(net_str,         ',', ''), '') AS NUMERIC) AS net_kwh
  FROM \`solar-data-api.energy.sdge_ext_raw\`
  WHERE SAFE.PARSE_DATE('%m/%d/%Y', date_str) IS NOT NULL
    AND SAFE.PARSE_TIME('%I:%M %p', start_time_str) IS NOT NULL
) U
LEFT JOIN \`solar-data-api.energy.sdge_usage\` T
  ON  T.meter_number = U.meter_number
  AND T.date         = U.date
  AND T.start_time   = U.start_time
WHERE T.meter_number IS NULL
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY U.meter_number, U.date, U.start_time
) = 1;

-- Add TOU to each record
UPDATE energy.sdge_usage u
SET TOU_category = picked.period_name
FROM (
  -- pick one TOU row per interval by highest priority
  SELECT
    src.meter_number,
    src.date,
    src.start_time,
    t.period_name
  FROM (
    SELECT
      u2.meter_number,
      u2.date,
      u2.start_time,
      -- weekend if Sunday or Saturday (BigQuery: 1=Sun ... 7=Sat)
      IF(EXTRACT(DAYOFWEEK FROM u2.date) IN (1,7), TRUE, FALSE) AS is_weekend,
      EXTRACT(MONTH FROM u2.date) AS mth,
      EXTRACT(HOUR FROM u2.start_time) * 60 + EXTRACT(MINUTE FROM u2.start_time) AS minute_of_day
    FROM energy.sdge_usage u2
    WHERE u2.TOU_category IS NULL
  ) AS src
  JOIN energy.tou_periods t
    ON t.plan = 'EV-TOU-5'
   AND ((src.is_weekend AND t.weekend_only = TRUE)
     OR (NOT src.is_weekend AND t.weekend_only = FALSE))
   AND src.minute_of_day >= t.start_minute
   AND src.minute_of_day <  t.end_minute
   AND (
         (t.season = 'Summer' AND src.mth BETWEEN 6 AND 10)
      OR (t.season = 'Winter' AND (src.mth BETWEEN 11 AND 12 OR src.mth BETWEEN 1 AND 5))
       )
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY src.meter_number, src.date, src.start_time
    ORDER BY t.priority DESC
  ) = 1
) AS picked
WHERE u.meter_number = picked.meter_number
  AND u.date = picked.date
  AND u.start_time = picked.start_time
  AND u.TOU_category IS NULL;
`;
