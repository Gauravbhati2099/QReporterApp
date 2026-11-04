# QReporter App

QReporter is a browser-based dashboard for SAP quotation data. It reads XLSX workbooks exported from SAP, validates the required columns, removes duplicate or conflicting records, and turns the raw sales document data into interactive summaries, KPI cards, charts, and CSV exports.

The application is intentionally local-first: the workbook is processed in the browser, no backend API is required, and the latest workbook is stored in IndexedDB for automatic restore on the next visit.

## Purpose

This project helps sales and reporting teams answer questions such as:

- How many quotation documents are in the selected period?
- What is the total value by sales organization, usage type, and currency?
- Which values are outliers or fall outside expected percentile ranges?
- How do the values compare across currencies after conversion to INR?
- Which records were created manually versus by the configurator?

The app is designed for SAP quotation exports that contain sales document details, dates, currency, value, and the creator.

## How it works

### 1. Workbook upload

The user uploads an XLSX file through the dashboard. The upload area supports drag-and-drop or file picker. Once selected, the app calls the worker-based reader instead of parsing the workbook on the main thread.

### 2. Workbook parsing in a Web Worker

The actual workbook parsing is offloaded to a worker:

- `src/lib/workbookClient.js` creates a Web Worker for the workbook
- `src/lib/workbook.worker.js` receives the file and calls `readQuotationWorkbook`
- `src/lib/workbookParser.js` performs the real parsing and validation

This keeps the UI responsive even when large spreadsheets are processed.

### 3. Validation and row normalization

`readQuotationWorkbook(file)` performs these checks:

- verifies the file is non-empty and actually has an XLSX signature
- reads the workbook using SheetJS (`xlsx`)
- confirms the workbook contains a valid spreadsheet package
- reads the first worksheet
- searches the first 30 rows for the required SAP headers
- validates the columns needed for the report

Required columns:

- Sales document
- Created By
- Sales Organization
- Document Currency
- Net Value (Header)
- Document Date

If any required column is missing, the import fails with a clear message.

### 4. Record-level processing

Each row below the header is transformed into a normalized record with the following shape:

```js
{
  document,
  salesOrganization,
  createdBy,
  usage,
  currency,
  date,
  amount,
  inr,
}
```

Important processing rules:

- `usage` is set to `CONFIGURATOR` when `createdBy === '12MM102101'`, otherwise `MANUAL`
- `currency` is normalized to uppercase text
- `amount` is parsed from the original value text, including currency symbols and negative values in parentheses
- `date` is normalized to `YYYY-MM-DD`
- `inr` is calculated using conversion rates defined in `EXCHANGE_RATES`

Example conversion logic:

```js
const record = {
  ...,
  currency,
  date,
  amount,
  inr: EXCHANGE_RATES[currency] == null ? null : amount * EXCHANGE_RATES[currency],
}
```

This means the dashboard can display both:

- original-currency totals
- converted INR totals for reporting

### 5. Duplicate and conflict detection

The parser deduplicates repeated lines for the same sales document:

- records are stored in a `Map` keyed by `document`
- if the same document appears multiple times, only the first valid row is kept
- repeated data rows are counted in `repeatedItemRows`
- conflicting values for the same sales document trigger an error rather than silently mixing corrupted/duplicate data

This is important because a single SAP sales document should not appear with different sales organizations, dates, currencies, or amounts inside the same workbook.

### 6. State and storage

The app uses Zustand in `src/store/useAppStore.js` to manage state such as:

- uploaded rows
- date filters
- selected organizations, usages, currencies
- table filters
- outlier preferences
- theme and presentation mode
- file metadata and status/error messages

The workbook is saved locally using IndexedDB via `src/lib/workbookStorage.js`:

- `saveWorkbook(file, sheetName)` stores the original XLSX as a Blob
- `loadWorkbook()` restores it on app open
- `createWorkbookFile(savedWorkbook)` rebuilds a File object from the saved blob

