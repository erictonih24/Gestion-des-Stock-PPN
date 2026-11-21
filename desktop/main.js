'use strict';
// Coquille Electron : ouvre le serveur Stock PPN dans une fenêtre dédiée (mêmes comptes, mêmes droits).
// Adresse du serveur : variable STOCK_URL, ou http://localhost:3000 par défaut.
const { app, BrowserWindow, shell } = require('electron');
const URL_APP = process.env.STOCK_URL || 'http://localhost:3000';

function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 820, title: 'Stock PPN', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadURL(URL_APP + '/app');
  // Tout lien externe s'ouvre dans le navigateur, jamais dans l'application.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(URL_APP)) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on('did-fail-load', () => win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    '<body style="font-family:sans-serif;padding:3rem"><h2>Serveur injoignable</h2><p>Vérifiez que le serveur Stock PPN est démarré et que la connexion fonctionne.</p></body>')));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
