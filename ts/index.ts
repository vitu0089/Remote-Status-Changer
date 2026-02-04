import express from "express"
import fs from "fs"
import allImages from "./imageData"
import { WebSocket, WebSocketServer } from "ws"

// Settings
const webPort = 39984
const socketManagerPort = 61235
const socketDisplayPort = 61236
const verboseMode = true

// Variables
const app = express()
let selectedImage : string | null = null
let socketArray : WebSocket[] = []

// Verbose printout
function VerboseLog(...args:any) {
    if (!verboseMode) return;

    console.log(`[ Verbose ]`, ...args, `Time: ${Date().split("GMT")[0]}`)
}
app.use((req, res, next) => {
    VerboseLog(req.url,"IP:", req.ip)
    next()
})

// Application Connections
app.get("/display", (req, res) => {
    const filePath = `${__dirname}/pages/display.html`
    res.sendFile(filePath)
})

app.get("/controls", (req, res) => {
    const filePath = `${__dirname}/pages/controller.html`
    res.sendFile(filePath)
})

app.get("/controls/imageData", (req, res) => {
    res.send(JSON.stringify(allImages))
})

app.get("/style/:cssName", (req, res) => {
    const cssName = req.params.cssName
    const filePath = `${__dirname}/style/${cssName}`
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, "File not found")
        return
    }

    res.sendFile(filePath)
})

app.get("/img/:imgName", (req, res) => {
    const imgName = req.params.imgName
    const filePath = `${__dirname}/images/${imgName}`
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, "File not found")
        return
    }

    res.sendFile(filePath)
})

app.get("/script/:scriptName", (req, res) => {
    const script = req.params.scriptName
    const filePath = `${__dirname}/scripts/${script}`
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, "File not found")
        return
    }

    res.sendFile(filePath)
})

// Websockets
const managerWebsocketServer = new WebSocketServer({port: socketManagerPort})
managerWebsocketServer.on("connection", (ws, req) => {
    VerboseLog("Websocket MANAGER connected on IP:", req.socket.remoteAddress)

    // Add to list
    socketArray.push(ws)

    // Prepare for "SET" requests
    ws.on("message", (data) => {
        const newImageName = data.toString()
        ChangeImage(newImageName)
    })

    // Send initial image
    ws.send(selectedImage && JSON.stringify(allImages.find(v => v.Name == selectedImage)) || "None")
})

const displayWebsocketServer = new WebSocketServer({port: socketDisplayPort})
displayWebsocketServer.on("connection", (ws, req) => {
    VerboseLog("Websocket DISPLAY connected on IP:", req.socket.remoteAddress)

    // Add to list
    socketArray.push(ws)

    // Send initial image
    ws.send(selectedImage && JSON.stringify(allImages.find(v => v.Name == selectedImage)) || "None")
})

// Start Server
app.listen(webPort, () => {
    console.log(`Listening on port: ${webPort}`)
})

// Image Changing
async function BroadcastCurrentImage() {
    VerboseLog("Broadcasting image:", selectedImage, " to", socketArray.length, "client(s)")

    // Validity Check
    for (const i in socketArray) {
        const index = Number.parseInt(i)
        const socket = socketArray[index]
        if (!socket) {
            // Socket has closed or dissapeared, probably closed though
            socketArray.slice(index, 1)
            return BroadcastCurrentImage()
        }
    }

    // Get image data
    const image = selectedImage && allImages.find(v => v.Name == selectedImage) || null

    // Send
    for (const i in socketArray) {
        const socket = socketArray[i]
        if (socket) {
            socket.send(selectedImage != null && JSON.stringify(image) || "None")
        }
    }
}

async function ChangeImage(name : string | null) : Promise<Boolean> {
    VerboseLog("Changing image to:", name)

    // Null Check
    if (name == null) {
        selectedImage = null
        BroadcastCurrentImage()
        return true
    }

    // Find image information
    let imageData = allImages.find(v => v.Name == name)
    if (!imageData) {
        console.warn(`No image by the name: ${name}`)
        return false
    }

    selectedImage = name
    BroadcastCurrentImage()
    return true
}

// Default Image
ChangeImage("Galaxy")