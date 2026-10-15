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
const players = {};          // socket.id -> { id, x, y, rot, color, score, moved, cooldown }
const changed = new Set();   // Spieler, die sich seit dem letzten Senden geändert haben
const usedIds = new Set();   // vergebene Spieler-IDs
let added = { grass: {}, flowers: {} };
let removed = { grass: [], flowers: [] };

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const log = (msg) => console.log(new Date().toLocaleString('de-DE') + ' - ' + msg);

/* Kurze 8-stellige Spieler-ID statt der 20 Zeichen langen Socket-ID */
function newPlayerId() {
    let id;
    do { id = rnd(10000000, 99999999); } while (usedIds.has(id));
    usedIds.add(id);
    return id;
}

/* Ein Spieler im Paket: [id, x, y, rot, farbe, score, age]
   age = wie viele ms die Position schon alt ist (für die Interpolation beim Client) */
const packPlayer = (p, now) => [p.id, p.x, p.y, p.rot, p.color, p.score, Math.min(now - p.moved, 999)];

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

function mow(sid, p) {
    const cx = p.x + MOWER / 2, cy = p.y + MOWER / 2;
    const near = ([x, y], r2) => (x - cx) ** 2 + (y - cy) ** 2 <= r2;
    const scoreBefore = p.score;

    for (const k in grass) if (near(grass[k], MOW_R2)) { delete grass[k]; p.score += 1; removed.grass.push(k); }
    for (const k in flowers) if (near(flowers[k], MOW_R2)) { delete flowers[k]; p.score += 2; removed.flowers.push(k); }

    const now = Date.now();
    if (p.cooldown < now) {
        for (const k in obstacles) {
            if (near(obstacles[k], HIT_R2)) { p.score = Math.max(p.score - 10, 0); p.cooldown = now + 2000; break; }
        }
    }
    if (p.score !== scoreBefore) changed.add(sid);
}

/* ---------- Globale Timer: genau EINMAL, unabhängig von der Spielerzahl ---------- */
setInterval(() => {                             // ~16 Hz: Änderungen senden (nur wenn sich etwas bewegt)
    if (removed.grass.length) io.emit('RemoveRasenPartikel', removed.grass);
    if (removed.flowers.length) io.emit('RemoveFlowers', removed.flowers);
    removed = { grass: [], flowers: [] };

    if (changed.size) {                         // nur die Spieler, die sich geändert haben
        const now = Date.now();
        const list = [];
        for (const sid of changed) if (players[sid]) list.push(packPlayer(players[sid], now));
        changed.clear();
        if (list.length) io.emit('players', list, now); // now = Serverzeit für die Interpolation
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
    const pid = newPlayerId();
    log(pid + ' has joined!');
    let lastMsg = 0;

    const now = Date.now();
    socket.emit('clientID', pid);
    socket.emit('players', Object.values(players).map(p => packPlayer(p, now)), now); // alle bisherigen Spieler
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
            p = players[socket.id] = { id: pid, x: Math.round(x), y: Math.round(y), rot: 0, color: c, score: 0, moved: now, cooldown: 0 }; // Score beginnt IMMER bei 0
            changed.add(socket.id);
        }
        // Max. Schrittweite pro Nachricht -> kein Teleportieren
        const nx = Math.round(clamp(clamp(x, p.x - MAX_STEP, p.x + MAX_STEP), 0, W - MOWER));
        const ny = Math.round(clamp(clamp(y, p.y - MAX_STEP, p.y + MAX_STEP), 0, H - MOWER));
        const nr = Math.round(((rot % 360) + 360) % 360);
        if (nx !== p.x || ny !== p.y || nr !== p.rot) {
            p.x = nx; p.y = ny; p.rot = nr;
            p.moved = now;
            changed.add(socket.id);
        }

        mow(socket.id, p);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        changed.delete(socket.id);
        usedIds.delete(pid);
        io.emit('playerLeft', pid);
        log(pid + ' has left!');
        if (Object.keys(players).length === 0) resetField();
    });
});

const PORT = process.env.PORT || 80;
server.listen(PORT, () => log('Server läuft auf Port ' + PORT));