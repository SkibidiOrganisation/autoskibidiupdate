const {
    app,
    BrowserWindow,
    Tray,
    Menu,
    nativeImage,
    shell,
    ipcMain,
    Notification,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log')
const path = require('path');
const AccountManager = require('./scripts/AccountManager');

const LoginPage = path.join(__dirname, 'pages', 'LoginPage.html');
const redirectPage = path.join(__dirname, 'pages', 'redirect.html');
const settingsPage = path.join(__dirname, 'pages', 'settings.html');
const updateProgressPage = path.join(__dirname, 'pages', 'update-progress.html');
const updateCheckPage = path.join(__dirname, 'pages', 'update-check.html');

let tray = null;
let loggedInUser = null;
let timerStatus = false;
let window = null;
let loginwindow = null;
let updateWindow = null;  // For the progress window
let updateCheckWindow = null;  // For the initial update check window

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Set autoDownload to false for manual control
autoUpdater.autoDownload = false;

// Add error handling for updater
autoUpdater.on('error', (error) => {
    console.error('Update error:', error);
    if (updateWindow && !updateWindow.isDestroyed()) {
        updateWindow.webContents.send('update-error', error.message);
    }
});

function showLoginNotification() {
    const notification = new Notification({
        title: AccountManager.isLoggedIn ? 'Login Erfolgreich ✅' : 'Du bist nun Abgemeldet ❌',
        body: AccountManager.isLoggedIn
            ? `Du bist nun eingeloggt als ${loggedInUser}`
            : 'Du hast dich abgemeldet.',
        silent: false,
        urgency: 'critical',
    });

    notification.show();
}

function createWindow(chosePage = LoginPage) {
    if (window && !window.isDestroyed()) {
        window.loadFile(chosePage);
        window.show();
        return window;
    }

    window = new BrowserWindow({
        width: 500,
        height: 700,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    window.loadFile(chosePage);

    window.on('close', (event) => {
        event.preventDefault();
        window.destroy();
        window = null;
    });

    window.on('blur', () => window.hide());

    window.show();
    return window;
}

function createUpdateProgressWindow() {
    if (updateWindow && !updateWindow.isDestroyed()) {
        updateWindow.show();
        return;
    }

    updateWindow = new BrowserWindow({
        width: 500,
        height: 400,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    updateWindow.loadFile(updateProgressPage);

    updateWindow.on('close', (event) => {
        event.preventDefault();
        app.quit();  // Quit app on progress window close
    });
}

function createUpdateCheckWindow() {
    if (updateCheckWindow && !updateCheckWindow.isDestroyed()) {
        updateCheckWindow.show();
        return;
    }

    updateCheckWindow = new BrowserWindow({
        width: 500,
        height: 700,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    updateCheckWindow.loadFile(updateCheckPage);

    updateCheckWindow.on('close', (event) => {
        event.preventDefault();
        proceedToApp();  // Proceed to tray on check window close (assume "later")
        updateCheckWindow.destroy();
        updateCheckWindow = null;
    });
}

async function createTray() {
    const trayIconPath = path.join(__dirname, 'assets/image.jpg');

    // Load image with nativeImage
    let image = nativeImage.createFromPath(trayIconPath);

    // If loading fails (e.g., file missing), fallback to empty image
    if (image.isEmpty()) {
        console.warn('Tray icon not found, using empty image.');
        image = nativeImage.createEmpty();
    }

    // Resize to 16x16
    image = image.resize({ width: 16, height: 16 });

    // Create or update tray
    if (!tray) {
        tray = new Tray(image);
        tray.setToolTip('GoDigital24 - Tray');
        tray.on('click', () => {
            if (!window || window.isDestroyed()) return;
            window.isVisible() ? window.hide() : window.show();
        });
    } else {
        tray.setImage(image);
    }

    const nameToShow = AccountManager.accountName || loggedInUser;

    let menuTemplate;

    if (!AccountManager.isLoggedIn) {
        menuTemplate = [
            { label: 'Tray Einrichten', click: () =>
                    window ? window.destroy() : createWindow(LoginPage)},
            { type: 'separator' },
            { label: 'Schließen', click: () => process.exit(0) },
        ];
    } else {
        menuTemplate = [
            { label: `Account: ${nameToShow}`, enabled: false },
            timerStatus
                ? {
                    label: 'Zeiterfassung Stoppen',
                    click: () => {
                        timerStatus = false;
                        createWindow(settingsPage);
                        createTray();
                    },
                }
                : {
                    label: 'Zeiterfassung Starten',
                    click: () => {
                        timerStatus = true;

                        if (window && !window.isDestroyed()) {
                            window.destroy();
                        }

                        createWindow(redirectPage);
                        createTray();
                    },
                },
            { type: 'separator' },
            { label: 'worker-portal', click: () => shell.openExternal('http://localhost:5173/#/home') },
            { type: 'separator' },

            {
                label: 'Account abmelden',
                click: async () => {
                    await AccountManager.logout();
                    loggedInUser = null;

                    if (window && !window.isDestroyed()) {
                        window.destroy();
                        window = null;
                    }

                    await createTray();
                    showLoginNotification();
                },
            },
            { label: 'Schließen', click: () => process.exit(0) },
        ];
    }

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    tray.setContextMenu(contextMenu);
}
ipcMain.on('login-success', async (event, data) => {
    AccountManager.isLoggedIn = true;
    AccountManager.accessToken = data.access_token || AccountManager.accessToken;
    loggedInUser = data.displayName || AccountManager.accountName || 'User';

    if (data.displayName) {
        AccountManager.accountName = data.displayName;
    }

    if (window && !window.isDestroyed()) {
        window.destroy();
        window = null;
    }

    showLoginNotification();
    await createTray();
});

// IPC to send progress to the update window
ipcMain.on('get-update-progress', (event) => {
    // If needed, but we'll send via 'update-progress' channel
});

// New IPC for update check from the check window
ipcMain.on('check-for-updates', async (event) => {
    console.log('Current app version:', app.getVersion());  // Log current version for debugging
    try {
        const checkResult = await autoUpdater.checkForUpdates();
        console.log('Check result:', checkResult);  // Log full result
        if (checkResult && checkResult.updateInfo && checkResult.updateInfo.version !== app.getVersion()) {  // Only if different version
            event.reply('update-check-result', { available: true, info: checkResult.updateInfo });
        } else {
            event.reply('update-check-result', { available: false });
        }
    } catch (error) {
        console.error('Check error:', error);
        event.reply('update-check-result', { available: false, error: error.message });
    }
});

// New IPC for user decision on update
ipcMain.on('install-update-now', async () => {
    if (updateCheckWindow && !updateCheckWindow.isDestroyed()) {
        updateCheckWindow.close();
    }
    createUpdateProgressWindow();
    try {
        const checkResult = await autoUpdater.checkForUpdates();
        if (checkResult && checkResult.updateInfo && checkResult.updateInfo.version !== app.getVersion()) {
            await autoUpdater.downloadUpdate();
            console.log('Download started');
        } else {
            throw new Error('No update available');
        }
    } catch (err) {
        console.error('Download failed:', err);
        if (updateWindow && !updateWindow.isDestroyed()) {
            updateWindow.webContents.send('update-error', err.message);
        }
    }
});

ipcMain.on('install-update-later', async () => {
    if (updateCheckWindow && !updateCheckWindow.isDestroyed()) {
        updateCheckWindow.close();
    }
    // Proceed to normal app flow
    await proceedToApp();
});

async function proceedToApp() {
    const autoLoginResult = await AccountManager.tryAutoLogin();

    if (autoLoginResult && autoLoginResult.success) {
        loggedInUser = autoLoginResult.account || AccountManager.accountName || 'User';
        console.log('Auto-login succeeded for', loggedInUser);
    } else {
        loggedInUser = null;
        console.log('No auto-login.');
    }

    await createTray();
}

app.whenReady().then(async () => {
    // Show the update check window on start
    createUpdateCheckWindow();

    // Auto-updater listeners (moved here, no auto-check)
    autoUpdater.on("checking-for-update", () => console.log("Checking for update..."));

    autoUpdater.on('download-progress', (progressObj) => {
        console.log(`Download progress: ${progressObj.percent}%`);
        if (updateWindow && !updateWindow.isDestroyed()) {
            updateWindow.webContents.send('update-progress', progressObj);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('Update downloaded', info);
        if (updateWindow && !updateWindow.isDestroyed()) {
            updateWindow.webContents.send('update-ready');
        }
        // Automatically install and restart
        autoUpdater.quitAndInstall(true, true);  // silent, restart
    });

    if (process.platform === 'darwin') app.dock.hide();

    app.on('activate', () => {
        if (!window || window.isDestroyed()) {
            createWindow(AccountManager.isLoggedIn ? redirectPage : LoginPage);
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});