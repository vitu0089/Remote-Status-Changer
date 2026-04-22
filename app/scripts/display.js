function SetupSocketConnection() {
    // Websocket
    const socket = new WebSocket(`ws://${document.location.hostname}:61236`)

    socket.addEventListener("open", () => {
        console.log("Socket connected successfully")
    })
    
    socket.addEventListener("message", (message) => {
        
        let data = message.data && JSON.parse(message.data)
        if (!data || (typeof(data) != "string" && data.type != "Image")) return;

        let imageAvailable = data != "None"
        let displayNode = document.getElementById("displayImage")
        if (!displayNode) {
            // Create Image
            displayNode = document.createElement("img")
            displayNode.setAttribute("id", "displayImage")
            document.body.appendChild(displayNode)
        }
    
        // Set image
        let imageData = JSON.parse(data.data)
        if (imageAvailable) {
            displayNode.setAttribute("src", `/img/${imageData.FileName}`)
        }
    })

    socket.onclose = (event) => {
        
        // wait a little before each reboot
        setTimeout(SetupSocketConnection, 10_000)
    }
}
SetupSocketConnection()