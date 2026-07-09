import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { googleSheetService } from './services/googleSheetService';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const isDev = !app.isPackaged;
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: '간이 POS 시스템',
  });

  mainWindow.setMenu(null);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// saveReceiptToExcel() is deprecated. Replacing with googleSheetService.appendReceipt().

ipcMain.handle('get-products', async () => {
  try {
    return await googleSheetService.getProducts();
  } catch (err: any) {
    console.error('Failed to get products via IPC:', err);
    throw new Error('Unable to load products.');
  }
});

ipcMain.handle('save-receipt', async (_event, receipt) => {
  console.log('\n[LOG 4] ipcMain.handle(\'save-receipt\') 요청 수신');
  console.log('\n[LOG 5] 수신된 Receipt 객체:');
  console.log(JSON.stringify(receipt, null, 2));
  console.log('');
  
  try {
    const res = await googleSheetService.appendReceipt(receipt);
    console.log('[LOG 11] 완료 - 매출 기록 절차 완료\n');
    return res;
  } catch (err: any) {
    console.error('IPC Handler error catch:');
    console.error(err);
    if (err && err.stack) {
      console.error(err.stack);
    }
    return { success: false, error: err.message || 'Unknown error' };
  }
});

ipcMain.handle('get-sales', async () => {
  try {
    return await googleSheetService.getSales();
  } catch (err: any) {
    console.error('Failed to get sales via IPC:', err);
    throw new Error('Unable to load sales.');
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
