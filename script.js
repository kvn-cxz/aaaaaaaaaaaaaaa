
const SUPABASE_URL = "https://wnwybwewfnstoveamltg.supabase.co";
const SUPABASE_KEY = "sb_publishable_iPzIHFKMC8_58pUM2Qii6w_gebEGbsv";
const endpointExcel = "https://inventario-api-m60v.onrender.com";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const reader = new Html5Qrcode("reader");

const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
startBtn.disabled = true;
const status = document.getElementById("status");
const detected = document.getElementById("detected");
const history = document.getElementById("history");
const count = document.getElementById("count");
const saveStatus = document.getElementById("saveStatus");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const authStatus = document.getElementById("authStatus");

let running = false;
let records = [];
let lastCode = null;
let unlockTimer = null;
let currentSession = null;

async function actualizarSesion() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        authStatus.textContent = "No se pudo comprobar la sesión.";
        return;
    }

    currentSession = data.session;

    const conectado = Boolean(currentSession);
    loginBtn.disabled = conectado;
    logoutBtn.disabled = !conectado;
    emailInput.disabled = conectado;
    passwordInput.disabled = conectado;

    authStatus.textContent = conectado
        ? "Sesión iniciada. Ya puedes escanear códigos."
        : "Inicia sesión para conectar el inventario.";

    startBtn.disabled = !conectado || running;
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentSession = session;

    const conectado = Boolean(session);
    loginBtn.disabled = conectado;
    logoutBtn.disabled = !conectado;
    emailInput.disabled = conectado;
    passwordInput.disabled = conectado;

    authStatus.textContent = conectado
        ? "Sesión iniciada. Ya puedes escanear códigos."
        : "Inicia sesión para conectar el inventario.";

    startBtn.disabled = !conectado || running;
});

loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        authStatus.textContent = "Escribe tu correo y contraseña.";
        return;
    }

    loginBtn.disabled = true;
    authStatus.textContent = "Iniciando sesión...";

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        authStatus.textContent =
            "No se pudo iniciar sesión. Revisa tus datos.";
        loginBtn.disabled = false;
        return;
    }

    currentSession = data.session;
    passwordInput.value = "";
    await actualizarSesion();
});

logoutBtn.addEventListener("click", async () => {
    if (running) {
        try {
            await reader.stop();
        } catch (_) {
            // La cámara podría haberse detenido previamente.
        }

        running = false;
        clearTimeout(unlockTimer);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        status.textContent = "Cámara detenida.";
    }

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        authStatus.textContent =
            "No se pudo cerrar la sesión. Inténtalo de nuevo.";
        return;
    }

    currentSession = null;
    await actualizarSesion();
});

async function enviarAExcel(texto) {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error || !data.session) {
        saveStatus.textContent =
            "Debes iniciar sesión antes de enviar códigos.";
        return;
    }

    const accessToken = data.session.access_token;
    saveStatus.textContent = "Enviando código al inventario...";

    try {
        const respuesta = await fetch(`${endpointExcel}/scan`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify({ text: texto })
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(resultado.error || `Error HTTP ${respuesta.status}`);
        }

        saveStatus.textContent = "✓ Código enviado al inventario.";
    } catch (error) {
        console.error("Error al enviar el código:", error);
        saveStatus.textContent =
            "No se pudo guardar el código. Revisa la conexión.";
    }
}

function scheduleUnlock() {
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => {
        lastCode = null;
    }, 1200);
}

function addRecord(text) {
    if (text === lastCode) {
        scheduleUnlock();
        return;
    }

    lastCode = text;
    scheduleUnlock();

    const record = {
        number: records.length + 1,
        text,
        date: new Date().toLocaleString("es-MX")
    };

    records.push(record);
    detected.textContent = text;
    saveStatus.textContent = "Lectura agregada al historial.";

    const item = document.createElement("div");
    item.className = "record";

    const value = document.createElement("strong");
    value.textContent = `${record.number}. ${record.text}`;

    const date = document.createElement("small");
    date.textContent = record.date;

    item.append(value, date);
    history.prepend(item);
    count.textContent = records.length;

    enviarAExcel(text);
}

startBtn.addEventListener("click", async () => {
    if (running) return;

    const { data } = await supabaseClient.auth.getSession();

    if (!data.session) {
        status.textContent = "Inicia sesión antes de activar la cámara.";
        return;
    }

    startBtn.disabled = true;
    status.textContent = "Solicitando acceso a la cámara...";

    try {
        await reader.start(
            { facingMode: "environment" },
            {
                fps: 12,
                qrbox: (width, height) => {
                    const size = Math.floor(Math.min(width, height) * 0.7);
                    return { width: size, height: size };
                }
            },
            decodedText => addRecord(decodedText),
            () => {}
        );

        running = true;
        stopBtn.disabled = false;
        status.textContent =
            "Cámara activa. Apunta al siguiente código QR.";
    } catch (error) {
        console.error(error);
        status.textContent =
            "No se pudo abrir la cámara. Comprueba los permisos y HTTPS.";
        startBtn.disabled = false;
    }
});

stopBtn.addEventListener("click", async () => {
    if (!running) return;

    try {
        await reader.stop();
        running = false;
        clearTimeout(unlockTimer);
        startBtn.disabled = !currentSession;
        stopBtn.disabled = true;
        status.textContent = "Cámara detenida.";
    } catch (error) {
        status.textContent =
            "No se pudo detener la cámara correctamente.";
    }
});

function csvCell(value) {
    let text = String(value);

    if (/^[\s]*[=+\-@]/.test(text)) {
        text = "'" + text;
    }

    return '"' + text.replace(/"/g, '""') + '"';
}

document.getElementById("download").addEventListener("click", () => {
    const rows = [
        ["Número", "Texto QR", "Fecha y hora"],
        ...records.map(r => [r.number, r.text, r.date])
    ];

    const csv = "\uFEFF" +
        rows.map(row => row.map(csvCell).join(",")).join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "registro_qr.csv";
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.getElementById("clear").addEventListener("click", () => {
    if (!confirm("¿Borrar el historial de esta sesión?")) return;

    records = [];
    history.replaceChildren();
    count.textContent = "0";
    detected.textContent = "Todavía no hay lecturas.";
    saveStatus.textContent = "";
    lastCode = null;
});

actualizarSesion();
