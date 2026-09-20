/* =========================================================
   NEUROGRIP - COMPLETE JAVASCRIPT
   Arduino + 5 Servo + REAL EMG GRAPH
========================================================= */

/* =========================================================
   GLOBAL VARIABLES
========================================================= */

let port = null;
let reader = null;
let inputStream = null;

let connected = false;

let currentExercise = "None";
let totalRepetitions = 0;

let sessionStartTime = null;
let sessionTimer = null;

let emgValues = [];
let emgData = [];

const MAX_EMG_POINTS = 300;

/* EMG range for Arduino Uno ADC */
const EMG_MIN = 0;
const EMG_MAX = 1023;

/* =========================================================
   PAGE LOAD
========================================================= */

window.addEventListener("load", function () {

    const splash = document.getElementById("splashScreen");
    const app = document.getElementById("app");

    if (splash) {

        setTimeout(function () {

            splash.style.opacity = "0";

            setTimeout(function () {

                splash.style.display = "none";

                if (app) {
                    app.style.display = "block";
                }

                resizeEMGCanvas();

            }, 250);

        }, 1000);

    } else {

        if (app) {
            app.style.display = "block";
        }

        resizeEMGCanvas();
    }

    loadHistory();

    /*
       Start graph animation even before EMG arrives.
       It will remain flat until Arduino sends real data.
    */
    requestAnimationFrame(graphLoop);
});


/* =========================================================
   PAGE NAVIGATION
========================================================= */

function showPage(pageName, button) {

    const pages = document.querySelectorAll(".page");

    pages.forEach(function (page) {
        page.classList.remove("activePage");
    });

    const selectedPage = document.getElementById(pageName);

    if (selectedPage) {
        selectedPage.classList.add("activePage");
    }

    const buttons = document.querySelectorAll(".navButton");

    buttons.forEach(function (btn) {
        btn.classList.remove("active");
    });

    if (button) {
        button.classList.add("active");
    }

    if (pageName === "dashboard") {

        setTimeout(function () {
            resizeEMGCanvas();
        }, 100);
    }
}


/* =========================================================
   CONNECT ARDUINO
========================================================= */

async function connectArduino() {

    if (!("serial" in navigator)) {

        alert(
            "Web Serial is not supported.\n\n" +
            "Please use Google Chrome or Microsoft Edge."
        );

        return;
    }

    try {

        port = await navigator.serial.requestPort();

        /*
           IMPORTANT:
           This must match Serial.begin()
           in Arduino code.
        */
        await port.open({
            baudRate: 115200
        });

        connected = true;

        updateConnectionUI(true);

        console.log("Arduino connected");

        /*
           Clear old graph
        */
        emgData = [];
        emgValues = [];

        drawEMG();

        readArduino();

    }

    catch (error) {

        console.error(
            "Arduino connection error:",
            error
        );

        connected = false;

        updateConnectionUI(false);

        alert(
            "Arduino connection failed.\n\n" +
            "Close Arduino Serial Monitor and try again."
        );
    }
}


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(isConnected) {

    const button =
        document.getElementById("connectBtn");

    const status =
        document.getElementById("connectionStatus");

    if (!button || !status) {
        return;
    }

    if (isConnected) {

        button.innerHTML =
            "🟢 Arduino Connected";

        status.innerHTML =
            "● Connected";

        status.className =
            "connectionStatus connected";

    } else {

        button.innerHTML =
            "🔌 Connect Arduino";

        status.innerHTML =
            "● Disconnected";

        status.className =
            "connectionStatus disconnected";
    }
}


/* =========================================================
   READ ARDUINO SERIAL
========================================================= */

async function readArduino() {

    if (!port || !port.readable) {
        return;
    }

    const decoder =
        new TextDecoderStream();

    inputStream =
        port.readable.pipeThrough(decoder);

    reader =
        inputStream.getReader();

    let buffer = "";

    try {

        while (true) {

            const result =
                await reader.read();

            const value =
                result.value;

            const done =
                result.done;

            if (done) {
                break;
            }

            if (value) {

                buffer += value;

                const lines =
                    buffer.split(/\r?\n/);

                buffer =
                    lines.pop();

                lines.forEach(function (line) {

                    line = line.trim();

                    if (line.length > 0) {

                        console.log(
                            "Arduino:",
                            line
                        );

                        processArduinoData(line);
                    }
                });
            }
        }

    }

    catch (error) {

        console.error(
            "Serial reading error:",
            error
        );

        connected = false;

        updateConnectionUI(false);
    }
}


