let currentMap = new Map()
const host = window.location.host

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
    }
}

// Build List
UpdateList()

// Connect to websocket
const socket = new WebSocket(`ws://${document.location.hostname}:61235`)
socket.addEventListener("open", (ev) => {
    console.log("Socket connected successfully")
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