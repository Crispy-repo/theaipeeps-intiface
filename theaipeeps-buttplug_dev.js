// ==UserScript==
// @name         The Ai Peeps Intiface / Buttplug.IO Sync
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Controls vibration based on chat messages with UI. Now supports devices with multiple motors by aggregating commands per device and only sending new commands if they differ.
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
    // mappingConfig holds one object per mapping row: { mapping: number, osc: number, device: deviceObj, motor: number, intensity: number }
    let mappingConfig = [];
    let lastSentValues = []; // per mapping row
    // Oscillation variables (currently unused but left for potential future use)
    let oscillationTimers = [];
    let oscillationBases = [];
    let oscillationStartTime = [];
    // Intervals
    let mappingProcessingInterval = null;
    let connectionCheckInterval = null;
    // New global map to store last command sent per device.
    let lastDeviceCommands = new Map();

    // Helper: round to 3 decimals.
    function roundTo3(num) {
        return Math.round(num * 1000) / 1000;
    }

    // Helper: compare two arrays for equality.
    function arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    // Debug logger.
    function debugLog(message) {
        console.log(message);
    }

    // Toggle help/documentation popup.
    function toggleDocumentation() {
        const helpPanel = document.getElementById("help-panel");
        helpPanel.style.display = (!helpPanel.style.display || helpPanel.style.display === "none") ? "block" : "none";
    }

    // Create help/documentation popup.
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
            - Use the dropdowns to assign which chat message number controls each motor of each device.<br>
            - Under each mapping row, adjust the slider (0–50) to set an oscillation percentage (if desired). Only numbers from 0 to 100 are accepted.<br><br>
            <em>Connection:</em><br>
            - The toggle button shows a red dot with "Connect" when disconnected and a green dot with "Disconnect" when connected.<br><br>
            <em>Chat Processing:</em><br>
            - The script reconstructs AI messages from split spans so that numbers split across elements are captured.<br>
            - You can choose to match only numbers preceded by "v" (e.g. v34) using the checkbox below.<br><br>
            Click the "?" button again to close this help.
        `;
        document.body.appendChild(helpPanel);
    }

    // Update connection toggle button.
    function updateToggleButton() {
        const btn = document.getElementById("connect-btn");
        if (isConnected) {
            btn.innerHTML = `<span id="connection-indicator" style="display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:5px; background:green;"></span>Disconnect`;
        } else {
            btn.innerHTML = `<span id="connection-indicator" style="display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:5px; background:red;"></span>Connect`;
        }
    }

    // Toggle connection.
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

    // Create UI.
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

        // Help button.
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
                <div id="vprefix-setting" style="margin-top:5px; font-size:12px;">
                    <input type="checkbox" id="v-prefix-checkbox">
                    <label for="v-prefix-checkbox">Only match numbers preceded by "v"</label>
                </div>
            </div>
            <div id="last-value" style="margin-top:10px; font-size:14px;">Last Read: None</div>
        `;
        panel.appendChild(contentDiv);

        // Hide UI button.
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

    // Create restore button.
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
            setTimeout(() => {
                populateMappingSettings();
                logAllDevices();
            }, 4000);
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

    // Check connection status.
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

    // Populate mapping settings for each device and each motor.
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
            // Compute total mapping rows (motors) across all devices.
            let totalMappingCount = 0;
            let motorCounts = [];
            devices.forEach((device) => {
                let motorCount = 1;
                if (device._deviceInfo && device._deviceInfo.DeviceMessages && device._deviceInfo.DeviceMessages.ScalarCmd) {
                    motorCount = device._deviceInfo.DeviceMessages.ScalarCmd.length;
                }
                motorCounts.push(motorCount);
                totalMappingCount += motorCount;
            });
            debugLog("Total mapping rows (motors): " + totalMappingCount);

            const mappingSection = document.getElementById("mapping-section");
            mappingSection.style.display = "block";
            const mappingSettingsDiv = document.getElementById("mapping-settings");
            mappingSettingsDiv.innerHTML = "";
            let globalMappingIndex = 0;
            devices.forEach((device, deviceIndex) => {
                let motorCount = motorCounts[deviceIndex];
                debugLog("Device: " + device.name + " reports " + motorCount + " vibration motor(s).");
                for (let m = 0; m < motorCount; m++) {
                    const container = document.createElement("div");
                    container.style.marginTop = "10px";
                    container.style.borderBottom = "1px solid #555";
                    container.style.paddingBottom = "5px";
                    
                    // Row for label and dropdown.
                    const row = document.createElement("div");
                    row.style.display = "flex";
                    row.style.alignItems = "center";
                    row.style.flexWrap = "wrap";
                    
                    const label = document.createElement("div");
                    label.innerText = `${device.name} (Motor ${m+1}): `;
                    label.style.flex = "1";
                    label.style.whiteSpace = "nowrap";
                    
                    const select = document.createElement("select");
                    select.id = "mapping-device-" + globalMappingIndex;
                    select.dataset.deviceIndex = deviceIndex;
                    select.dataset.motorIndex = m;
                    for (let j = 1; j <= totalMappingCount; j++) {
                        const option = document.createElement("option");
                        option.value = j;
                        option.text = "Number " + j;
                        if (j === globalMappingIndex + 1) {
                            option.selected = true;
                        }
                        select.appendChild(option);
                    }
                    row.appendChild(label);
                    row.appendChild(select);
                    container.appendChild(row);

                    // Row for oscillation slider.
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
                    slider.id = "osc-device-" + globalMappingIndex;
                    const sliderValue = document.createElement("span");
                    sliderValue.id = "osc-value-display-" + globalMappingIndex;
                    sliderValue.innerText = "0%";
                    sliderValue.style.marginLeft = "5px";
                    slider.addEventListener("input", function() {
                        sliderValue.innerText = slider.value + "%";
                        if(mappingStarted) {
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
                    globalMappingIndex++;
                }
            });
        } catch (e) {
            debugLog("Error in populateMappingSettings: " + e);
        }
    }

    // Start mapping: build mappingConfig for each mapping row.
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
        // Also clear last device commands so that we start fresh.
        lastDeviceCommands = new Map();

        for (let i = 0; i < selects.length; i++) {
            const sel = selects[i];
            const mappingValue = parseInt(sel.value, 10);
            const slider = document.getElementById("osc-device-" + i);
            const oscValue = parseFloat(slider.value) || 0;
            const deviceIndex = parseInt(sel.dataset.deviceIndex, 10);
            const motorIndex = parseInt(sel.dataset.motorIndex, 10);
            mappingConfig.push({
                mapping: mappingValue,
                osc: oscValue,
                device: client.devices[deviceIndex],
                motor: motorIndex,
                intensity: 0
            });
            lastSentValues.push(null);
            oscillationTimers.push(null);
            oscillationBases.push(null);
            oscillationStartTime.push(null);
        }
        debugLog("Mapping configuration set: " + mappingConfig.map(obj =>
            `(${obj.device.name} Motor ${obj.motor+1} -> Number ${obj.mapping}, ${obj.osc}%)`
        ).join(", "));
        mappingStarted = true;
        mappingProcessingInterval = setInterval(checkMessages, 2000);
        const startBtn = document.getElementById("start-btn");
        startBtn.innerText = "Stop";
        startBtn.style.backgroundColor = "";
        startBtn.style.border = "";
        startBtn.style.fontWeight = "";
    }

    // Stop mapping.
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
            // For each mapping row, send stop command.
            mappingConfig.forEach(config => {
                let motorCount = 1;
                if (config.device._deviceInfo && config.device._deviceInfo.DeviceMessages && config.device._deviceInfo.DeviceMessages.ScalarCmd) {
                    motorCount = config.device._deviceInfo.DeviceMessages.ScalarCmd.length;
                }
                let zeros = Array(motorCount).fill(0);
                sendVibrationCommandToDevice(config.device, zeros);
            });
        } catch (e) {
            debugLog("Error sending stop command: " + e);
        }
    }

    // Toggle mapping.
    function toggleMapping() {
        if (mappingStarted) {
            stopMapping();
        } else {
            startMapping();
        }
    }

    // Process chat messages.
    function checkMessages() {
        if (!isConnected || !mappingStarted) return;
        let msgs;
        try {
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
        for (let i = msgs.length - 1; i >= 0; i--) {
            let text = "";
            if (msgs[i].classList.contains("msg-content")) {
                text = msgs[i].textContent.trim();
            } else if (msgs[i].classList.contains("word")) {
                let parent = msgs[i].parentElement;
                if (parent) {
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
        let numberMatches;
        const vCheckbox = document.getElementById("v-prefix-checkbox");
        if (vCheckbox && vCheckbox.checked) {
            numberMatches = validMsg.match(/v(\d{1,3})/gi);
            if (numberMatches) {
                numberMatches = numberMatches.map(match => match.replace(/v/gi, ""));
            }
        } else {
            numberMatches = validMsg.match(/\d{1,3}/g);
        }
        if (!numberMatches) {
            debugLog("No numbers found in the message.");
            return;
        }
        // Filter numbers in the 0-100 range.
        numberMatches = numberMatches.filter(numStr => {
            const n = parseInt(numStr, 10);
            return n >= 0 && n <= 100;
        });
        if (numberMatches.length === 0) {
            debugLog("No numbers in range 0-100 found in the message.");
            return;
        }
        document.getElementById("last-value").innerText = "Last Read: " + numberMatches.join(", ");

        // Aggregate commands per device.
        let deviceCommands = new Map();
        for (let i = 0; i < mappingConfig.length; i++) {
            const mappingObj = mappingConfig[i];
            const chatIndex = mappingObj.mapping - 1;
            if (chatIndex < numberMatches.length) {
                const newValue = parseInt(numberMatches[chatIndex], 10);
                if (newValue !== lastSentValues[i]) {
                    lastSentValues[i] = newValue;
                    mappingObj.intensity = Math.min(Math.max(newValue / 100, 0), 1);
                }
                let motorCount = 1;
                const device = mappingObj.device;
                if (device._deviceInfo && device._deviceInfo.DeviceMessages && device._deviceInfo.DeviceMessages.ScalarCmd) {
                    motorCount = device._deviceInfo.DeviceMessages.ScalarCmd.length;
                }
                if (!deviceCommands.has(device)) {
                    deviceCommands.set(device, Array(motorCount).fill(0));
                }
                let speeds = deviceCommands.get(device);
                speeds[mappingObj.motor] = mappingObj.intensity;
            } else {
                debugLog(`Mapping row ${i+1}: No corresponding number found in the message.`);
            }
        }
        // Now send command per device only if the aggregated array has changed.
        for (let [device, speeds] of deviceCommands.entries()) {
            let send = true;
            if (lastDeviceCommands.has(device)) {
                const prev = lastDeviceCommands.get(device);
                if (arraysEqual(prev, speeds)) {
                    send = false;
                }
            }
            if (send) {
                sendVibrationCommandToDevice(device, speeds);
                // Store a copy of speeds.
                lastDeviceCommands.set(device, speeds.slice());
            }
        }
    }

    // Send a vibration command.
    async function sendVibrationCommandToDevice(device, vibValueOrArray) {
        if (!device || !device.vibrate) return;
        if (Array.isArray(vibValueOrArray)) {
            await device.vibrate(vibValueOrArray);
            debugLog(`Sent vibration array: ${JSON.stringify(vibValueOrArray)} to ${device.name}`);
        } else {
            const intensity = Math.min(Math.max(vibValueOrArray / 100, 0), 1);
            await device.vibrate(intensity);
            debugLog(`Sent vibration: ${roundTo3(intensity)} to ${device.name}`);
        }
    }

    // Initialize help popup, UI, and connection status checks.
    createHelpPanel();
    createUI();
    connectionCheckInterval = setInterval(checkConnectionStatus, 10000);

    // Set up MutationObserver for chat updates.
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
