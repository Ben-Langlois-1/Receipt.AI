const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('receiptDesktop', Object.freeze({
  copyText: text => ipcRenderer.invoke('receiptai:copy-report', text),
  status: () => ipcRenderer.invoke('receiptai:status'),
  request: request => ipcRenderer.invoke('receiptai:request', request),
  cancel: id => ipcRenderer.send('receiptai:cancel', id),
  retry: () => ipcRenderer.invoke('receiptai:retry'),
  useBundledModel: () => ipcRenderer.invoke('receiptai:reset-model'),
  chooseModel: () => ipcRenderer.invoke('receiptai:choose-model'),
  onStatus: callback => {
    const handler = (_event, status) => callback(status)
    ipcRenderer.on('receiptai:status-update', handler)
    return () => ipcRenderer.removeListener('receiptai:status-update', handler)
  },
}))