/* =========================================================
   PROCESS ARDUINO DATA
========================================================= */

function processArduinoData(data) {

    data = data.trim();

    /*
       =====================================================
       REAL EMG DATA

       Arduino sends:

       EMG:512
       EMG:350
       EMG:700

       This is what creates the waveform.
       =====================================================
    */

    if (data.startsWith("EMG:")) {

        const rawValue =
            data.substring(4).trim();

        const value =
            Number(rawValue);

        if (
            Number.isFinite(value) &&
            value >= 0 &&
            value <= 1023
        ) {

            updateEMG(value);
        }

        return;
    }


    /*
       =====================================================
       ANGLE
       ANGLE:THUMB:180
       =====================================================
    */

    if (data.startsWith("ANGLE:")) {

        const parts =
            data.split(":");

        if (parts.length >= 3) {

            const finger =
                parts[1]
                    .trim()
                    .toUpperCase();

            const angle =
                Number(parts[2]);

            if (Number.isFinite(angle)) {

                updateFingerAngle(
                    finger,
                    angle
                );
            }
        }

        return;
    }


    /*
       =====================================================
       REPETITION
       =====================================================
    */

    if (data.startsWith("REP:")) {

        const repValue =
            Number(data.substring(4));

        if (Number.isFinite(repValue)) {

            totalRepetitions =
                repValue;

        } else {

            totalRepetitions++;
        }

        setText(
            "repCount",
            totalRepetitions
        );

        setText(
            "reportReps",
            totalRepetitions
        );

        return;
    }


    /*
       =====================================================
       READY
       =====================================================
    */

    if (
        data === "READY" ||
        data === "NEUROGRIP_READY"
    ) {

        console.log(
            "NEUROGRIP Arduino READY"
        );

        return;
    }


    /*
       =====================================================
       START
       =====================================================
    */

    if (data.startsWith("START:")) {

        const exercise =
            data.substring(6).trim();

        currentExercise =
            exercise;

        setText(
            "currentExercise",
            exercise
        );

        setText(
            "exerciseStatus",
            exercise +
            " exercise running"
        );

        return;
    }


    /*
       =====================================================
       STOP
       =====================================================
    */

    if (
        data === "STOPPED" ||
        data === "STOP"
    ) {

        setText(
            "exerciseStatus",
            "Exercise stopped"
        );

        return;
    }
}


/* =========================================================
   SEND COMMAND TO ARDUINO
========================================================= */

async function sendCommand(command) {

    if (!port || !port.writable) {

        alert(
            "Please connect Arduino first."
        );

        return false;
    }

    try {

        const writer =
            port.writable.getWriter();

        const encoder =
            new TextEncoder();

        await writer.write(
            encoder.encode(
                command + "\n"
            )
        );

        writer.releaseLock();

        console.log(
            "Sent to Arduino:",
            command
        );

        return true;

    }

    catch (error) {

        console.error(
            "Send command error:",
            error
        );

        return false;
    }
}


/* =========================================================
   START EXERCISE
========================================================= */

async function startExercise(exercise) {

    if (!port || !port.writable) {

        alert(
            "Connect Arduino first."
        );

        return;
    }

    totalRepetitions = 0;

    emgValues = [];

    currentExercise =
        exercise;

    setText(
        "currentExercise",
        exercise
    );

    setText(
        "repCount",
        "0"
    );

    setText(
        "exerciseStatus",
        exercise +
        " exercise running"
    );

    startSessionTimer();

    const success =
        await sendCommand(
            exercise.toUpperCase()
        );

    if (!success) {

        setText(
            "exerciseStatus",
            "Command failed"
        );
    }
}


/* =========================================================
   STOP EXERCISE
========================================================= */

async function stopExercise() {

    await sendCommand("STOP");

    setText(
        "exerciseStatus",
        "Exercise stopped"
    );

    saveCurrentSession();

    currentExercise =
        "None";

    setText(
        "currentExercise",
        "None"
    );

    stopSessionTimer();
}


/* =========================================================
   SESSION TIMER
========================================================= */

function startSessionTimer() {

    stopSessionTimer();

    sessionStartTime =
        Date.now();

    sessionTimer =
        setInterval(function () {

            const elapsed =
                Date.now() -
                sessionStartTime;

            const seconds =
                Math.floor(
                    elapsed / 1000
                );

            updateTimeDisplay(
                seconds
            );

        }, 1000);
}


/* =========================================================
   STOP TIMER
========================================================= */

