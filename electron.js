'use strict';

const electron = require('electron');
const path = require('path');
const log = require('./src/services/log');
const sqlInit = require('./src/services/sql_init');
const cls = require('./src/services/cls');
const url = require("url");
const port = require('./src/services/port');
const appIconService = require('./src/services/app_icon');
const windowStateKeeper = require('electron-window-state');

const app = electron.app;
const globalShortcut = electron.globalShortcut;

// Adds debug features like hotkeys for triggering dev tools and reload
require('electron-debug')();

appIconService.installLocalAppIcon();

// Prevent window being garbage collected
let mainWindow;

require('electron-dl')({ saveAs: true });

function onClosed() {
    // Dereference the window
    // For multiple windows store them in an array
    mainWindow = null;
}

async function createMainWindow() {
    await sqlInit.dbConnection;

    // if schema doesn't exist -> setup process
    // if schema exists, then we need to wait until the migration process is finished
    if (await sqlInit.schemaExists()) {
        await sqlInit.dbReady;
    }

    const mainWindowState = windowStateKeeper({
        // default window width & height so it's usable on 1600 * 900 display (including some extra panels etc.)
        defaultWidth: 1200,
        defaultHeight: 800
    });

    const win = new electron.BrowserWindow({
        x: mainWindowState.x,
        y: mainWindowState.y,
        width: mainWindowState.width,
        height: mainWindowState.height,
        title: 'Trilium Notes',
        webPreferences: {
            nodeIntegration: true
        },
        icon: path.join(__dirname, 'images/app-icons/png/256x256.png')
    });

    mainWindowState.manage(win);

    win.setMenuBarVisibility(false);
    win.loadURL('http://localhost:' + await port);
    win.on('closed', onClosed);

    win.webContents.on('new-window', (e, url) => {
        if (url !== win.webContents.getURL()) {
            e.preventDefault();
            require('electron').shell.openExternal(url);
        }
    });

    // prevent drag & drop to navigate away from trilium
    win.webContents.on('will-navigate', (ev, targetUrl) => {
        const parsedUrl = url.parse(targetUrl);

        // we still need to allow internal redirects from setup and migration pages
        if (parsedUrl.hostname !== 'localhost' || (parsedUrl.path && parsedUrl.path !== '/')) {
            ev.preventDefault();
        }
    });

    return win;
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (!mainWindow) {
        mainWindow = createMainWindow();
    }
});

app.on('ready', async () => {
    app.setAppUserModelId('com.github.zadam.trilium');

    mainWindow = await createMainWindow();

    const result = globalShortcut.register('CommandOrControl+Alt+P', cls.wrap(async () => {
        // window may be hidden / not in focus
        mainWindow.focus();

        mainWindow.webContents.send('create-day-sub-note');
    }));

    if (!result) {
        log.error("Could not register global shortcut CTRL+ALT+P");
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

require('./src/www');
