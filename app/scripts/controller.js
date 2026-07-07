const body = document.getElementById("body")
const timer = document.getElementById("timer")
const overrideTimerButton = document.getElementById("overrideTimer")
const host = window.location.host
const originalBodyColor = window.getComputedStyle(body).backgroundColor

let currentMap = new Map()
let socket = new WebSocket(`ws://${document.location.hostname}:61235`)
let nextChangeTime = 0
let nextChangeImage = ""
let cachedSettings = {
    OverrideTimer : false
}
async function GetImageData() {
    let body = await fetch(`http://${host}/controls/imageData`)
    return await body.json()
}

async function SendSocket(sendType, data) {
    socket.send(JSON.stringify({
        type : sendType,
        data : data
    }))
}

async function UpdateList() {
    let allImages = await GetImageData()

    for (const i in allImages) {
        let item = allImages[i]
        
        // Exists check
        if (currentMap.has(item.Name)) {
            // Item exists, ignore
            continue
        }

        let node = document.createElement("div")
        node.id = "listItem"
        node.innerHTML = `<h2>${item.Name}</h2>`
        document.getElementById("list").appendChild(node)
        currentMap.set(item.Name, node)

        // Clickability
        node.onclick = function() {
            if (socket.readyState == 3 /* 3 means closed */) {
                console.error("Socket has been closed, please wait for server to restart")
                return
            }
            
            // Force server to change image
            SendSocket("ChangeImage", item.Name)
        }
    }
}

// Build List
UpdateList()

// Timer
function UpdateTimer() {
    if (cachedSettings.OverrideTimer) {
        timer.innerHTML = "Timer is currently paused"
        return
    }

    let date = new Date()
    let secondsLeft = Math.floor(Math.max(nextChangeTime - date.getTime(), 0) / 1_000)
    let hoursLeft = Math.floor(secondsLeft / 3_600)
    let minutesLeft = Math.floor((secondsLeft - (hoursLeft * 3_600)) / 60)

    // Correct seconds
    secondsLeft = secondsLeft - (hoursLeft * 3_600) - (minutesLeft * 60)

    // Change text
    timer.innerHTML = `<em>${hoursLeft < 10 && "0" || ""}${hoursLeft}:${minutesLeft < 10 && "0" || ""}${minutesLeft}:${secondsLeft < 10 && "0" || ""}${secondsLeft}</em> Till Change To: <u>${nextChangeImage}</u>`
}

setInterval(() => {
    UpdateTimer()
}, 300)

// Settings
overrideTimerButton.addEventListener("click", event => {
    SendSocket("Settings_OverrideTimer", overrideTimerButton.checked)
})

// Socket connections
function SetupSocketConnection(reboot) {
    if (reboot) {
        socket = new WebSocket(`ws://${document.location.hostname}:61235`)
    }

    socket.addEventListener("open", () => {
        console.log("Socket connected successfully")
        body.style.backgroundColor = originalBodyColor
    })
    socket.addEventListener("message", (message) => {

        // Selection
        let data = JSON.parse(message.data)
        
        if (data.type == "Image") {
            // Image
            let selectedImage = JSON.parse(data.data)
            let imageAvailable = selectedImage != "None"
            let displayNode = document.getElementById("displayImage")
            if (!displayNode) {
                console.warn("Unable to find displaynode")
                return
            }
        
            // Set image
            if (imageAvailable) {
                displayNode.setAttribute("src", `/img/${selectedImage.FileName}`)
            }
        } else if (data.type == "Timer") {
            // Update the timer
            let changeData = JSON.parse(data.data)
            nextChangeTime = new Date().getTime() + changeData.timeLeft
            nextChangeImage = changeData.nextImage
            UpdateTimer()
        } else if (data.type == "Settings") {
            // Force update all settings
            let settings = JSON.parse(data.data)
            cachedSettings = settings
            
            overrideTimerButton.checked = settings.OverrideTimer

            // Update
            UpdateTimer()
        }
    })
    socket.onclose = () => {
        body.style.background = "#501616"

        // wait a little before each reboot
        setTimeout(SetupSocketConnection, 10_000, true)
    }
}
SetupSocketConnection(false)