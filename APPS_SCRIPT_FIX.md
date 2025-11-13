# Apps Script Backend Fix - Gap-Fill Precision

## Issue
The Apps Script backend's `buildExtrapolatedRows_()` function creates gap-filled records with excessive decimal precision, causing BigQuery insertion errors like "Invalid NUMERIC value".

## Root Cause
When calculating average daily production for missing dates:
- Old calculation: `(newITD - oldITD) / daysBetween` creates values like `21.194863636363635`
- BigQuery NUMERIC schema expects max 3 decimal places
- Cumulative ITD calculations compound the precision errors

## Solution Applied to Frontend
The same fix pattern has been applied to `tabs/entry.js` and must be applied to the Apps Script `buildExtrapolatedRows_()` function.

## Required Changes to Apps Script Code

### Before (Incorrect):
```javascript
function buildExtrapolatedRows_(last, inputDate, inputITD, inputProd) {
  // ... validation code ...

  const missingCount = gapDays - 1;
  const deltaITD = inputITD - lastITD;
  const missingSum = deltaITD - inputProd;

  const even = missingCount > 0 ? missingSum / missingCount : 0;  // ❌ Not rounded!

  const rows = [];
  let runningITD = lastITD;
  let allocated = 0;

  for (let i = 1; i <= missingCount; i++) {
    let prod = i < missingCount ? even : (missingSum - allocated);
    prod = Math.round(prod * 10) / 10;  // ❌ Only 1 decimal!
    runningITD += prod;
    rows.push([date, Math.round(runningITD), prod]);
    allocated += prod;
  }

  rows.push([inputDate, Math.round(inputITD), Math.round(inputProd * 10) / 10]);  // ❌ Only 1 decimal!
  return rows;
}
```

### After (Correct):
```javascript
function buildExtrapolatedRows_(last, inputDate, inputITD, inputProd) {
  // ... validation code ...

  const missingCount = gapDays - 1;
  const deltaITD = inputITD - lastITD;
  const missingSum = deltaITD - inputProd;

  // ✅ Calculate average daily production and round to 3 decimals immediately
  const avgDailyProduction = missingCount > 0
    ? parseFloat((missingSum / missingCount).toFixed(3))
    : 0;

  const rows = [];
  let cumulativeITD = lastITD;

  // ✅ Create interpolated records for missing days
  for (let i = 1; i <= missingCount; i++) {
    cumulativeITD += avgDailyProduction;
    const roundedITD = Math.round(cumulativeITD);
    const date = calculateDate(lastDate, i);  // Your date calculation logic
    rows.push([date, roundedITD, avgDailyProduction]);
  }

  // ✅ Final record uses exact user input to avoid cumulative rounding errors
  rows.push([
    inputDate,
    Math.round(inputITD),
    parseFloat(Number(inputProd).toFixed(3))
  ]);

  return rows;
}
```

### Special Case - Single Day Gap:
```javascript
if (gapDays === 1) {
  // ✅ Single day gap - use exact user input values with proper rounding
  return [[
    inputDate,
    Math.round(inputITD),
    parseFloat(Number(inputProd).toFixed(3))
  ]];
}
```

## Key Changes Summary

1. **Round average immediately** (Line 54 equivalent):
   ```javascript
   // OLD: const even = missingSum / missingCount;
   // NEW: const avgDailyProduction = parseFloat((missingSum / missingCount).toFixed(3));
   ```

2. **Use cumulative ITD calculation** (Lines 56-64 equivalent):
   ```javascript
   // OLD: runningITD += prod;
   // NEW: cumulativeITD += avgDailyProduction; const roundedITD = Math.round(cumulativeITD);
   ```

3. **Round production to 3 decimals consistently**:
   ```javascript
   // OLD: Math.round(prod * 10) / 10  // 1 decimal
   // NEW: parseFloat(Number(prod).toFixed(3))  // 3 decimals
   ```

