import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getProducts: () => ipcRenderer.invoke('get-products'),
  saveReceipt: (receipt: any) => ipcRenderer.invoke('save-receipt', receipt),
  getSales: () => ipcRenderer.invoke('get-sales')
});
