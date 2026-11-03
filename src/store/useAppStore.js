import { create } from 'zustand'

const initialSelections = () => ({
  organizations: [],
  usages: [],
  currencies: [],
})

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
  theme: 'light',
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
  setTheme: createFieldSetter(set, 'theme'),
  setFileInfo: createFieldSetter(set, 'fileInfo'),
  setStatus: createFieldSetter(set, 'status'),
  setError: createFieldSetter(set, 'error'),
  setIsReading: createFieldSetter(set, 'isReading'),
  setDragging: createFieldSetter(set, 'dragging'),
  setIsPresenting: createFieldSetter(set, 'isPresenting'),
}))
