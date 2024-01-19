"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const mowerImg = new Image;
mowerImg.src = 'images/mower.png';
let fps = 60; /* Frames per Second */
let renderFPS = 0;
let displayRenderFPS = 0;
const socket = io();
let clientID = "undefined";

const mowerSize = 100;
let motionX = 0;
let motionY = 0;
let mowerSpeed = 5;
let startmowerPositionX = (canvas.width / 2) - (mowerSize / 2);
let startmowerPositionY = (canvas.height / 2) - (mowerSize / 2);
let mowerRotation = 0;
let targetRotation = 0;
const rasenPartikelAnzahl = 300;
let rasenPositionen = {};
let keysState = {};
let mowerColor = 0;
let clientInfo = [startmowerPositionX, startmowerPositionY, mowerColor];
let serverInfo = {};

socket.on('clientID', (data) => {
    clientID = data;
});

socket.on('serverInfo', (data) => {
    serverInfo = data;
});

socket.on('rasenPartikel', (data) => {
    rasenPositionen = data;
});

// Fügen Sie Eventlistener für keydown und keyup hinzu
window.addEventListener('keydown', function (event) {
    keysState[event.keyCode] = true;
    updateMotionAndRotation();
});

window.addEventListener('keyup', function (event) {
    keysState[event.keyCode] = false;
    updateMotionAndRotation();
});

// Aktualisieren Sie die Bewegung und Rotation basierend auf dem aktuellen Tastenzustand
function updateMotionAndRotation() {
    // Standardwerte
    motionX = 0;
    motionY = 0;
    mowerSpeed = 5;
    targetRotation = mowerRotation;

    // Überprüfen der Tasten und Anpassung der Bewegung und Rotation
    if (keysState[87]) { // W
        motionY = -mowerSpeed;
        targetRotation = -90;
    }
    if (keysState[65]) { // A
        motionX = -mowerSpeed;
        targetRotation = 180;
    }
    if (keysState[83]) { // S
        motionY = mowerSpeed;
        targetRotation = 90;
    }
    if (keysState[68]) { // D
        motionX = mowerSpeed;
        targetRotation = 0;
    }

    // Diagonale Kombinationen aus Tasten
    if (keysState[87] && keysState[68]) {
        motionX = motionX / 2;
        motionY = motionY / 2;
        targetRotation = -45;
    } else if (keysState[68] && keysState[83]) {
        motionX = motionX / 2;
        motionY = motionY / 2;
        targetRotation = 45;
    } else if (keysState[83] && keysState[65]) {
        motionX = motionX / 2;
        motionY = motionY / 2;
        targetRotation = 135;
    } else if (keysState[87] && keysState[65]) {
        motionX = motionX / 2;
        motionY = motionY / 2;
        targetRotation = -135;
    }
}

/* Developer Anzeige */
setInterval(() => {
    document.getElementById('dev_anzeige').textContent = 'Motion-X: ' + motionX + ' Motion-Y: ' + motionY + ' Rotation: ' + mowerRotation + ' Engine-FPS: ' + fps + ' FPS: ' + displayRenderFPS;
}, 800);

canvas.style.top = (window.innerHeight / 2) - (canvas.height / 2);
canvas.style.left = (window.innerWidth / 2) - (canvas.width / 2);

function getRandomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gamelogic() {
    startmowerPositionX += motionX;
    startmowerPositionY += motionY;

    // Kürzesten Drehwinkel zwischen aktueller Rotation und Zielrotation berechnen
    let angleDiff = targetRotation - mowerRotation;
    angleDiff = ((angleDiff + 180) % 360) - 180;

    // Drehung anpassen (maximal 10 Grad pro Schritt)
    let rotationStep = Math.sign(angleDiff) * Math.min(10, Math.abs(angleDiff));
    mowerRotation += rotationStep;

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

function socketemit() {
    clientInfo = [startmowerPositionX, startmowerPositionY, mowerRotation, mowerColor];
    socket.emit('clientInfo', clientInfo);
}

function animate() {
    renderFPS++; /* Rendered FPS analysis */
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const key in rasenPositionen) {
        if (Object.hasOwnProperty.call(rasenPositionen, key)) {
            const element = rasenPositionen[key];
            ctx.fillStyle = "rgb(78, 105, 24)";
            ctx.fillRect(element[0], element[1], 10, 10); // x, y, width, height
        }
    }

    // Den Ursprung auf die Mitte des Bildes verschieben
    ctx.translate(startmowerPositionX + mowerSize / 2, startmowerPositionY + mowerSize / 2);

    // Das Bild um die eigene Achse drehen
    ctx.rotate(mowerRotation * Math.PI / 180);

    // Das Bild zeichnen (Berücksichtigen Sie die Verschiebung des Ursprungs)
    ctx.drawImage(mowerImg, -mowerSize / 2, -mowerSize / 2, mowerSize, mowerSize);

    // Die Transformationen zurücksetzen
    ctx.rotate(-mowerRotation * Math.PI / 180);
    ctx.translate(-(startmowerPositionX + mowerSize / 2), -(startmowerPositionY + mowerSize / 2));

    for (const key in serverInfo) {
        if (Object.hasOwnProperty.call(serverInfo, key)) {
            if (clientID !== key) {
                ctx.save();

                // Den Ursprung auf die Mitte des Bildes verschieben
                ctx.translate(serverInfo[key][0] + mowerSize / 2, serverInfo[key][1] + mowerSize / 2);

                // Das Bild um die eigene Achse drehen
                ctx.rotate(serverInfo[key][2] * Math.PI / 180);

                // Das Bild zeichnen (Berücksichtigen Sie die Verschiebung des Ursprungs)
                ctx.drawImage(mowerImg, -mowerSize / 2, -mowerSize / 2, mowerSize, mowerSize);

                // Die Transformationen zurücksetzen
                ctx.rotate(-mowerRotation * Math.PI / 180);
                ctx.translate(-(serverInfo[key][0] + mowerSize / 2), -(serverInfo[key][1] + mowerSize / 2));

                ctx.restore();
            }

            /* ctx.drawImage(mowerImg, serverInfo[key][0], serverInfo[key][1], mowerSize, mowerSize); */
        }
    }

    canvas.style.transform = 'translate('+ ((window.innerWidth / 2) - startmowerPositionX - 50 - mowerSize / 2) + 'px, '+ ((window.innerHeight / 2) - startmowerPositionY - 50 - mowerSize / 2) +'px)';

    requestAnimationFrame(animate);
}

setInterval(() => {
    gamelogic();
}, 1000 / fps);

setInterval(() => {
    socketemit();
}, 1000 / (fps / 2));

setInterval(() => {
    displayRenderFPS = renderFPS;
    renderFPS = 0;
}, 1000);

requestAnimationFrame(animate);