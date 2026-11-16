const CATEGORY_DEFINITIONS = [
  {
    id: 'procurement',
    name: 'Procurement analysis',
    tag: 'PO',
    transaction: 'po',
    description: 'Purchase order value, quantity, pricing, and material mix.',
    reports: [
      'Purchase Summary Report',
      'Vendor-wise Purchase Report',
      'Material-wise Purchase Report',
      'Material Group Analysis',
      'Plant-wise Purchase Report',
      'Monthly Purchase Trend',
      'PO-wise Purchase Details',
      'Purchase Order Status Report',
      'Purchase Price Analysis',
      'Purchase Category Report',
    ],
  },
  {
    id: 'vendor-performance',
    name: 'Vendor performance',
    tag: 'Vendor',
    transaction: 'miro',
    description: 'Supplier spend, delivery, compliance, concentration, and receipt quality.',
    reports: [
      'Vendor Performance Dashboard',
      'Vendor Purchase Ranking',
      'Vendor-wise GRN Report',
      'Vendor Delivery Performance',
      'Vendor Payment Performance',
      'Vendor Outstanding Report',
      'Vendor GST Compliance Report',
      'Vendor Region Analysis',
      'Vendor Receipt Exception Report',
      'Vendor Concentration Analysis',
    ],
  },
  {
    id: 'po-grn',
    name: 'PO vs GRN analysis',
    tag: 'GRN',
    transaction: 'grn',
    description: 'Compare ordered and received quantities, values, and receipt documents.',
    reports: [
      'PO vs GRN Quantity Report',
      'Pending GRN Report',
      'Excess Receipt Report',
      'Partial Delivery Report',
      'Multiple GRN Against PO Report',
      'GRN-wise Value Report',
      'GRN Date Analysis',
      'Warehouse Receipt Report',
      'Material Receipt Trend',
      'GRN Document Tracking',
    ],
  },
  {
    id: 'miro',
    name: 'MIRO & invoice analysis',
    tag: 'MIRO',
    transaction: 'miro',
    description: 'Invoice register, PO/GRN matching, tax, aging, and price variance.',
    reports: [
      'Vendor Invoice Register',
      'MIRO vs GRN Report',
      'MIRO vs PO Value Report',
      'Invoice Pending Report',
      'Invoice Booking Trend',
      'Vendor Invoice Aging',
      'Duplicate Invoice Detection',
      'MIRO Tax Analysis',
      'Invoice-wise GST Report',
      'Invoice Price Variance Report',
    ],
  },
  {
    id: 'gst',
    name: 'GST & tax analysis',
    tag: 'GST',
    transaction: 'miro',
    description: 'Actual GST amounts, tax codes, HSN, and vendor tax compliance.',
    reports: [
      'GST Summary Report',
      'Vendor-wise GST Report',
      'HSN-wise GST Report',
      'CGST-SGST-IGST Analysis',
      'Input GST Credit Report',
      'GSTIN Validation Report',
      'GST Tax Rate Analysis',
      'Intra-state vs Inter-state Purchase',
      'GST Reconciliation Report',
      'GST Vendor Compliance Report',
    ],
  },
  {
    id: 'finance',
    name: 'Finance & payment',
    tag: 'Finance',
    transaction: 'miro',
    description: 'Invoice settlement, payment terms, aging, and currency exposure.',
    reports: [
      'Vendor Payment Report',
      'Vendor Outstanding Analysis',
      'Invoice Clearing Days Report',
      'Vendor Credit Analysis',
      'Payment Terms Analysis',
      'Overdue Payment Report',
      'Monthly Payment Trend',
      'Vendor-wise Payment Aging',
      'Currency-wise Purchase Report',
      'Exchange Rate Analysis',
    ],
  },
  {
    id: 'logistics',
    name: 'Logistics & material receipt',
    tag: 'Logistics',
    transaction: 'grn',
    description: 'Dispatch, freight, gate entry, e-way bill, and warehouse receipts.',
    reports: [
      'Mode of Dispatch Report',
      'Freight Cost Analysis',
      'Insurance Cost Analysis',
      'Other Charges Analysis',
      'E-Way Bill Tracking',
      'Gate Entry Register',
      'Warehouse-wise GRN Analysis',
      'Transportation Cost by Vendor',
    ],
  },
  {
    id: 'management',
    name: 'Management MIS',
    tag: 'Management',
    transaction: 'po',
    description: 'Spend, supplier dependency, procurement cycle, and management KPIs.',
    reports: [
      'Procurement KPI Dashboard',
      'Top 10 Vendors Dashboard',
      'Top 10 Material Spend Dashboard',
      'Purchase Cost Trend',
      'Vendor Dependency Report',
      'Purchase Spend Classification',
      'Purchase-to-Payment Cycle',
      'Procurement Exception Report',
      'Financial Year Purchase Comparison',
      'Plant-wise Procurement Comparison',
      'Procurement Efficiency Report',
      'Management Procurement MIS',
    ],
  },
  {
    id: 'data-quality',
    name: 'Data quality & exceptions',
    tag: 'Exceptions',
    transaction: 'po',
    description: 'Missing fields, duplicate documents, mismatches, and linkage gaps.',
    reports: [
      'Missing MIRO Report',
      'Missing Invoice Number Report',
      'Missing GSTIN Report',
      'Zero Value PO Report',
      'Zero Value MIRO Report',
      'Duplicate GRN Report',
      'Duplicate PO Item Report',
      'Tax Mismatch Report',
      'Quantity Mismatch Report',
      'Document Linkage Report',
    ],
  },
]

