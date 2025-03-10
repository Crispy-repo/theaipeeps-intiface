// ==UserScript==
// @name         The Ai Peeps Intiface / Buttplug.IO Sync
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
    // mappingConfig is an array of objects: { mapping: number, osc: number }
    let mappingConfig = [];
    let lastSentValues = []; // Last chat value received for each device
    // Oscillation variables: for each device, store the current oscillation timer, base value, and start time.
    let oscillationTimers = [];
    let oscillationBases = [];
    let oscillationStartTime = [];
    // Interval for chat processing (mapping) and connection check.
    let mappingProcessingInterval = null;
    let connectionCheckInterval = null;

    // Helper: round to 3 decimals.
    function roundTo3(num) {
        return Math.round(num * 1000) / 1000;
    }

    // Debug log helper.
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
        helpPanel.style.width = "400px";
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
            This program connects to Intiface using the fixed URL <code>ws://localhost:12345</code> and scans for connected devices.<br><br>
            <em>Mapping Settings:</em><br>
            - Use the dropdowns to assign which chat message number controls each device.<br>
            - Under each device, adjust the slider (0–50) to set an oscillation percentage. For example, 10 means the device’s intensity will oscillate ±10% of the base value if no new value arrives.<br>
            - The oscillated intensity is clamped between 0 and 100.<br><br>
            <em>Connection:</em><br>
            - The toggle button shows a red dot with "Connect" when disconnected and a green dot with "Disconnect" when connected.<br><br>
            <em>Chat Processing:</em><br>
            - The script reconstructs AI messages from split elements so numbers split across spans are captured.<br><br>
            Click the "?" button again to close this help.
        `;
        document.body.appendChild(helpPanel);
    }

    // Update the connection toggle button appearance.
    function updateToggleButton() {
        const btn = document.getElementById("connect-btn");
        if (isConnected) {
            btn.innerHTML = `<span id="connection-indicator" style="display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:5px; background:green;"></span>Disconnect`;
        } else {
            btn.innerHTML = `<span id="connection-indicator" style="display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:5px; background:red;"></span>Connect`;
        }
    }

    // Toggle connection: connect if disconnected, disconnect if connected.
    async function toggleConnection() {
        if (!isConnected) {
            await connectToIntiface();
            if (!connectionCheckInterval) {
                connectionCheckInterval = setInterval(checkConnectionStatus, 10000);
            }
        } else {
            await disconnectFromIntiface();
            if (connectionCheckInterval) {
                clearInterval(connectionCheckInterval);
                connectionCheckInterval = null;
            }
        }
        updateToggleButton();
    }

    // Create the UI.
    function createUI() {
        const wrapper = document.createElement('div');
        wrapper.id = 'ui-wrapper';
        wrapper.style.position = 'fixed';
        wrapper.style.bottom = '10px';
        wrapper.style.right = '10px';
        wrapper.style.zIndex = '9999';

        const panel = document.createElement('div');
        panel.id = 'control-panel';
        panel.style.width = '400px';
        panel.style.background = 'rgba(0,0,0,0.8)';
        panel.style.color = 'white';
        panel.style.padding = '10px';
        panel.style.borderRadius = '8px';
        panel.style.fontFamily = 'Arial, sans-serif';
        panel.style.position = 'relative';

        // Help button
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

        // Hide UI button
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

        wrapper.appendChild(panel);
        document.body.appendChild(wrapper);

        helpBtn.addEventListener("click", toggleDocumentation);
        document.getElementById("connect-btn").addEventListener("click", toggleConnection);
        hideBtn.addEventListener("click", function() {
            wrapper.style.display = 'none';
            showRestoreButton();
        });
        document.getElementById("start-btn").addEventListener("click", toggleMapping);
        document.getElementById("refresh-devices-btn").addEventListener("click", function() {
            populateMappingSettings();
            mappingStarted = false;
            const startBtn = document.getElementById("start-btn");
            startBtn.innerText = "Restart";
            startBtn.style.backgroundColor = "#ff9800";
            startBtn.style.border = "2px solid #fff";
            startBtn.style.fontWeight = "bold";
        });
        createRestoreButton();
    }

    // Create a restore button.
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

    function showRestoreButton() {
        const restoreBtn = document.getElementById('restore-btn');
        if (restoreBtn) {
            restoreBtn.style.display = 'flex';
        }
    }

    // Connect to Intiface.
    async function connectToIntiface() {
        const wsUrl = "ws://localhost:12345";
        try {
            client = new Buttplug.ButtplugClient("The Ai Peeps Intiface Sync");
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
                if (connectionCheckInterval) {
                    clearInterval(connectionCheckInterval);
                    connectionCheckInterval = null;
                }
            } catch (err) {
                debugLog("Error disconnecting: " + err);
            }
        }
    }

    // Check connection status periodically.
    function checkConnectionStatus() {
        try {
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
        } catch (e) {
            isConnected = false;
            document.getElementById("status").innerText = "Disconnected";
            document.getElementById("status").style.color = "red";
            debugLog("Connection status check error: " + e);
            updateToggleButton();
        }
    }

    // Populate mapping settings based on connected devices.
    function populateMappingSettings() {
        try {
            if (!client || !client.connected) {
                debugLog("Client not connected. Cannot populate mapping settings.");
                return;
            }
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
                const container = document.createElement("div");
                container.style.marginTop = "10px";
                container.style.borderBottom = "1px solid #555";
                container.style.paddingBottom = "5px";
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.alignItems = "center";
                row.style.flexWrap = "wrap";
                const label = document.createElement("div");
                label.innerText = device.name + ": ";
                label.style.flex = "1";
                label.style.whiteSpace = "nowrap";
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
                row.appendChild(label);
                row.appendChild(select);
                container.appendChild(row);
                const sliderRow = document.createElement("div");
                sliderRow.style.marginTop = "5px";
                sliderRow.style.display = "flex";
                sliderRow.style.alignItems = "center";
                const sliderLabel = document.createElement("div");
                sliderLabel.innerText = "Osc:";
                sliderLabel.style.marginRight = "5px";
                const slider = document.createElement("input");
                slider.type = "range";
                slider.min = "0";
                slider.max = "50";
                slider.step = "1";
                slider.value = "0";
                slider.id = "osc-device-" + i;
                const sliderValue = document.createElement("span");
                sliderValue.id = "osc-value-display-" + i;
                sliderValue.innerText = "0%";
                sliderValue.style.marginLeft = "5px";
                slider.addEventListener("input", function() {
                    sliderValue.innerText = slider.value + "%";
                    if (mappingStarted) {
                        mappingStarted = false;
                        const startBtn = document.getElementById("start-btn");
                        startBtn.innerText = "Restart";
                        startBtn.style.backgroundColor = "#ff9800";
                        startBtn.style.border = "2px solid #fff";
                        startBtn.style.fontWeight = "bold";
                    }
                });
                sliderRow.appendChild(sliderLabel);
                sliderRow.appendChild(slider);
                sliderRow.appendChild(sliderValue);
                container.appendChild(sliderRow);
                mappingSettingsDiv.appendChild(container);
            }
        } catch (e) {
            debugLog("Error in populateMappingSettings: " + e);
        }
    }

    // Start processing chat messages (mapping).
    function startMapping() {
        // Clear any existing oscillation timers.
        if (oscillationTimers && oscillationTimers.length > 0) {
            for (let i = 0; i < oscillationTimers.length; i++) {
                if (oscillationTimers[i]) {
                    clearInterval(oscillationTimers[i]);
                }
            }
        }
        const mappingSettingsDiv = document.getElementById("mapping-settings");
        const selects = mappingSettingsDiv.getElementsByTagName("select");
        mappingConfig = [];
        lastSentValues = [];
        oscillationTimers = [];
        oscillationBases = [];
        oscillationStartTime = [];
        for (let i = 0; i < selects.length; i++) {
            const sel = selects[i];
            const mappingValue = parseInt(sel.value, 10);
            const slider = document.getElementById("osc-device-" + i);
            const oscValue = parseFloat(slider.value) || 0;
            mappingConfig.push({ mapping: mappingValue, osc: oscValue });
            lastSentValues.push(null);
            oscillationTimers.push(null);
            oscillationBases.push(null);
            oscillationStartTime.push(null);
        }
        debugLog("Mapping configuration set: " + mappingConfig.map(obj => `(${obj.mapping}, ${obj.osc}%)`).join(", "));
        mappingStarted = true;
        mappingProcessingInterval = setInterval(checkMessages, 2000);
        const startBtn = document.getElementById("start-btn");
        startBtn.innerText = "Stop";
        startBtn.style.backgroundColor = "";
        startBtn.style.border = "";
        startBtn.style.fontWeight = "";
    }

    // Stop processing messages and send a 0 command to every device.
    function stopMapping() {
        if (mappingProcessingInterval) {
            clearInterval(mappingProcessingInterval);
            mappingProcessingInterval = null;
        }
        mappingStarted = false;
        const startBtn = document.getElementById("start-btn");
        startBtn.innerText = "Start";
        for (let i = 0; i < oscillationTimers.length; i++) {
            if (oscillationTimers[i]) {
                clearInterval(oscillationTimers[i]);
                oscillationTimers[i] = null;
            }
        }
        try {
            if (client && client.devices && client.devices.length > 0) {
                for (let i = 0; i < client.devices.length; i++) {
                    sendVibrationCommandToDevice(client.devices[i], 0);
                }
            }
        } catch (e) {
            debugLog("Error sending stop command: " + e);
        }
    }

    // Toggle mapping: start if not running; stop if running.
    function toggleMapping() {
        if (mappingStarted) {
            stopMapping();
        } else {
            startMapping();
        }
    }

    // Updated checkMessages function that reconstructs the full message from split spans.
    function checkMessages() {
        if (!isConnected || !mappingStarted) return;
        let msgs;
        try {
            // Query for both full message containers and individual word elements with AI class.
            msgs = document.querySelectorAll('.chat-window .msg-content.AI, .chat-window .word.AI');
        } catch (e) {
            debugLog("Error accessing chat messages: " + e);
            return;
        }
        if (!msgs || msgs.length === 0) {
            debugLog("No messages found.");
            return;
        }
        let validMsg = null;
        // Iterate backwards to find the most recent message that contains a number.
        for (let i = msgs.length - 1; i >= 0; i--) {
            let text = "";
            if (msgs[i].classList.contains("msg-content")) {
                text = msgs[i].textContent.trim();
            } else if (msgs[i].classList.contains("word")) {
                let parent = msgs[i].parentElement;
                if (parent) {
                    // Combine text from all child spans with class "word"
                    let words = parent.querySelectorAll(".word.AI");
                    words.forEach(word => { text += word.textContent; });
                    text = text.trim();
                }
            }
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
            const mappingObj = mappingConfig[i];
            const chatIndex = mappingObj.mapping - 1;
            if (chatIndex < numberMatches.length) {
                const newValue = parseInt(numberMatches[chatIndex], 10);
                if (newValue !== lastSentValues[i]) {
                    if (oscillationTimers[i]) {
                        clearInterval(oscillationTimers[i]);
                        oscillationTimers[i] = null;
                    }
                    oscillationBases[i] = newValue;
                    oscillationStartTime[i] = Date.now();
                    sendVibrationCommandToDevice(client.devices[i], newValue);
                    lastSentValues[i] = newValue;
                } else {
                    if (mappingObj.osc > 0) {
                        if (!oscillationTimers[i]) {
                            oscillationStartTime[i] = Date.now();
                            oscillationTimers[i] = setInterval(function() {
                                const frequency = 0.5; // Hz
                                const t = (Date.now() - oscillationStartTime[i]) / 1000;
                                const base = oscillationBases[i];
                                const amplitude = (mappingObj.osc / 100) * base;
                                let oscillated = base + amplitude * Math.sin(2 * Math.PI * frequency * t);
                                oscillated = Math.max(0, Math.min(100, oscillated));
                                sendVibrationCommandToDevice(client.devices[i], oscillated);
                            }, 175);
                        }
                    } else {
                        if (oscillationTimers[i]) {
                            clearInterval(oscillationTimers[i]);
                            oscillationTimers[i] = null;
                        }
                    }
                }
            } else {
                debugLog(`Device ${i + 1}: No corresponding number found in the message.`);
            }
        }
    }

    // Send a vibration command to a device.
    async function sendVibrationCommandToDevice(device, vibValue) {
        if (!device || !device.vibrate) return;
        const intensity = Math.min(Math.max(vibValue / 100, 0), 1);
        await device.vibrate(intensity);
        debugLog(`Sent vibration: ${roundTo3(intensity)} to ${device.name}`);
    }

    // Initialize help popup, UI, and start connection status checks.
    createHelpPanel();
    createUI();
    connectionCheckInterval = setInterval(checkConnectionStatus, 10000);

    // Optionally, set up a MutationObserver for chat window updates.
    setTimeout(() => {
        const chatWindow = document.querySelector('.chat-window');
        if (chatWindow) {
            const observer = new MutationObserver((mutationsList) => {
                debugLog("Mutation observed in chat window.");
                checkMessages();
            });
            observer.observe(chatWindow, { childList: true, subtree: true });
            debugLog("MutationObserver for chat window has been initialized.");
        } else {
            debugLog("Chat window not found for observer.");
        }
    }, 3000);

})();
