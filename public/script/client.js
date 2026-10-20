"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const mowerURL = [
    'images/mower.png',
    'images/mower_2.png',
    'images/mower_3.png',
    'images/mower_4.png',
    'images/mower_5.png',
    'images/mower_6.png',
    'images/mower_0.png'
];
const mowerImgs = mowerURL.map(src => {
    const img = new Image();
    img.src = src;
    return img;
});

const flowerImg = new Image;
flowerImg.src = 'images/flower.png';

const rockImg = new Image;
rockImg.src = 'images/rock.png';
const pegImg = new Image;
pegImg.src = 'images/peg.png';

const fps = 25; /* Frames per Second zur Übertragung an Socket */
let renderFPS = 0;
let logicFPS = 0;
let displayRenderFPS = 0;
let displayLogicFPS = 0;
const socket = io();
let clientID = null; /* 8-stellige Spieler-ID vom Server */

const mowerSize = 100;
let motionX = 0;
let motionY = 0;
const mowerSpeed = 4;
let offsetMowerSpeed = mowerSpeed;
let startmowerPositionX = (canvas.width / 2) - (mowerSize / 2);
let startmowerPositionY = (canvas.height / 2) - (mowerSize / 2);
let mowerRotation = 0;
let targetRotation = 0;
let rasenPositionen = {};
let flowerPositionen = {};
let obstaclePositionen = {};
let keysState = {};
const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
let score = 0;
let cooldown = 0;
let lastUpdatedDate = performance.now();
let dismissedRotationInfo = false;

function isTouchScreen() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
}

// Beispielaufruf der Funktion
const isTouch = isTouchScreen();

function getMowerColor() {
    const eastereggnum = Math.floor(Math.random() * 1000);
    const num = Math.floor(Math.random() * 6);

    if (eastereggnum === 500) {
        return 6;
    } else {
        return num;
    }
}

let mowerColor = getMowerColor();
let clientInfo = [startmowerPositionX, startmowerPositionY, mowerRotation, mowerColor, score];
socket.on('clientID', (data) => {
    clientID = data;
});

/* Interpolation der anderen Mäher
   Jede Server-Position wird mit dem Zeitpunkt gespeichert, zu dem der andere Spieler
   dort war. Gezeichnet werden die anderen Mäher INTERP_DELAY ms in der Vergangenheit,
   genau zwischen zwei bekannten Positionen. So gibt es kein Ruckeln, auch wenn
   Pakete mal etwas früher oder später ankommen. */
const INTERP_DELAY = 120;  // ms; muss größer sein als Server-Takt (60 ms) + Sendeintervall (40 ms) + etwas Puffer.
// Ruckeln fremde Mäher bei schlechter Verbindung, diesen Wert um 20–40 erhöhen.
const remoteMowers = new Map(); // Spieler-ID -> { snaps: [{ t, x, y, r }], cur: [x, y, r], color }
let clockOffset = null;    // Unterschied zwischen eigener Uhr und Server-Uhr

/* Der Server schickt nur Spieler, die sich geändert haben: [[id, x, y, rot, farbe, score, age], ...] */
socket.on('players', (list, serverTime) => {
    // Uhrenabgleich: das am wenigsten verzögerte Paket bestimmt den Abstand.
    // So verfälschen späte Pakete oder ein kurz blockierter Browser die Zeiten nicht.
    const sample = performance.now() - serverTime;
    clockOffset = clockOffset === null ? sample : Math.min(sample, clockOffset + 1);

    for (const [id, x, y, r, color, playerScore, age] of list) {
        if (id === clientID) { score = playerScore; continue; } // eigener Eintrag: nur der Score zählt

        const t = serverTime - age + clockOffset; // Zeitpunkt, zu dem der Spieler dort war
        let m = remoteMowers.get(id);
        if (!m) remoteMowers.set(id, m = { snaps: [], cur: [x, y, r], color });

        const last = m.snaps[m.snaps.length - 1];
        if (last && last.x === x && last.y === y && last.r === r) continue; // keine Bewegung
        if (last && t - last.t > 250) {
            // Spieler stand still und fährt jetzt los: Startpunkt kurz vor der neuen Position setzen
            m.snaps.push({ t: t - 1000 / fps, x: last.x, y: last.y, r: last.r });
        }
        if (!last || t > last.t) m.snaps.push({ t, x, y, r });
        if (m.snaps.length > 30) m.snaps.shift();
    }
});