const REPORT_SPECS = [
  {
    id: 'procurement-overview',
    number: '01',
    title: 'Procurement Overview',
    description: 'Purchase value, quantity, vendor mix, and material or plant distribution.',
    categoryId: 'spend-overview',
    category: 'Spend overview',
    tag: 'PO',
    transaction: 'po',
    metric: 'poTotal',
    dimension: 'vendorName',
    summaryTable: 'poItems',
    requiredFields: ['poNumber', 'poItem', 'poTotal'],
    anyOfFields: [['vendorId', 'vendorName']],
    dateField: 'poDate',
    tableFields: ['poNumber', 'poItem', 'plant', 'vendorId', 'vendorName', 'material', 'materialDescription', 'materialGroup', 'poDate', 'poQuantity', 'poTotal', 'currency'],
    filterFields: ['plant', 'vendorId', 'vendorRegion', 'material', 'materialGroup', 'poNumber', 'documentType', 'currency'],
    chartDimensions: ['vendorName', 'plant', 'materialGroup', 'material'],
    metrics: [
      { key: 'poTotal', label: 'PO value', kind: 'currency', fields: ['poTotal'] },
      { key: 'recordCount', label: 'PO items', kind: 'count', fields: [] },
      { key: 'poQuantity', label: 'Ordered quantity', kind: 'number', fields: ['poQuantity'] },
      { key: 'vendorCount', label: 'Vendors', kind: 'distinct', fields: ['vendorId', 'vendorName'] },
    ],
  },
  {
    id: 'supplier-performance',
    number: '02',
    title: 'Supplier Performance',
    description: 'Compare vendor purchasing, receipt, and invoice activity by source currency.',
    categoryId: 'supplier-performance',
    category: 'Supplier performance',
    tag: 'Vendor',
    transaction: 'po',
    metric: 'poTotal',
    dimension: 'vendorName',
    summaryTable: 'vendorPerformance',
    requiredFields: ['poNumber', 'poItem', 'poTotal'],
    anyOfFields: [['vendorId', 'vendorName']],
    dateField: false,
    tableFields: ['vendorId', 'vendorName', 'vendorRegion', 'currency', 'poItemCount', 'poTotal', 'poQuantity', 'grnCount', 'grnValue', 'grnQuantity', 'miroCount', 'miroValue', 'gst'],
    filterFields: ['vendorId', 'vendorRegion', 'currency'],
    chartDimensions: ['vendorName', 'vendorRegion'],
    metrics: [
      { key: 'poTotal', label: 'PO value', kind: 'currency', fields: ['poTotal'] },
      { key: 'grnValue', label: 'GRN value', kind: 'currency', fields: ['grnValue'] },
      { key: 'miroValue', label: 'MIRO value', kind: 'currency', fields: ['miroValue'] },
      { key: 'recordCount', label: 'PO items', kind: 'count', fields: [] },
    ],
  },
  {
    id: 'order-fulfillment',
    number: '03',
    title: 'PO & Receipt Fulfillment',
    description: 'Compare ordered and cumulative GRN quantities, including reversals and returns.',
    categoryId: 'order-fulfillment',
    category: 'Order fulfillment',
    tag: 'GRN',
    transaction: 'po',
    metric: 'pendingQuantity',
    dimension: 'vendorName',
    summaryTable: 'poGrnMiro',
    requiredFields: ['poNumber', 'poItem', 'poQuantity', 'grnNumber', 'grnItem', 'grnQuantity'],
    anyOfFields: [],
    dateField: 'poDate',
    tableFields: ['poNumber', 'poItem', 'plant', 'vendorId', 'vendorName', 'material', 'materialGroup', 'poDate', 'poQuantity', 'orderedQuantity', 'receivedQuantity', 'pendingQuantity', 'grnNumbers', 'grnCount'],
    filterFields: ['plant', 'vendorId', 'material', 'materialGroup', 'poNumber'],
    chartDimensions: ['vendorName', 'plant', 'materialGroup', 'material'],
    metrics: [
      { key: 'poQuantity', label: 'Ordered quantity', kind: 'number', fields: ['poQuantity'] },
      { key: 'receivedQuantity', label: 'Received quantity', kind: 'number', fields: ['poQuantity', 'grnQuantity'] },
      { key: 'pendingQuantity', label: 'Pending quantity', kind: 'number', fields: ['poQuantity', 'grnQuantity'] },
      { key: 'recordCount', label: 'PO items', kind: 'count', fields: [] },
    ],
  },
  {
    id: 'invoice-tax',
    number: '04',
    title: 'Invoice, Tax & Payment',
    description: 'Review MIRO value, actual GST amounts, and recorded clearing days.',
    categoryId: 'invoice-tax',
    category: 'Invoice, tax & payment',
    tag: 'MIRO',
    transaction: 'miro',
    metric: 'miroValue',
    dimension: 'vendorName',
    summaryTable: 'miroDocuments',
    requiredFields: ['miroValue'],
    anyOfFields: [['miroNumber', 'miroFiDocument', 'invoiceNumber']],
    dateField: 'miroPostingDate',
    tableFields: ['vendorId', 'vendorName', 'vendorRegion', 'invoiceNumber', 'invoiceDate', 'miroNumber', 'miroFiDocument', 'miroDocumentDate', 'miroPostingDate', 'currency', 'miroValue', 'miroTaxCode', 'miroCgst', 'miroSgst', 'miroUgst', 'miroIgst', 'clearingDate'],
    filterFields: ['plant', 'vendorId', 'vendorRegion', 'miroNumber', 'miroTaxCode', 'currency', 'paymentTerms'],
    chartDimensions: ['vendorName', 'miroTaxCode', 'currency'],
    metrics: [
      { key: 'miroValue', label: 'MIRO value', kind: 'currency', fields: ['miroValue'] },
      { key: 'gst', label: 'GST amount', kind: 'currency', fields: ['miroCgst', 'miroSgst', 'miroUgst', 'miroIgst'], anyOf: true },
      { key: 'clearingDays', label: 'Average clearing days', kind: 'average', fields: ['clearingDays'] },
      { key: 'recordCount', label: 'MIRO documents', kind: 'count', fields: [] },
    ],
  },
  {
    id: 'data-quality',
    number: '05',
    title: 'Exceptions & Data Quality',
    description: 'Prioritize data gaps, document linkage, duplicates, and receipt mismatches.',
    categoryId: 'data-quality',
    category: 'Exceptions & data quality',
    tag: 'Exceptions',
    transaction: 'po',
    metric: 'recordCount',
    dimension: 'exceptionType',
    summaryTable: 'qualityExceptions',
    requiredFields: ['poNumber', 'poItem'],
    anyOfFields: [],
    dateField: 'poDate',
    tableFields: ['exceptionType', 'severity', 'issueDetails', 'vendorId', 'vendorName', 'poNumber', 'poItem', 'grnNumber', 'grnItem', 'miroNumber', 'invoiceNumber', 'currency'],
    filterFields: ['plant', 'vendorId', 'material', 'poNumber', 'grnNumber', 'miroNumber', 'currency'],
    chartDimensions: ['exceptionType', 'severity'],
    metrics: [
      { key: 'recordCount', label: 'Exception records', kind: 'count', fields: [] },
      { key: 'poCount', label: 'Affected PO items', kind: 'distinct', fields: ['poNumber', 'poItem'] },
      { key: 'issueTypeCount', label: 'Exception types', kind: 'distinct', fields: ['exceptionType'] },
    ],
  },
  {
    id: 'tat-analysis',
    number: '06',
    title: 'TAT Analysis',
    description: 'Track elapsed days from requisition through supplier confirmation, receipt, invoice posting, and clearing when source dates exist.',
    categoryId: 'tat-analysis',
    category: 'Turnaround time',
    tag: 'TAT',
    transaction: 'po',
    metric: 'tatDays',
    dimension: 'tatStage',
    summaryTable: 'tatEvents',
    requiredFields: [],
    anyOfFields: [],
    availableIfAny: [
      ['prNumber', 'prDate', 'poNumber', 'poDate'],
      ['poNumber', 'poItem', 'poDate', 'vendorFinalizationDate'],
      ['poNumber', 'poItem', 'poDate', 'grnNumber', 'grnItem', 'grnDate'],
      ['poNumber', 'poItem', 'grnNumber', 'grnItem', 'grnDate', 'miroPostingDate'],
      ['miroPostingDate', 'clearingDate'],
    ],
    dateField: 'poDate',
    filterFields: ['plant', 'vendorId', 'vendorRegion'],
    chartDimensions: ['tatStage', 'vendorName'],
    tableFields: ['tatStage', 'startDate', 'endDate', 'tatDays', 'vendorId', 'vendorName', 'plant', 'prNumber', 'poNumber', 'poItem', 'vendorFinalizationDate', 'grnNumber', 'grnItem', 'grnDate', 'miroNumber', 'miroFiDocument', 'miroPostingDate', 'clearingDate'],
    metrics: [
      { key: 'tatDays', label: 'Average turnaround days', kind: 'average', fields: ['tatDays'] },
      { key: 'recordCount', label: 'Completed stage intervals', kind: 'count', fields: [] },
      { key: 'tatStageCount', label: 'TAT stages', kind: 'distinct', fields: ['tatStage'] },
    ],
  },
]

