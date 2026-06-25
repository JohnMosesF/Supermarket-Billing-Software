const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
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

function waitForUrl(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const deadline = Date.now() + timeout;

    const check = () => {
      const req = lib.request(parsed, { method: 'GET', timeout: 3000 }, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          res.resume();
          resolve();
        } else if (Date.now() < deadline) {
          setTimeout(check, 500);
        } else {
          reject(new Error(`Timeout waiting for ${url}`));
        }
      });

      req.on('error', () => {
        if (Date.now() < deadline) {
          setTimeout(check, 500);
        } else {
          reject(new Error(`Timeout waiting for ${url}`));
        }
      });
      req.on('timeout', () => {
        req.destroy();
      });
      req.end();
    };

    check();
  });
}

async function waitForDevServers() {
  if (!isDev) return;

  const frontEndUrl = process.env.VITE_DEV_SERVER_URL;
  const backendUrl = `http://127.0.0.1:${process.env.PORT || 5000}/api/health`;

  console.log('Waiting for dev servers:', { frontEndUrl, backendUrl });
  await Promise.all([waitForUrl(frontEndUrl), waitForUrl(backendUrl)]);
  console.log('Dev servers are ready');
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
const { createBillingWindow } = require('./electronWindowManager.js');
const { formatInvoiceHTML } = require('./thermalPrinter.cjs');

ipcMain.handle('create-billing-window', async (event, opts = {}) => {
  return createBillingWindow({ isDev, loadUrl: process.env.VITE_DEV_SERVER_URL, opts });
});

ipcMain.handle('print-invoice', async (event, invoiceHtml, options = {}) => {
  if (!invoiceHtml || typeof invoiceHtml !== 'string' || invoiceHtml.trim().length < 50) {
    return { ok: false, error: 'Invoice HTML is empty' };
  }

  // use thermal formatter if asked
  const html = options.useThermalFormatter ? formatInvoiceHTML(options.meta || {}, invoiceHtml) : invoiceHtml;

  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 700,
    webPreferences: { offscreen: true }
  });

  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  return new Promise((resolve) => {
    printWindow.webContents.print(
      {
        silent: options.silent !== undefined ? options.silent : true,
        printBackground: options.printBackground !== undefined ? options.printBackground : true,
        copies: Number(options.copies || 1),
        deviceName: options.deviceName || undefined,
        margins: { marginType: 'none' },
        pageSize: options.pageSize || { width: 80000, height: 210000 }
      },
      (success, failureReason) => {
        printWindow.close();
        resolve({ ok: success, error: failureReason });
      }
    );
  });
});

app.whenReady().then(async () => {
  if (isDev) {
    try {
      await waitForDevServers();
    } catch (error) {
      console.error('Dev server readiness check failed:', error);
      dialog.showErrorBox('Startup error', `Dev server startup failed: ${error.message}`);
      app.quit();
      return;
    }
  } else {
    startBundledBackend();
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