socket.on('playerLeft', (id) => {
    remoteMowers.delete(id);
    playerNames.delete(id);
});

/* ---------- Namensschilder ---------- */
const NAME_MAX = 16;                       // gleiche Grenze wie auf dem Server
const NAME_STORAGE_KEY = 'rasenrasen-name';
const TAG_FONT = '16px silkscreen-regular';
const TAG_HEIGHT = 24, TAG_PADDING = 6, TAG_GAP = 14, TAG_RADIUS = 4; // GAP = Abstand zum Mäher
const nameInput = document.getElementById('name_input');
const playerNames = new Map();             // Spieler-ID -> Anzeigename
let editingName = false;

function generateName() {
    const adjektive = ['Flinker', 'Grüner', 'Wilder', 'Schneller', 'Fleißiger', 'Mutiger', 'Kleiner', 'Lustiger', 'Stiller', 'Wackerer'];
    const namen = ['Igel', 'Gärtner', 'Maulwurf', 'Grashüpfer', 'Regenwurm', 'Hase', 'Gartenzwerg', 'Käfer', 'Spatz', 'Mäher',
        'Dachs', 'Fuchs', 'Frosch', 'Biber', 'Specht', 'Luchs', 'Molch', 'Rabe', 'Kauz', 'Marder'];
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    let name;
    do { name = pick(adjektive) + ' ' + pick(namen); } while (name.length > NAME_MAX); // max. 16 Zeichen
    return name;
}

