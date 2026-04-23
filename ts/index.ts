import express from "express"
import fs from "fs"
import allImages from "./imageData"
import { WebSocket, WebSocketServer } from "ws"

// Settings
const webPort = 39984
const socketManagerPort = 61235
const socketDisplayPort = 61236
const verboseMode = true
const ChangeTimes : {TimeOfDayPlusTime : {hours? : number, minutes? : number}, Image : string, AvoidWeekends : boolean}[] = [
    { // Open in the morning
        TimeOfDayPlusTime : {
            hours : 9
        },
        Image : "Open 9 -> 14",
        AvoidWeekends : true
    },

    { // Close when that time comes
        TimeOfDayPlusTime : {
            hours : 14
        },
        Image : "Closed (Purple)",
        AvoidWeekends : true
    },

    { // Close when the day is completely over, to override manual input
        TimeOfDayPlusTime : {
            hours : 17
        },
        Image : "Closed (Purple)",
        AvoidWeekends : true
    }
]

// Variables
const app = express()
let selectedImage : string | null = null
let defaultImage = "Open 9 -> 14"
let socketArray : WebSocket[] = []
let nextChangeDisplayValue = 0
let nextImage : string | null = null

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
function SendWebsocketMessage(websocket : WebSocket, data : {data : string, type : "Image" | "Timer"}) {
    websocket.send(JSON.stringify(data))
}
managerWebsocketServer.on("connection", (ws, req) => {
    VerboseLog("Websocket MANAGER connected on IP:", req.socket.remoteAddress)

    // Add to list
    socketArray.push(ws)

    // Prepare for "SET" requests
    ws.on("message", (data) => {
        const newImageName = data.toString()
        ChangeImage(newImageName)
    })

    // Websocket cleanup
    ws.on("close",() => {
        VerboseLog("Websocket MANAGE connection closed on IP:",req.socket.remoteAddress)

        const socketId = socketArray.findIndex(v => v == ws)
        if (socketId >= 0) {
            socketArray.splice(socketId, 1)
        } else {
            VerboseLog("Unable to find websocket in array")
        }
    })

    // Send initial image
    SendWebsocketMessage(ws, {
        data: selectedImage && JSON.stringify(allImages.find(v => v.Name == selectedImage)) || "None",
        type: "Image" 
    })
    SendWebsocketMessage(ws, {
        data: JSON.stringify({timeLeft : nextChangeDisplayValue - new Date().getTime(), nextImage: nextImage}),
        type : "Timer"
    })
})

const displayWebsocketServer = new WebSocketServer({port: socketDisplayPort})
displayWebsocketServer.on("connection", (ws, req) => {
    VerboseLog("Websocket DISPLAY connected on IP:", req.socket.remoteAddress)

    // Add to list
    socketArray.push(ws)

    // Send image
    SendWebsocketMessage(ws, {
        data: selectedImage && JSON.stringify(allImages.find(v => v.Name == selectedImage)) || "None",
        type: "Image" 
    })
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
            socketArray.splice(index, 1)
            return BroadcastCurrentImage()
        }
    }

    // Get image data
    const image = selectedImage && allImages.find(v => v.Name == selectedImage) || null

    // Send
    for (const i in socketArray) {
        const socket = socketArray[i]
        if (socket) {
            SendWebsocketMessage(socket, {
                data: selectedImage != null && JSON.stringify(image) || "None",
                type: "Image" 
            })
        }
    }
}

async function ChangeImage(name : string | null, automatic? : boolean) : Promise<Boolean> {
    // Same image check
    if (name == selectedImage) return false;

    // Logging
    VerboseLog(`${automatic && `[ AUTOMATIC ] ` || ""}Changing image to:`, name)

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
ChangeImage(defaultImage)

// Automation
async function GetAutomatedImageData() : Promise<{TimeToChangeMs : number, NextImage : string, CurrentImage : string | undefined}> {
    const date = new Date()
    const day = date.getDay()
    const isWeekend = day == 0 || day == 6

    let currentDisplay : string | undefined = undefined
    let nextSwitch : {TimeToChangeMs : number, NextImage : string} | null = null
    let todaysSchedulePassed = true

    // Run through the dates
    for (const key in ChangeTimes) {

        // Get object and verify data
        const data = ChangeTimes[key]
        if (!data) continue;

        // Weekend Check
        if (data.AvoidWeekends && isWeekend) continue;

        // Time Check [In Ms, unfortunately]
        let targetTimeFromMidnight = 
            (data.TimeOfDayPlusTime.hours || 0) * 3_600_000 + // Hours in ms
            (data.TimeOfDayPlusTime.minutes || 0) * 60_000 // Minutes in ms

        let currentTimeFromMidnight = 
            date.getHours() * 3_600_000 +
            date.getMinutes() * 60_000 +
            date.getSeconds() * 1_000 +
            date.getMilliseconds()

        // Already Passed Check
        if (currentTimeFromMidnight >= targetTimeFromMidnight) {
            currentDisplay = data.Image
            continue
        }
        todaysSchedulePassed = false

        // Compare And Apply
        const calculatedWaitTime = targetTimeFromMidnight - currentTimeFromMidnight
        if (!nextSwitch || calculatedWaitTime < nextSwitch.TimeToChangeMs) {

            nextSwitch = {
                TimeToChangeMs : calculatedWaitTime,
                NextImage : data.Image
            }
        }
    }

    if (nextSwitch) {
        return {
            TimeToChangeMs : nextSwitch.TimeToChangeMs,
            NextImage : nextSwitch.NextImage,
            CurrentImage : currentDisplay
        }
    }

    return todaysSchedulePassed && {
        TimeToChangeMs : 86_460_000 - date.getMilliseconds(), // [ Midnight clock ] If all tasks have passed, just wait till a minute past midnight to try again
        NextImage : selectedImage || "Open 9 -> 14",
        CurrentImage : currentDisplay
    } ||
    {
        TimeToChangeMs : 600_000, // [ Fallback ] Wait 10 minutes before trying again, stay open in the meantime
        NextImage : "Open 9 -> 14",
        CurrentImage : currentDisplay
    }
}

async function RunAutomationLoop() {
    const timeTillChangeObject = await GetAutomatedImageData()

    // Change image to keep schedule
    if (timeTillChangeObject.CurrentImage) {
        ChangeImage(timeTillChangeObject.CurrentImage, true)
    }

    setTimeout(() => {
        ChangeImage(timeTillChangeObject.NextImage, true)

        // Wait 5 seconds to not overlap anything
        setTimeout(RunAutomationLoop, 5_000)
        VerboseLog("Waiting for 5 seconds to avoid overlap")
    }, timeTillChangeObject.TimeToChangeMs)
    VerboseLog(`Waiting for ${Math.floor(timeTillChangeObject.TimeToChangeMs / 1000)} seconds to change to image ${timeTillChangeObject.NextImage}`)

    // Set display value
    nextChangeDisplayValue = new Date().getTime() + timeTillChangeObject.TimeToChangeMs
    nextImage = timeTillChangeObject.NextImage

    // Broadcast timer signal
    for (const i in socketArray) {
        const socket = socketArray[i]
        if (socket) {
            SendWebsocketMessage(socket, {
                data: JSON.stringify({timeLeft : nextChangeDisplayValue - new Date().getTime(), nextImage: nextImage}),
                type : "Timer"
            })
        }
    }
}
RunAutomationLoop()