const FIELD_ALIASES = {
  plant: ['plant'],
  vendorId: ['vendor'],
  vendorName: ['name', 'vendorname'],
  vendorClass: ['vendorclass', 'gstvendorclass'],
  vendorRegion: ['venregion', 'venregion', 'region'],
  pan: ['panno', 'venpan', 'pan'],
  gstin: ['gstinno', 'vengstin', 'gstin'],
  msmeType: ['msmetype'],
  certificateDate: ['certificatedate'],
  msmeDescription: ['msmedescription'],
  msmeNumber: ['msmeno'],
  material: ['material'],
  materialDescription: ['matdescription', 'materialdescription'],
  materialGroup: ['materialgroup'],
  materialGroupDescription: ['materialdesc'],
  materialSubGroup: ['materialsubgroup'],
  materialSubGroupDescription: ['materialsubgroupd'],
  prNumber: ['prno'],
  prDate: ['prdate'],
  prItem: ['pritem'],
  prQuantity: ['prqty'],
  prSalesOrder: ['prsalesorderno'],
  vendorFinalizationDate: [
    'vendorfinalizationdate',
    'vendorconfirmationdate',
    'supplierconfirmationdate',
    'vendoracknowledgementdate',
    'vendoracknowledgmentdate',
    'supplieracknowledgementdate',
    'supplieracknowledgmentdate',
    'poacknowledgementdate',
    'poacknowledgmentdate',
  ],
  poNumber: ['pono'],
  poItem: ['poitemno'],
  documentType: ['doctype'],
  profitCenter: ['profitcenter'],
  paymentTerms: ['paymentterms'],
  poDate: ['podate'],
  poQuantity: ['poquantity'],
  poSalesOrder: ['posalesorder'],
  unitOfMeasure: ['pouom'],
  poExchangeRate: ['poexchangerate'],
  poBasic: ['pobasic'],
  poBasicCustomDuty: ['pobasiccustomduty'],
  poDiscount: ['podiscount'],
  carriageInward: ['carriageinward'],
  poFreight: ['pofrieght', 'pofreight'],
  poFreightGst: ['pofrieghtgst', 'pofreightgst'],
  poOtherCharges: ['poothercharges'],
  poInsurance: ['poinsuransecharges', 'poinsurancecharges'],
  poTaxCode: ['potaxcode'],
  poTaxCodeDescription: ['potaxcodedescript'],
  poCgst: ['pocgst'],
  poSgst: ['posgst'],
  poUgst: ['pougst'],
  poIgst: ['poigst'],
  poTotal: ['pototal'],
  dispatchMode: ['modeofdispatch'],
  dispatchDescription: ['modeofdispatchdes'],
  grnNumber: ['grno'],
  grnExchangeRate: ['grnexchangerate'],
  warehouse: ['wharehouselocation', 'warehouselocation'],
  grnItem: ['gritem'],
  grnFiDocument: ['grnfidoc'],
  movementType: ['mvt'],
  grnDate: ['grdate'],
  grnQuantity: ['grnqty'],
  grnSalesOrder: ['grnsalesorder'],
  grnValue: ['grnvalue'],
  invoiceNumber: ['invoiceno'],
  invoiceDate: ['invoicedt'],
  gateEntryNumber: ['gateentryno'],
  eWayBillNumber: ['ewaybillno'],
  miroNumber: ['mirono'],
  miroFiDocument: ['mirofidoc'],
  miroVendor: ['mirovendor'],
  miroVendorName: ['vendorname'],
  gstVendorClass: ['gstvendorclass'],
  miroPan: ['venpan'],
  miroGstin: ['vengstin'],
  hsnCode: ['hsncode'],
  miroDocumentDate: ['mirodocumentdate'],
  miroPostingDate: ['miropostingdate'],
  miroQuantity: ['miroqty'],
  miroValue: ['mirovalue'],
  currency: ['currency'],
  assessableValue: ['assessablevalue'],
  miroInsurance: ['miroinsurance'],
  miroBcd: ['mirobcd'],
  miroOtherCharges: ['miroothercharges'],
  miroFreight: ['mirofrieght', 'mirofreight'],
  miroFreightGst: ['mirofrieghtgst', 'mirofreightgst'],
  partyInvoiceNumber: ['miropartyinvoicen'],
  exchangeRate: ['exchg.rate', 'exchgrate'],
  convertedMiroValue: ['convmirovalue'],
  conversionCurrency: ['convcurr'],
  miroTaxCode: ['mirotaxcode'],
  miroTaxCodeDescription: ['mirotaxcodedesc.'],
  materialCharge: ['materialcharge'],
  materialTax: ['materialtax'],
  miroCgst: ['mirocgst'],
  miroSgst: ['mirosgst'],
  miroUgst: ['mirougst'],
  miroIgst: ['miroigst'],
  miroTotal: ['mirototal'],
  clearingDocumentNumber: ['clearingdocno'],
  clearingDate: ['clearingdocdate'],
  clearingDays: ['clearingdays'],
  creditAmount: ['creditamt.'],
  assetCode: ['assetcode'],
  incoterms: ['incoterms'],
  creditGstAmount: ['creditgstamt.'],
  poStatus: ['postatus', 'purchaseorderstatus'],
  outstandingAmount: ['outstandingamount', 'openamount'],
  paymentStatus: ['paymentstatus'],
  dueDate: ['duedate', 'paymentduedate'],
}

const DATE_FIELDS = new Set([
  'certificateDate',
  'prDate',
  'vendorFinalizationDate',
  'poDate',
  'grnDate',
  'invoiceDate',
  'miroDocumentDate',
  'miroPostingDate',
  'clearingDate',
])

const NUMBER_FIELDS = new Set(
  Object.keys(FIELD_ALIASES).filter(
    (field) =>
      field.toLowerCase().includes('quantity') ||
      field.toLowerCase().includes('value') ||
      field.toLowerCase().includes('rate') ||
      field.toLowerCase().includes('amount') ||
      field.toLowerCase().includes('charge') ||
      field.toLowerCase().includes('freight') ||
      field.toLowerCase().includes('insurance') ||
      field.toLowerCase().includes('duty') ||
      field.toLowerCase().includes('discount') ||
      field.toLowerCase().includes('tax') ||
      ['poBasic', 'poCgst', 'poSgst', 'poUgst', 'poIgst', 'miroCgst', 'miroSgst', 'miroUgst', 'miroIgst', 'miroBcd', 'miroTotal', 'poTotal', 'clearingDays'].includes(field),
  ),
)

