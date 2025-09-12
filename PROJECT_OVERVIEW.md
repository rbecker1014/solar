# Project Overview

This project is a mobile-first web application for tracking household electricity and solar production. The app is built as a Progressive Web App (PWA) and divides functionality into multiple tabs, each implemented as a separate JavaScript module within the `tabs/` directory.

## Key Components
- **index.html** – main entry point that sets up the PWA shell and tab navigation.
- **app.core.js** – contains shared application state, Google authentication, data loading logic, and tab routing.
- **tabs/** – directory containing the code for each tab/page:
  - `kpi.js` – displays key performance indicators.
  - `charts.js` – renders usage and solar charts.
  - `record.js` – shows historical records.
  - `entry.js` – provides a data entry form.
  - `data.js` – fetches and displays tabular data.
  - `settings.js` – user-configurable options.
- **service-worker.js** – enables offline support.
- **manifest.webmanifest** – PWA manifest referencing icons under `icons/`.

## Notes
- The README and test HTML files are not part of the application runtime and can be ignored.
