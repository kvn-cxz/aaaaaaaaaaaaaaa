const reader = new Html5Qrcode("reader");

const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const status = document.getElementById("status");
const detected = document.getElementById("detected");
const history = document.getElementById("history");
const count = document.getElementById("count");
const saveStatus = document.getElementById("saveStatus");
const tokenInput = document.getElementById("token");

let running = false;
let records = [];
let lastCode = null;
let unlockTimer = null;

async function enviarAExcel(texto) {
    const token = tokenInput.value.trim();

    if (!token) {
        saveStatus.textContent =
            "Lectura guardada en el historial, pero falta la clave para enviarla a Excel.";
        return;
    }

    saveStatus.textContent = "Enviando código a Excel...";

    try {
        const respuesta = await fetch(
            `${endpointExcel}/scan`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-QR-Token": token
                },
                body: JSON.stringify({
                    text: texto
                })
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.error || `Error HTTP ${respuesta.status}`
            );
        }

        saveStatus.textContent =
            "✓ Código enviado a Excel correctamente.";

    } catch (error) {
        console.error("Error al enviar a Excel:", error);

        saveStatus.textContent =
            "No se pudo enviar a Excel. Revisa la clave y la conexión.";
    }
}

// Reinicia la detección cuando el QR deja de verse.
function scheduleUnlock() {
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => {
        lastCode = null;
        }, 1200);
    }

function addRecord(text) {
    // Evita registrar repetidamente el mismo QR
    // mientras continúa delante de la cámara.
    if (text === lastCode) {
        scheduleUnlock();
        return;
    }

    lastCode = text;
    scheduleUnlock();

    const record = {
        number: records.length + 1,
        text: text,
        date: new Date().toLocaleString("es-MX")
    };

    records.push(record);

    detected.textContent = text;
    saveStatus.textContent =
    "Lectura agregada al historial. Enviando a Excel...";

    const item = document.createElement("div");
    item.className = "record";

    const value = document.createElement("strong");
    value.textContent = record.number + ". " + record.text;

    const date = document.createElement("small");
    date.textContent = record.date;

    item.append(value, date);
    history.prepend(item);

    count.textContent = records.length;

    // Enviar automáticamente el código escaneado a Excel.
    enviarAExcel(text);
}

startBtn.addEventListener("click", async () => {
    if (running) return;

    startBtn.disabled = true;
    status.textContent = "Solicitando acceso a la cámara...";

    try {
        await reader.start(
            { facingMode: "environment" },
            {
                fps: 12,
                qrbox: (width, height) => {
                    const size = Math.floor(
                        Math.min(width, height) * 0.7
                    );
                    return { width: size, height: size };
                }
            },
            (decodedText) => addRecord(decodedText),
            () => {}
        );

        running = true;
        stopBtn.disabled = false;
        status.textContent =
            "Cámara activa. Apunta al siguiente código QR.";
    } catch (error) {
        status.textContent =
        "No se pudo abrir la cámara. Comprueba los permisos y que uses HTTPS.";
        startBtn.disabled = false;
    }
    const tokenInput = document.getElementById("token");

    const endpointExcel =
    "https://size-appeared-not-turn.trycloudflare.com";
});

stopBtn.addEventListener("click", async () => {
    if (!running) return;

        try {
            await reader.stop();
            running = false;
            clearTimeout(unlockTimer);

            startBtn.disabled = false;
            stopBtn.disabled = true;
            status.textContent = "Cámara detenida.";
        } catch (error) {
        status.textContent =
            "No se pudo detener la cámara correctamente.";
      }
});

// CSV compatible con Excel.
function csvCell(value) {
    let text = String(value);

    // Evita que un contenido QR se interprete como fórmula.
    if (/^[\s]*[=+\-@]/.test(text)) {
        text = "'" + text;
    }

    return '"' + text.replace(/"/g, '""') + '"';
}

document.getElementById("download")
    .addEventListener("click", () => {
        const rows = [
            ["Número", "Texto QR", "Fecha y hora"],
            ...records.map(r => [r.number, r.text, r.date])
        ];

        const csv = "\uFEFF" +
        rows.map(row => row.map(csvCell).join(",")).join("\r\n");

        const blob = new Blob([csv], {
            type: "text/csv;charset=utf-8;"
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = "registro_qr.csv";
        a.click();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

document.getElementById("clear")
.addEventListener("click", () => {
    if (!confirm("¿Borrar el historial de esta sesión?")) return;

    records = [];
    history.replaceChildren();
    count.textContent = "0";
    detected.textContent = "Todavía no hay lecturas.";
    saveStatus.textContent = "";
    lastCode = null;
});