const FIELD_LABELS = {
  plant: 'Plant',
  vendorId: 'Vendor',
  vendorName: 'Vendor name',
  vendorRegion: 'Vendor region',
  material: 'Material',
  materialGroup: 'Material group',
  prNumber: 'PR number',
  vendorFinalizationDate: 'Vendor finalization date',
  poNumber: 'PO number',
  grnNumber: 'GRN number',
  miroNumber: 'MIRO number',
  documentType: 'Document type',
  poTaxCode: 'PO tax code',
  miroTaxCode: 'MIRO tax code',
  hsnCode: 'HSN code',
  tatStage: 'TAT stage',
  startDate: 'Stage start date',
  endDate: 'Stage end date',
  tatDays: 'Elapsed days',
  currency: 'Currency',
  paymentTerms: 'Payment terms',
  warehouse: 'Warehouse',
  exceptionType: 'Exception type',
  severity: 'Severity',
  issueDetails: 'Issue details',
  poItemCount: 'PO items',
  grnCount: 'GRN documents',
  miroCount: 'MIRO documents',
}

function normalizeHeader(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function formatIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return ''
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

const ALIAS_LOOKUP = new Map(
  Object.entries(FIELD_ALIASES).flatMap(([field, aliases]) =>
    aliases.map((alias) => [normalizeHeader(alias), field]),
  ),
)

export const PROCUREMENT_FILTERS = [
  ['plant', 'Plant'],
  ['vendorId', 'Vendor'],
  ['vendorRegion', 'Vendor region'],
  ['material', 'Material'],
  ['materialGroup', 'Material group'],
  ['poNumber', 'PO number'],
  ['grnNumber', 'GRN number'],
  ['miroNumber', 'MIRO number'],
  ['documentType', 'Document type'],
  ['poTaxCode', 'PO tax code'],
  ['miroTaxCode', 'MIRO tax code'],
  ['currency', 'Currency'],
  ['warehouse', 'Warehouse'],
  ['paymentTerms', 'Payment terms'],
]

function reportTags(category, title) {
  const tags = new Set([category.tag])
  const text = `${category.name} ${title}`.toLowerCase()
  if (/\bpr\b|requisition/.test(text)) tags.add('PR')
  if (/\bpo\b|purchase|procurement/.test(text)) tags.add('PO')
  if (/\bgrn\b|\bgr\b|receipt|delivery|warehouse/.test(text)) tags.add('GRN')
  if (tags.has('GRN')) tags.add('MRN')
  if (/miro|invoice|payment|gst|tax|credit|clearing/.test(text)) tags.add('MIRO')
  if (/gst|tax|hsn/.test(text)) tags.add('GST')
  if (/vendor|supplier/.test(text)) tags.add('Vendor')
  if (/material/.test(text)) tags.add('Material')
  if (/plant/.test(text)) tags.add('Plant')
  if (/exception|missing|duplicate|mismatch|zero|compliance|quality/.test(text)) tags.add('Exceptions')
  if (/tat|turnaround/.test(text)) tags.add('TAT')
  return [...tags]
}

export function getSummaryTable(title, transaction) {
  const name = title.toLowerCase()
  if (/missing miro/.test(name)) return 'missingMiroItems'
  if (/invoice pending/.test(name)) return 'invoicePending'
  if (/missing invoice/.test(name)) return 'missingInvoiceDocuments'
  if (/pending grn|excess receipt|partial delivery|quantity mismatch|po vs grn quantity/.test(name)) {
    if (/duplicate grn/.test(name)) return 'duplicateGrnItems'
    return 'pendingGrnItems'
  }
  if (/duplicate po item/.test(name)) return 'duplicatePoItemRows'
  if (/duplicate invoice/.test(name)) return 'duplicateInvoices'
  if (/document linkage/.test(name)) return 'poGrnMiro'
  if (/invoice/.test(name) && transaction === 'miro') return 'invoiceDocuments'
  if (transaction === 'pr') return 'prItems'
  if (transaction === 'grn') return 'grnItems'
  if (transaction === 'miro') return 'miroDocuments'
  return 'poItems'
}

export function getReportRequirements(report) {
  const requiredFields = []
  const anyOfFields = []
  const keyFields = {
    po: ['poNumber', 'poItem'],
    pr: ['prNumber', 'prItem'],
    grn: ['grnNumber', 'grnItem'],
    miro: [],
  }[report.transaction]
  requiredFields.push(...keyFields)
  if (report.transaction === 'miro') {
    anyOfFields.push(['miroNumber', 'miroFiDocument', 'invoiceNumber'])
  }

  const metricFields = {
    poTotal: ['poTotal'],
    grnValue: ['grnValue'],
    miroValue: ['miroValue'],
    gst: [],
    creditGstAmount: ['creditGstAmount'],
    pendingQuantity: ['poQuantity', 'grnQuantity'],
    receivedQuantity: ['poQuantity', 'grnQuantity'],
    excessQuantity: ['poQuantity', 'grnQuantity'],
    quantityMismatch: ['poQuantity', 'grnQuantity'],
    grnQuantity: ['grnQuantity'],
    clearingDays: ['clearingDays'],
    freight: [],
    insurance: [],
    otherCharges: [],
    unitPrice: ['poTotal', 'poQuantity'],
    exchangeRate: [],
    recordCount: [],
  }[report.metric] ?? []
  requiredFields.push(...metricFields)
  if (report.metric === 'gst') anyOfFields.push(['miroCgst', 'miroSgst', 'miroUgst', 'miroIgst'])
  if (report.metric === 'freight') anyOfFields.push(['poFreight', 'miroFreight'])
  if (report.metric === 'insurance') anyOfFields.push(['poInsurance', 'miroInsurance'])
  if (report.metric === 'otherCharges') anyOfFields.push(['poOtherCharges', 'miroOtherCharges'])
  if (report.metric === 'exchangeRate') {
    anyOfFields.push(['exchangeRate', 'poExchangeRate', 'grnExchangeRate'])
  }

  const title = report.title.toLowerCase()
  if (report.dimension === 'vendorName') anyOfFields.push(['vendorName', 'vendorId'])
  else if (report.dimension === 'date') {
    requiredFields.push(
      report.transaction === 'miro'
        ? 'miroPostingDate'
        : report.transaction === 'grn'
          ? 'grnDate'
          : report.transaction === 'pr'
            ? 'prDate'
            : 'poDate',
    )
  } else {
    requiredFields.push(report.dimension)
  }
  if (/material group/.test(title)) requiredFields.push('materialGroup')
  if (/material/.test(title) && !/material group/.test(title)) requiredFields.push('material')
  if (/plant/.test(title)) requiredFields.push('plant')
  if (/region/.test(title)) requiredFields.push('vendorRegion')
  if (/monthly|trend|financial year/.test(title)) {
    requiredFields.push(
      report.transaction === 'miro'
        ? 'miroPostingDate'
        : report.transaction === 'grn'
          ? 'grnDate'
          : 'poDate',
    )
  }
  if (/invoice number|invoice register|invoice detection/.test(title)) requiredFields.push('invoiceNumber')
  if (/gstin/.test(title)) requiredFields.push('gstin')
  if (/hsn/.test(title)) requiredFields.push('hsnCode')
  if (/eway bill/.test(title)) requiredFields.push('eWayBillNumber')
  if (/gate entry/.test(title)) requiredFields.push('gateEntryNumber')
  if (/warehouse/.test(title)) requiredFields.push('warehouse')
  if (/payment terms/.test(title)) requiredFields.push('paymentTerms')
  if (/tax code|tax mismatch/.test(title)) anyOfFields.push(['poTaxCode', 'miroTaxCode'])
  if (/clearing days|aging|overdue|payment performance/.test(title)) {
    anyOfFields.push(['clearingDays', 'clearingDate'])
  }
  if (/missing miro/.test(title)) requiredFields.push('miroNumber')
  if (/missing gstin/.test(title)) requiredFields.push('gstin')
  if (/zero value miro/.test(title)) requiredFields.push('miroValue')
  if (/zero value po/.test(title)) requiredFields.push('poTotal')
  if (/duplicate grn/.test(title)) requiredFields.push('grnNumber')
  if (/duplicate po item/.test(title)) requiredFields.push('poNumber', 'poItem')
  if (/quantity mismatch/.test(title)) requiredFields.push('poQuantity', 'grnQuantity')
  if (/po vs grn quantity|pending grn|excess receipt|partial delivery/.test(title)) {
    requiredFields.push('poNumber', 'poItem', 'poQuantity', 'grnNumber', 'grnItem', 'grnQuantity')
  }
  if (/document linkage/.test(title)) requiredFields.push('poNumber', 'grnNumber', 'miroNumber')
  if (/miro vs grn/.test(title)) requiredFields.push('grnNumber', 'grnValue')
  if (/miro vs po/.test(title)) requiredFields.push('poNumber', 'poTotal')
  if (/purchase order status/.test(title)) requiredFields.push('poStatus')
  if (/delivery performance/.test(title)) {
    requiredFields.push('poDate', 'grnDate', 'poQuantity', 'grnQuantity')
  }
  if (/vendor outstanding|outstanding analysis/.test(title)) {
    requiredFields.push('outstandingAmount')
  }
  if (/overdue payment/.test(title)) requiredFields.push('paymentStatus', 'dueDate')
  if (/duplicate invoice/.test(title)) requiredFields.push('invoiceNumber')
  if (/tax mismatch/.test(title)) requiredFields.push('poTaxCode', 'miroTaxCode')

  return {
    requiredFields: [...new Set(requiredFields)],
    anyOfFields: anyOfFields.map((group) => [...new Set(group)]),
  }
}

export const PROCUREMENT_REPORTS = REPORT_SPECS.map((report) => ({
  ...report,
  tags: reportTags({ tag: report.tag, name: report.category }, report.title),
  lastRefresh: null,
}))

export const PROCUREMENT_CATEGORIES = CATEGORY_DEFINITIONS.map(
  ({ id, name, tag, reports }) => ({
    id,
    name,
    tag,
    count: reports.length,
  }),
)

export const PROCUREMENT_TAGS = [
  'PO',
  'PR',
  'GRN',
  'MRN',
  'MIRO',
  'GST',
  'Vendor',
  'Material',
  'Plant',
  'Finance',
  'Logistics',
  'Management',
  'Exceptions',
]

export function getProcurementField(header) {
  return ALIAS_LOOKUP.get(normalizeHeader(header)) ?? null
}

export function getProcurementFieldLabel(field) {
  return FIELD_LABELS[field] ?? field
}

export function isProcurementHeaderRow(headers) {
  const fields = new Set(headers.map(getProcurementField).filter(Boolean))
  return (
    fields.has('plant') &&
    (fields.has('vendorId') || fields.has('vendorName')) &&
    fields.has('poNumber') &&
    fields.has('poItem')
  )
}

export function normalizeProcurementCell(field, value, date1904 = false) {
  if (value == null || value === '') return ''
  if (DATE_FIELDS.has(field)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const wholeDays = Math.floor(value)
      const date = date1904
        ? new Date(Date.UTC(1904, 0, 1) + wholeDays * 86_400_000)
        : new Date(Date.UTC(1899, 11, 30) + wholeDays * 86_400_000)
      return date.toISOString().slice(0, 10)
    }
    const text = String(value).trim()
    const parsedDate = new Date(text)
    return Number.isNaN(parsedDate.getTime())
      ? text
      : formatIsoDate(parsedDate.getFullYear(), parsedDate.getMonth() + 1, parsedDate.getDate())
  }
  if (NUMBER_FIELDS.has(field)) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    const text = String(value).trim()
    if (!text) return ''
    const negative = /^\(.*\)$/.test(text)
    const parsed = Number(text.replace(/[(),₹$€£\s]/g, '').replace(/,/g, ''))
    return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : value
  }
  return String(value).trim()
}

