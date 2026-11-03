export function readWorkbookInWorker(file) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workbook.worker.js', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event) => {
      worker.terminate()
      if (event.data.error) {
        reject(new Error(event.data.error))
      } else {
        resolve(event.data.result)
      }
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'The workbook could not be read in this browser.'))
    }

    worker.postMessage(file)
  })
}
