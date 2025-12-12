const { ipcRenderer, shell } = require('electron');
const { sha512 } = require('js-sha512');
const AccountManager = require('../scripts/AccountManager');

const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');

//old
const loginBtnIconContainer = document.getElementById('loginBtnIconContainer'); // container we toggle

const loginBtnIcon = document.getElementById('loginBtnIcon');


const errorMsg = document.getElementById('errorMsg');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

function showButtonLoader() {
    loginBtn.disabled = true;
    loginBtn.classList.add("opacity-50", "cursor-not-allowed");

    loginBtnText.classList.add("invisible");
    loginBtnIconContainer.classList.remove("hidden");

    const icon = document.querySelector("#loginBtnIcon"); // <i> placeholder
    if (icon) {
        icon.classList.add("animate-spin-self"); // 🔥 apply animation TO SVG
    }

    if (window.lucide) window.lucide.createIcons();
}

function hideButtonLoader() {
    loginBtn.disabled = false;
    loginBtn.classList.remove("opacity-50", "cursor-not-allowed");
    loginBtnText.classList.remove("invisible");
    loginBtnIconContainer.classList.add("hidden");

    const icon = document.querySelector("#loginBtnIcon");
    if (icon) {
        icon.classList.remove("animate-spin-self");
    }
}

function triggerShake() {
    loginBtn.classList.add("animate-shake");
    setTimeout(() => loginBtn.classList.remove("animate-shake"), 500);
}

function markInputsInvalid() {
    usernameInput.classList.add("border-red-500");
    passwordInput.classList.add("border-red-500");
}
function clearInputStyle() {
    usernameInput.classList.remove("border-red-500");
    passwordInput.classList.remove("border-red-500");
}

async function withMinimumDelay(asyncOperation, ms) {
    const start = Date.now();
    const result = await asyncOperation();
    const elapsed = Date.now() - start;
    if (elapsed < ms) await new Promise(r => setTimeout(r, ms - elapsed));
    return result;
}


async function handleLogin() {
    clearInputStyle();
    errorMsg.classList.add("hidden");

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        errorMsg.textContent = "Bitte füllen Sie alle Felder aus.";
        errorMsg.classList.remove("hidden");
        markInputsInvalid();
        triggerShake();
        return;
    }

    showButtonLoader();

    try {
        const hashedPassword = sha512(password);

        const res = await withMinimumDelay(() =>
            fetch("http://localhost:3000/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mailAddress: username, password: hashedPassword })
            }), 1200
        );

        if (res.status === 401 || res.status === 400) {
            errorMsg.textContent = "Falsche E-Mail oder Passwort.";
            errorMsg.classList.remove("hidden");
            markInputsInvalid();
            triggerShake();
            return;
        }

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.access_token) {
            errorMsg.textContent = "Login fehlgeschlagen.";
            errorMsg.classList.remove("hidden");
            triggerShake();
            return;
        }

        let displayName = username;
        const who = await fetch("http://localhost:3000/auth/whoAmI", {
            headers: { "Authorization": `Bearer ${data.access_token}` }
        });
        if (who.ok) {
            const user = await who.json();
            displayName = user.firstname + " " + user.lastname || username;
        }

        await AccountManager.login(username, password, data.access_token, displayName);

        ipcRenderer.send("login-success", {
            access_token: data.access_token,
            displayName
        });

        window.close();

    } catch (err) {
        console.error(err);
        errorMsg.textContent = "Verbindungsfehler. Bitte später erneut versuchen.";
        errorMsg.classList.remove("hidden");
        triggerShake();
    } finally {
        hideButtonLoader();
    }
}

loginBtn.addEventListener("click", handleLogin);

window.addEventListener("DOMContentLoaded", () => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    setTimeout(() => {
        const loader = document.getElementById("pageLoader");
        if (loader) loader.style.display = "none";
    }, 600);
});