export function getProcurementRowDate(row) {
  return row.miroPostingDate || row.grnDate || row.poDate || row.prDate || ''
}

export function getProcurementTransactionKey(row, transaction) {
  if (transaction === 'pr') return [row.prNumber, row.prItem].join('|')
  if (transaction === 'grn') return [row.grnNumber, row.grnItem].join('|')
  if (transaction === 'miro') {
    return [row.miroNumber || row.miroFiDocument, row.partyInvoiceNumber || row.invoiceNumber].join('|')
  }
  return [row.poNumber, row.poItem].join('|')
}

export function getProcurementMeasure(row, metric) {
  if (metric === 'gst') {
    return ['miroCgst', 'miroSgst', 'miroUgst', 'miroIgst']
      .reduce((sum, field) => sum + (Number(row[field]) || 0), 0)
  }
  if (metric === 'creditGstAmount') return Number(row.creditGstAmount) || 0
  if (metric === 'recordCount') return Number(row.duplicateCount ?? row.recordCount) || 1
  if (metric === 'pendingQuantity') {
    return row.pendingQuantity != null
      ? Number(row.pendingQuantity)
      : Math.max(0, (Number(row.poQuantity) || 0) - (Number(row.grnQuantity) || 0))
  }
  if (metric === 'receivedQuantity') return Number(row.receivedQuantity) || 0
  if (metric === 'excessQuantity') return Math.max(0, -(Number(row.pendingQuantity) || 0))
  if (metric === 'quantityMismatch') return Math.abs(Number(row.pendingQuantity) || 0)
  if (metric === 'deliveryRate') {
    const ordered = Number(row.poQuantity) || 0
    return ordered > 0 ? ((Number(row.receivedQuantity) || 0) / ordered) * 100 : 0
  }
  if (metric === 'grnQuantity') return Number(row.grnQuantity) || 0
  if (metric === 'clearingDays') {
    const value = Number(row.clearingDays)
    return Number.isFinite(value) && value >= 0 ? value : Number.NaN
  }
  if (metric === 'freight') {
    return Number(row.miroFreight) || Number(row.poFreight) || 0
  }
  if (metric === 'insurance') {
    return Number(row.miroInsurance) || Number(row.poInsurance) || 0
  }
  if (metric === 'otherCharges') {
    return Number(row.miroOtherCharges) || Number(row.poOtherCharges) || 0
  }
  if (metric === 'unitPrice') {
    const quantity = Number(row.poQuantity)
    return quantity > 0 ? (Number(row.poTotal) || 0) / quantity : 0
  }
  if (metric === 'exchangeRate') {
    return Number(row.exchangeRate) || Number(row.poExchangeRate) || Number(row.grnExchangeRate) || 0
  }
  const field = {
    poTotal: 'poTotal',
    grnValue: 'grnValue',
    miroValue: 'miroValue',
    quantity: 'poQuantity',
  }[metric]
  return Number(row[field]) || 0
}

export function getProcurementRowsForReport(rows, report) {
  const unique = new Map()
  for (const row of rows) {
    const key = getProcurementTransactionKey(row, report.transaction)
    const usableKey = key.replace(/\|/g, '').trim() ? key : `row-${row.rowNumber}`
    if (!unique.has(usableKey)) unique.set(usableKey, row)
  }
  return [...unique.values()]
}