4. **Preserve user's exact final values** (Line 67 equivalent):
   ```javascript
   // Final record always uses user's input ITD and production (properly rounded)
   rows.push([inputDate, Math.round(inputITD), parseFloat(Number(inputProd).toFixed(3))]);
   ```

## Validation Logic (Optional but Recommended)

Add this before `bqInsertAll_()`:

```javascript
function validateGapFilledRecords(rows) {
  rows.forEach((row, index) => {
    const [date, itd, prod] = row;

    // Validate production has max 3 decimals
    const prodStr = prod.toString();
    if (prodStr.includes('.')) {
      const decimals = prodStr.split('.')[1].length;
      if (decimals > 3) {
        throw new Error(`Row ${index}: Production has ${decimals} decimals (max 3): ${prod}`);
      }
    }

    // Validate ITD is integer
    if (!Number.isInteger(itd)) {
      throw new Error(`Row ${index}: ITD must be integer, got: ${itd}`);
    }

    // Validate ITD increases monotonically
    if (index > 0 && itd <= rows[index - 1][1]) {
      throw new Error(`Row ${index}: ITD must increase monotonically`);
    }
  });
  return true;
}

// Use in doPost:
const rows = buildExtrapolatedRows_(last, inputDate, inputITD, inputProd);
validateGapFilledRecords(rows);  // Add this line
bqInsertAll_(rows);
```

## Testing Scenarios

### Test Case 1: Small gap (2 days)
- Last: 2025-09-28, ITD 125804
- New: 2025-09-30, ITD 125846, Prod 21
- Expected: 2 records with production values properly rounded to 3 decimals

### Test Case 2: Large gap (45 days) - From user report
- Last: 2025-09-28, ITD 125804
- New: 2025-11-12, ITD 126753, Prod 16.426
- Expected: 45 records with avgDailyProduction ~21.089 (3 decimals)
- Final record: Date=2025-11-12, ITD=126753 (exact), Prod=16.426 (exact)

### Test Case 3: Verify final record
- Last record should always match user's exact input:
  - ITD: Rounded to integer
  - Production: Rounded to 3 decimals
  - Date: Exact match

## Debugging Logs (Optional)

Add these logs in Apps Script for troubleshooting:

```javascript
Logger.log('Gap-filling calculation:');
Logger.log('- Last date: ' + lastDate);
Logger.log('- New date: ' + inputDate);
Logger.log('- Days between: ' + gapDays);
Logger.log('- Missing count: ' + missingCount);
Logger.log('- ITD difference: ' + deltaITD);
Logger.log('- Missing sum: ' + missingSum);
Logger.log('- Avg daily production (raw): ' + (missingSum / missingCount));
Logger.log('- Avg daily production (rounded): ' + avgDailyProduction);
Logger.log('- Records to insert: ' + rows.length);
Logger.log('- First 3 records: ' + JSON.stringify(rows.slice(0, 3)));
Logger.log('- Last record: ' + JSON.stringify(rows[rows.length - 1]));
```

## Deployment Steps

1. Open your Google Apps Script project
2. Locate the `buildExtrapolatedRows_()` function
3. Apply the changes above
4. Test with the test cases provided
5. Deploy as new version:
   - Click "Deploy" → "Manage deployments"
   - Click pencil icon on active deployment
   - Update version description: "Fix gap-fill precision to 3 decimals"
   - Click "Deploy"
6. Test with real data entry through the web interface

## Files Changed in This Repository

- `tabs/entry.js` - Frontend gap-filling logic (reference implementation)
- `APPS_SCRIPT_FIX.md` - This documentation file

## Related Issues

This fix resolves:
- BigQuery "Invalid NUMERIC value" errors during bulk insert
- Precision overflow errors when gap-filling large date ranges
- Cumulative rounding errors in ITD calculations
- Data quality issues with excessive decimal places

## Notes

- The frontend fix in `tabs/entry.js` serves as the reference implementation
- Both frontend (Sheets) and backend (BigQuery) need the same fix
- Production values: 3 decimal places max
- ITD values: Always whole numbers (Math.round)
- Final record: Always preserves user's exact input values
