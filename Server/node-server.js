"use strict";

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

/* ---------- HTTP ---------- */
const PUBLIC = path.join(__dirname, '..', 'public'); // nur öffentliche Dateien liegen hier
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e4 }); // 10 KB statt 1 MB pro Nachricht

app.disable('x-powered-by');
app.get('/zauberw%C3%BCrfel', (req, res) => res.redirect(301, '/rubikscube'));
app.use(express.static(PUBLIC, {
    extensions: ['html'],                       // /about -> about.html, /rubikscube -> rubikscube.html
    maxAge: '1d',                               // Bilder, Fonts, CSS, JS einen Tag cachen
    setHeaders(res, file) {
        if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
}));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, '404.html')));

/* ---------- Spielzustand ---------- */
const W = 1920, H = 1080, MOWER = 100;
const GRASS = 350, GRASS_MIN = GRASS - 50, FLOWERS = 15, OBSTACLES = 4;
const MOW_R2 = 40 ** 2, HIT_R2 = 40 ** 2, MAX_STEP = 60;

let nextId = 0;
let grass = {}, flowers = {}, obstacles = {};
const players = {};          // socket.id -> [x, y, rot, color, score, age]
const lastMove = {};         // socket.id -> Zeitpunkt der letzten Positionsänderung
const cooldowns = {};
let added = { grass: {}, flowers: {} };
let removed = { grass: [], flowers: [] };
let playersChanged = true;  // nur senden, wenn sich etwas geändert hat

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const log = (msg) => console.log(new Date().toLocaleString('de-DE') + ' - ' + msg);

function spawn(target, amount, diff, withType = false) {
    for (let i = 0; i < amount; i++) {
        const item = [rnd(22, W - 22), rnd(22, H - 22)];
        if (withType) item.push(rnd(0, 1));
        const id = nextId++;                    // eindeutige ID statt x+y (keine Kollisionen)
        target[id] = item;
        if (diff) diff[id] = item;
    }
}

function resetField() {
    grass = {}; flowers = {}; obstacles = {};
    spawn(grass, GRASS);
    spawn(flowers, FLOWERS);
    spawn(obstacles, OBSTACLES, null, true);
}
resetField();

function mow(id, p) {
    const cx = p[0] + MOWER / 2, cy = p[1] + MOWER / 2;
    const near = ([x, y], r2) => (x - cx) ** 2 + (y - cy) ** 2 <= r2;
    const scoreBefore = p[4];

    for (const k in grass) if (near(grass[k], MOW_R2)) { delete grass[k]; p[4] += 1; removed.grass.push(k); }
    for (const k in flowers) if (near(flowers[k], MOW_R2)) { delete flowers[k]; p[4] += 2; removed.flowers.push(k); }

    const now = Date.now();
    if ((cooldowns[id] || 0) < now) {
        for (const k in obstacles) {
            if (near(obstacles[k], HIT_R2)) { p[4] = Math.max(p[4] - 10, 0); cooldowns[id] = now + 2000; break; }
        }
    }
    if (p[4] !== scoreBefore) playersChanged = true;
}

/* ---------- Globale Timer: genau EINMAL, unabhängig von der Spielerzahl ---------- */
setInterval(() => {                             // ~16 Hz: Positionen + Änderungen (nur wenn sich etwas bewegt)
    if (removed.grass.length) io.emit('RemoveRasenPartikel', removed.grass);
    if (removed.flowers.length) io.emit('RemoveFlowers', removed.flowers);
    removed = { grass: [], flowers: [] };

    if (playersChanged) {                       // stehen alle still, wird nichts gesendet
        const now = Date.now();                 // age: wie viele ms die Position schon alt ist
        for (const id in players) players[id][5] = Math.min(now - (lastMove[id] || now), 999);
        io.emit('serverInfo', players, now);    // now = Serverzeit, damit Clients die Positionen zeitlich einordnen können
        playersChanged = false;
    }
}, 60);

setInterval(() => {                             // 1 Hz: Rasen/Blumen nachwachsen lassen
    const g = GRASS_MIN - Object.keys(grass).length;
    const f = FLOWERS - Object.keys(flowers).length;
    if (g > 0) spawn(grass, g, added.grass);
    if (f > 0) spawn(flowers, f, added.flowers);
    if (g > 0) io.emit('AddRasenPartikel', added.grass);
    if (f > 0) io.emit('AddFlower', added.flowers);
    added = { grass: {}, flowers: {} };
}, 1000);

setInterval(() => {                             // Vollabgleich alle 15 s
    io.emit('rasenPartikel', grass);
    io.emit('flowers', flowers);
}, 15000);

/* ---------- Verbindungen ---------- */
io.on('connection', (socket) => {
    log(socket.id + ' has joined!');
    let lastMsg = 0;

    socket.emit('clientID', socket.id);
    socket.emit('serverInfo', players, Date.now());
    socket.emit('rasenPartikel', grass);
    socket.emit('flowers', flowers);
    socket.emit('obstacles', obstacles);

    socket.on('clientInfo', (data) => {
        const now = Date.now();
        if (now - lastMsg < 20) return;         // max. ~50 Nachrichten/s pro Client
        lastMsg = now;

        if (!Array.isArray(data)) return;       // ungültige Daten ignorieren statt abzustürzen
        const [x, y, rot, color] = data;
        if (![x, y, rot].every(Number.isFinite)) return;

        let p = players[socket.id];
        if (!p) {
            const c = Number.isInteger(color) && color >= 0 && color <= 6 ? color : 0;
            p = players[socket.id] = [x, y, rot, c, 0]; // Score beginnt IMMER bei 0
            playersChanged = true;
        }
        // Max. Schrittweite pro Nachricht -> kein Teleportieren
        const nx = Math.round(clamp(clamp(x, p[0] - MAX_STEP, p[0] + MAX_STEP), 0, W - MOWER));
        const ny = Math.round(clamp(clamp(y, p[1] - MAX_STEP, p[1] + MAX_STEP), 0, H - MOWER));
        const nr = Math.round(((rot % 360) + 360) % 360);
        if (nx !== p[0] || ny !== p[1] || nr !== p[2]) {
            p[0] = nx; p[1] = ny; p[2] = nr;
            lastMove[socket.id] = now;
            playersChanged = true;
        }

        mow(socket.id, p);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        delete cooldowns[socket.id];
        delete lastMove[socket.id];
        playersChanged = true;
        log(socket.id + ' has left!');
        if (Object.keys(players).length === 0) resetField();
    });
});

const PORT = process.env.PORT || 80;
server.listen(PORT, () => log('Server läuft auf Port ' + PORT));