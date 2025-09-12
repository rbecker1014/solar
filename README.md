# Solar Production → BigQuery Integration

This project records daily solar production data into BigQuery via a Google Apps Script Web App.
It replaces the old Excel-based workflow with a simple, token-protected HTTP API and static web client.

---

## Architecture

* **Google Cloud Project**: `solar-data-api`

* **BigQuery Dataset**: `energy`

* **BigQuery Table**: `solar_production`

  * `date` DATE
  * `ITD_Production` NUMERIC
  * `Production` NUMERIC
  * Insert deduplication: rows use `insertId = "d:<date>"` so the same date cannot be inserted twice.

* **Apps Script Web App**

  * Executes as **Me**
  * Access: **Anyone with the link**
  * Provides GET and POST endpoints with a shared token check
  * **Endpoint**:

    ```
    https://script.google.com/macros/s/AKfycbz8cwcHG57A8n9XTTvwvt5pTyejqptINCjTl5BUrkUeZ9VIGIgOCYFHxJsria8xcTXj/exec
    ```
  * **Shared Token**:

    ```
    Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d
    ```

---

## API

### GET Latest Row

* **Request**

  ```
  GET /exec?token=<TOKEN>
  ```
* **Response**

  ```json
  {
    "ok": true,
    "version": "v3.0",
    "last": {
      "date": "2025-09-12",
      "itd": 12345,
      "prod": 50
    }
  }
  ```

### POST New Entry

* **Request**

  ```
  POST /exec
  Content-Type: application/x-www-form-urlencoded
  ```

  Fields:

  * `token` (string) — shared secret
  * `date` (YYYY-MM-DD) — must be strictly after the last recorded date
  * `itd` (number) — cumulative production through this date
  * `prod` (number) — daily production for this date

* **Response**

  ```json
  {
    "ok": true,
    "inserted": 3,
    "last": { "date": "2025-09-12", "itd": 12345, "prod": 50 },
    "rows": [
      ["2025-09-10", 12300, 20],
      ["2025-09-11", 12320, 25],
      ["2025-09-12", 12345, 50]
    ]
  }
  ```

* **Gap filling**
  If there are missing days, the server distributes the ITD difference evenly across the gap, so totals reconcile.

---

## Client Web Page

A simple HTML page is included to:

* Show the latest date in the BigQuery table.
* Accept new `date`, `itd`, and `prod` input.
* POST the entry to the API.
* Refresh the latest date after each submit.
* Show status and raw responses for debugging.

---

## Security Model

* **Shared Token** is required on every request.
* Anyone with the Web App URL *and* the token can read/write.
* Do **not** publish the token in public repos.
* For more protection:

  * Store the token in Apps Script `Script Properties`.
  * Serve HTML via Apps Script HTML Service to inject the token server-side.

---

## Deployment Notes

* Enable **BigQuery Advanced Service** in Apps Script (Services → Add Service → BigQuery).
* Deploy Web App:

  * **Execute as**: Me
  * **Who has access**: Anyone with link
* To update:

  * Apps Script → Deploy → Manage deployments → pencil icon → **Deploy**
  * This keeps the same URL.

---

## BigQuery Quick Checks

```sql
-- Row count
SELECT COUNT(*) AS row_count
FROM `solar-data-api.energy.solar_production`;

-- Min/Max dates
SELECT CAST(MIN(date) AS STRING) AS min_date,
       CAST(MAX(date) AS STRING) AS max_date
FROM `solar-data-api.energy.solar_production`;

-- Recent rows
SELECT *
FROM `solar-data-api.energy.solar_production`
ORDER BY date DESC
LIMIT 10;
```

---

## Example Commands

**Check latest row**

```bash
curl "https://script.google.com/macros/s/AKfycbz8cwcHG57A8n9XTTvwvt5pTyejqptINCjTl5BUrkUeZ9VIGIgOCYFHxJsria8xcTXj/exec?token=Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d"
```

**Insert a new row**

```bash
curl -X POST "https://script.google.com/macros/s/AKfycbz8cwcHG57A8n9XTTvwvt5pTyejqptINCjTl5BUrkUeZ9VIGIgOCYFHxJsria8xcTXj/exec" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "token=Rick_c9b8f4f2a0d34d0c9e2b6a7c5f1e4a3d&date=2025-09-12&itd=12345&prod=50"
```

---

## Migration from Excel to BigQuery

1. **Replace Excel integration** with calls to the Apps Script API above.
2. **Write flow**: POST `date`, `itd`, `prod`, `token`.
3. **Read flow**: GET with `token` to fetch the latest row.
4. **Schema**: maintain `date` (YYYY-MM-DD), `ITD_Production` (cumulative), `Production` (daily).
5. **Store config**: put `ENDPOINT` and `TOKEN` in app settings or environment variables.
6. **Monitor**: use Apps Script “Executions” and BigQuery queries for auditing.

---

## Troubleshooting

* **forbidden**: Token mismatch. Ensure client `TOKEN` matches `SHARED_TOKEN` in Apps Script code.
* **inserted: 0**: Same date posted again. `insertId` prevents duplicates.
* **GET shows none**: Table is empty or using the wrong project/dataset.
* **JSON parse error**: Client sent form-encoded but server expected JSON (or vice versa). Use the provided `doPost`.

---

## Version

* Apps Script server code: `v3.0`
* Client HTML page: latest commit
