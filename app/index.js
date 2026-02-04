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
const socketPort = 61235;
const verboseMode = true;
// Variables
const app = (0, express_1.default)();
let selectedImage = null;
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
app.get("/Display", (req, res) => {
    // Send image to client and establish a connection
    res.send("Hello worlds");
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
// Websocket
const websocketServer = new ws_1.WebSocketServer({ port: socketPort });
websocketServer.on("connection", (ws, req) => {
    VerboseLog("Websocket connected on IP:", req.socket.remoteAddress);
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
async function ChangeImage(name) {
    VerboseLog("Changing image to:", name);
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
ChangeImage("Galaxy");
//# sourceMappingURL=index.js.map