// scripts/AccountManager.js
const keytar = require('keytar');

class AccountManager {
    constructor() {
        this.serviceName = 'GoDigital24-Tray';
        this.accountName = null; // displayName (human-friendly) when logged in
        this.accessToken = null;
        this.isLoggedIn = false;
    }

    /**
     * Login and save credentials.
     * email: user email used for backend login
     * password: plain password (we store it in keytar JSON so auto-login can use it)
     * accessToken: optional JWT
     * displayName: optional human-friendly name (will be stored as keytar account)
     */
    async login(email, password, accessToken, displayName) {
        // choose displayName if provided, otherwise fallback to email
        this.accountName = displayName || email;
        this.accessToken = accessToken || this.accessToken;
        this.isLoggedIn = true;

        try {
            await this.saveCredentialsToKeychain(this.accountName, email, password);
            return { success: true, account: this.accountName };
        } catch (err) {
            console.error('AccountManager.login: save to keychain failed', err);
            return { success: false, error: err };
        }
    }

    /**
     * tryAutoLogin: looks up saved credentials and attempts to call login()
     * Returns { success: boolean, account?: displayName }
     */
    async tryAutoLogin() {
        try {
            const credentials = await this.getCredentialsFromKeychain();

            if (credentials) {
                // credentials: { account: displayName, data: { email, password } }
                console.log(`Found credentials for ${credentials.account}, attempting auto-login...`);

                // call login with stored email + password, and pass displayName so it gets stored as accountName
                const res = await this.login(
                    credentials.data.email,
                    credentials.data.password,
                    null,
                    credentials.account
                );
                return res;
            } else {
                console.log('No credentials found in Keychain.');
                return { success: false };
            }
        } catch (error) {
            console.error('Auto-login error:', error);
            return { success: false, error };
        }
    }

    async logout() {
        this.accessToken = null;
        this.isLoggedIn = false;
        try {
            if (this.accountName) {
                await keytar.deletePassword(this.serviceName, this.accountName);
            }
        } catch (err) {
            console.warn('deletePassword failed', err);
        }

        this.accountName = null;
        console.log('Logged out and credentials cleared.');
    }

    /**
     * Save credentials in keytar.
     * We store the displayName as the keytar account and JSON { email, password } as the password string.
     */
    async saveCredentialsToKeychain(displayName, email, password) {
        this.accountName = displayName;
        const payload = JSON.stringify({ email, password });
        return keytar.setPassword(this.serviceName, displayName, payload);
    }

    /**
     * Read credentials. Returns:
     *   { account: displayName, data: { email, password } } or null
     */
    async getCredentialsFromKeychain() {
        const credentials = await keytar.findCredentials(this.serviceName); // returns [{ account, password }, ...]
        if (credentials && credentials.length > 0) {
            const { account, password } = credentials[0];
            try {
                const data = JSON.parse(password);
                return { account, data };
            } catch (err) {
                // If password isn't JSON (older format), fall back to assuming account is email
                return {
                    account,
                    data: { email: account, password },
                };
            }
        }
        return null;
    }
}

module.exports = new AccountManager();
