# QReporter

A client-side React dashboard for SAP quotation XLSX exports. Workbooks are parsed
inside a browser Web Worker and saved locally in the browser; this project does not
upload data to a backend.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Upload a workbook

Select or drop an XLSX-format workbook. The file name and extension are not used to
identify its format. QReporter checks the workbook package and reads the first
worksheet. It searches the first 30 rows for these required headers:

- `Sales document`
- `Created By`
- `Sales Organization`
- `Document Currency`
- `Net Value (Header)`
- `Document Date`

Additional columns are ignored. Header capitalization and punctuation do not affect
matching. The exact SAP **Sales Organization** codes are retained as text.

Rows are reduced to one record per sales document, with repeated item rows excluded.
Conflicting header-level values for the same document stop the import rather than
producing misleading totals. Uploading another workbook replaces the previously
saved workbook and dashboard data after the new file has been validated.

Dashboard state is managed with Zustand. Filtering, date bounds, original-currency
summaries, interactive bar charts, static quotation-count and converted-INR pie
charts, and CSV export all run locally in the browser. Each pie chart shows a
prominent total, legend, and values with percentage labels; use the dashboard filters
to change the chart data.
INR value pie shares use absolute converted amounts. INR conversions use the rates in
`src/lib/workbookParser.js`; review those rates before using converted totals for
financial reporting.

## Browser storage and presentation

The latest original XLSX workbook is kept as a single IndexedDB entry on this device
and reloaded when QReporter is opened again in the same browser. A successfully
validated replacement overwrites that entry; a rejected or unsavable upload keeps
the previous saved workbook. Browser storage quotas still apply, and clearing this
site's browser data removes the saved workbook.

Choose **Present** on the dashboard for the audience view. It enlarges the KPI cards
and charts, hides the filter controls and detail table, and requests full screen
when the browser permits it. Press **Esc** or choose **Exit presentation** to return.
