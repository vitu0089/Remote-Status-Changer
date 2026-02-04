// Websocket
const socket = new WebSocket(`ws://${document.location.hostname}:61236`)
socket.addEventListener("open", () => {
    console.log("Socket connected successfully")
})

socket.addEventListener("message", (message) => {
    let selectedImage = message.data
    let imageAvailable = selectedImage != "None"
    let displayNode = document.getElementById("displayImage")
    if (!displayNode) {
        // Create Image
        displayNode = document.createElement("img")
        displayNode.setAttribute("id", "displayImage")
        document.body.appendChild(displayNode)
    }

    // Set image
    const imageJson = JSON.parse(selectedImage)
    if (imageAvailable) {
        displayNode.setAttribute("src", `/img/${imageJson.FileName}`)
    }
})