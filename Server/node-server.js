const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Rate Limiting für API-Endpunkte (z.B. Socket.io)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 Minute
    max: 3800, // Maximale Anzahl von Anfragen pro Minute
    message: 'Zu viele Anfragen von dieser IP, bitte versuche es später erneut.'
});

app.use('/api/', apiLimiter);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../test.html'));
});

io.on('connection', (socket) => {
    console.log('Ein Client hat sich verbunden.');

    // Beispiel: Sende eine Variable an den Client
    socket.emit('nachrichtVomServer', 'Hallo, Client!');

    // Beispiel: Empfange eine Variable vom Client
    socket.on('nachrichtVomClient', (data) => {
        console.log('Nachricht vom Client:', data);
    });
});

server.listen(3000, () => {
    console.log('Server läuft auf http://localhost:3000');
});