function cleanName(name) {
    return String(name).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

function loadName() {
    try { return cleanName(localStorage.getItem(NAME_STORAGE_KEY) || ''); } catch (e) { return ''; }
}

function saveName(name) {
    try {
        if (name) localStorage.setItem(NAME_STORAGE_KEY, name);
        else localStorage.removeItem(NAME_STORAGE_KEY);
    } catch (e) { /* z. B. privates Fenster: Name gilt dann nur für diesen Besuch */ }
}

let myName = loadName() || generateName();

socket.on('names', (list) => {
    for (const [id, name] of list) playerNames.set(id, name);
});

/* ---------- Spielrunden ---------- */
const roundTimer = document.getElementById('round_timer');
const roundBanner = document.getElementById('round_banner');
const roundRestart = document.getElementById('round_restart');
let roundPhase = 'waiting';
let roundEndsAt = 0;          // lokale Zeit (performance.now), zu der die aktuelle Phase endet
let bannerTimeout = null;

/* Banner in der Bildschirmmitte: erste Zeile groß, weitere Zeilen klein.
   textContent statt innerHTML, weil Spielernamen von Nutzern kommen. */
function showBanner(lines, duration) {
    roundBanner.replaceChildren(...lines.map((text, i) => {
        const p = document.createElement('p');
        p.textContent = text;
        if (i === 0) p.className = 'banner_title';
        return p;
    }));
    roundBanner.classList.add('visible');
    clearTimeout(bannerTimeout);
    if (duration) bannerTimeout = setTimeout(() => roundBanner.classList.remove('visible'), duration);
}

socket.on('round', ([phase, msLeft]) => {
    const previous = roundPhase;
    roundPhase = phase;
    roundEndsAt = performance.now() + msLeft;

    if (phase === 'running') showBanner(['Los!'], 1500);
    if (phase === 'waiting' && previous === 'countdown') showBanner(['Start abgebrochen', 'Warte auf Mitspieler'], 3000);
    if (phase === 'waiting' && previous === 'running') showBanner(['Runde abgebrochen', 'Zu wenige Mäher'], 3000);
    updateRoundDisplay();
});

socket.on('roundEnd', (ranking) => {
    const best = ranking.length ? ranking[0][2] : 0;
    const winners = ranking.filter(([, , s]) => s === best);
    let title;
    if (best === 0) title = 'Niemand hat gemäht';
    else if (winners.length > 1) title = 'Unentschieden!';
    else if (winners[0][0] === clientID) title = 'Du hast gewonnen!';
    else title = winners[0][1] + ' gewinnt!';

    const lines = [title];
    ranking.forEach(([id, name, s], i) => {     // Top 3 und immer der eigene Platz
        if (i < 3 || id === clientID) lines.push((i + 1) + '. ' + (id === clientID ? 'Du' : name) + ' – ' + s);
    });
    showBanner(lines, 7000);
});

/* Countdown und Rundentimer aus der lokalen Endzeit berechnen (4× pro Sekunde) */
function updateRoundDisplay() {
    const secondsLeft = Math.ceil(Math.max(roundEndsAt - performance.now(), 0) / 1000);

    if (roundPhase === 'countdown') {
        showBanner(['Spiel startet in ' + secondsLeft]);
    }
    if (roundPhase === 'running') {
        roundTimer.textContent = Math.floor(secondsLeft / 60) + ':' + String(secondsLeft % 60).padStart(2, '0');
        roundTimer.classList.toggle('urgent', secondsLeft <= 10);
    }
    roundTimer.classList.toggle('visible', roundPhase === 'running');
    roundRestart.classList.toggle('visible', roundPhase === 'ready');
}

roundRestart.addEventListener('click', () => {
    roundRestart.classList.remove('visible');   // sofort weg, der Server schickt gleich den Countdown
    socket.emit('startRound');
});
setInterval(updateRoundDisplay, 250);

/* Position und Größe eines Namensschilds über einem Mäher (in Canvas-Koordinaten) */
const tagWidths = new Map();               // Name -> Breite, damit nicht jedes Frame neu gemessen wird
let tagFontReady = !document.fonts || document.fonts.check(TAG_FONT);
if (!tagFontReady) {
    document.fonts.load(TAG_FONT).then(() => {
        tagFontReady = true;
        tagWidths.clear();                 // evtl. falsch gemessene Breiten verwerfen
    });
}

function nameTagRect(name, mowerX, mowerY) {
    let w = tagWidths.get(name);
    if (w === undefined) {
        ctx.font = TAG_FONT;
        w = Math.ceil(ctx.measureText(name).width) + TAG_PADDING * 2;
        if (tagFontReady) {
            if (tagWidths.size > 200) tagWidths.clear();
            tagWidths.set(name, w);
        }
    }
    const x = Math.round(Math.min(Math.max(mowerX + mowerSize / 2 - w / 2, 0), canvas.width - w));
    let y = Math.round(mowerY - TAG_HEIGHT - TAG_GAP);
    if (y < 0) y = Math.round(mowerY + mowerSize + TAG_GAP); // am oberen Rand: Schild unter den Mäher
    return { x, y, w, h: TAG_HEIGHT };
}

/* Rechteck mit abgerundeten Ecken (funktioniert auch in älteren Browsern ohne ctx.roundRect) */
function roundedRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function drawNameTag(name, mowerX, mowerY) {
    const r = nameTagRect(name, mowerX, mowerY);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundedRect(r.x, r.y, r.w, r.h, TAG_RADIUS);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';   // kleiner Pixel-Schatten wie bei Minecraft
    ctx.fillText(name, r.x + TAG_PADDING + 2, r.y + r.h / 2 + 2);
    ctx.fillStyle = 'rgb(225, 225, 225)';
    ctx.fillText(name, r.x + TAG_PADDING, r.y + r.h / 2);
}

function drawNameTags() {
    ctx.font = TAG_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const [id, m] of remoteMowers) {
        const name = playerNames.get(id);
        if (name) drawNameTag(name, m.cur[0], m.cur[1]);
    }
    if (!editingName) drawNameTag(myName, startmowerPositionX, startmowerPositionY);
}

/* Bildschirm-Koordinaten -> Canvas-Koordinaten (der Canvas wird per CSS verschoben) */
function toCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left - canvas.clientLeft, y: clientY - rect.top - canvas.clientTop };
}

