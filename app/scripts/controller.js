let currentMap = new Map()
const host = window.location.host
let socket = new WebSocket(`ws://${document.location.hostname}:61235`)
const body = document.getElementById("body")
const originalBodyColor = window.getComputedStyle(body).backgroundColor
async function GetImageData() {
    let body = await fetch(`http://${host}/controls/imageData`)
    return await body.json()
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
        node.onclick = function(event) {
            if (socket.readyState == 3 /* 3 means closed */) {
                console.error("Socket has been closed, please wait for server to restart")
                return
            }
            
            // Force server to change image
            socket.send(item.Name)
        }
    }
}

// Build List
UpdateList()

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
        let selectedImage = message.data
        let imageAvailable = selectedImage != "None"
        let displayNode = document.getElementById("displayImage")
        if (!displayNode) {
            console.warn("Unable to find displaynode")
            return
        }
    
        // Set image
        const imageJson = JSON.parse(selectedImage)
        if (imageAvailable) {
            displayNode.setAttribute("src", `/img/${imageJson.FileName}`)
        }
    })
    socket.onclose = (event) => {
        body.style.background = "#501616"

        // wait a little before each reboot
        setTimeout(SetupSocketConnection, 10_000, true)
    }
}
SetupSocketConnection(false)