function uniqueTransactionRows(rows, transaction, makeKey) {
  const unique = new Map()
  for (const row of rows) {
    const key = makeKey(row)
    if (!key.replace(/\|/g, '').trim()) {
      unique.set(`row-${row.rowNumber}`, { ...row })
      continue
    }
    const current = unique.get(key)
    if (!current) {
      unique.set(key, { ...row, sourceRowCount: 1 })
    } else {
      current.sourceRowCount += 1
      for (const [field, value] of Object.entries(row)) {
        // Keep document metadata from the first row, but retain source linkage fields
        // that may only be populated on another row for this same document.
        if ((current[field] == null || current[field] === '') && value !== '') {
          current[field] = value
        }
      }
    }
  }
  return [...unique.values()]
}

function groupSummary(rows, keyFor, labelField, metrics) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyFor(row) || `unspecified-${row.rowNumber}`
    let group = groups.get(key)
    if (!group) {
      group = {
        ...row,
        [labelField]: row[labelField] || 'Unspecified',
        recordCount: 0,
      }
      for (const metric of metrics) group[metric] = 0
      groups.set(key, group)
    }
    group.recordCount += 1
    for (const metric of metrics) {
      const value = Number(row[metric])
      if (Number.isFinite(value)) group[metric] += value
    }
  }
  return [...groups.values()]
}