function isOnOwnTag(clientX, clientY) {
    const p = toCanvas(clientX, clientY);
    const r = nameTagRect(myName, startmowerPositionX, startmowerPositionY);
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function openNameEditor() {
    const r = nameTagRect(myName, startmowerPositionX, startmowerPositionY);
    const rect = canvas.getBoundingClientRect();
    editingName = true;
    nameInput.value = myName;
    nameInput.style.left = (rect.left + canvas.clientLeft + r.x) + 'px';
    nameInput.style.top = (rect.top + canvas.clientTop + r.y) + 'px';
    nameInput.style.width = r.w + 'px';
    nameInput.style.display = 'block';
    nameInput.focus();
    nameInput.select();
}

function closeNameEditor(save) {
    if (!editingName) return;
    editingName = false;
    nameInput.style.display = 'none';
    if (save) {
        const name = cleanName(nameInput.value);
        saveName(name);                     // leer = eigener Name gelöscht
        myName = name || generateName();
        socket.emit('setName', myName);
    }
    nameInput.blur();
}

/* Tasten im Eingabefeld nicht an das Spiel weitergeben (sonst fährt der Mäher beim Tippen) */
nameInput.addEventListener('keydown', (event) => event.stopPropagation());
nameInput.addEventListener('keyup', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') closeNameEditor(true);
    if (event.key === 'Escape') closeNameEditor(false);
});
nameInput.addEventListener('blur', () => closeNameEditor(true));
nameInput.addEventListener('input', () => {   // Feld wächst mit dem Namen mit
    ctx.font = TAG_FONT;
    nameInput.style.width = Math.max(40, Math.ceil(ctx.measureText(nameInput.value).width) + TAG_PADDING * 2 + 4) + 'px';
});

window.addEventListener('click', (event) => {
    if (editingName || event.target.closest('a, button, input')) return;
    if (isOnOwnTag(event.clientX, event.clientY)) openNameEditor();
});

window.addEventListener('mousemove', (event) => {
    document.body.style.cursor = !editingName && isOnOwnTag(event.clientX, event.clientY) ? 'pointer' : '';
});

function updateRemoteMower(m, renderTime) {
    const s = m.snaps;
    while (s.length > 2 && s[1].t <= renderTime) s.shift(); // verbrauchte Positionen entfernen

    const a = s[0], b = s[1];
    if (!b || renderTime <= a.t) { m.cur = [a.x, a.y, a.r]; return; }
    if (renderTime >= b.t) { m.cur = [b.x, b.y, b.r]; return; }

    const k = (renderTime - a.t) / (b.t - a.t);
    let dRot = (b.r - a.r) % 360;
    dRot = ((dRot + 540) % 360) - 180; // kürzester Drehweg
    m.cur = [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, (a.r + dRot * k + 360) % 360];
}

/* Eigenes Mähen sofort anzeigen (der Server bestätigt es kurz danach) */
function mowLocally() {
    const cx = startmowerPositionX + mowerSize / 2, cy = startmowerPositionY + mowerSize / 2;
    for (const key in rasenPositionen) {
        const [x, y] = rasenPositionen[key];
        if ((x - cx) ** 2 + (y - cy) ** 2 <= 1600) delete rasenPositionen[key];
    }
    for (const key in flowerPositionen) {
        const [x, y] = flowerPositionen[key];
        if ((x - cx) ** 2 + (y - cy) ** 2 <= 1600) delete flowerPositionen[key];
    }
}

socket.on('rasenPartikel', (data) => {
    rasenPositionen = data;
});

socket.on('flowers', (data) => {
    flowerPositionen = data;
});

socket.on('obstacles', (data) => {
    obstaclePositionen = data;
});

/* Von anderen gemähter Rasen verschwindet erst, wenn deren Mäher (verzögert angezeigt) dort ist */
socket.on('RemoveRasenPartikel', (data) => {
    setTimeout(() => data.forEach(key => delete rasenPositionen[key]), INTERP_DELAY);
});

socket.on('RemoveFlowers', (data) => {
    setTimeout(() => data.forEach(key => delete flowerPositionen[key]), INTERP_DELAY);
});

socket.on('AddRasenPartikel', (data) => {
    Object.assign(rasenPositionen, data);
});

