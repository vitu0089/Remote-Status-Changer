"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const imageData_1 = __importDefault(require("./imageData"));
const ws_1 = require("ws");
// Settings
const webPort = 39984;
const socketManagerPort = 61235;
const socketDisplayPort = 61236;
const verboseMode = true;
const ChangeTimes = [
    {
        TimeOfDayPlusTime: {
            hours: 9
        },
        Image: "Open 9 -> 14",
        AvoidWeekends: true
    },
    {
        TimeOfDayPlusTime: {
            hours: 14
        },
        Image: "Long Pause (Purple)",
        AvoidWeekends: true
    }
];
// Variables
const app = (0, express_1.default)();
let selectedImage = null;
let defaultImage = "Open 9 -> 14";
let socketArray = [];
// Verbose printout
function VerboseLog(...args) {
    if (!verboseMode)
        return;
    console.log(`[ Verbose ]`, ...args, `Time: ${Date().split("GMT")[0]}`);
}
app.use((req, res, next) => {
    VerboseLog(req.url, "IP:", req.ip);
    next();
});
// Application Connections
app.get("/display", (req, res) => {
    const filePath = `${__dirname}/pages/display.html`;
    res.sendFile(filePath);
});
app.get("/controls", (req, res) => {
    const filePath = `${__dirname}/pages/controller.html`;
    res.sendFile(filePath);
});
app.get("/controls/imageData", (req, res) => {
    res.send(JSON.stringify(imageData_1.default));
});
app.get("/style/:cssName", (req, res) => {
    const cssName = req.params.cssName;
    const filePath = `${__dirname}/style/${cssName}`;
    if (!fs_1.default.existsSync(filePath)) {
        res.writeHead(404, "File not found");
        return;
    }
    res.sendFile(filePath);
});
app.get("/img/:imgName", (req, res) => {
    const imgName = req.params.imgName;
    const filePath = `${__dirname}/images/${imgName}`;
    if (!fs_1.default.existsSync(filePath)) {
        res.writeHead(404, "File not found");
        return;
    }
    res.sendFile(filePath);
});
app.get("/script/:scriptName", (req, res) => {
    const script = req.params.scriptName;
    const filePath = `${__dirname}/scripts/${script}`;
    if (!fs_1.default.existsSync(filePath)) {
        res.writeHead(404, "File not found");
        return;
    }
    res.sendFile(filePath);
});
// Websockets
const managerWebsocketServer = new ws_1.WebSocketServer({ port: socketManagerPort });
managerWebsocketServer.on("connection", (ws, req) => {
    VerboseLog("Websocket MANAGER connected on IP:", req.socket.remoteAddress);
    // Add to list
    socketArray.push(ws);
    // Prepare for "SET" requests
    ws.on("message", (data) => {
        const newImageName = data.toString();
        ChangeImage(newImageName);
    });
    // Send initial image
    ws.send(selectedImage && JSON.stringify(imageData_1.default.find(v => v.Name == selectedImage)) || "None");
});
const displayWebsocketServer = new ws_1.WebSocketServer({ port: socketDisplayPort });
displayWebsocketServer.on("connection", (ws, req) => {
    VerboseLog("Websocket DISPLAY connected on IP:", req.socket.remoteAddress);
    // Add to list
    socketArray.push(ws);
    // Send initial image
    ws.send(selectedImage && JSON.stringify(imageData_1.default.find(v => v.Name == selectedImage)) || "None");
});
// Start Server
app.listen(webPort, () => {
    console.log(`Listening on port: ${webPort}`);
});
// Image Changing
async function BroadcastCurrentImage() {
    VerboseLog("Broadcasting image:", selectedImage, " to", socketArray.length, "client(s)");
    // Validity Check
    for (const i in socketArray) {
        const index = Number.parseInt(i);
        const socket = socketArray[index];
        if (!socket) {
            // Socket has closed or dissapeared, probably closed though
            socketArray.slice(index, 1);
            return BroadcastCurrentImage();
        }
    }
    // Get image data
    const image = selectedImage && imageData_1.default.find(v => v.Name == selectedImage) || null;
    // Send
    for (const i in socketArray) {
        const socket = socketArray[i];
        if (socket) {
            socket.send(selectedImage != null && JSON.stringify(image) || "None");
        }
    }
}
async function ChangeImage(name, automatic) {
    VerboseLog(`${automatic && `[ AUTOMATIC ]` || ""}Changing image to:`, name);
    // Null Check
    if (name == null) {
        selectedImage = null;
        BroadcastCurrentImage();
        return true;
    }
    // Find image information
    let imageData = imageData_1.default.find(v => v.Name == name);
    if (!imageData) {
        console.warn(`No image by the name: ${name}`);
        return false;
    }
    selectedImage = name;
    BroadcastCurrentImage();
    return true;
}
// Default Image
ChangeImage(defaultImage);
// Automation
async function GetTimeTillChange() {
    const date = new Date();
    const day = date.getDay();
    const isWeekend = day == 0 || day == 6;
    let nextSwitch = null;
    let todaysSchedulePassed = true;
    // Run through the dates
    for (const key in ChangeTimes) {
        // Get object and verify data
        const data = ChangeTimes[key];
        if (!data)
            continue;
        // Weekend Check
        if (data.AvoidWeekends && isWeekend)
            continue;
        // Time Check [In Ms, unfortunately]
        let targetTimeFromMidnight = (data.TimeOfDayPlusTime.hours || 0) * 3_600_000 + // Hours in ms
            (data.TimeOfDayPlusTime.minutes || 0) * 60_000; // Minutes in ms
        let currentTimeFromMidnight = date.getHours() * 3_600_000 +
            date.getMinutes() * 60_000 +
            date.getSeconds() * 1_000 +
            date.getMilliseconds();
        // Already Passed Check
        if (currentTimeFromMidnight >= targetTimeFromMidnight)
            continue;
        todaysSchedulePassed = false;
        // Compare And Apply
        const calculatedWaitTime = targetTimeFromMidnight - currentTimeFromMidnight;
        if (!nextSwitch || calculatedWaitTime < nextSwitch.TimeMs) {
            nextSwitch = {
                TimeMs: calculatedWaitTime,
                Image: data.Image
            };
        }
    }
    return nextSwitch ||
        todaysSchedulePassed && {
            TimeMs: 86_460_000 - date.getMilliseconds(), // [ Midnight clock ] If all tasks have passed, just wait till a minute past midnight to try again
            Image: selectedImage || "Open 9 -> 14"
        } ||
        {
            TimeMs: 600_000, // [ Fallback ] Wait 10 minutes before trying again, stay open in the meantime
            Image: "Open 9 -> 14"
        };
}
async function RunAutomationLoop() {
    const timeTillChangeObject = await GetTimeTillChange();
    setTimeout(() => {
        ChangeImage(timeTillChangeObject.Image, true);
        // Wait 5 seconds to not overlap anything
        setTimeout(RunAutomationLoop, 5_000);
    }, timeTillChangeObject.TimeMs);
}
RunAutomationLoop();
//# sourceMappingURL=index.js.map