function getElapsedDays(startDate, endDate) {
  const parse = (value) => {
    const text = String(value ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
    const timestamp = Date.parse(`${text}T00:00:00Z`)
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === text
      ? timestamp
      : null
  }
  const start = parse(startDate)
  const end = parse(endDate)
  if (start == null || end == null || end < start) return null
  return Math.round((end - start) / 86_400_000)
}

function movementSign(movementType) {
  const movement = String(movementType ?? '').trim()
  // Reversal/return movements observed in SAP extracts; movement conventions
  // can be customized, so unknown types retain their source quantity sign.
  return ['102', '106', '110', '122', '262', '602', '161'].includes(movement) ? -1 : 1
}

function getValidClearingDays(row) {
  return getElapsedDays(row.miroPostingDate, row.clearingDate)
}

function buildTatEvents(rows, grnItems, miroDocuments, sourceFields) {
  const events = []
  const seen = new Set()
  const addEvent = (stage, row, startDate, endDate, key) => {
    const tatDays = getElapsedDays(startDate, endDate)
    if (tatDays == null || seen.has(`${stage}|${key}`)) return
    seen.add(`${stage}|${key}`)
    events.push({ ...row, tatStage: stage, startDate, endDate, tatDays })
  }

  if (['prNumber', 'prDate', 'poNumber', 'poDate'].every((field) => sourceFields.has(field))) {
    for (const row of rows) {
      if (!row.prNumber || !row.poNumber) continue
      addEvent(
        'PR to PO',
        row,
        row.prDate,
        row.poDate,
        [row.prNumber, row.prItem, row.poNumber, row.poItem].join('|'),
      )
    }
  }
  if (['poNumber', 'poItem', 'poDate', 'vendorFinalizationDate'].every((field) => sourceFields.has(field))) {
    const poItems = uniqueTransactionRows(rows, 'po', (row) => [row.poNumber, row.poItem].join('|'))
    for (const row of poItems) {
      if (!row.poNumber) continue
      addEvent(
        'PO to vendor finalization',
        row,
        row.poDate,
        row.vendorFinalizationDate,
        [row.poNumber, row.poItem].join('|'),
      )
    }
  }
  if (['poNumber', 'poItem', 'poDate', 'grnNumber', 'grnItem', 'grnDate'].every((field) => sourceFields.has(field))) {
    for (const row of grnItems) {
      if (!row.poNumber || !row.grnNumber) continue
      addEvent(
        'PO to GRN/MRN',
        row,
        row.poDate,
        row.grnDate,
        [row.poNumber, row.poItem, row.grnNumber, row.grnItem].join('|'),
      )
    }
  }
  if (['poNumber', 'poItem', 'grnNumber', 'grnItem', 'grnDate', 'miroPostingDate'].every((field) => sourceFields.has(field))) {
    for (const row of rows) {
      if (!row.poNumber || !row.grnNumber || !(row.miroNumber || row.miroFiDocument)) continue
      addEvent(
        'GRN/MRN to MIRO invoice',
        row,
        row.grnDate,
        row.miroPostingDate,
        [row.poNumber, row.poItem, row.grnNumber, row.grnItem, row.miroNumber || row.miroFiDocument].join('|'),
      )
    }
  }
  if (sourceFields.has('miroPostingDate') && sourceFields.has('clearingDate')) {
    for (const row of miroDocuments) {
      if (!row.miroNumber && !row.miroFiDocument) continue
      addEvent(
        'MIRO invoice to clearing',
        row,
        row.miroPostingDate,
        row.clearingDate,
        row.miroNumber || row.miroFiDocument,
      )
    }
  }
  return events
}

export function buildProcurementSummaryTables(rows, availableFields) {
  const sourceFields = availableFields ?? new Set(Object.keys(rows[0] ?? {}))
  const poItems = uniqueTransactionRows(
    rows,
    'po',
    (row) => [row.poNumber, row.poItem].join('|'),
  )
  const prItems = uniqueTransactionRows(
    rows,
    'pr',
    (row) => [row.prNumber, row.prItem].join('|'),
  )
  const grnItems = uniqueTransactionRows(
    rows,
    'grn',
    (row) => [row.grnNumber, row.grnItem].join('|'),
  )
  const rowsWithMiro = rows.filter(
    (row) => row.miroNumber || row.miroFiDocument,
  )
  const miroDocuments = uniqueTransactionRows(
    rowsWithMiro,
    'miro',
    (row) => [row.miroNumber || row.miroFiDocument, row.partyInvoiceNumber || row.invoiceNumber].join('|'),
  )
  const invoiceDocuments = uniqueTransactionRows(
    rows.filter((row) => row.invoiceNumber),
    'invoice',
    (row) => [row.vendorId, row.invoiceNumber, row.invoiceDate].join('|'),
  )
  const missingInvoiceDocuments = miroDocuments.filter(
    (row) => !String(row.invoiceNumber ?? row.partyInvoiceNumber ?? '').trim(),
  )
  const invoicePending = invoiceDocuments.filter(
    (row) => !row.miroNumber && !row.miroFiDocument,
  )
  const miroPoKeys = new Set(
    miroDocuments
      .filter((row) => row.poNumber && row.poItem)
      .map((row) => [row.poNumber, row.poItem].join('|')),
  )
  const missingMiroItems = poItems.filter(
    (row) => row.poNumber && row.poItem && !miroPoKeys.has([row.poNumber, row.poItem].join('|')),
  )
  const exactRowGroups = new Map()
  for (const row of rows) {
    const signature = JSON.stringify(row.sourceValues ?? [])
    const existing = exactRowGroups.get(signature) ?? { ...row, duplicateCount: 0 }
    existing.duplicateCount += 1
    exactRowGroups.set(signature, existing)
  }
  const duplicateSourceRows = [...exactRowGroups.values()].filter((row) => row.duplicateCount > 1)
  const duplicateInvoicesByNumber = new Map()
  for (const row of miroDocuments) {
    const invoiceNumber = String(row.invoiceNumber ?? row.partyInvoiceNumber ?? '').trim()
    if (!invoiceNumber) continue
    const key = `${row.vendorId ?? ''}|${invoiceNumber}`
    const existing = duplicateInvoicesByNumber.get(key) ?? { ...row, duplicateCount: 0 }
    existing.duplicateCount += 1
    duplicateInvoicesByNumber.set(key, existing)
  }

  const grnQuantityByPoItem = new Map()
  const distinctSourceMovements = new Map()
  for (const row of rows) {
    if (!row.grnNumber || !row.grnItem) continue
    distinctSourceMovements.set(JSON.stringify(row.sourceValues ?? row), row)
  }
  for (const row of distinctSourceMovements.values()) {
    const key = [row.poNumber, row.poItem].join('|')
    if (!key.replace(/\|/g, '').trim()) continue
    const current = grnQuantityByPoItem.get(key) ?? 0
    const quantity = Number(row.grnQuantity) || 0
    const sign = movementSign(row.movementType)
    grnQuantityByPoItem.set(key, current + (sign < 0 && quantity > 0 ? -quantity : quantity))
  }
  const pendingGrnItems = poItems.map((row) => {
    const key = [row.poNumber, row.poItem].join('|')
    const orderedQuantity = Number(row.poQuantity) || 0
    const receivedQuantity = grnQuantityByPoItem.get(key) ?? 0
    return {
      ...row,
      orderedQuantity,
      receivedQuantity,
      pendingQuantity: orderedQuantity - receivedQuantity,
      fulfillmentRate: orderedQuantity > 0 ? (receivedQuantity / orderedQuantity) * 100 : null,
    }
  })
  const pendingByPoItem = new Map(
    pendingGrnItems.map((row) => [[row.poNumber, row.poItem].join('|'), row]),
  )
  const grnByPoItem = new Map()
  for (const row of grnItems) {
    const key = [row.poNumber, row.poItem].join('|')
    if (!key.replace(/\|/g, '').trim()) continue
    const group = grnByPoItem.get(key) ?? { documents: new Set(), rows: [] }
    group.documents.add(row.grnNumber)
    group.rows.push(row)
    grnByPoItem.set(key, group)
  }
  const miroByPoItem = new Map()
  for (const row of miroDocuments) {
    const key = [row.poNumber, row.poItem].join('|')
    if (!key.replace(/\|/g, '').trim()) continue
    const group = miroByPoItem.get(key) ?? { documents: new Set(), rows: [] }
    group.documents.add(row.miroNumber || row.miroFiDocument)
    group.rows.push(row)
    miroByPoItem.set(key, group)
  }
  const poGrnMiro = poItems.map((row) => {
    const key = [row.poNumber, row.poItem].join('|')
    const receipts = grnByPoItem.get(key)
    const invoices = miroByPoItem.get(key)
    const fulfillment = pendingByPoItem.get(key)
    return {
      ...row,
      grnNumbers: [...(receipts?.documents ?? [])].filter(Boolean).join(', '),
      grnCount: receipts?.documents.size ?? 0,
      orderedQuantity: fulfillment?.orderedQuantity ?? 0,
      receivedQuantity: fulfillment?.receivedQuantity ?? 0,
      pendingQuantity: fulfillment?.pendingQuantity ?? 0,
      miroNumbers: [...(invoices?.documents ?? [])].filter(Boolean).join(', '),
      miroCount: invoices?.documents.size ?? 0,
    }
  })

  const purchaseMetrics = ['poTotal', 'poQuantity', 'poDiscount', 'poFreight', 'poInsurance', 'poOtherCharges']
  const receiptMetrics = ['grnValue', 'grnQuantity']
  const invoiceMetrics = [
    'miroValue', 'convertedMiroValue', 'miroQuantity', 'miroTotal',
    'miroCgst', 'miroSgst', 'miroUgst', 'miroIgst',
  ]
  const groupBy = (source, field, metrics) =>
    groupSummary(
      source,
      (row) => `${String(row[field] ?? '')}|${String(row.currency ?? '')}`,
      field,
      metrics,
    )
  const monthBy = (source, dateField, metrics) =>
    groupSummary(
      source,
      (row) => `${String(row[dateField] ?? '').slice(0, 7)}|${String(row.currency ?? '')}`,
      dateField,
      metrics,
    ).map((group) => ({
      ...group,
      [dateField]: String(group[dateField] ?? '').slice(0, 7),
    }))

  const invoicesWithInvoiceNumber = invoiceDocuments.filter((row) => row.invoiceNumber)
  const settlementDocuments = miroDocuments.map((row) => ({
    ...row,
    clearingDays: getValidClearingDays(row),
    isCleared: Boolean(row.clearingDate || row.clearingDocumentNumber),
    isValidSettlement: getValidClearingDays(row) != null,
  }))
  const settlementMetrics = [
    'miroValue', 'convertedMiroValue', 'miroQuantity', 'miroTotal',
    'miroCgst', 'miroSgst', 'miroUgst', 'miroIgst', 'clearingDays',
  ]
  const duplicateInvoices = [...duplicateInvoicesByNumber.values()].filter((row) => row.duplicateCount > 1)
  const duplicateGrnItems = duplicateSourceRows.filter((row) => row.grnNumber && row.grnItem)
  const duplicatePoItemRows = duplicateSourceRows.filter((row) => row.poNumber && row.poItem)
  const gstByVendor = groupBy(miroDocuments, 'vendorId', invoiceMetrics)
  const gstByTax = groupBy(miroDocuments, 'miroTaxCode', invoiceMetrics)
  const vendorPerformanceGroups = new Map()
  const getVendorGroup = (row) => {
    const vendorKey = row.vendorId || row.vendorName || `unspecified-${row.rowNumber}`
    const currency = row.currency || row.conversionCurrency || 'Unspecified currency'
    const key = `${vendorKey}|${currency}`
    let group = vendorPerformanceGroups.get(key)
    if (!group) {
      group = {
        ...row,
        vendorId: row.vendorId || '',
        vendorName: row.vendorName || row.vendorId || 'Unspecified',
        currency,
        poItemCount: 0,
        poTotal: 0,
        poQuantity: 0,
        grnCount: 0,
        grnValue: 0,
        grnQuantity: 0,
        miroCount: 0,
        miroValue: 0,
        gst: 0,
      }
      vendorPerformanceGroups.set(key, group)
    }
    return group
  }
  for (const row of poItems) {
    const group = getVendorGroup(row)
    group.poItemCount += 1
    group.poTotal += Number(row.poTotal) || 0
    group.poQuantity += Number(row.poQuantity) || 0
  }
  for (const row of grnItems) {
    const group = getVendorGroup(row)
    group.grnCount += 1
    group.grnValue += Number(row.grnValue) || 0
    group.grnQuantity += Number(row.grnQuantity) || 0
  }
  for (const row of miroDocuments) {
    const group = getVendorGroup(row)
    group.miroCount += 1
    group.miroValue += Number(row.miroValue) || 0
    group.gst += ['miroCgst', 'miroSgst', 'miroUgst', 'miroIgst']
      .reduce((sum, field) => sum + (Number(row[field]) || 0), 0)
  }
  const qualityExceptions = []
  const addException = (type, row, severity, details) => {
    qualityExceptions.push({
      ...row,
      exceptionType: type,
      severity,
      issueDetails: details,
    })
  }
  if (sourceFields.has('miroNumber') || sourceFields.has('miroFiDocument')) {
    for (const row of missingMiroItems) {
      addException('Missing MIRO link', row, 'High', 'PO item has no linked MIRO document in this workbook.')
    }
  }
  if (sourceFields.has('invoiceNumber') || sourceFields.has('partyInvoiceNumber')) {
    for (const row of missingInvoiceDocuments) {
      addException('Missing invoice number', row, 'Medium', 'MIRO document has no supplier invoice number.')
    }
  }
  if (sourceFields.has('gstin') || sourceFields.has('miroGstin')) {
    const missingGstinVendors = new Map()
    for (const row of rows) {
      if (String(row.gstin ?? row.miroGstin ?? '').trim()) continue
      const vendorKey = row.vendorId || row.vendorName || `row-${row.rowNumber}`
      if (!missingGstinVendors.has(vendorKey)) missingGstinVendors.set(vendorKey, row)
    }
    for (const row of missingGstinVendors.values()) {
      addException('Missing GSTIN', row, 'Medium', 'Vendor GSTIN is blank in the uploaded source.')
    }
  }
  if (sourceFields.has('poTotal')) {
    for (const row of poItems) {
      if (row.poTotal !== '' && row.poTotal != null && Number(row.poTotal) === 0) {
        addException('Zero-value PO item', row, 'Medium', 'PO item has an explicit zero value.')
      }
    }
  }
  if (sourceFields.has('miroValue')) {
    for (const row of miroDocuments) {
      if (row.miroValue !== '' && row.miroValue != null && Number(row.miroValue) === 0) {
        addException('Zero-value MIRO', row, 'Medium', 'MIRO document has an explicit zero value.')
      }
    }
  }
  for (const row of duplicateInvoices) {
    addException('Duplicate invoice', row, 'High', `${row.duplicateCount} MIRO documents share a vendor and invoice number.`)
  }
  for (const row of duplicateGrnItems) {
    addException('Duplicate GRN row', row, 'High', `${row.duplicateCount} identical source rows were found.`)
  }
  for (const row of duplicatePoItemRows) {
    addException('Duplicate PO item row', row, 'High', `${row.duplicateCount} identical source rows were found.`)
  }
  for (const row of pendingGrnItems) {
    if (row.pendingQuantity > 0) {
      addException('Pending GRN quantity', row, 'Medium', 'Ordered quantity exceeds linked valid GRN quantity.')
    } else if (row.pendingQuantity < 0) {
      addException('Excess GRN quantity', row, 'High', 'Linked valid GRN quantity exceeds the PO quantity.')
    }
    if (row.fulfillmentRate != null && row.fulfillmentRate > 100) {
      addException('Receipt above ordered quantity', row, 'High', `Net receipt is ${row.fulfillmentRate.toFixed(1)}% of ordered quantity.`)
    }
  }
  const tatEvents = buildTatEvents(rows, grnItems, miroDocuments, sourceFields)

  const fulfillmentAnalytics = {
    orderedItemCount: pendingGrnItems.length,
    fullyReceivedCount: pendingGrnItems.filter((row) => row.pendingQuantity <= 0 && row.orderedQuantity > 0).length,
    partiallyReceivedCount: pendingGrnItems.filter((row) => row.receivedQuantity > 0 && row.pendingQuantity > 0).length,
    notReceivedCount: pendingGrnItems.filter((row) => row.receivedQuantity <= 0 && row.orderedQuantity > 0).length,
    pendingQuantity: pendingGrnItems.reduce((sum, row) => sum + Math.max(0, row.pendingQuantity), 0),
    excessQuantity: pendingGrnItems.reduce((sum, row) => sum + Math.max(0, -row.pendingQuantity), 0),
    averageCompletionRate: pendingGrnItems.filter((row) => row.fulfillmentRate != null).length
      ? pendingGrnItems.filter((row) => row.fulfillmentRate != null)
        .reduce((sum, row) => sum + row.fulfillmentRate, 0) /
          pendingGrnItems.filter((row) => row.fulfillmentRate != null).length
      : null,
  }
  const settlementAnalytics = {
    invoiceCount: settlementDocuments.length,
    clearedCount: settlementDocuments.filter((row) => row.isCleared).length,
    openCount: settlementDocuments.filter((row) => !row.isCleared).length,
    invalidIntervalCount: miroDocuments.filter((row) => {
      const importedDays = Number(row.clearingDays)
      return (row.miroPostingDate && row.clearingDate && getElapsedDays(row.miroPostingDate, row.clearingDate) == null) ||
        (Number.isFinite(importedDays) && importedDays < 0)
    }).length,
    averageClearingDays: (() => {
      const valid = settlementDocuments.map((row) => row.clearingDays).filter((days) => days != null)
      return valid.length ? valid.reduce((sum, days) => sum + days, 0) / valid.length : null
    })(),
  }

  return {
    poItems,
    prItems,
    grnItems,
    miroDocuments,
    invoiceDocuments,
    missingInvoiceDocuments,
    invoicePending,
    missingMiroItems,
    invoicesWithInvoiceNumber,
    pendingGrnItems,
    poGrnMiro,
    duplicateInvoices,
    duplicateGrnItems,
    duplicatePoItemRows,
    purchaseByVendor: groupBy(poItems, 'vendorId', purchaseMetrics),
    vendorPerformance: [...vendorPerformanceGroups.values()],
    settlementDocuments,
    fulfillmentAnalytics,
    settlementAnalytics,
    purchaseByMaterial: groupBy(poItems, 'material', purchaseMetrics),
    purchaseByMaterialGroup: groupBy(poItems, 'materialGroup', purchaseMetrics),
    purchaseByPlant: groupBy(poItems, 'plant', purchaseMetrics),
    grnByVendor: groupBy(grnItems, 'vendorId', receiptMetrics),
    warehouseGrn: groupBy(grnItems, 'warehouse', receiptMetrics),
    miroByVendor: groupBy(settlementDocuments, 'vendorId', settlementMetrics),
    gstByVendor: groupBy(miroDocuments, 'vendorId', invoiceMetrics),
    gstByTax: groupBy(miroDocuments, 'miroTaxCode', invoiceMetrics),
    monthlyPurchase: monthBy(poItems, 'poDate', purchaseMetrics),
    monthlyGrn: monthBy(grnItems, 'grnDate', receiptMetrics),
    monthlyMiro: monthBy(miroDocuments, 'miroPostingDate', invoiceMetrics),
    qualityExceptions,
    tatEvents,
    sourceRecordCount: rows.length,
  }
}

export function getAvailableProcurementReports(reports, availableFields) {
  return reports.filter((report) =>
    report.requiredFields.every((field) => availableFields.has(field)) &&
    report.anyOfFields.every((group) => group.some((field) => availableFields.has(field))) &&
    (!report.availableIfAny ||
      report.availableIfAny.some((group) => group.every((field) => availableFields.has(field)))),
  )
}

export const PROCUREMENT_SOURCE_COLUMNS = Object.keys(FIELD_ALIASES)
