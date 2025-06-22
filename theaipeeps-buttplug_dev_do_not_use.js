// ==UserScript==
// @name         The Ai Peeps Intiface / Buttplug.IO Sync TESTING
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Controls vibration based on chat messages with UI. Supports splitting commands per actuator type (Vibrate, Oscillate, Rotate, Linear).
// @author       Crispy-repo
// @match        https://www.theaipeeps.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=theaipeeps.com
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/buttplug@3.2.2/dist/web/buttplug.js
// ==/UserScript==

(async function() {
    'use strict';

    // Global variables
    let client = null;
    let isConnected = false;
    let mappingStarted = false;
    // mappingConfig: one entry per mapping row (per actuator) with:
    // { mapping: number, osc: number, deviceIndex: number, motor: number, intensity: number }
    let mappingConfig = [];
    let lastSentValues = []; // one per mapping row
    // Oscillation arrays (one per mapping row)
    let oscillationTimers = [];
    let oscillationBases = [];
    let oscillationStartTime = [];
    // Intervals for mapping and connection checking.
    let mappingProcessingInterval = null;
    let connectionCheckInterval = null;
    // Global message Id counter.
    let messageIdCounter = 1;

    // Helper: round to 3 decimals.
    function roundTo3(num) {
        return Math.round(num * 1000) / 1000;
    }

    // Get next unique message Id.
    function getNextMessageId() {
        return messageIdCounter++;
    }

    // Debug log helper.
    function debugLog(message) {
        console.log(message);
    }

    // Toggle the help/documentation popup.
    function toggleDocumentation() {
        const helpPanel = document.getElementById("help-panel");
        helpPanel.style.display = (!helpPanel.style.display || helpPanel.style.display === "none") ? "block" : "none";
    }

    // Create the help/documentation popup.
    function createHelpPanel() {
        const helpPanel = document.createElement("div");
        helpPanel.id = "help-panel";
        helpPanel.style.position = "fixed";
        helpPanel.style.bottom = "calc(95px + 320px)";
        helpPanel.style.right = "10px";
        helpPanel.style.width = "600px";
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
            - Use the dropdowns to assign which chat message number controls each actuator of each device.<br>
            - Under each mapping row, adjust the slider (0–50) to set an oscillation percentage. Only numbers from 0 to 100 are accepted.<br><br>
            <em>Connection:</em><br>
            - The toggle button shows a red dot with "Connect" when disconnected and a green dot with "Disconnect" when connected.<br><br>
            <em>Chat Processing:</em><br>
            - The script reconstructs AI messages from split spans so that numbers spread across elements are captured.<br>
            - Use the checkbox below to limit matching to numbers preceded by "v" (e.g., v34).<br><br>
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
        let intensityPhrases = {}; // Store loaded phrases
    const phrasesUrl = "https://raw.githubusercontent.com/Crispy-repo/testing/refs/heads/main/intensity_phrases.json";  // Replace with your actual GitHub URL
    let usePhraseSystem = false; // Default to number system

    async function loadIntensityPhrases() {
        try {
            const response = await fetch(phrasesUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            intensityPhrases = await response.json();
            debugLog("Intensity phrases loaded successfully.");
        } catch (error) {
            console.error("Error loading intensity phrases:", error);
            debugLog("Error loading intensity phrases.  Using default behavior."); //Important fallback!
            // Optionally, provide some default phrase lists here if the load fails.
        }
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
        panel.style.width = '600px';
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
            <div class="setting">
    <label for="use-phrase-system">Use Phrase-Based Intensity Mapping:</label>
    <input type="checkbox" id="use-phrase-system" name="use-phrase-system" />
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

        const settingsDiv = document.createElement('div');
        settingsDiv.id = 'plugin-settings'; // Add an ID for styling/access

        const phraseSystemCheckbox = document.createElement('input');
        phraseSystemCheckbox.type = 'checkbox';
        phraseSystemCheckbox.id = 'use-phrase-system';
        phraseSystemCheckbox.checked = usePhraseSystem;  // Initialize based on default value

        phraseSystemCheckbox.addEventListener('change', (event) => {
            usePhraseSystem = event.target.checked;
            debugLog("Using phrase system: " + usePhraseSystem);
        });

        const label = document.createElement('label');
        label.htmlFor = 'use-phrase-system';
        label.textContent = 'Use Phrase System for Intensity Mapping';

        settingsDiv.appendChild(phraseSystemCheckbox);
        settingsDiv.appendChild(label);

        // Add the settings div to your main plugin UI element (adjust selector as needed)
        const container = document.querySelector('#your-plugin-container'); // Replace with your actual container ID
        if (container) {
            container.appendChild(settingsDiv);
        } else {
            console.warn("Plugin container not found for settings.");
        }
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
            client = new buttplug.ButtplugClient("The Ai Peeps Intiface Sync");
            const connector = new buttplug.ButtplugBrowserWebsocketClientConnector(wsUrl);
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

    // Disconnect from Intiface and clear mapping.
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
                // Clear mapping UI and config.
                document.getElementById("mapping-section").style.display = "none";
                document.getElementById("mapping-settings").innerHTML = "";
                mappingConfig = [];
                lastSentValues = [];
                oscillationTimers.forEach(timer => { if (timer) clearInterval(timer); });
                oscillationTimers = [];
                oscillationBases = [];
                oscillationStartTime = [];
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

    // Log complete device info.
    function logAllDevices() {
        if (client && client.devices) {
            client.devices.forEach((device, index) => {
                debugLog(`Device ${index+1} info: ${JSON.stringify(device._deviceInfo, null, 2)}`);
            });
        }
    }

    // Populate mapping settings based on connected devices and their actuators.
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
            let totalMappingCount = 0;
            let motorCounts = [];
            devices.forEach((device) => {
                let motorCount = 1;
                if (device._deviceInfo &&
                    device._deviceInfo.DeviceMessages &&
                    device._deviceInfo.DeviceMessages.ScalarCmd) {
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
            devices.forEach((device, dIndex) => {
                let motorCount = motorCounts[dIndex];
                debugLog("Device: " + device._deviceInfo.DeviceName + " (DeviceIndex: " + device._deviceInfo.DeviceIndex + ") reports " + motorCount + " motor(s).");
                for (let m = 0; m < motorCount; m++) {
                    const actuatorType = device._deviceInfo.DeviceMessages.ScalarCmd[m].ActuatorType;
                    const container = document.createElement("div");
                    container.style.marginTop = "10px";
                    container.style.borderBottom = "1px solid #555";
                    container.style.paddingBottom = "5px";

                    const row = document.createElement("div");
                    row.style.display = "flex";
                    row.style.alignItems = "center";
                    row.style.flexWrap = "wrap";

                    const label = document.createElement("div");
                    label.innerText = `${device._deviceInfo.DeviceName} (Motor ${m+1}, ${actuatorType}): `;
                    label.style.flex = "1";
                    label.style.whiteSpace = "nowrap";

                    const select = document.createElement("select");
                    select.id = "mapping-device-" + globalMappingIndex;
                    // Save deviceIndex and motor index for later lookup.
                    select.dataset.deviceIndex = device._deviceInfo.DeviceIndex;
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

                    // Oscillation slider row.
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

    // NEW: Send commands for an entire device by grouping its actuators per type.
    async function sendCommandsForDevice(device) {
        if (!device || !device._deviceInfo || !device._deviceInfo.DeviceMessages || !device._deviceInfo.DeviceMessages.ScalarCmd) {
            debugLog("sendCommandsForDevice: Invalid device info.");
            return;
        }
        const deviceIndex = device._deviceInfo.DeviceIndex;
        const scalarCmdArray = device._deviceInfo.DeviceMessages.ScalarCmd;
        let actuatorGroups = {};
        // Group actuator indices by actuator type.
        for (let i = 0; i < scalarCmdArray.length; i++) {
            let type = scalarCmdArray[i].ActuatorType.toLowerCase();
            if (!actuatorGroups[type]) actuatorGroups[type] = [];
            actuatorGroups[type].push(i);
        }
        for (let type in actuatorGroups) {
            let indices = actuatorGroups[type];
            let speeds = [];
            indices.forEach(idx => {
                let mapping = mappingConfig.find(cfg => cfg.deviceIndex === deviceIndex && cfg.motor === idx);
                let speed = mapping ? mapping.intensity : 0;
                speeds.push(speed);
            });
            try {
                // Call the appropriate device method with an array of speeds.
                if (type === "vibrate" && typeof device.vibrate === "function") {
                    await device.vibrate(speeds);
                } else if (type === "oscillate" && typeof device.oscillate === "function") {
                    await device.oscillate(speeds);
                } else if (type === "rotate" && typeof device.rotate === "function") {
                    await device.rotate(speeds);
                } else if (type === "linear" && typeof device.linear === "function") {
                    await device.linear(speeds);
                } else {
                    // Fallback: send a ScalarCmd message.
                    let scalars = indices.map(idx => ({
                        Index: idx,
                        Speed: speeds[idx]
                    }));
                    let message = {
                        ScalarCmd: {
                            DeviceIndex: deviceIndex,
                            Id: getNextMessageId(),
                            Scalars: scalars
                        }
                    };
                    debugLog("Fallback: Sending ScalarCmd message: " + JSON.stringify(message));
                    await client.sendDeviceMessage(message);
                }
                debugLog(`Sent command for device ${device._deviceInfo.DeviceName} actuator type ${type} with speeds: ${JSON.stringify(speeds)}`);
            } catch (err) {
                debugLog(`Error sending command for device ${device._deviceInfo.DeviceName} actuator type ${type}: ${err}`);
            }
        }
    }

 // ... (Your existing plugin initialization code) ...

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
        let phraseMsg = null;
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
            else {
                phraseMsg = text;
                break;
            }

        }




        // NEW SECTION - Phrase Based Intensity Mapping (Start)
        const usePhraseSystem = document.getElementById("use-phrase-system") ? document.getElementById("use-phrase-system").checked : false;

        if (usePhraseSystem) {
            debugLog(`phrasemsg: ${phraseMsg}`);
            let intensityLevel = null;
            for (const level in intensityPhrases) {
                const phrases = intensityPhrases[level];
                for (const phrase of phrases) {
                    if (phraseMsg.toLowerCase().includes(phrase.toLowerCase())) {
                        intensityLevel = level;
                        break;
                    }
                }
                if (intensityLevel) break;
            }

            if (intensityLevel) {
                let intensityValue;
                switch (intensityLevel) {
                    case 'low':
                        intensityValue = 0.25;
                        break;
                    case 'mid':
                        intensityValue = 0.5;
                        break;
                    case 'high':
                        intensityValue = 0.75;
                        break;
                    case 'orgasm':
                        intensityValue = 1;
                        break;
                }

                // Update mappingConfig based on the detected intensity level
                for (let i = 0; i < mappingConfig.length; i++) {
                    const mappingObj = mappingConfig[i];
                    mappingObj.intensity = intensityValue;
                    lastSentValues[i] = intensityValue * 100; // Store as percentage for consistency

                    // Oscillation logic (same as before)
                    if (mappingObj.osc > 0) {
                        if (!oscillationTimers[i]) {
                            oscillationStartTime[i] = Date.now();
                            oscillationBases[i] = mappingObj.intensity;
                            oscillationTimers[i] = setInterval(() => {
                                const frequency = 0.5;
                                const t = (Date.now() - oscillationStartTime[i]) / 1000;
                                const amplitude = (mappingObj.osc / 100) * oscillationBases[i];
                                let oscillated = oscillationBases[i] + amplitude * Math.sin(2 * Math.PI * frequency * t);
                                oscillated = Math.max(0, Math.min(1, oscillated));
                                mappingObj.intensity = oscillated;
                                let device = getDeviceByDeviceIndex(mappingObj.deviceIndex);
                                if (device) {
                                    sendCommandsForDevice(device);
                                }
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
                debugLog("No matching intensity phrase found.");
            }
            // NEW SECTION - Phrase Based Intensity Mapping (End)

        } else { // Original Number-Based Logic (Start)
   if (!validMsg) {
            debugLog("No valid vibration message found.");
            return;
        }
        debugLog("Latest valid message: " + validMsg);

        // Choose matching mode based on checkbox.
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
document.getElementById("last-value").innerText = "Last Read: " + numberMatches.join(", ");
        // Filter numbers to be between 0 and 100.
        numberMatches = numberMatches.filter(numStr => {
            const n = parseInt(numStr, 10);
            return n >= 0 && n <= 100;
        });

        if (numberMatches.length === 0) {
            debugLog("No numbers in range 0-100 found in the message.");
            return;
        }
            // Update mappingConfig based on the mapping number from the chat.
            for (let i = 0; i < mappingConfig.length; i++) {
                const mappingObj = mappingConfig[i];
                const chatIndex = mappingObj.mapping - 1;
                if (chatIndex < numberMatches.length) {
                    const newValue = parseInt(numberMatches[chatIndex], 10);
                    if (newValue !== lastSentValues[i]) {
                        lastSentValues[i] = newValue;
                        mappingObj.intensity = newValue / 100;
                    } else {
                        // Oscillation: update intensity if oscillation is enabled.
                        if (mappingObj.osc > 0) {
                            if (!oscillationTimers[i]) {
                                oscillationStartTime[i] = Date.now();
                                oscillationBases[i] = mappingObj.intensity;
                                oscillationTimers[i] = setInterval(() => {
                                    const frequency = 0.5;
                                    const t = (Date.now() - oscillationStartTime[i]) / 1000;
                                    const amplitude = (mappingObj.osc / 100) * oscillationBases[i];
                                    let oscillated = oscillationBases[i] + amplitude * Math.sin(2 * Math.PI * frequency * t);
                                    oscillated = Math.max(0, Math.min(1, oscillated));
                                    mappingObj.intensity = oscillated;
                                    let device = getDeviceByDeviceIndex(mappingObj.deviceIndex);
                                    if (device) {
                                        sendCommandsForDevice(device);
                                    }
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
                    debugLog(`Mapping row ${i + 1}: No corresponding number found in the message.`);
                }
            }

        } // Original Number-Based Logic (End)


        // For each unique device referenced in mappingConfig, send commands.
        let uniqueDeviceIndices = [...new Set(mappingConfig.map(cfg => cfg.deviceIndex))];
        uniqueDeviceIndices.forEach(async (deviceIndex) => {
            let device = getDeviceByDeviceIndex(deviceIndex);
            if (device) {
                await sendCommandsForDevice(device);
            }
        });

    }


    // Toggle mapping: start if not running; stop if running.
    function toggleMapping() {
        if (mappingStarted) {
            stopMapping();
        } else {
            startMapping();
        }
    }

    // Start mapping: build mappingConfig from UI settings.
    function startMapping() {
        // Clear any existing oscillation timers.
        if (oscillationTimers && oscillationTimers.length > 0) {
            oscillationTimers.forEach(timer => { if (timer) clearInterval(timer); });
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
            const deviceIndex = parseInt(sel.dataset.deviceIndex, 10);
            const motorIndex = parseInt(sel.dataset.motorIndex, 10);
            mappingConfig.push({
                mapping: mappingValue,
                osc: oscValue,
                deviceIndex: deviceIndex,
                motor: motorIndex,
                intensity: 0
            });
            lastSentValues.push(null);
            oscillationTimers.push(null);
            oscillationBases.push(null);
            oscillationStartTime.push(null);
        }
        debugLog("Mapping configuration set: " + mappingConfig.map(obj =>
            `(${obj.deviceIndex} Motor ${obj.motor+1} -> Number ${obj.mapping}, ${obj.osc}%)`
        ).join(", "));
        mappingStarted = true;
        mappingProcessingInterval = setInterval(checkMessages, 2000);
        const startBtn = document.getElementById("start-btn");
        startBtn.innerText = "Stop";
        startBtn.style.backgroundColor = "";
        startBtn.style.border = "";
        startBtn.style.fontWeight = "";
    }


    function getDeviceByDeviceIndex(deviceIndex) {
    if (!client || !client.devices) {
        debugLog("No devices available to search.");
        return null;
    }
    return client.devices.find(device => device._deviceInfo.DeviceIndex === deviceIndex);
}
    // Stop mapping: clear intervals and send stop commands.
    function stopMapping() {
        if (mappingProcessingInterval) {
            clearInterval(mappingProcessingInterval);
            mappingProcessingInterval = null;
        }
        mappingStarted = false;
        const startBtn = document.getElementById("start-btn");
        startBtn.innerText = "Start";
        if (oscillationTimers) {
            oscillationTimers.forEach(timer => { if (timer) clearInterval(timer); });
            oscillationTimers = [];
        }
        // Stop all devices by sending a 0 intensity command to every actuator.
        let uniqueDeviceIndices = [...new Set(mappingConfig.map(cfg => cfg.deviceIndex))];
        uniqueDeviceIndices.forEach(async (deviceIndex) => {
            let device = getDeviceByDeviceIndex(deviceIndex);
            if (device) {
                const scalarCmdArray = device._deviceInfo.DeviceMessages.ScalarCmd;
                // Group actuator indices by type
                let actuatorGroups = {};
                for (let i = 0; i < scalarCmdArray.length; i++) {
                    let type = scalarCmdArray[i].ActuatorType.toLowerCase();
                    if (!actuatorGroups[type]) actuatorGroups[type] = [];
                    actuatorGroups[type].push(i);
                }
                try {
                    for (let type in actuatorGroups) {
                        let indices = actuatorGroups[type];
                        let speeds = Array(indices.length).fill(0);
                        if (type === "vibrate" && typeof device.vibrate === "function") {
                            await device.vibrate(speeds);
                        } else if (type === "oscillate" && typeof device.oscillate === "function") {
                            await device.oscillate(speeds);
                        } else if (type === "rotate" && typeof device.rotate === "function") {
                            await device.rotate(speeds);
                        } else if (type === "linear" && typeof device.linear === "function") {
                            await device.linear(speeds);
                        } else {
                            // Fallback: send a ScalarCmd message.
                            let scalars = indices.map(idx => ({
                                Index: idx,
                                Speed: 0
                            }));
                            let message = {
                                ScalarCmd: {
                                    DeviceIndex: device._deviceInfo.DeviceIndex,
                                    Id: getNextMessageId(),
                                    Scalars: scalars
                                }
                            };
                            await client.sendDeviceMessage(message);
                        }
                    }
                    debugLog(`Stopped device ${device._deviceInfo.DeviceName}.`);
                } catch (err) {
                    debugLog(`Error stopping device ${device._deviceInfo.DeviceName}: ${err}`);
                }
            }
        });
    }

    async function updateCommandForDeviceActuator(device, actuatorIndex, intensity) {
        // Check if the device is still in the client devices list.
        const availableDevice = client.devices.find(d => d._deviceInfo.DeviceIndex === device._deviceInfo.DeviceIndex);
        if (!availableDevice) {
            debugLog(`Device ${device._deviceInfo.DeviceName} is no longer available to receive commands.`);
            return;
        }
        const actuatorType = device._deviceInfo.DeviceMessages.ScalarCmd[actuatorIndex].ActuatorType.toLowerCase();
        debugLog(`updateCommandForDeviceActuator: Device ${device._deviceInfo.DeviceName} (Index: ${device._deviceInfo.DeviceIndex}) actuator ${actuatorIndex} (${actuatorType}) intensity: ${intensity}`);
        try {
            let message = {
                ScalarCmd: {
                    DeviceIndex: device._deviceInfo.DeviceIndex,
                    Id: getNextMessageId(),
                    Scalars: [{
                        Index: actuatorIndex,
                        Speed: intensity
                    }]
                }
            };
            debugLog("Fallback: Sending ScalarCmd message: " + JSON.stringify(message));
            await client.sendDeviceMessage(message);
            debugLog(`updateCommandForDeviceActuator: Command sent to ${device._deviceInfo.DeviceName} actuator ${actuatorIndex}`);
        } catch (err) {
            debugLog(`Error in updateCommandForDeviceActuator for device ${device._deviceInfo.DeviceName} actuator ${actuatorIndex}: ${err}`);
        }
    }


    // Initialize help popup, UI, and start connection status checks.
    createHelpPanel();
    loadIntensityPhrases(); // Load phrases on plugin startup
    createUI();
    connectionCheckInterval = setInterval(checkConnectionStatus, 10000);

    // Set up a MutationObserver for chat window updates.
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
