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

let tray = null;
let loggedInUser = null;
let timerStatus = false;
let window = null;
let loginwindow = null;

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
//autoUpdater.autoDownload = false;

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
            { label: 'Tray Nicht Einrichten', click: () =>
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
            { label: 'mitarbeiter-portal2', click: () => shell.openExternal('http://localhost:5173/#/home') },
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

app.whenReady().then(async () => {

    console.log("Checking for updates…");
    autoUpdater.checkForUpdatesAndNotify();

    const autoLoginResult = await AccountManager.tryAutoLogin();

    if (autoLoginResult && autoLoginResult.success) {
        loggedInUser = autoLoginResult.account || AccountManager.accountName || 'User';
        console.log('Auto-login succeeded for', loggedInUser);
        await autoUpdater.checkForUpdatesAndNotify();
    } else {
        loggedInUser = null;
        console.log('No auto-login.');
    }
    autoUpdater.on("checking-for-update", () => console.log("Checking for update..."));
    autoUpdater.on("update-available", (info) => console.log("Update available.", info));
    autoUpdater.on("update-not-available", (info) => console.log("No Recent Updates available.", info));
    autoUpdater.on('update-downloaded', () => {
        autoUpdater.quitAndInstall();
    })
    await createTray();

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


//WIP