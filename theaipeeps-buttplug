// ==UserScript==
// @name         The Ai Peeps Intiface / Buttplug.IO
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Controls vibration based on chat messages with UI
// @author       Crispy-repo
// @match        https://www.theaipeeps.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=theaipeeps.com
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/buttplug@3.0.0/dist/web/buttplug.min.js
// ==/UserScript==

(async function() {
    'use strict';

    // Global variables
    let client = null;
    let isConnected = false;
    let mappingStarted = false;
    let mappingConfig = []; // For each device (index), the corresponding chat number position (1-based)
    let lastSentValues = []; // Last vibration value sent for each device

    // Debug log helper
    function debugLog(message) {
        console.log(message);
    }

    // Toggle the help/documentation popup.
    function toggleDocumentation() {
        const helpPanel = document.getElementById("help-panel");
        if (!helpPanel.style.display || helpPanel.style.display === "none") {
            helpPanel.style.display = "block";
        } else {
            helpPanel.style.display = "none";
        }
    }

    // Create the help/documentation popup.
    function createHelpPanel() {
        const helpPanel = document.createElement("div");
        helpPanel.id = "help-panel";
        helpPanel.style.position = "fixed";
        helpPanel.style.bottom = "calc(95px + 320px)";
        helpPanel.style.right = "10px";
        helpPanel.style.width = "300px";
        helpPanel.style.background = "rgba(0,0,0,0.9)";
        helpPanel.style.color = "white";
        helpPanel.style.padding = "10px";
        helpPanel.style.borderRadius = "8px";
        helpPanel.style.fontFamily = "Arial, sans-serif";
        helpPanel.style.fontSize = "12px";
        helpPanel.style.zIndex = "10000";
        helpPanel.style.display = "none";
        helpPanel.innerHTML = `
            <strong>Program Documentation</strong><br>
            This program connects to Intiface using the fixed URL <code>ws://localhost:12345</code> and scans for connected devices. Please use the Repeater Mode to redirect to phone or other device.<br><br>
            <em>Mapping Settings:</em><br>
            - Use the dropdowns to assign which chat message number controls each device.<br>
            - If you refresh devices or change a dropdown, the Start button becomes "Restart" so you must reapply your mapping.<br><br>
            <em>Connection:</em><br>
            - The toggle button shows a red dot with "Connect" when disconnected and a green dot with "Disconnect" when connected.<br><br>
            <em>Chat Processing:</em><br>
            - The script listens for chat messages containing numbers and sends vibration commands accordingly.<br><br>
            Click the "?" button again to close this help.
        `;
        document.body.appendChild(helpPanel);
    }

    // Update the toggle button appearance based on connection status.
    function updateToggleButton() {
        const btn = document.getElementById("connect-btn");
        if (isConnected) {
            btn.innerHTML = `<span id="connection-indicator" style="display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:5px; background:green;"></span>Disconnect`;
        } else {
            btn.innerHTML = `<span id="connection-indicator" style="display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:5px; background:red;"></span>Connect`;
        }
    }

    // Toggle connection: if connected, disconnect; if not, connect.
    async function toggleConnection() {
        if (!isConnected) {
            await connectToIntiface();
        } else {
            await disconnectFromIntiface();
        }
        updateToggleButton();
    }

    // Create the UI. Here we wrap everything in a single container so that the help button appears at the top inside the panel.
    function createUI() {
        // Create a container for the UI.
        const wrapper = document.createElement('div');
        wrapper.id = 'ui-wrapper';
        // Position the wrapper fixed at bottom-right.
        wrapper.style.position = 'fixed';
        wrapper.style.bottom = '10px';
        wrapper.style.right = '10px';
        wrapper.style.zIndex = '9999';

        // Create the main control panel.
        const panel = document.createElement('div');
        panel.id = 'control-panel';
        panel.style.width = '300px';
        panel.style.background = 'rgba(0,0,0,0.8)';
        panel.style.color = 'white';
        panel.style.padding = '10px';
        panel.style.borderRadius = '8px';
        panel.style.fontFamily = 'Arial, sans-serif';
        panel.style.position = 'relative';

        // Add the help ("?") button inside the panel at the top left.
        const helpBtn = document.createElement("button");
        helpBtn.id = "help-btn";
        helpBtn.innerText = "?";
        helpBtn.style.position = "absolute";
        helpBtn.style.top = "5px";
        helpBtn.style.left = "5px";
        helpBtn.style.background = "none";
        helpBtn.style.border = "none";
        helpBtn.style.color = "white";
        helpBtn.style.fontSize = "16px";
        helpBtn.style.cursor = "pointer";
        panel.appendChild(helpBtn);

        // Create a content container to leave space for the help button.
        const contentDiv = document.createElement("div");
        contentDiv.style.marginTop = "30px";
        contentDiv.innerHTML = `
            <div id="connection-section">
                <strong>Intiface Connection</strong><br>
                <div id="doc-section" style="margin-top:5px; font-size:12px;">
                    <a id="doc-link" href="https://docs.intiface.com/docs/intiface-central/ui/app-modes-repeater-panel/" target="_blank" style="color:white; text-decoration:none; background-color:#2196F3; padding:2px 4px; border-radius:4px; font-weight:bold;">
                        Repeater Mode Documentation
                    </a>
                </div>
                <button id="connect-btn" style="width:100%; padding:5px; margin-top:5px;">
                    <span id="connection-indicator" style="display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:5px; background:red;"></span>Connect
                </button>
                <div id="status" style="margin-top:5px; font-size:14px; color: orange;">Not connected</div>
            </div>
            <div id="mapping-section" style="display:none; margin-top:10px;">
                <strong>Mapping Settings</strong><br>
                <div id="mapping-settings"></div>
                <button id="refresh-devices-btn" style="width:100%; padding:5px; margin-top:5px;">Refresh Devices</button>
                <button id="start-btn" style="width:100%; padding:5px; margin-top:5px;">Start</button>
            </div>
            <div id="last-value" style="margin-top:10px; font-size:14px;">Last Read: None</div>
        `;
        panel.appendChild(contentDiv);

        // Create the "Hide UI" button inside the panel (top right).
        const hideBtn = document.createElement('button');
        hideBtn.id = 'hide-ui-btn';
        hideBtn.innerText = 'Hide UI';
        hideBtn.style.position = 'absolute';
        hideBtn.style.top = '5px';
        hideBtn.style.right = '5px';
        hideBtn.style.fontSize = '10px';
        hideBtn.style.padding = '2px 4px';
        hideBtn.style.cursor = 'pointer';
        panel.appendChild(hideBtn);

        // Append the panel to the wrapper.
        wrapper.appendChild(panel);
        document.body.appendChild(wrapper);

        // Hook up event listeners.
        helpBtn.addEventListener("click", toggleDocumentation);
        document.getElementById("connect-btn").addEventListener("click", toggleConnection);
        hideBtn.addEventListener("click", function() {
            wrapper.style.display = 'none';
            showRestoreButton();
        });
        document.getElementById("start-btn").addEventListener("click", startMapping);
        document.getElementById("refresh-devices-btn").addEventListener("click", function() {
            populateMappingSettings();
            mappingStarted = false;
            const startBtn = document.getElementById("start-btn");
            startBtn.innerText = "Restart";
            startBtn.style.backgroundColor = "#ff9800";
            startBtn.style.border = "2px solid #fff";
            startBtn.style.fontWeight = "bold";
        });

        // Create the restore button.
        createRestoreButton();
    }

    // Create a small restore button that appears when the UI wrapper is hidden.
    function createRestoreButton() {
        const restoreBtn = document.createElement('div');
        restoreBtn.id = 'restore-btn';
        restoreBtn.style.position = 'fixed';
        restoreBtn.style.bottom = '10px';
        restoreBtn.style.right = '10px';
        restoreBtn.style.width = '40px';
        restoreBtn.style.height = '40px';
        restoreBtn.style.background = 'rgba(0,0,0,0.8)';
        restoreBtn.style.color = 'white';
        restoreBtn.style.borderRadius = '50%';
        restoreBtn.style.display = 'none';
        restoreBtn.style.justifyContent = 'center';
        restoreBtn.style.alignItems = 'center';
        restoreBtn.style.cursor = 'pointer';
        restoreBtn.style.zIndex = '10000';
        restoreBtn.innerText = '💦';
        document.body.appendChild(restoreBtn);

        restoreBtn.addEventListener("click", function() {
            document.getElementById('ui-wrapper').style.display = 'block';
            this.style.display = 'none';
        });
    }

    // Show the restore button when the UI wrapper is hidden.
    function showRestoreButton() {
        const restoreBtn = document.getElementById('restore-btn');
        if (restoreBtn) {
            restoreBtn.style.display = 'flex';
        }
    }

    // Connect to Intiface via WebSocket and start scanning for devices.
    async function connectToIntiface() {
        const wsUrl = "ws://localhost:12345"; // fixed URL, ws browser limitation
        try {
            client = new Buttplug.ButtplugClient("The Ai Peeps Intiface");
            const connector = new Buttplug.ButtplugBrowserWebsocketClientConnector(wsUrl);
            await client.connect(connector);
            await client.startScanning();
            isConnected = true;
            document.getElementById("status").innerText = "Connected!";
            document.getElementById("status").style.color = "lime";
            debugLog("Connected to Intiface and scanning for devices...");
            setTimeout(populateMappingSettings, 4000);
        } catch (err) {
            isConnected = false;
            document.getElementById("status").innerText = "Connection failed!";
            document.getElementById("status").style.color = "red";
            debugLog("Connection error: " + err);
        }
    }

    // Disconnect from Intiface.
    async function disconnectFromIntiface() {
        if (client && isConnected) {
            try {
                await client.disconnect();
                isConnected = false;
                document.getElementById("status").innerText = "Disconnected";
                document.getElementById("status").style.color = "red";
                debugLog("Disconnected from Intiface.");
                updateToggleButton();
            } catch (err) {
                debugLog("Error disconnecting: " + err);
            }
        }
    }

    // Check if the connection is still up. This function is called every 10 seconds.
    function checkConnectionStatus() {
        if (client && typeof client.connected !== "undefined") {
            isConnected = client.connected;
            if (isConnected) {
                document.getElementById("status").innerText = "Connected!";
                document.getElementById("status").style.color = "lime";
                debugLog("Connection status check: Connected");
            } else {
                document.getElementById("status").innerText = "Disconnected";
                document.getElementById("status").style.color = "red";
                debugLog("Connection status check: Disconnected");
            }
            updateToggleButton();
        }
    }

    // Populate the mapping settings based on the connected devices (up to 4).
    function populateMappingSettings() {
        let devices = client.devices;
        if (!devices || devices.length === 0) {
            debugLog("No devices found. Ensure your toys are turned on and connected.");
            return;
        }
        if (devices.length > 4) {
            devices = devices.slice(0, 4);
        }
        const mappingSection = document.getElementById("mapping-section");
        mappingSection.style.display = "block";
        const mappingSettingsDiv = document.getElementById("mapping-settings");
        mappingSettingsDiv.innerHTML = "";
        for (let i = 0; i < devices.length; i++) {
            const device = devices[i];
            const div = document.createElement("div");
            div.style.marginTop = "5px";
            const label = document.createElement("span");
            label.innerText = device.name + ": ";
            const select = document.createElement("select");
            select.id = "mapping-device-" + i;
            for (let j = 1; j <= devices.length; j++) {
                const option = document.createElement("option");
                option.value = j;
                option.text = "Number " + j;
                if (j === i + 1) {
                    option.selected = true;
                }
                select.appendChild(option);
            }
            // When a dropdown is changed, if mapping is active, force a restart.
            select.addEventListener("change", function() {
                if(mappingStarted) {
                    mappingStarted = false;
                    const startBtn = document.getElementById("start-btn");
                    startBtn.innerText = "Restart";
                    startBtn.style.backgroundColor = "#ff9800";
                    startBtn.style.border = "2px solid #fff";
                    startBtn.style.fontWeight = "bold";
                }
            });
            div.appendChild(label);
            div.appendChild(select);
            mappingSettingsDiv.appendChild(div);
        }
    }

    // Called when the user clicks "Start" (or "Restart") after mapping is set.
    function startMapping() {
        const mappingSettingsDiv = document.getElementById("mapping-settings");
        const selects = mappingSettingsDiv.getElementsByTagName("select");
        mappingConfig = [];
        lastSentValues = [];
        for (let i = 0; i < selects.length; i++) {
            const sel = selects[i];
            const mappingValue = parseInt(sel.value, 10);
            mappingConfig.push(mappingValue);
            lastSentValues.push(null);
        }
        debugLog("Mapping configuration set: " + mappingConfig.join(", "));
        mappingStarted = true;
        setInterval(checkMessages, 2000);
        const startBtn = document.getElementById("start-btn");
        startBtn.innerText = "Started";
        startBtn.style.backgroundColor = "";
        startBtn.style.border = "";
        startBtn.style.fontWeight = "";
    }

    // Process chat messages, extract numbers, and send commands based on mapping.
    function checkMessages() {
        if (!isConnected || !mappingStarted) return;
        const msgs = document.querySelectorAll('.chat-window .msg-content.AI');
        if (!msgs.length) {
            debugLog("No messages found.");
            return;
        }
        let validMsg = null;
        for (let i = msgs.length - 1; i >= 0; i--) {
            const text = msgs[i].textContent.trim();
            if (text.match(/\d+/)) {
                validMsg = text;
                break;
            }
        }
        if (!validMsg) {
            debugLog("No valid vibration message found.");
            return;
        }
        debugLog("Latest valid message: " + validMsg);
        const numberMatches = validMsg.match(/\d{1,3}/g);
        if (!numberMatches) {
            debugLog("No numbers found in the message.");
            return;
        }
        document.getElementById("last-value").innerText = "Last Read: " + numberMatches.join(", ");
        for (let i = 0; i < mappingConfig.length; i++) {
            const pos = mappingConfig[i];
            if (pos - 1 < numberMatches.length) {
                const vib = parseInt(numberMatches[pos - 1], 10);
                if (lastSentValues[i] !== vib) {
                    sendVibrationCommandToDevice(client.devices[i], vib);
                    lastSentValues[i] = vib;
                } else {
                    debugLog(`Device ${i + 1}: Vibration value unchanged, command not re-sent.`);
                }
            } else {
                debugLog(`Device ${i + 1}: No corresponding number found in the message.`);
            }
        }
    }

    // Sends a vibration command to a specific device.
    async function sendVibrationCommandToDevice(device, vibValue) {
        if (!device || !device.vibrate) return;
        const intensity = Math.min(Math.max(vibValue / 100, 0), 1);
        await device.vibrate(intensity);
        debugLog(`Sent vibration: ${intensity} to ${device.name}`);
    }

    // Initialize help popup, UI, and start periodic connection status checks.
    createHelpPanel();
    createUI();
    setInterval(checkConnectionStatus, 10000);

})();
