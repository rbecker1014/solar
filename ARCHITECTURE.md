# Solar KPIs - Comprehensive Architectural Overview

**Generated:** December 2024
**Repository:** `rbecker1014/solar`

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [Hosting & Deployment](#2-hosting--deployment)
3. [Backend Services & Integrations](#3-backend-services--integrations)
4. [Database & Storage](#4-database--storage)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Environment & Configuration](#6-environment--configuration)
7. [Dependencies](#7-dependencies)
8. [Architecture Diagram](#8-architecture-diagram)

---

## 1. Repository Structure

### Directory Layout

```
/solar
├── .git/                           # Git repository
├── .gitignore                      # Excludes node_modules, package-lock.json
│
├── dist/                           # Build output
│   └── output.css                  # Compiled & minified TailwindCSS
│
├── icons/                          # PWA icon assets
│   ├── icon-192.png                # Standard PWA icon
│   ├── icon-512.png                # Maskable PWA icon
│   └── text.html                   # Legacy test file
│
├── src/                            # Source files
│   └── input.css                   # TailwindCSS source (imports)
│
├── tabs/                           # Feature modules (tab components)
│   ├── charts.js                   # Monthly/daily chart visualizations
│   ├── cloud-config.js             # Google Cloud configuration constants
│   ├── daily-data-store.js         # Data fetching, caching & selectors
│   ├── data.js                     # Raw data table view
│   ├── date-range.js               # Date picker & range utilities
│   ├── entry.js                    # Google Sheets API integration
│   ├── kpi.js                      # KPI dashboard with metrics
│   ├── record.js                   # Manual solar production entry
│   ├── settings.js                 # Cloud Storage & BigQuery config
│   ├── UserFriendlyFeedback.js     # User feedback & error display
│   └── test.html                   # Legacy test file
│
├── index.html                      # Main application shell
├── app.core.js                     # Application router & state management
├── chatbot.html                    # Chat interface for data queries
├── manifest.webmanifest            # PWA configuration
├── service-worker.js               # PWA caching strategy
├── pwa-install.js                  # PWA installation prompt handler
│
├── package.json                    # npm configuration
├── tailwind.config.js              # TailwindCSS configuration
├── placeholder-data.json           # Sample test data
│
├── README.md                       # Apps Script API documentation
├── PROJECT_OVERVIEW.md             # Project overview
├── APPS_SCRIPT_FIX.md              # Backend precision fix docs
└── ARCHITECTURE.md                 # This document
```

### File Purposes

| File/Directory | Purpose |
|----------------|---------|
| `app.core.js` | Central router, shared state management, tab lazy-loading |
| `tabs/*.js` | Self-contained feature modules for each navigation tab |
| `dist/output.css` | Production CSS (TailwindCSS compiled) |
| `service-worker.js` | PWA offline caching (cache-first strategy) |
| `manifest.webmanifest` | PWA metadata (name, icons, display mode) |

### Primary Languages & Frameworks

| Technology | Purpose | Version |
|------------|---------|---------|
| **JavaScript (ES6+)** | Primary language | ES2020 modules |
| **TailwindCSS** | Utility-first CSS framework | ^3.4.18 |
| **Chart.js** | Data visualization | 4.4.1 (CDN) |
| **Google Identity Services** | OAuth 2.0 authentication | GIS SDK |
| **Google APIs** | Sheets, BigQuery, Cloud Storage | REST/JS |

### Build Tools

| Tool | Purpose | Configuration |
|------|---------|---------------|
| **TailwindCSS CLI** | CSS compilation & minification | `tailwind.config.js` |
| **npm** | Package management | `package.json` |

**No bundler is used** - all code uses native ES6 modules imported directly in the browser.

**Build Commands:**
```bash
npm run build:css    # Compile TailwindCSS to dist/output.css
npm run watch:css    # Watch mode for development
```

---

## 2. Hosting & Deployment

### Hosting Platform

**Frontend:** Static file hosting (any web server)
- The application is a Progressive Web App (PWA) consisting of static HTML, JS, and CSS
- No specific hosting platform is configured in the repository
- Can be hosted on GitHub Pages, Netlify, Vercel, Firebase Hosting, or any static host

**Backend:** Google Apps Script Web App
- Deployed as a Google Apps Script web application
- Execute as: **Me** (service account)
- Access: **Anyone with the link**

### Deployment Pipeline

**No CI/CD pipeline is configured.** Deployment is manual:

1. **Frontend Deployment:**
   - Build CSS: `npm run build:css`
   - Upload static files to hosting provider
   - Service worker handles caching

2. **Backend Deployment:**
   - Google Apps Script → Deploy → Manage deployments
   - Select version and deploy (preserves URL)

### Deployment Configuration Files

| File | Purpose |
|------|---------|
| `manifest.webmanifest` | PWA installation metadata |
| `service-worker.js` | Offline caching configuration |

**PWA Manifest Configuration:**
```json
{
  "name": "Solar KPIs",
  "short_name": "Solar",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#111827",
  "theme_color": "#111827"
}
```

**Service Worker Cache:** `solar-pwa-v3`
- Caches: index.html, app.core.js, tab modules, icons, manifest

### Domain Configuration

- No custom domain configuration in repository
- No DNS settings referenced
- Uses relative paths for all assets (portable to any domain)

---

## 3. Backend Services & Integrations

### Service Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Third-Party Services                         │
├─────────────────────────────────────────────────────────────────┤
│  Google Apps Script  │  BigQuery  │  Cloud Storage  │  Sheets  │
│    (API Gateway)     │  (Data)    │   (Files)       │  (Legacy)│
└─────────────────────────────────────────────────────────────────┘
```

### Google Apps Script Web App

**Functionality:** Token-authenticated API gateway for BigQuery operations

**Endpoint:**
```
https://script.google.com/macros/s/AKfycbwRo6WY9zanLB2B47Wl4oJBIoRNBCrO1qcPHJ6FKvi0FdTJQd4TeekpHsfyMva2TUCf/exec
```

**Configuration:**
- Project ID: `solar-data-api`
- Dataset: `energy`
- Location: `US`
- Requires BigQuery Advanced Service enabled

**API Endpoints:**

| Method | Path | Parameters | Purpose |
|--------|------|------------|---------|
| GET | `/exec` | `token`, `query` | Execute BigQuery SQL |
| GET | `/exec` | `token` | Get latest production record |
| POST | `/exec` | `token`, `date`, `itd`, `prod` | Insert new production record |

**Codebase Integration:**
- `tabs/daily-data-store.js:5-6` - Endpoint and token constants
- `tabs/record.js` - POST requests for new entries

### Google BigQuery

**Functionality:** Data warehouse for solar production and utility usage data

**Configuration:**
```javascript
// tabs/cloud-config.js
DEFAULT_BIGQUERY_PROJECT = 'solar-data-api'
DEFAULT_BIGQUERY_LOCATION = 'US'
```

**Codebase Integration:**
- `tabs/daily-data-store.js` - SQL queries for combined daily data
- `tabs/settings.js` - Job execution for external table refresh
- `tabs/cloud-config.js` - SQL templates for data ingestion

### Google Cloud Storage

**Functionality:** File upload for SDGE billing CSV exports

**Configuration:**
```javascript
// tabs/cloud-config.js
CLOUD_STORAGE_BUCKET = 'solar-data-api-ingest'
CLOUD_STORAGE_PREFIX = 'incoming'
```

**Codebase Integration:**
- `tabs/settings.js` - File upload functionality
- OAuth scopes include `devstorage.read_write`

### Google Sheets API

**Functionality:** Legacy data entry (read last row, append new records)

**Configuration:**
- Scope: `https://www.googleapis.com/auth/spreadsheets`
- Separate OAuth token client

**Codebase Integration:**
- `tabs/entry.js` - Spreadsheet read/write operations

### Chart.js (CDN)

**Functionality:** Data visualization for charts tab

**Configuration:**
```html
<!-- index.html:13 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" defer></script>
```

**Codebase Integration:**
- `tabs/charts.js` - Monthly and daily chart rendering

---

## 4. Database & Storage

### BigQuery Tables

**Project:** `solar-data-api`
**Dataset:** `energy`

#### Table: `solar_production`

| Column | Type | Description |
|--------|------|-------------|
| `date` | DATE | Production date |
| `Production` | NUMERIC | Daily production (kWh) |
| `ITD_Production` | NUMERIC | Cumulative production to date |

**Deduplication:** Uses `insertId = "d:<date>"` to prevent duplicate entries

#### Table: `sdge_usage`

| Column | Type | Description |
|--------|------|-------------|
| `meter_number` | INT64 | Utility meter identifier |
| `date` | DATE | Usage date |
| `start_time` | TIME | Interval start time |
| `duration_minutes` | INT64 | Interval duration |
| `consumption_kwh` | NUMERIC | Grid consumption |
| `generation_kwh` | NUMERIC | Solar exported to grid |
| `net_kwh` | NUMERIC | Net (consumption - generation) |
| `TOU_category` | STRING | Time-of-Use pricing tier |

#### Table: `tou_periods`

| Column | Type | Description |
|--------|------|-------------|
| `plan` | STRING | Tariff plan name (e.g., 'EV-TOU-5') |
| `period_name` | STRING | Period name (Peak, Off-Peak, etc.) |
| `season` | STRING | Summer or Winter |
| `weekend_only` | BOOLEAN | Weekend applicability |
| `start_minute` | INT64 | Period start (minutes from midnight) |
| `end_minute` | INT64 | Period end (minutes from midnight) |
| `priority` | INT64 | Overlap resolution priority |

#### External Table: `sdge_ext_raw`

Points to CSV files in Cloud Storage for data ingestion:
```sql
OPTIONS (
  format = 'CSV',
  uris = ['gs://solar-data-api-ingest/incoming/*.csv'],
  skip_leading_rows = 14
)
```

### Cloud Storage

**Bucket:** `solar-data-api-ingest`
**Prefix:** `incoming/`

**Purpose:** Receives uploaded SDGE billing CSV exports for BigQuery ingestion

### Security Rules

- BigQuery access controlled via Apps Script execution identity
- Cloud Storage access requires OAuth with `devstorage.read_write` scope
- No Firestore/Realtime Database security rules (not used)

---

## 5. Authentication & Authorization

### Authentication Methods

#### 1. Shared Token (Apps Script API)

**Type:** Static bearer token
**Token:** `Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d`

**Usage:**
```javascript
// tabs/daily-data-store.js:6
const TOKEN = "Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d";

// Request format
fetch(`${ENDPOINT}?token=${TOKEN}&query=${sql}`)
```

**Scope:** Read/write access to BigQuery via Apps Script

#### 2. OAuth 2.0 (Google Cloud Services)

**Client ID:** `656801194507-ujbqhlcm5ou4nqfq25c5j657jl6gnkoo.apps.googleusercontent.com`

**Scopes:**
```javascript
// tabs/cloud-config.js:6-9
[
  'https://www.googleapis.com/auth/devstorage.read_write',  // Cloud Storage
  'https://www.googleapis.com/auth/bigquery',               // BigQuery
]
```

**Token Management (tabs/settings.js):**
```javascript
let cloudAccessToken = null;
let cloudTokenExpiresAt = 0;
// Token expires in ~55 minutes, refresh on demand
```

#### 3. OAuth 2.0 (Google Sheets)

**Scope:** `https://www.googleapis.com/auth/spreadsheets`

**Used by:** `tabs/entry.js` for legacy spreadsheet operations

### Authorization Model

| Component | Auth Type | Access Level |
|-----------|-----------|--------------|
| KPI Tab | Shared Token | Read-only (BigQuery) |
| Charts Tab | Shared Token | Read-only (BigQuery) |
| Data Tab | Shared Token | Read-only (BigQuery) |
| Record Tab | Shared Token | Read/Write (BigQuery) |
| Settings Tab | OAuth 2.0 | Read/Write (Cloud Storage, BigQuery) |
| Entry Tab | OAuth 2.0 | Read/Write (Google Sheets) |

### Auth Code Locations

| File | Line | Auth Type |
|------|------|-----------|
| `tabs/cloud-config.js` | 4 | OAuth Client ID |
| `tabs/daily-data-store.js` | 5-6 | Endpoint + Token |
| `tabs/record.js` | ~10 | Endpoint + Token |
| `tabs/settings.js` | ~50-100 | OAuth token management |
| `tabs/entry.js` | ~30-60 | Sheets OAuth |

---

## 6. Environment & Configuration

### Environment Variables

**No `.env` files exist.** All configuration is hardcoded:

| Constant | Location | Value |
|----------|----------|-------|
| `GOOGLE_OAUTH_CLIENT_ID` | `cloud-config.js:4` | `656801194507-...` |
| `CLOUD_STORAGE_BUCKET` | `cloud-config.js:11` | `solar-data-api-ingest` |
| `CLOUD_STORAGE_PREFIX` | `cloud-config.js:12` | `incoming` |
| `DEFAULT_BIGQUERY_PROJECT` | `cloud-config.js:14` | `solar-data-api` |
| `DEFAULT_BIGQUERY_LOCATION` | `cloud-config.js:19` | `US` |
| `TOKEN` | `daily-data-store.js:6` | `Rick_c9b8f4f2...` |
| `ENDPOINT` | `daily-data-store.js:5` | Apps Script URL |

### Configuration Files

| File | Purpose | Key Settings |
|------|---------|--------------|
| `package.json` | npm config | TailwindCSS dependency, build scripts |
| `tailwind.config.js` | CSS framework | Content paths for purging |
| `manifest.webmanifest` | PWA metadata | App name, icons, display mode |
| `tabs/cloud-config.js` | Google Cloud | OAuth ID, BigQuery project, SQL templates |

### Secrets Management

**Current Approach:** Hardcoded in source files (not recommended for production)

**Exposed Secrets:**
- Shared API token in client-side JavaScript
- OAuth Client ID (public but project-restricted)
- Apps Script endpoint URL

**Recommendations:**
1. Move shared token to server-side injection
2. Use environment variables in a build process
3. Implement token rotation
4. Add request signing (HMAC)

---

## 7. Dependencies

### Production Dependencies

**None** - all external libraries loaded via CDN

### Development Dependencies

```json
{
  "devDependencies": {
    "tailwindcss": "^3.4.18"
  }
}
```

### CDN Dependencies

| Library | Version | Source | Purpose |
|---------|---------|--------|---------|
| Chart.js | 4.4.1 | jsdelivr CDN | Data visualization |
| Google Identity Services | Latest | Google CDN | OAuth 2.0 flows |

### Security Assessment

| Dependency | Status | Notes |
|------------|--------|-------|
| TailwindCSS | ✅ Current | ^3.4.18 is recent |
| Chart.js | ✅ Current | 4.4.1 is stable |
| Google APIs | ✅ Managed | Google-maintained SDKs |

**No known vulnerabilities** in current dependencies.

### Recommendations

1. Add `package-lock.json` to version control for reproducible builds
2. Consider adding ESLint for code quality
3. Add a testing framework (Jest, Vitest)

---

## 8. Architecture Diagram

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     Progressive Web App (PWA)                      │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │                     index.html (Shell)                       │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │  │  │
│  │  │  │ Header   │ │  Main    │ │   Nav    │ │ Loading Overlay  │ │  │  │
│  │  │  │          │ │  #view   │ │  5 Tabs  │ │                  │ │  │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │                              │                                     │  │
│  │                              ▼                                     │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │                    app.core.js (Router)                      │  │  │
│  │  │  • State management     • Tab lazy loading                   │  │  │
│  │  │  • Data loading         • Navigation wiring                  │  │  │
│  │  └───────────────────────────┬──────────────────────────────────┘  │  │
│  │                              │                                     │  │
│  │        ┌─────────────────────┼─────────────────────┐               │  │
│  │        ▼                     ▼                     ▼               │  │
│  │  ┌──────────┐  ┌───────────────────────┐  ┌────────────┐           │  │
│  │  │ kpi.js   │  │ daily-data-store.js   │  │ charts.js  │           │  │
│  │  │ data.js  │  │ • Data fetching       │  │ record.js  │           │  │
│  │  │ entry.js │  │ • Caching             │  │ settings.js│           │  │
│  │  │          │  │ • Selectors           │  │            │           │  │
│  │  └──────────┘  └───────────────────────┘  └────────────┘           │  │
│  │                                                                    │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                        │  │
│  │  │ service-worker.js│  │ pwa-install.js   │                        │  │
│  │  │ (Cache Strategy) │  │ (Install Prompt) │                        │  │
│  │  └──────────────────┘  └──────────────────┘                        │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │      NETWORK REQUESTS       │
                     └──────────────┬──────────────┘
                                    │
┌───────────────────────────────────┼───────────────────────────────────────┐
│                     GOOGLE CLOUD PLATFORM                                 │
├───────────────────────────────────┼───────────────────────────────────────┤
│                                   │                                       │
│   ┌───────────────────────────────▼────────────────────────────────────┐  │
│   │                  Google Apps Script Web App                        │  │
│   │  ┌────────────────────────────────────────────────────────────┐   │  │
│   │  │                     Token Validation                        │   │  │
│   │  │  if (token !== SHARED_TOKEN) return bad_('forbidden')       │   │  │
│   │  └────────────────────────────────────────────────────────────┘   │  │
│   │                              │                                     │  │
│   │        ┌─────────────────────┼─────────────────────┐               │  │
│   │        ▼                     ▼                     ▼               │  │
│   │  ┌──────────┐         ┌──────────┐         ┌──────────┐            │  │
│   │  │  doGet   │         │  doPost  │         │  Query   │            │  │
│   │  │ (Latest) │         │ (Insert) │         │  (SQL)   │            │  │
│   │  └──────────┘         └──────────┘         └──────────┘            │  │
│   └───────────────────────────────┬────────────────────────────────────┘  │
│                                   │                                       │
│                                   ▼                                       │
│   ┌───────────────────────────────────────────────────────────────────┐  │
│   │                     BigQuery (Data Warehouse)                     │  │
│   │  Project: solar-data-api    Dataset: energy    Location: US       │  │
│   │  ┌─────────────────────────────────────────────────────────────┐  │  │
│   │  │  Tables                                                     │  │  │
│   │  │  ├── solar_production (date, Production, ITD_Production)    │  │  │
│   │  │  ├── sdge_usage (date, time, consumption, generation, TOU)  │  │  │
│   │  │  ├── sdge_ext_raw (external table → Cloud Storage CSVs)     │  │  │
│   │  │  └── tou_periods (tariff schedule lookup)                   │  │  │
│   │  └─────────────────────────────────────────────────────────────┘  │  │
│   └───────────────────────────────┬───────────────────────────────────┘  │
│                                   │                                       │
│                                   ▼                                       │
│   ┌───────────────────────────────────────────────────────────────────┐  │
│   │                 Cloud Storage (File Uploads)                      │  │
│   │  Bucket: solar-data-api-ingest                                    │  │
│   │  Prefix: incoming/                                                │  │
│   │  Files: *.csv (SDGE billing exports)                              │  │
│   └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│   ┌───────────────────────────────────────────────────────────────────┐  │
│   │                 Google Sheets (Legacy Entry)                      │  │
│   │  Used by: tabs/entry.js                                           │  │
│   │  Scope: spreadsheets read/write                                   │  │
│   └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            DATA FLOW                                     │
└─────────────────────────────────────────────────────────────────────────┘

1. INITIAL LOAD
   ┌─────────┐     ┌───────────┐     ┌────────────┐     ┌─────────┐
   │  User   │ ──▶ │ index.html│ ──▶ │app.core.js │ ──▶ │loadData │
   │ Opens   │     │  (Shell)  │     │  (Router)  │     │  ()     │
   │  App    │     └───────────┘     └────────────┘     └────┬────┘
   └─────────┘                                               │
                                                             ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                     daily-data-store.js                              │
   │  ensureDailyDataLoaded() → fetchCombinedDaily() → SQL Query         │
   └─────────────────────────────────────────────────────────────────────┘
                                                             │
                                                             ▼
   ┌───────────────────────┐     ┌──────────────┐     ┌─────────────────┐
   │ Apps Script Endpoint  │ ──▶ │   BigQuery   │ ──▶ │ JSON Response   │
   │ (Token Validated)     │     │  SQL Exec    │     │ {ok, rows:[...]}│
   └───────────────────────┘     └──────────────┘     └────────┬────────┘
                                                               │
                                                               ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                     State Cache (app.core.js)                        │
   │  state.dailyData = { rows: [...], status: 'ready', ... }            │
   └─────────────────────────────────────────────────────────────────────┘
                                                               │
                       ┌───────────────────────────────────────┼────────┐
                       ▼                   ▼                   ▼        │
               ┌────────────┐      ┌────────────┐      ┌────────────┐   │
               │  KPI Tab   │      │ Charts Tab │      │  Data Tab  │   │
               │ (Metrics)  │      │ (Graphs)   │      │ (Table)    │   │
               └────────────┘      └────────────┘      └────────────┘   │

2. MANUAL DATA ENTRY
   ┌─────────┐     ┌────────────┐     ┌────────────┐     ┌─────────────┐
   │  User   │ ──▶ │ Record Tab │ ──▶ │ POST Form  │ ──▶ │ Apps Script │
   │ Enters  │     │ (record.js)│     │ token+data │     │  doPost()   │
   │  Data   │     └────────────┘     └────────────┘     └──────┬──────┘
   └─────────┘                                                  │
                                                                ▼
   ┌───────────────────────┐                         ┌─────────────────┐
   │ BigQuery INSERT       │ ◀─────────────────────  │ Insert + Fill   │
   │ solar_production      │                         │ Missing Days    │
   └───────────────────────┘                         └─────────────────┘

3. FILE UPLOAD (Settings Tab)
   ┌─────────┐     ┌────────────┐     ┌────────────┐     ┌─────────────┐
   │  User   │ ──▶ │Settings Tab│ ──▶ │ OAuth 2.0  │ ──▶ │   Cloud     │
   │ Uploads │     │(settings.js│     │   Token    │     │  Storage    │
   │  CSV    │     └────────────┘     └────────────┘     └──────┬──────┘
   └─────────┘                                                  │
                                                                ▼
   ┌───────────────────────┐     ┌──────────────┐     ┌─────────────────┐
   │ External Table Refresh│ ◀── │  BigQuery    │ ◀── │ Trigger Job     │
   │ sdge_ext_raw → usage  │     │  Job Exec    │     │ (SQL in config) │
   └───────────────────────┘     └──────────────┘     └─────────────────┘
```

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION FLOWS                             │
└─────────────────────────────────────────────────────────────────────────┘

A. TOKEN-BASED (Apps Script API)
   ┌────────────────────────────────────────────────────────────────────┐
   │  Client                                          Server            │
   │  ┌──────────────┐    GET /exec?token=XXX    ┌──────────────┐      │
   │  │ KPI/Charts/  │ ─────────────────────────▶│ Apps Script  │      │
   │  │ Data/Record  │                           │              │      │
   │  │              │    {ok: true, rows:[]}    │ if(token !=  │      │
   │  │              │ ◀─────────────────────────│ SHARED_TOKEN)│      │
   │  └──────────────┘                           │ return 403   │      │
   │                                             └──────────────┘      │
   └────────────────────────────────────────────────────────────────────┘

B. OAUTH 2.0 (Cloud Services)
   ┌────────────────────────────────────────────────────────────────────┐
   │  1. User clicks "Sign In"                                         │
   │     ┌──────────────┐                                              │
   │     │ Settings Tab │                                              │
   │     │ settings.js  │                                              │
   │     └──────┬───────┘                                              │
   │            │                                                      │
   │  2. Google Identity Services popup                                │
   │            ▼                                                      │
   │     ┌──────────────┐    ┌───────────────────────────────────┐    │
   │     │ GIS Client   │ ──▶│ accounts.google.com               │    │
   │     │ initTokenCli │    │ Consent: Cloud Storage + BigQuery │    │
   │     └──────────────┘    └───────────────────────────────────┘    │
   │            │                                                      │
   │  3. Access token returned                                         │
   │            ▼                                                      │
   │     ┌──────────────────────────────────────────┐                 │
   │     │ cloudAccessToken = response.access_token │                 │
   │     │ cloudTokenExpiresAt = Date.now() + 3300s │                 │
   │     └──────────────────────────────────────────┘                 │
   │            │                                                      │
   │  4. Direct API calls with Bearer token                            │
   │            ▼                                                      │
   │     ┌──────────────┐    ┌───────────────────────────────────┐    │
   │     │ Upload File  │ ──▶│ storage.googleapis.com/upload     │    │
   │     │ Run BQ Job   │ ──▶│ bigquery.googleapis.com/jobs      │    │
   │     └──────────────┘    └───────────────────────────────────┘    │
   └────────────────────────────────────────────────────────────────────┘
```

---

## Summary

| Aspect | Details |
|--------|---------|
| **Application Type** | Progressive Web App (PWA) |
| **Frontend Stack** | Vanilla JavaScript (ES6 modules) + TailwindCSS + Chart.js |
| **Backend** | Google Apps Script → BigQuery |
| **Authentication** | Token-based (API) + OAuth 2.0 (Cloud Services) |
| **Data Storage** | BigQuery (data warehouse) + Cloud Storage (files) |
| **Hosting** | Static hosting (unspecified) + Google Apps Script |
| **Build System** | TailwindCSS CLI only (no bundler) |
| **CI/CD** | None configured (manual deployment) |
| **Total JS Code** | ~4,000 lines |

---

*Document generated for architectural reference. Review and update as the codebase evolves.*
