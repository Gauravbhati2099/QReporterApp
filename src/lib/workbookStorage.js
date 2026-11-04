const DATABASE_NAME = 'qreporter-local'
const STORE_NAME = 'workbooks'
const WORKBOOK_KEY = 'latest'

function openDatabase() {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('This browser does not support local workbook storage.'))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open browser workbook storage.'))
    request.onblocked = () =>
      reject(new Error('Workbook storage is busy in another tab. Close other QReporter tabs and try again.'))
  })
}

async function runWorkbookTransaction(mode, action) {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    let result

    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Could not update browser workbook storage.'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('Browser workbook storage operation was cancelled.'))
    }

    try {
      result = action(store)
    } catch (error) {
      transaction.abort()
      reject(error)
    }
  })
}

export function saveWorkbook(file, sheetName) {
  return runWorkbookTransaction('readwrite', (store) =>
    store.put(
      {
        blob: file.slice(0, file.size, file.type),
        name: file.name,
        size: file.size,
        type: file.type,
        sheetName,
      },
      WORKBOOK_KEY,
    ),
  )
}

export async function loadWorkbook() {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(WORKBOOK_KEY)
    let result

    request.onsuccess = () => {
      result = request.result
    }
    transaction.oncomplete = () => {
      database.close()
      resolve(result ?? null)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Could not read the saved workbook.'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('Reading the saved workbook was cancelled.'))
    }
  })
}

export function clearWorkbookData() {
  return runWorkbookTransaction('readwrite', (store) => store.clear())
}

export function createWorkbookFile(savedWorkbook) {
  if (
    !savedWorkbook?.blob ||
    typeof savedWorkbook.name !== 'string' ||
    !(savedWorkbook.blob instanceof Blob)
  ) {
    throw new Error('The saved workbook is incomplete. Upload the XLSX again to replace it.')
  }

  return new File([savedWorkbook.blob], savedWorkbook.name, {
    type: savedWorkbook.type || savedWorkbook.blob.type,
  })
}