function stopSessionTimer() {

    if (sessionTimer) {

        clearInterval(
            sessionTimer
        );

        sessionTimer = null;
    }
}


/* =========================================================
   UPDATE TIME
========================================================= */

function updateTimeDisplay(seconds) {

    const minutes =
        Math.floor(
            seconds / 60
        );

    const remainingSeconds =
        seconds % 60;

    const text =
        String(minutes).padStart(2, "0")
        + ":" +
        String(remainingSeconds).padStart(2, "0");

    setText(
        "sessionTime",
        text
    );

    setText(
        "reportTime",
        text
    );
}


/* =========================================================
   FINGER ANGLE
========================================================= */

function updateFingerAngle(
    finger,
    angle
) {

    angle =
        Math.max(
            0,
            Math.min(
                180,
                angle
            )
        );

    let angleId = "";
    let barId = "";

    switch (
        finger.toUpperCase()
    ) {

        case "THUMB":

            angleId =
                "thumbAngle";

            barId =
                "thumbBar";

            break;

        case "INDEX":

            angleId =
                "indexAngle";

            barId =
                "indexBar";

            break;

        case "MIDDLE":

            angleId =
                "middleAngle";

            barId =
                "middleBar";

            break;

        case "RING":

            angleId =
                "ringAngle";

            barId =
                "ringBar";

            break;

        case "LITTLE":

            angleId =
                "littleAngle";

            barId =
                "littleBar";

            break;
    }

    if (angleId) {

        const angleElement =
            document.getElementById(
                angleId
            );

        if (angleElement) {

            angleElement.innerText =
                Math.round(angle);
        }
    }

    if (barId) {

        const barElement =
            document.getElementById(
                barId
            );

        if (barElement) {

            barElement.style.width =
                (angle / 180 * 100) +
                "%";
        }
    }
}


/* =========================================================
   EMG CANVAS
========================================================= */

const emgCanvas =
    document.getElementById(
        "emgCanvas"
    );

let emgCtx = null;

if (emgCanvas) {

    emgCtx =
        emgCanvas.getContext(
            "2d"
        );
}


/* =========================================================
   RESIZE GRAPH
========================================================= */

function resizeEMGCanvas() {

    if (
        !emgCanvas ||
        !emgCtx
    ) {
        return;
    }

    const rect =
        emgCanvas.getBoundingClientRect();

    if (
        rect.width <= 0 ||
        rect.height <= 0
    ) {
        return;
    }

    const dpr =
        window.devicePixelRatio || 1;

    emgCanvas.width =
        Math.round(
            rect.width * dpr
        );

    emgCanvas.height =
        Math.round(
            rect.height * dpr
        );

    emgCanvas.style.width =
        rect.width + "px";

    emgCanvas.style.height =
        rect.height + "px";

    emgCtx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    drawEMG();
}


window.addEventListener(
    "resize",
    resizeEMGCanvas
);


/* =========================================================
   UPDATE EMG
========================================================= */

function updateEMG(value) {

    value =
        Number(value);

    if (
        !Number.isFinite(value)
    ) {
        return;
    }

    /*
       Keep value between Arduino ADC limits
    */

    value =
        Math.max(
            EMG_MIN,
            Math.min(
                EMG_MAX,
                value
            )
        );


    /*
       Display current EMG value
    */

    setText(
        "emgValue",
        Math.round(value)
    );

    setText(
        "emgLargeValue",
        Math.round(value)
    );


    /*
       Save complete session data
    */

    emgValues.push(value);

    if (
        emgValues.length > 2000
    ) {

        emgValues.shift();
    }


    /*
       Add value to graph
    */

    emgData.push(value);

    if (
        emgData.length >
        MAX_EMG_POINTS
    ) {

        emgData.shift();
    }


    /*
       Hide waiting message
    */

    const waiting =
        document.getElementById(
            "emgWaiting"
        );

    if (waiting) {

        waiting.style.display =
            "none";
    }


    /*
       Update graph immediately
    */

    drawEMG();
}


/* =========================================================
   CONTINUOUS GRAPH ANIMATION
========================================================= */

function graphLoop() {

    if (
        emgData.length >= 2
    ) {

        drawEMG();
    }

    requestAnimationFrame(
        graphLoop
    );
}


/* =========================================================
   DRAW REAL EMG WAVEFORM
========================================================= */