socket.on('AddFlower', (data) => {
    Object.assign(flowerPositionen, data);
});

// Fügen Sie Eventlistener für keydown und keyup hinzu
window.addEventListener('keydown', function (event) {
    keysState[event.keyCode] = true;
});

window.addEventListener('keyup', function (event) {
    keysState[event.keyCode] = false;
});

function emulateKeyPress(keyCode) {
    keysState[keyCode] = true;
}

function emulateKeyUp(keyCode) {
    keysState[keyCode] = false;
}

function emulateKeyUpAll() {
    keysState[87] = false;
    keysState[65] = false;
    keysState[83] = false;
    keysState[68] = false;
}

// Aktualisieren Sie die Bewegung und Rotation basierend auf dem aktuellen Tastenzustand
function updateMotionAndRotation() {
    // Standardwerte
    motionX = 0;
    motionY = 0;
    targetRotation = mowerRotation;

    // Überprüfen der Tasten und Anpassung der Bewegung und Rotation
    if (keysState[87]) { // W
        motionY = -offsetMowerSpeed;
        targetRotation = 270;
    }
    if (keysState[65]) { // A
        motionX = -offsetMowerSpeed;
        targetRotation = 180;
    }
    if (keysState[83]) { // S
        motionY = offsetMowerSpeed;
        targetRotation = 90;
    }
    if (keysState[68]) { // D
        motionX = offsetMowerSpeed;
        targetRotation = 0;
    }

    // Diagonale Kombinationen aus Tasten
    if (keysState[87] && keysState[68] && keysState[65] && keysState[83]) {
        motionX = motionX * 0;
        motionY = motionY * 0;
        targetRotation = mowerRotation;
    } else if (keysState[87] && keysState[68]) {
        motionX = motionX * 0.7072;
        motionY = motionY * 0.7072;
        targetRotation = 315;
    } else if (keysState[68] && keysState[83]) {
        motionX = motionX * 0.7072;
        motionY = motionY * 0.7072;
        targetRotation = 45;
    } else if (keysState[83] && keysState[65]) {
        motionX = motionX * 0.7072;
        motionY = motionY * 0.7072;
        targetRotation = 135;
    } else if (keysState[87] && keysState[65]) {
        motionX = motionX * 0.7072;
        motionY = motionY * 0.7072;
        targetRotation = 225;
    }
}

/* Developer Anzeige */
const devAnzeige = document.getElementById('dev_anzeige');
const scoreAnzeige = document.getElementById('score');
const scoreDamage = document.getElementById('score_damage');

setInterval(() => {
    if (devAnzeige.style.display !== 'none') devAnzeige.textContent = 'RasenRasen Client-ID: ' + clientID + ' Motion-X: ' + motionX + ' Motion-Y: ' + motionY + ' Rotation: ' + mowerRotation + ' Engine-FPS: ' + displayLogicFPS + ' FPS: ' + displayRenderFPS;
    scoreAnzeige.textContent = 'Score: ' + score;
}, 800);

function gamelogic() {
    logicFPS++;
    const currentTime = performance.now();
    const timeOffset = Math.min(currentTime - lastUpdatedDate, 100); /* z. B. nach Tab-Wechsel nicht springen */
    const offsetSpeedMultiplier = (1000 / 60) / timeOffset;
    lastUpdatedDate = currentTime;

    offsetMowerSpeed = mowerSpeed / offsetSpeedMultiplier;
    updateMotionAndRotation(); /* Bewegung mit der Zeit DIESES Frames berechnen */

    startmowerPositionX += motionX;
    startmowerPositionY += motionY;

    // Kürzesten Drehwinkel zwischen aktueller Rotation und Zielrotation berechnen
    let angleDiff = targetRotation - mowerRotation;
    angleDiff = ((angleDiff + 180) % 360 + 360) % 360 - 180;

    // Drehung anpassen (maximal 10 Grad pro Schritt)
    let rotationStep = Math.sign(angleDiff) * Math.min(10 / offsetSpeedMultiplier, Math.abs(angleDiff));
    mowerRotation = (mowerRotation + rotationStep + 360) % 360;

    if (startmowerPositionX < 0) {
        startmowerPositionX = 0;
    } else if (startmowerPositionX + mowerSize > canvas.width) {
        startmowerPositionX = canvas.width - mowerSize;
    }

    if (startmowerPositionY < 0) {
        startmowerPositionY = 0;
    } else if (startmowerPositionY + mowerSize > canvas.height) {
        startmowerPositionY = canvas.height - mowerSize;
    }
}

