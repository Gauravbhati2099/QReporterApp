import { create } from 'zustand'

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

export const useAppStore = create((set) => ({
  isRestoring: true,
  rows: [],
  selections: initialSelections(),
  dateFrom: '',
  dateTo: '',
  groupBy: 'salesOrganization',
  query: '',
  tableFilters: {},
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
  setSelections: createFieldSetter(set, 'selections'),
  setDateFrom: createFieldSetter(set, 'dateFrom'),
  setDateTo: createFieldSetter(set, 'dateTo'),
  setGroupBy: createFieldSetter(set, 'groupBy'),
  setQuery: createFieldSetter(set, 'query'),
  setTableFilters: createFieldSetter(set, 'tableFilters'),
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
}))