function drawEMG() {

    if (
        !emgCanvas ||
        !emgCtx
    ) {
        return;
    }

    const width =
        emgCanvas.clientWidth;

    const height =
        emgCanvas.clientHeight;

    if (
        width <= 0 ||
        height <= 0
    ) {
        return;
    }


    /*
       Clear graph
    */

    emgCtx.clearRect(
        0,
        0,
        width,
        height
    );


    /*
       Background
    */

    emgCtx.fillStyle =
        "#f7fcfa";

    emgCtx.fillRect(
        0,
        0,
        width,
        height
    );


    /*
       GRID
    */

    emgCtx.strokeStyle =
        "#dcece8";

    emgCtx.lineWidth = 1;


    /*
       Horizontal lines
    */

    for (
        let i = 0;
        i <= 5;
        i++
    ) {

        const y =
            (height / 5) * i;

        emgCtx.beginPath();

        emgCtx.moveTo(
            0,
            y
        );

        emgCtx.lineTo(
            width,
            y
        );

        emgCtx.stroke();
    }


    /*
       Vertical lines
    */

    for (
        let i = 0;
        i <= 10;
        i++
    ) {

        const x =
            (width / 10) * i;

        emgCtx.beginPath();

        emgCtx.moveTo(
            x,
            0
        );

        emgCtx.lineTo(
            x,
            height
        );

        emgCtx.stroke();
    }


    /*
       If there is no Arduino data,
       show center waiting line.
    */

    if (
        emgData.length < 2
    ) {

        emgCtx.strokeStyle =
            "#b8d8d0";

        emgCtx.lineWidth = 2;

        emgCtx.beginPath();

        emgCtx.moveTo(
            0,
            height / 2
        );

        emgCtx.lineTo(
            width,
            height / 2
        );

        emgCtx.stroke();

        return;
    }


    /*
       =====================================================
       IMPORTANT

       Arduino Uno EMG ADC = 0 to 1023

       We use a FIXED SCALE.

       This means:
       small muscle activity -> small wave
       strong muscle activity -> large wave

       The graph will NOT keep resizing itself.
       =====================================================
    */


    /*
       Draw waveform
    */

    emgCtx.beginPath();


    for (
        let i = 0;
        i < emgData.length;
        i++
    ) {

        /*
           Spread data across the graph
        */

        const x =
            (i /
                (MAX_EMG_POINTS - 1))
            * width;


        /*
           Convert ADC value to graph position
        */

        const normalized =
            (emgData[i] - EMG_MIN) /
            (EMG_MAX - EMG_MIN);


        /*
           Flip Y because canvas starts at top
        */

        const y =
            height -
            (
                normalized *
                height
            );


        if (i === 0) {

            emgCtx.moveTo(
                x,
                y
            );

        } else {

            emgCtx.lineTo(
                x,
                y
            );
        }
    }


    /*
       EMG waveform appearance
    */

    emgCtx.strokeStyle =
        "#1ca486";

    emgCtx.lineWidth =
        2.5;

    emgCtx.lineJoin =
        "round";

    emgCtx.lineCap =
        "round";

    emgCtx.stroke();


    /*
       Draw latest signal point
    */

    if (
        emgData.length > 0
    ) {

        const last =
            emgData[
                emgData.length - 1
            ];

        const x =
            (
                (emgData.length - 1) /
                (MAX_EMG_POINTS - 1)
            ) * width;

        const normalized =
            (last - EMG_MIN) /
            (EMG_MAX - EMG_MIN);

        const y =
            height -
            normalized * height;

        emgCtx.beginPath();

        emgCtx.arc(
            x,
            y,
            4,
            0,
            Math.PI * 2
        );

        emgCtx.fillStyle =
            "#1ca486";

        emgCtx.fill();
    }
}


/* =========================================================
   SAVE SESSION
========================================================= */

function saveCurrentSession() {

    if (
        currentExercise === "None"
    ) {
        return;
    }

    const duration =
        getText(
            "sessionTime",
            "00:00"
        );

    let averageEMG = 0;

    if (
        emgValues.length > 0
    ) {

        const sum =
            emgValues.reduce(
                function (
                    total,
                    value
                ) {

                    return total + value;

                },
                0
            );

        averageEMG =
            Math.round(
                sum /
                emgValues.length
            );
    }


    const session = {

        exercise:
            currentExercise,

        repetitions:
            totalRepetitions,

        duration:
            duration,

        averageEMG:
            averageEMG,

        date:
            new Date().toLocaleString()
    };


    let history =
        JSON.parse(
            localStorage.getItem(
                "rehabHistory"
            )
        ) || [];


    history.unshift(
        session
    );


    if (
        history.length > 50
    ) {

        history =
            history.slice(
                0,
                50
            );
    }


    localStorage.setItem(
        "rehabHistory",
        JSON.stringify(
            history
        )
    );


    renderHistory();


    setText(
        "reportExercise",
        session.exercise
    );

    setText(
        "reportReps",
        session.repetitions
    );

    setText(
        "reportTime",
        session.duration
    );

    setText(
        "reportEMG",
        session.averageEMG
    );
}