let lastSent = '';
socket.on('connect', () => {   /* nach (Neu-)Verbindung, z. B. Server-Neustart */
    lastSent = '';               // eigene Position einmal senden
    socket.emit('setName', myName);
    remoteMowers.clear();        // Server schickt gleich alle aktuellen Spieler
});

function socketemit() {
    const state = startmowerPositionX + ',' + startmowerPositionY + ',' + mowerRotation;
    if (state === lastSent) return; /* Mäher steht still -> nichts senden */
    lastSent = state;
    mowLocally();

    if (cooldown <= 0) {
        for (const key in obstaclePositionen) {
            const [objX, objY] = obstaclePositionen[key];
            const abstand = Math.sqrt(Math.pow(objX - (startmowerPositionX + 50), 2) + Math.pow(objY - (startmowerPositionY + 50), 2));

            if (abstand <= 40) {
                cooldown = 2;

                // Visuelles Feedback (Schaden) bleibt bestehen
                scoreDamage.style.animation = 'none';
                void scoreDamage.offsetWidth;
                scoreDamage.style.animation = null;
                scoreDamage.style.animationPlayState = 'running';
            }
        }
    }

    clientInfo = [startmowerPositionX, startmowerPositionY, mowerRotation, mowerColor, score];
    socket.emit('clientInfo', clientInfo);
}

function animate() {
    gamelogic();
    renderFPS++; /* Rendered FPS analysis */
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgb(88, 114, 36)";
    ctx.beginPath();
    for (const key in rasenPositionen) {
        const element = rasenPositionen[key];
        ctx.rect(element[0], element[1], 10, 10); // x, y, width, height
    }
    ctx.fill();

    for (const key in flowerPositionen) {
        if (Object.hasOwnProperty.call(flowerPositionen, key)) {
            const element = flowerPositionen[key];
            ctx.drawImage(flowerImg, element[0] - 15, element[1] - 15, 30, 30);
        }
    }

    for (const key in obstaclePositionen) {
        if (Object.hasOwnProperty.call(obstaclePositionen, key)) {
            const element = obstaclePositionen[key];

            switch (element[2]) {
                case 0:
                    ctx.drawImage(rockImg, element[0] - 25, element[1] - 25, 50, 50);
                    break;

                case 1:
                    ctx.drawImage(pegImg, element[0] - 25, element[1] - 15, 50, 30);
                    break;

                default:
                    ctx.drawImage(rockImg, element[0] - 25, element[1] - 25, 50, 50);
                    break;
            }
        }
    }

    // Den Ursprung auf die Mitte des Bildes verschieben
    ctx.translate(startmowerPositionX + mowerSize / 2, startmowerPositionY + mowerSize / 2);

    // Das Bild um die eigene Achse drehen
    ctx.rotate(mowerRotation * Math.PI / 180);

    // Das Bild zeichnen (Berücksichtigen Sie die Verschiebung des Ursprungs)
    ctx.drawImage(mowerImgs[mowerColor], -mowerSize / 2, -mowerSize / 2, mowerSize, mowerSize);

    // Die Transformationen zurücksetzen
    ctx.rotate(-mowerRotation * Math.PI / 180);
    ctx.translate(-(startmowerPositionX + mowerSize / 2), -(startmowerPositionY + mowerSize / 2));

    const renderTime = performance.now() - INTERP_DELAY;
    for (const m of remoteMowers.values()) {
        updateRemoteMower(m, renderTime);

        ctx.save();
        ctx.translate(m.cur[0] + mowerSize / 2, m.cur[1] + mowerSize / 2);
        ctx.rotate(m.cur[2] * Math.PI / 180);
        ctx.drawImage(mowerImgs[m.color] || mowerImgs[0], -mowerSize / 2, -mowerSize / 2, mowerSize, mowerSize);
        ctx.restore();
    }

    drawNameTags();

    canvas.style.transform = 'translate(' + ((window.innerWidth / 2) - startmowerPositionX - 50 - mowerSize / 2) + 'px, ' + ((window.innerHeight / 2) - startmowerPositionY - 50 - mowerSize / 2) + 'px)';

    requestAnimationFrame(animate);
}