This allows the application to reopen a previously uploaded workbook without a backend.

## Data calculations and analysis

### Summary aggregation

`src/lib/reportData.js` contains the statistics used to summarize the data.

`getSummary(rows)` groups rows by:

```js
[salesOrganization, usage, currency]
```

and returns records like:

```js
{
  salesOrganization,
  usage,
  currency,
  count,
  value,
}
```

where:

- `count` is the number of sales documents in that group
- `value` is the sum of the original amounts in that currency

### Date bounds

`getDateBounds(rows)` gets the earliest and latest valid dates in the loaded dataset, then the UI uses those values to constrain the date pickers and validation.

### Outlier logic

The dashboard supports a few outlier filtering modes.

#### IQR filter

`getOutlierRows(rows)` computes quartiles for each currency group and marks entries outside the 1.5×IQR fence.

Formula:

```js
lowerFence = Q1 - 1.5 * IQR
upperFence = Q3 + 1.5 * IQR
```

Any value outside these bounds is excluded when the user chooses the IQR filter.

#### MAD / Modified Z-score filter

`getModifiedZScoreOutlierRows(rows)` uses the median and median absolute deviation (MAD) for each currency bucket.

```js
modifiedZScore = (0.6745 * abs(value - median)) / MAD
```

Values above a cutoff of `3.5` are treated as outliers.

#### Percentile filter

`getPercentileBounds(rows, tailPercent)` calculates the lower and upper percentile cutoffs per currency and filters out the extremes based on the selected tail size.

### Currency and number formatting

The formatting helpers in `src/lib/reportData.js` handle Indian numbering and currency display:

- `formatIndianAmount()` formats values into lakh or crore style
- `formatMoney(amount, currency)` prints money with INR-specific formatting
- `formatCount()` formats counts with Indian locale separators
- `formatDateLabel()` turns `YYYY-MM-DD` into user-friendly dates

Examples:

- `1234567` → `₹12.35 Lacs`
- `345000000` → `₹34.50 Cr`
- `123456` → `12,34,56` (depending on locale layout)

## Dashboard features

### Filter panel

The main app screen includes:

- From/To date selectors
- Sales organization filter
- Usage group filter
- Currency filter
- Outlier filter choice
- Percentile tail adjustment
- Reset filters button

These controls update the working dataset without reloading the workbook.

### KPI cards

The dashboard shows high-level KPIs:

- Number of quotations
- Total INR value
- Number of sales organizations represented

These values are derived from the current filtered dataset and reflect the active selection.

### Charts

`App.jsx` renders charts using the in-memory dataset.

#### Pie charts

- Quote count by selected chart dimension
- Value by selected chart dimension

The pie chart is built with `getPieSlices()` and displays the label, value, and share percentage.

#### Bar charts

`MetricChart` shows a ranked breakdown of top categories by count or value. It also includes a percentage share and visual bar widths relative to the largest entry.

### Summary table

The table at the bottom of the dashboard shows one row per sales organization + usage group + currency combination.

Columns:

- Sales Organization
- Usage group
- Currency
- Quotations
- Total value

A search box and per-column dropdown filters allow fast drilling into the summary data. The CSV export uses the visible selected summary rows.

### Presentation mode

The app includes a presentation layout toggle:

- enlarges KPI cards and charts
- hides filters/table details for audience view
- optionally enters fullscreen when supported

This makes it easier to present the report on a screen during meetings.

## Important functions and modules

### `src/lib/workbookParser.js`

This is the heart of the data ingest pipeline.

Key functions:

- `readQuotationWorkbook(file)`
  - validates and reads the workbook
  - finds the sheet and required headers
  - parses the rows
- `findHeaderRow(matrix)`
  - scans the first 30 rows for the required columns
- `buildColumnPositions(headers)`
  - maps normalized column names to their index
- `parseRows(matrix, headerIndex, positions, date1904)`
  - converts raw spreadsheet values into normalized records
