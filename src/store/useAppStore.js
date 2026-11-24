import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const initialSelections = () => ({
  organizations: [],
  usages: [],
  currencies: [],
})

const getInitialTheme = () => {
  try {
    return window.localStorage.getItem('qreport-theme') === 'dark' ? 'dark' : 'light'
  } catch (error) {
    console.error('Unable to read the saved theme preference.', error)
    return 'light'
  }
}

const createFieldSetter = (set, field) => (value) =>
  set((state) => ({
    [field]: typeof value === 'function' ? value(state[field]) : value,
  }))

const QUOTATION_REPORTS = new Set([
  'salesOrganization', 'salesOrganizationName', 'salesDocumentTypeDescription', 'soldToPartyName', 'salesOffice',
  'salesGroup', 'salesDistrictName', 'salesDistrict', 'distributionChannelName', 'distributionChannel', 'divisionName', 'division',
  'materialDescription', 'material', 'plant', 'overallStatusDescription', 'referenceStatusDescription',
  'orderReasonDescription', 'rejectionReasonDescription', 'createdBy', 'usage', 'currency', 'trend',
])

export const useAppStore = create(persist((set) => ({
  isRestoring: true,
  rows: [],
  datasetType: 'quotation',
  summaryTables: null,
  selections: initialSelections(),
  dateFrom: '',
  dateTo: '',
  groupBy: 'salesOrganizationName',
  query: '',
  outlierFilter: 'all',
  percentileTail: 5,
  theme: getInitialTheme(),
  fileInfo: null,
  status: '',
  error: '',
  isReading: false,
  dragging: false,
  isPresenting: false,
  setIsRestoring: createFieldSetter(set, 'isRestoring'),
  setRows: createFieldSetter(set, 'rows'),
  setDatasetType: createFieldSetter(set, 'datasetType'),
  setSummaryTables: createFieldSetter(set, 'summaryTables'),
  setSelections: createFieldSetter(set, 'selections'),
  setDateFrom: createFieldSetter(set, 'dateFrom'),
  setDateTo: createFieldSetter(set, 'dateTo'),
  setGroupBy: createFieldSetter(set, 'groupBy'),
  setQuery: createFieldSetter(set, 'query'),
  setOutlierFilter: createFieldSetter(set, 'outlierFilter'),
  setPercentileTail: createFieldSetter(set, 'percentileTail'),
  setTheme: (theme) => {
    set({ theme })
    try {
      window.localStorage.setItem('qreport-theme', theme)
    } catch (error) {
      console.error('Unable to save the theme preference.', error)
    }
  },
  setFileInfo: createFieldSetter(set, 'fileInfo'),
  setStatus: createFieldSetter(set, 'status'),
  setError: createFieldSetter(set, 'error'),
  setIsReading: createFieldSetter(set, 'isReading'),
  setDragging: createFieldSetter(set, 'dragging'),
  setIsPresenting: createFieldSetter(set, 'isPresenting'),
}), {
  name: 'qreport-dashboard-state',
  version: 1,
  partialize: (state) => ({ groupBy: state.groupBy }),
  merge: (persistedState, currentState) => ({
    ...currentState,
    groupBy: persistedState?.groupBy === 'salesOrganization'
      ? 'salesOrganizationName'
      : QUOTATION_REPORTS.has(persistedState?.groupBy)
        ? persistedState.groupBy
        : currentState.groupBy,
  }),
}))
