"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const mowerImg = new Image;
const mowerURL = [
    'images/mower.png',
    'images/mower_2.png',
    'images/mower_3.png',
    'images/mower_4.png',
    'images/mower_5.png',
    'images/mower_6.png',
    'images/mower_0.png'
];
const mower0 = new Image;
mower0.src = mowerURL[6];
const mower1 = new Image;
mower1.src = mowerURL[0];
const mower2 = new Image;
mower2.src = mowerURL[1];
const mower3 = new Image;
mower3.src = mowerURL[2];
const mower4 = new Image;
mower4.src = mowerURL[3];
const mower5 = new Image;
mower5.src = mowerURL[4];
const mower6 = new Image;
mower6.src = mowerURL[5];

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
let clientID = "undefined";

const mowerSize = 100;
let motionX = 0;
let motionY = 0;
const mowerSpeed = 4;
let offsetMowerSpeed = mowerSpeed;
let startmowerPositionX = (canvas.width / 2) - (mowerSize / 2);
let startmowerPositionY = (canvas.height / 2) - (mowerSize / 2);
let mowerRotation = 0;
let targetRotation = 0;
const rasenPartikelAnzahl = 300;
let rasenPositionen = {};
let flowerPositionen = {};
let obstaclePositionen = {};
let keysState = {};
const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
let score = 0;
let cooldown = 0;
let lastUpdatedDate = new Date().getTime();

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
let serverInfo = {};
mowerImg.src = mowerURL[mowerColor];

socket.on('clientID', (data) => {
    clientID = data;
});

function interpolateMowerPosition(offsetMowerSpeed, offsetSpeedMultiplier) {
    for (const key in serverInfo) {
        if (Object.hasOwnProperty.call(serverInfo, key)) {
            const element = serverInfo[key];

            const deltaX = Math.sign(element[0] - element[5]);
            const deltaY = Math.sign(element[1] - element[6]);

            // Kürzesten Drehwinkel zwischen aktueller Rotation und Zielrotation berechnen
            const angleDiff = (((element[2] - element[7]) + 180) % 360 + 360) % 360 - 180;

            // Drehung anpassen (maximal 10 Grad pro Schritt)
            let rotationStep = Math.sign(angleDiff) * Math.min(10 / offsetSpeedMultiplier, Math.abs(angleDiff));

            serverInfo[key][5] = element[5] + deltaX * offsetMowerSpeed;
            serverInfo[key][6] = element[6] + deltaY * offsetMowerSpeed;
            serverInfo[key][7] = (element[7] + rotationStep + 360) % 360;
        }
    }
}

socket.on('serverInfo', (data) => {
    serverInfo = data;
    if (serverInfo[clientID] !== undefined) score = serverInfo[clientID][4];
});

socket.on('rasenPartikel', (data) => {
    rasenPositionen = data;
});

socket.on('flowers', (data) => {
    flowerPositionen = data;
});

socket.on('obstacles', (data) => {
    obstaclePositionen = data;
});

socket.on('RemoveRasenPartikel', (data) => {
    data.forEach(element => {
        delete rasenPositionen[element];
    });
});