- `parseAmount(value)`
  - strips symbols, commas, and parenthesized negatives
- `parseDate(value, date1904)`
  - handles Excel dates and ISO-like date strings

### `src/lib/reportData.js`

This file calculates the analytics layer.

Key functions:

- `getDateBounds(rows)`
- `getSummary(rows)`
- `getOutlierRows(rows)`
- `getPercentileBounds(rows, tailPercent)`
- `getModifiedZScoreOutlierRows(rows)`
- `formatIndianAmount(amount)`
- `formatMoney(amount, currency)`
- `formatCount(count)`
- `formatDateLabel(value)`

These functions are shared by the KPI cards, charts, and summary table.

### `src/lib/workbookClient.js`

This file sets up the browser worker and returns a promise-based result.

```js
export function readWorkbookInWorker(file) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workbook.worker.js', import.meta.url), {
      type: 'module',
    })
    ...
  })
}
```

This is the bridge between the UI and the parser.

### `src/lib/workbookStorage.js`

This module handles persistent browser storage using IndexedDB.

- `openDatabase()` creates the database if necessary
- `runWorkbookTransaction(mode, action())` wraps object-store operations
- `saveWorkbook(file, sheetName)` stores the workbook
- `loadWorkbook()` fetches the last workbook
- `createWorkbookFile(savedWorkbook)` reconstructs a File object

### `src/store/useAppStore.js`

This stores global app state using Zustand.

The state includes:

- `rows`
- `selections`
- `dateFrom`, `dateTo`
- `groupBy`
- `query`
- `tableFilters`
- `outlierFilter`
- `theme`
- `fileInfo`
- `status`, `error`

It provides setters such as:

- `setRows`
- `setSelections`
- `setDateFrom`
- `setTheme`
- `setFileInfo`
- `setStatus`
- `setError`

### `src/App.jsx`

This is the main UI and orchestration file.

Important logic in the app includes:

- `handleFiles(fileList)`
  - uploads a file
  - parses it
  - saves it locally
  - updates the state
- `resetFilters()`
  - restores all filter values to defaults
- `downloadCsv()`
  - exports a CSV summary of the current summary rows
- `togglePresentationMode()`
  - expands the dashboard for presentation and fullscreen mode
- `selectedRows` / `filteredRows`
  - build the working dataset after filtering and outlier handling
- `kpis`
  - builds KPI values from the filtered rows
- `chartEntries`
  - prepares grouped chart data

The render tree also contains reusable UI building blocks such as:

- `MultiSelect`
- `MetricChart`
- `PieChart`
- `Icon`
- `makeCsv`

## File structure

```text
src/
  App.jsx                 # main dashboard and orchestration
  App.css                 # dashboard styling and responsive layout
  main.jsx                # React entry point
  index.css               # base styles and resets
  service-worker.js       # caching for offline shell support
  lib/
    reportData.js         # calculations, formatting, summary logic
    workbook.worker.js    # worker entry point
    workbookClient.js     # worker wrapper
    workbookParser.js     # XLSX parser and validation
    workbookStorage.js    # browser persistence using IndexedDB
  store/
    useAppStore.js        # global state management
```

## Local development

Install dependencies and run the app:

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Notes

- The app is fully client-side and does not send workbook data to a server.
- Data is reloaded from browser storage on subsequent visits.
- All calculations happen locally in the browser, so performance depends on the size of the workbook and the browser's memory.
- The conversion rates used for INR values are hardcoded in `src/lib/workbookParser.js` and should be reviewed before reporting financial values externally.

## Summary

QReporter converts raw SAP quotation exports into a clean, interactive, browser-only reporting dashboard. It validates workbook structure, removes bad or duplicate rows, computes financial summaries by sales organization and currency, applies advanced outlier filters, and presents the results as KPIs, charts, and CSV exports. The entire workflow is optimized for local analysis and quick decision-making without a backend service.