setInterval(() => {
    socketemit();
}, 1000 / fps);

setInterval(() => {
    displayRenderFPS = renderFPS;
    renderFPS = 0;
    displayLogicFPS = logicFPS;
    logicFPS = 0;

    if (cooldown > 0) {
        cooldown = cooldown - 1;
    }
}, 1000);

requestAnimationFrame(animate);

function disableWelcomeMobile() {
    document.getElementById('mobile_info').style.opacity = 0;
}

function enableWelcomeMobile() {
    document.getElementById('mobile_info').style.opacity = 1;
}

function disableMain() {
    document.getElementById('main_overlay').style.opacity = 0;
    document.getElementById('fullscreen_btn').textContent = '-';
    document.getElementById('horizontal_notification').style.opacity = 0;
    document.getElementById('horizontal_notification').style.zIndex = 999;
    document.getElementById("nav_select").style.display = 'none';
}

/* Nur einblenden – ohne mobileResizeFeature(), sonst rufen sich beide endlos gegenseitig auf */
function showMain() {
    document.getElementById('main_overlay').style.opacity = 1;
    document.getElementById('fullscreen_btn').textContent = '+';
}

function enableMain() {
    showMain();
    mobileResizeFeature();
}

/* Opacity 0 / 1 for Main when pressed Fullscreen button */
function toggleMain() {
    if (document.getElementById('main_overlay').style.opacity === "0") {
        enableMain();
    } else {
        disableMain();
    }
}
window.addEventListener('keyup', function (event) {
    if (event.keyCode === 27) {
        event.preventDefault();
        toggleMain();
    }
});

/* Check for Firefox dreck */
if (isFirefox) {
    document.getElementById('warning').style.transform = 'translateX(0px)';
}

document.getElementById('warning').addEventListener('click', function () {
    document.getElementById('warning').style.transform = 'translateX(1060px)';
});

/* Mobile Resize Logic */
function mobileResizeFeature() {
    if (window.innerWidth > 420 && window.innerHeight < 420) {
        document.getElementById("disableonmobile").style.display = 'none';
        document.getElementById("nav_select").style.display = 'block';
        disableMain();
        enableWelcomeMobile();
    } else if (window.innerWidth < 435 && window.innerHeight > 435) {
        document.getElementById("disableonmobile").style.display = 'none';
        document.getElementById("nav_select").style.display = 'block';
        enableWelcomeMobile();

        if (isTouch) {
            showMain();

            setTimeout(() => {
                if (window.innerWidth < 435 && window.innerHeight > 435 && dismissedRotationInfo === false) {
                    console.warn("Gerät im Hochformat! Für bessere sichtbarkeit ins Querformat drehen.")
                    document.getElementById('horizontal_notification').style.opacity = 1;
                    document.getElementById('horizontal_notification').style.zIndex = 9999;
                    disableWelcomeMobile();
                }
            }, 3000);
        }
    } else {
        document.getElementById("disableonmobile").style.display = 'block';
        document.getElementById("nav_select").style.display = 'none';
        showMain();
        disableWelcomeMobile();
    }
}

/* Touch Controller */

const joystickContainer = document.getElementById('joystick-container');
const joystick = document.getElementById('joystick');

let joystickActive = false;  // Joystick nur aktiv, wenn die Berührung auf der Spielfläche begonnen hat
let nameTagTouched = false;  // Berührung hat auf dem eigenen Namensschild begonnen

function touchend() {
    if (nameTagTouched) {
        nameTagTouched = false;
        openNameEditor();    // direkt hier öffnen, damit iOS die Tastatur zeigt
    }
    joystickActive = false;
    emulateKeyUpAll();
    joystickContainer.style.display = 'none';
    joystick.style.transform = 'translate(0, 0)';
}