socket.on('RemoveFlowers', (data) => {
    data.forEach(element => {
        delete flowerPositionen[element];
    });
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

window.addEventListener('touchcancel', function () {
    emulateKeyUpAll();
});

window.addEventListener('touchend', function () {
    emulateKeyUpAll();
});

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
setInterval(() => {
    document.getElementById('dev_anzeige').textContent = 'RasenRasen Client-ID: ' + clientID + ' Motion-X: ' + motionX + ' Motion-Y: ' + motionY + ' Rotation: ' + mowerRotation + ' Engine-FPS: ' + displayLogicFPS + ' FPS: ' + displayRenderFPS;
    document.getElementById('score').textContent = 'Score: ' + score;
}, 800);

canvas.style.top = (window.innerHeight / 2) - (canvas.height / 2);
canvas.style.left = (window.innerWidth / 2) - (canvas.width / 2);

function getRandomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gamelogic() {
    logicFPS++;
    const currentTime = new Date().getTime();
    const timeOffset = currentTime - lastUpdatedDate;
    const offsetSpeedMultiplier = (1000 / 60) / timeOffset;
    lastUpdatedDate = currentTime;

    offsetMowerSpeed = mowerSpeed / offsetSpeedMultiplier;

    startmowerPositionX += motionX;
    startmowerPositionY += motionY;

    interpolateMowerPosition(offsetMowerSpeed, offsetSpeedMultiplier);

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

    updateMotionAndRotation();
    requestAnimationFrame(gamelogic);
}

function socketemit() {
    if (cooldown <= 0) {
        for (const key in obstaclePositionen) {
            const [objX, objY] = obstaclePositionen[key];
            const abstand = Math.sqrt(Math.pow(objX - (startmowerPositionX + 50), 2) + Math.pow(objY - (startmowerPositionY + 50), 2));

            if (abstand <= 40) {
                cooldown = 2;

                // Visuelles Feedback (Schaden) bleibt bestehen
                document.getElementById('score_damage').style.animation = 'none';
                void document.getElementById('score_damage').offsetWidth;
                document.getElementById('score_damage').style.animation = null;
                document.getElementById('score_damage').style.animationPlayState = 'running';
            }
        }
    }
    
    clientInfo = [startmowerPositionX, startmowerPositionY, mowerRotation, mowerColor, score];
    socket.emit('clientInfo', clientInfo);
}

function animate() {
    renderFPS++; /* Rendered FPS analysis */
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const key in rasenPositionen) {
        if (Object.hasOwnProperty.call(rasenPositionen, key)) {
            const element = rasenPositionen[key];
            ctx.fillStyle = "rgb(88, 114, 36)";
            ctx.fillRect(element[0], element[1], 10, 10); // x, y, width, height
        }
    }

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
    ctx.drawImage(mowerImg, -mowerSize / 2, -mowerSize / 2, mowerSize, mowerSize);

    // Die Transformationen zurücksetzen
    ctx.rotate(-mowerRotation * Math.PI / 180);
    ctx.translate(-(startmowerPositionX + mowerSize / 2), -(startmowerPositionY + mowerSize / 2));

    for (const key in serverInfo) {
        if (Object.hasOwnProperty.call(serverInfo, key)) {
            if (clientID !== key) {
                ctx.save();

                // Den Ursprung auf die Mitte des Bildes verschieben
                ctx.translate(serverInfo[key][5] + mowerSize / 2, serverInfo[key][6] + mowerSize / 2);

                // Das Bild um die eigene Achse drehen
                ctx.rotate(serverInfo[key][7] * Math.PI / 180);

                // Das Bild zeichnen (Berücksichtigen Sie die Verschiebung des Ursprungs)
                let differentMower;

                switch (serverInfo[key][3]) {
                    case 0:
                        differentMower = mower1;
                        break;

                    case 1:
                        differentMower = mower2;
                        break;

                    case 2:
                        differentMower = mower3;
                        break;

                    case 3:
                        differentMower = mower4;
                        break;

                    case 4:
                        differentMower = mower5;
                        break;

                    case 5:
                        differentMower = mower6;
                        break;

                    case 6:
                        differentMower = mower0;
                        break;

                    default:
                        differentMower = mower1;
                        break;
                }
                ctx.drawImage(differentMower, -mowerSize / 2, -mowerSize / 2, mowerSize, mowerSize);

                // Die Transformationen zurücksetzen
                ctx.rotate(-serverInfo[key][7] * Math.PI / 180);
                ctx.translate(-(serverInfo[key][5] + mowerSize / 2), -(serverInfo[key][6] + mowerSize / 2));

                ctx.restore();
            }
        }
    }

    canvas.style.transform = 'translate(' + ((window.innerWidth / 2) - startmowerPositionX - 50 - mowerSize / 2) + 'px, ' + ((window.innerHeight / 2) - startmowerPositionY - 50 - mowerSize / 2) + 'px)';

    requestAnimationFrame(animate);
}

requestAnimationFrame(gamelogic);

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

/* Opacity 0 / 1 for Main when pressed Fullscreen button */
function disableMain() {
    if (document.getElementById('main_overlay').style.opacity === "0") {
        document.getElementById('main_overlay').style.opacity = 1;
        document.getElementById('fullscreen_btn').textContent = '+';
    } else {
        document.getElementById('main_overlay').style.opacity = 0;
        document.getElementById('fullscreen_btn').textContent = '-';
    }
}
window.addEventListener('keyup', function (event) {
    if (event.keyCode === 27) {
        event.preventDefault();
        disableMain();
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
    } else if (window.innerWidth < 435 && window.innerHeight > 435) {
        document.getElementById("disableonmobile").style.display = 'none';
        if (isTouch) {
            setTimeout(() => {
                alert('Bitte drehen Sie Ihr Gerät ins Querformat!');
            }, 250);
        }
    } else {
        document.getElementById("disableonmobile").style.display = 'block';
    }
}

/* Touch Controller */

const joystickContainer = document.getElementById('joystick-container');
const joystick = document.getElementById('joystick');

function touchend() {
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
    let touch = event.touches[0];
    const posX = touch.clientX - 40;
    const posY = touch.clientY - 40;

    joystickContainer.style.display = 'flex';

    joystickContainer.style.top = posY + 'px';
    joystickContainer.style.left = posX + 'px';
});

window.addEventListener('touchmove', function (event) {
    if (joystickContainer.style.display !== 'none') {
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

window.addEventListener('touchcancel', touchend);
window.addEventListener('touchend', touchend);

window.addEventListener('load', mobileResizeFeature);
window.addEventListener('resize', mobileResizeFeature);