import { app, BrowserWindow, shell, ipcMain } from 'electron';
import * as path from 'path';
import { syncInventoryToExcel, getExcelFilePaths } from './excelSyncService';

let mainWindow: BrowserWindow | null = null;

// ponytail: packaged app reads/writes the two xlsx next to the .exe; switch to app.getPath('documents') if users want them elsewhere
const dataDir = () => (app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd());

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
      sandbox: true,
    },
    title: '간이 POS 시스템',
  });

  mainWindow.setMenu(null);

  // Open all target="_blank" and external links in the OS default browser instead of new Electron windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent navigation away from the local app origin
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (isDev && parsed.origin === 'http://localhost:5173') return;
      if (!isDev && parsed.protocol === 'file:') return;
    } catch (_) {}
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

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

app.whenReady().then(() => {
  ipcMain.handle('inventory:sync-excel', async (_, session) => {
    try {
      return await syncInventoryToExcel(session, dataDir());
    } catch (err: any) {
      console.error('[IPC] syncInventoryToExcel failed:', err);
      return {
        success: false,
        message: err?.message || '엑셀 파일 동기화 중 오류가 발생했습니다.',
        timestamp: new Date().toISOString(),
      };
    }
  });

  ipcMain.handle('inventory:open-file', async (_, type: 'bakery' | 'salepaper') => {
    try {
      const { bakeryPath, salePaperPath } = getExcelFilePaths(dataDir());
      const target = type === 'bakery' ? bakeryPath : salePaperPath;
      await shell.openPath(target);
      return true;
    } catch (err) {
      console.error('[IPC] openExcelFile failed:', err);
      return false;
    }
  });

  ipcMain.handle('inventory:get-paths', async () => {
    return getExcelFilePaths(dataDir());
  });

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
