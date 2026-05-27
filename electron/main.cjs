const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let backendProcess = null;

function resourcePath(...parts) {
  return isDev ? path.join(__dirname, '..', ...parts) : path.join(process.resourcesPath, ...parts);
}

function ensureUserDataFolders() {
  const uploadDir = path.join(app.getPath('userData'), 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  return { uploadDir };
}

function startBundledBackend() {
  if (isDev) return;

  const serverEntry = resourcePath('backend', 'server.cjs');
  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox('Backend missing', `Could not find bundled server at ${serverEntry}`);
    return;
  }

  const { uploadDir } = ensureUserDataFolders();
  const serverCwd = app.getPath('userData');
  const userEnvPath = path.join(app.getPath('userData'), 'server.env');

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: process.env.PORT || '5000',
    CLIENT_URL: 'http://localhost:5173,http://localhost:5174,file://,null',
    UPLOAD_DIR: uploadDir,
    AUTO_SEED_ON_START: 'true'
  };

  if (fs.existsSync(userEnvPath)) {
    for (const line of fs.readFileSync(userEnvPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const index = trimmed.indexOf('=');
      env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    }
  }

  backendProcess = spawn(process.execPath, [serverEntry], {
    cwd: serverCwd,
    env,
    windowsHide: true,
    stdio: 'ignore'
  });

  backendProcess.on('exit', () => {
    backendProcess = null;
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'StoreDesk POS',
    backgroundColor: '#f4f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(resourcePath('client', 'dist', 'index.html'));
  }
}

ipcMain.handle('print-invoice', async (event, invoiceHtml) => {
  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 700,
    webPreferences: { offscreen: true }
  });

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { margin: 0; background: white; }
          .invoice-print { width: 80mm; color: #000; background: #fff; font-family: "Courier New", monospace; font-size: 12px; padding: 4mm; }
          table { width: 100%; border-collapse: collapse; }
          .flex { display: flex; justify-content: space-between; }
          .text-center { text-align: center; }
          .font-bold { font-weight: 700; }
          .border-t { border-top: 1px dashed #000; }
          .border-y { border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
        </style>
      </head>
      <body>${invoiceHtml || ''}</body>
    </html>
  `;

  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  return new Promise((resolve) => {
    printWindow.webContents.print(
      {
        silent: false,
        printBackground: true,
        margins: { marginType: 'none' },
        pageSize: { width: 80000, height: 210000 }
      },
      (success, failureReason) => {
        printWindow.close();
        resolve({ ok: success, error: failureReason });
      }
    );
  });
});

app.whenReady().then(() => {
  startBundledBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
