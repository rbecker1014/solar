# Project Overview

This repository contains a mobile-first progressive web application (PWA) for tracking household electricity use and solar production. The UI is organized into self-contained tabs, each implemented as its own JavaScript module in the `tabs/` directory. The application shell lives in plain HTML/JS and loads only the code required for the active tab, keeping the experience lightweight on mobile devices.

## Application Shell

- **index.html** – Defines the shared layout, tab navigation bar, and root container that each tab renders into.
- **app.core.js** – Centralizes cross-tab state (date range, rate assumptions, and default Google Cloud parameters), exposes the `loadData` helper hook for tabs that need to populate additional data, and implements the lazy tab router. Each tab module receives the shared state and `loadData` when mounted.
- **service-worker.js** & **manifest.webmanifest** – Provide the caching strategy and metadata required for installable/offline PWA behavior. Icon assets live under `icons/`.
- **placeholder-data.json** – Sample payload that can be used when building or testing without live backends.

## Shared Utilities

- **tabs/date-range.js** – Hosts reusable helpers for rendering the date range picker UI and normalizing the selected start/end dates for BigQuery-style SQL queries. The default range now begins on 2024-01-01 so the KPI tab can calculate both the current and prior year-to-date aggregates without triggering a second network round-trip.
- **tabs/cloud-config.js** – Exposes the OAuth client ID, Cloud Storage bucket information, and default BigQuery settings (including the US multi-region location) used anywhere Google Cloud access is required (entry and settings tabs).
- **tabs/daily-data-store.js** – Centralizes loading of the combined solar/usage daily dataset, caches the results in shared state per date range, and exposes selectors for KPIs, charts, and tables so presentation tabs can stay lean.

## Tab Modules (`tabs/`)

Each tab mounts into the shared `<main id="view">` element and drives its own UI:

- **kpi.js** – Reads the cached daily dataset, calculates summary metrics (total usage/solar, grid import/export, self-sufficiency, and average daily values), and renders them as headline KPIs. The WTD, PWTD, MTD, PMTD, YTD, and PYTD tiles now draw from the full historical dataset (ignoring the active date filter) and surface change cards for PWTD, PMTD, and PYTD next to their base totals.
- **charts.js** – Uses the shared daily dataset selectors to render monthly stacked bars plus a sliding 7-day daily view. Includes a manual refresh button, change log, and slider to adjust the daily window.
- **data.js** – Presents a sortable table of raw combined data (date, solar kWh, home kWh, net, grid import/export) for the selected range using the cached dataset. Shows helpful status messages when the range is empty or a backend request fails.
- **record.js** – Allows manual entry of production readings. Displays the latest recorded values from Google Apps Script and submits form data back to the same endpoint, logging responses for troubleshooting.
- **entry.js** – Provides an authenticated workflow for appending rows to a Google Sheet. Handles OAuth sign-in with Google Identity Services, reads the last populated row to calculate interpolation, and appends new rows with validation of production totals.
- **settings.js** – Configures the SDGE ingestion workflow. After authenticating with Google Cloud scopes it uploads the selected SDGE export file to the configured Cloud Storage bucket, runs a follow-up BigQuery statement, and reports upload/query status back to the user. It also surfaces the “Add to Home Screen” installer whenever the browser exposes the PWA prompt so mobile users can pin the app and run it without browser chrome.

Tabs share date range changes via a `document` event so that selecting a range in one view keeps the others synchronized.

## Data Flow & Backends

- **Google Apps Script endpoint** – The KPI, charts, data, and record tabs communicate with the hosted Apps Script endpoint (`https://script.google.com/.../exec`) using a shared token. This script aggregates solar production and SDGE usage data and serves as the bridge to Google Sheets or other data sources.
- **Google Sheets API** – The entry tab reads the most recent spreadsheet row and appends new entries using OAuth tokens acquired at runtime.
- **Google Cloud Storage & BigQuery** – The settings tab requests the broader Cloud scopes, uploads selected SDGE files into `gs://solar-data-api-ingest/incoming/`, and triggers a BigQuery job (defaults stored in shared state, with the US multi-region preselected but editable) to process the uploaded data.


## Additional Notes

- The mobile experience relies on Tailwind-style utility classes baked into `index.html` and shared styles; no build tooling is required.
- `README.md`, `test.html`, and `Test2.html` are legacy artifacts and are not part of the active application. Focus on the modules outlined above when working on the project.
- The refreshed application shell applies a subtle deep-blue gradient backdrop, glassmorphism header, and glowing tab bar accent to give the UI more personality while keeping analytics cards legible on light surfaces. Form inputs also received focus styling to improve usability on touch devices.
