const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getProducts: () => ipcRenderer.invoke('get-products'),
  saveReceipt: (receipt) => {
    console.log('[LOG 2] preload saveReceipt 호출됨');
    console.log('[LOG 3] ipcRenderer.invoke(\'save-receipt\') 호출 시작');
    return ipcRenderer.invoke('save-receipt', receipt);
  },
  onProductsUpdated: (callback) => {
    const subscription = (_event, products) => callback(products);
    ipcRenderer.on('products-updated', subscription);
    
    // Returns cleanup/unsubscribe function to prevent React memory leaks
    return () => {
      ipcRenderer.removeListener('products-updated', subscription);
    };
  }
});
