const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  syncInventoryExcel: (session) => ipcRenderer.invoke('inventory:sync-excel', session),
  openExcelFile: (type) => ipcRenderer.invoke('inventory:open-file', type),
  getExcelPaths: () => ipcRenderer.invoke('inventory:get-paths'),
});