function getDirection(x, y) {
    const angle = Math.atan2(y, x);
    const angleInDegrees = (angle * 180) / Math.PI;

    if (angleInDegrees >= -22.5 && angleInDegrees < 22.5) {
        emulateKeyUpAll();
        emulateKeyPress(68);
        /* return 'right'; */
    } else if (angleInDegrees >= 22.5 && angleInDegrees < 67.5) {
        emulateKeyUpAll();
        emulateKeyPress(68);
        emulateKeyPress(83);
        /* return 'down-right'; */
    } else if (angleInDegrees >= 67.5 && angleInDegrees < 112.5) {
        emulateKeyUpAll();
        emulateKeyPress(83);
        /* return 'down'; */
    } else if (angleInDegrees >= 112.5 && angleInDegrees < 157.5) {
        emulateKeyUpAll();
        emulateKeyPress(83);
        emulateKeyPress(65);
        /* return 'down-left'; */
    } else if (angleInDegrees >= 157.5 || angleInDegrees < -157.5) {
        emulateKeyUpAll();
        emulateKeyPress(65);
        /* return 'left'; */
    } else if (angleInDegrees >= -157.5 && angleInDegrees < -112.5) {
        emulateKeyUpAll();
        emulateKeyPress(65);
        emulateKeyPress(87);
        /* return 'up-left'; */
    } else if (angleInDegrees >= -112.5 && angleInDegrees < -67.5) {
        emulateKeyUpAll();
        emulateKeyPress(87);
        /* return 'up'; */
    } else if (angleInDegrees >= -67.5 && angleInDegrees < -22.5) {
        emulateKeyUpAll();
        emulateKeyPress(87);
        emulateKeyPress(68);
        /* return 'up-right'; */
    }
}

window.addEventListener('touchstart', function (event) {
    const touch = event.touches[0];

    // Auf Links, Buttons, Eingabefeld, Steuerleiste und Firefox-Hinweis: kein Joystick
    if (event.target.closest('a, button, input, footer, #warning, #horizontal_notification, #horizontal_notification_text, #nav_select')) return;

    // Auf dem eigenen Namensschild: Namen bearbeiten statt Joystick
    if (!editingName && isOnOwnTag(touch.clientX, touch.clientY)) {
        nameTagTouched = true;
        return;
    }

    const posX = touch.clientX - 40;
    const posY = touch.clientY - 40;

    joystickActive = true;
    joystickContainer.style.display = 'flex';

    joystickContainer.style.top = posY + 'px';
    joystickContainer.style.left = posX + 'px';
});

window.addEventListener('touchmove', function (event) {
    nameTagTouched = false;  // Wischen ist kein Antippen
    if (joystickActive) {
        let touch = event.touches[0];
        let posX = touch.clientX - 40 - joystickContainer.offsetLeft;
        let posY = touch.clientY - 40 - joystickContainer.offsetTop;

        const maxRadius = 30;
        const distance = Math.sqrt(posX ** 2 + posY ** 2);

        if (distance > maxRadius) {
            const angle = Math.atan2(posY, posX);

            posX = Math.cos(angle) * maxRadius;
            posY = Math.sin(angle) * maxRadius;
        }

        const offsetX = posX / maxRadius;
        const offsetY = posY / maxRadius;

        getDirection(offsetX, offsetY);

        joystick.style.transform = 'translate(' + posX + 'px, ' + posY + 'px)';
    }
});

document.getElementById("horizontal_notification").addEventListener('touchend', function () {
    if (this.style.opacity !== '1') return;
    dismissedRotationInfo = true;
    document.getElementById('horizontal_notification').style.opacity = 0;
    document.getElementById('horizontal_notification').style.zIndex = 999;
    enableWelcomeMobile();
});

document.getElementById('nav_select').addEventListener('change', function () {
    console.log('Gewählt:', this.value);
    window.location.href = this.value;
});

window.addEventListener('touchcancel', touchend);
window.addEventListener('touchend', touchend);

window.addEventListener('load', mobileResizeFeature);
window.addEventListener('resize', mobileResizeFeature);