/* =========================================================
   HISTORY
========================================================= */

function loadHistory() {

    renderHistory();
}


function renderHistory() {

    const container =
        document.getElementById(
            "historyContainer"
        );

    if (!container) {
        return;
    }


    let history =
        JSON.parse(
            localStorage.getItem(
                "rehabHistory"
            )
        ) || [];


    if (
        history.length === 0
    ) {

        container.innerHTML = `

            <div class="emptyHistory">

                📋

                <h3>No sessions yet</h3>

                <p>
                    Completed sessions will appear here.
                </p>

            </div>

        `;

        return;
    }


    container.innerHTML =
        history.map(
            function (item) {

                return `

                    <div class="historyItem">

                        <strong>
                            ${item.exercise}
                        </strong>

                        <span>
                            🔁 ${item.repetitions} reps
                        </span>

                        <span>
                            ⏱️ ${item.duration}
                        </span>

                        <span>
                            ⚡ EMG ${item.averageEMG}
                        </span>

                        <span>
                            ${item.date}
                        </span>

                    </div>

                `;

            }
        ).join("");
}


/* =========================================================
   RESET HISTORY
========================================================= */

function resetHistory() {

    const answer =
        confirm(
            "Delete all rehabilitation history?"
        );

    if (!answer) {
        return;
    }

    localStorage.removeItem(
        "rehabHistory"
    );

    renderHistory();
}


/* =========================================================
   DOWNLOAD REPORT
========================================================= */

function downloadReport() {

    const exercise =
        getText(
            "reportExercise",
            "None"
        );

    const reps =
        getText(
            "reportReps",
            "0"
        );

    const time =
        getText(
            "reportTime",
            "00:00"
        );

    const emg =
        getText(
            "reportEMG",
            "0"
        );


    const report =

`NEUROGRIP
SMART HAND REHABILITATION GLOVE
========================================

REHABILITATION EXERCISE REPORT

Date:
${new Date().toLocaleString()}

Exercise:
${exercise}

Total Repetitions:
${reps}

Session Duration:
${time}

Average EMG Signal:
${emg}

========================================
NEUROGRIP
Smart Hand Rehabilitation System
`;


    const blob =
        new Blob(
            [report],
            {
                type:
                    "text/plain"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    link.href =
        url;

    link.download =
        "NEUROGRIP_Report.txt";


    document.body.appendChild(
        link
    );

    link.click();

    document.body.removeChild(
        link
    );


    URL.revokeObjectURL(
        url
    );
}


/* =========================================================
   HELPER FUNCTIONS
========================================================= */

function setText(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );

    if (element) {

        element.innerText =
            value;
    }
}


function getText(
    id,
    defaultValue
) {

    const element =
        document.getElementById(
            id
        );

    if (element) {

        return element.innerText;
    }

    return defaultValue;
}


/* =========================================================
   OPTIONAL:
   MANUAL FINGER BUTTON FUNCTIONS
========================================================= */

function moveFinger(finger) {

    if (!connected) {

        alert(
            "Connect Arduino first."
        );

        return;
    }

    sendCommand(
        finger.toUpperCase()
    );
}


/* =========================================================
   INDIVIDUAL FINGER FUNCTIONS

   You can call these from HTML:

   onclick="moveThumb()"
   onclick="moveIndex()"
   onclick="moveMiddle()"
   onclick="moveRing()"
   onclick="moveLittle()"
========================================================= */

function moveThumb() {
    moveFinger("THUMB");
}

function moveIndex() {
    moveFinger("INDEX");
}

function moveMiddle() {
    moveFinger("MIDDLE");
}

function moveRing() {
    moveFinger("RING");
}

function moveLittle() {
    moveFinger("LITTLE");
}


/* =========================================================
   STOP ALL FINGERS
========================================================= */

function stopAllFingers() {

    if (!connected) {

        alert(
            "Connect Arduino first."
        );

        return;
    }

    sendCommand("STOP");
}
