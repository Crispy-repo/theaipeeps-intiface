// ==UserScript==
// @name         The Ai Peeps Intiface / Buttplug.IO Sync
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Controls device commands based on chat messages with UI. Supports devices with multiple actuator types (Vibrate, Oscillate, Rotate, Linear).
// @author       Crispy-repo (modified)
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
    // mappingConfig holds one object per mapping row (each actuator channel):
    // { mapping: number, osc: number, device: deviceObj, motor: number, intensity: number, commandType: string }
    let mappingConfig = [];
    let lastSentValues = []; // holds last raw value per mapping row (0-100)
    // Oscillation arrays (per mapping row)
    let oscillationTimers = [];
    let oscillationBases = [];      // base intensity (0-1)
    let oscillationStartTime = [];  // timestamp for oscillation start
    // Intervals
    let mappingProcessingInterval = null;
    let connectionCheckInterval = null;

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
        helpPanel.style.width = "600px"; // widened for long names
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
            - Use the dropdowns to assign which chat message number controls each actuator channel of each device.<br>
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
        panel.style.width = '600px'; // widened
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

    // Disconnect from Intiface and clear mapping settings.
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
                // Clear mapping UI and configuration.
                document.getElementById("mapping-section").style.display = "none";
                document.getElementById("mapping-settings").innerHTML = "";
                mappingConfig = [];
                lastSentValues = [];
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

    // Log complete device information.
    function logAllDevices() {
        if (client && client.devices) {
            client.devices.forEach((device, index) => {
                debugLog(`Device ${index+1} info: ${JSON.stringify(device._deviceInfo, null, 2)}`);
            });
        }
    }

    // New helper: Update command for a given device and command type.
    // This aggregates all mapping rows for that device and command type.
    async function updateDeviceCommand(device, commandType) {
        // Find all mapping rows for this device and command type.
        let relevantConfigs = mappingConfig.filter(config =>
            config.device === device &&
            config.commandType.toLowerCase() === commandType.toLowerCase()
        );
        if (relevantConfigs.length === 0) return;

        // Determine the channel indices for this command type on the device.
        let cmdIndices = [];
        if(device._deviceInfo && device._deviceInfo.DeviceMessages && device._deviceInfo.DeviceMessages.ScalarCmd) {
            device._deviceInfo.DeviceMessages.ScalarCmd.forEach((cmd, idx) => {
                if(cmd.ActuatorType && cmd.ActuatorType.toLowerCase() === commandType.toLowerCase()){
                    cmdIndices.push(idx);
                }
            });
        }
        // Prepare an array with length equal to the number of channels for that command type.
        let intensities = Array(cmdIndices.length).fill(0);
        // For each relevant mapping row, place its intensity at the appropriate position.
        relevantConfigs.forEach(config => {
            let pos = cmdIndices.indexOf(config.motor);
            if (pos >= 0) {
                intensities[pos] = config.intensity;
            }
        });
        // Send the appropriate command.
        try {
            if(commandType.toLowerCase() === "vibrate" && device.vibrate) {
                await device.vibrate(intensities);
                debugLog(`Sent vibrate command: ${JSON.stringify(intensities)} to ${device.name}`);
            } else if(commandType.toLowerCase() === "oscillate" && device.oscillate) {
                await device.oscillate(intensities);
                debugLog(`Sent oscillate command: ${JSON.stringify(intensities)} to ${device.name}`);
            } else if(commandType.toLowerCase() === "rotate" && device.rotate) {
                await device.rotate(intensities);
                debugLog(`Sent rotate command: ${JSON.stringify(intensities)} to ${device.name}`);
            } else if(commandType.toLowerCase() === "linear" && device.linear) {
                await device.linear(intensities);
                debugLog(`Sent linear command: ${JSON.stringify(intensities)} to ${device.name}`);
            } else {
                debugLog(`Device ${device.name} does not support command type: ${commandType}`);
            }
        } catch (err) {
            debugLog(`Error sending ${commandType} command to ${device.name}: ${err}`);
        }
    }

    // Populate mapping settings for each device and each actuator channel.
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
            // No limit on devices; use all connected devices.
            //if (devices.length > 4) {
            //    devices = devices.slice(0, 4);
            //}
            // Compute total mapping rows (actuator channels) across all devices.
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
            debugLog("Total mapping rows (actuator channels): " + totalMappingCount);

            const mappingSection = document.getElementById("mapping-section");
            mappingSection.style.display = "block";
            const mappingSettingsDiv = document.getElementById("mapping-settings");
            mappingSettingsDiv.innerHTML = "";
            let globalMappingIndex = 0;
            devices.forEach((device, deviceIndex) => {
                let motorCount = motorCounts[deviceIndex];
                debugLog("Device: " + device.name + " reports " + motorCount + " actuator channel(s).");
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
                    // Also display the actuator type (if available)
                    let actuatorType = "Vibrate";
                    if (device._deviceInfo && device._deviceInfo.DeviceMessages && device._deviceInfo.DeviceMessages.ScalarCmd) {
                        let cmd = device._deviceInfo.DeviceMessages.ScalarCmd[m];
                        if(cmd && cmd.ActuatorType) {
                            actuatorType = cmd.ActuatorType;
                        }
                    }
                    label.innerText = `${device.name} (Channel ${m+1} - ${actuatorType}): `;
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

    // Start mapping: build mappingConfig for each mapping row and clear any old oscillation timers.
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
            const deviceIndex = parseInt(sel.dataset.deviceIndex, 10);
            const motorIndex = parseInt(sel.dataset.motorIndex, 10);
            let deviceObj = client.devices[deviceIndex];
            // Determine the command type for this channel based on device info.
            let commandType = "vibrate"; // default
            if (deviceObj._deviceInfo && deviceObj._deviceInfo.DeviceMessages && deviceObj._deviceInfo.DeviceMessages.ScalarCmd) {
                let cmd = deviceObj._deviceInfo.DeviceMessages.ScalarCmd[motorIndex];
                if(cmd && cmd.ActuatorType) {
                    commandType = cmd.ActuatorType.toLowerCase();
                }
            }
            mappingConfig.push({
                mapping: mappingValue,
                osc: oscValue,
                device: deviceObj,
                motor: motorIndex,
                intensity: 0,
                commandType: commandType
            });
            lastSentValues.push(null);
            oscillationTimers.push(null);
            oscillationBases.push(null);
            oscillationStartTime.push(null);
        }
        debugLog("Mapping configuration set: " + mappingConfig.map(obj =>
            `(${obj.device.name} Channel ${obj.motor+1} [${obj.commandType}] -> Number ${obj.mapping}, ${obj.osc}%)`
        ).join(", "));
        mappingStarted = true;
        mappingProcessingInterval = setInterval(checkMessages, 2000);
        const startBtn = document.getElementById("start-btn");
        startBtn.innerText = "Stop";
        startBtn.style.backgroundColor = "";
        startBtn.style.border = "";
        startBtn.style.fontWeight = "";
    }

    // Stop mapping: clear intervals and send stop command.
    function stopMapping() {
        if (mappingProcessingInterval) {
            clearInterval(mappingProcessingInterval);
            mappingProcessingInterval = null;
        }
        mappingStarted = false;
        const startBtn = document.getElementById("start-btn");
        startBtn.innerText = "Start";
        // Clear any ongoing oscillation timers.
        for (let i = 0; i < oscillationTimers.length; i++) {
            if (oscillationTimers[i]) {
                clearInterval(oscillationTimers[i]);
                oscillationTimers[i] = null;
            }
        }
        // Group mapping rows by device and command type to send only one stop command per group.
        let deviceCmdMap = new Map();
        mappingConfig.forEach(config => {
            if (!deviceCmdMap.has(config.device)) {
                deviceCmdMap.set(config.device, new Set());
            }
            deviceCmdMap.get(config.device).add(config.commandType);
        });
        // For each device and command type, build the correct zeros array and send the stop command.
        deviceCmdMap.forEach((cmdSet, device) => {
            cmdSet.forEach(async (cmdType) => {
                // Determine channels for the given command type on the device.
                let channels = [];
                if (device._deviceInfo && device._deviceInfo.DeviceMessages && device._deviceInfo.DeviceMessages.ScalarCmd) {
                    device._deviceInfo.DeviceMessages.ScalarCmd.forEach((cmd, idx) => {
                        if (cmd.ActuatorType && cmd.ActuatorType.toLowerCase() === cmdType.toLowerCase()) {
                            channels.push(idx);
                        }
                    });
                }
                // Create an array of zeros with the same length as the number of channels.
                let zeros = Array(channels.length).fill(0);
                try {
                    if (cmdType.toLowerCase() === "vibrate" && device.vibrate) {
                        await device.vibrate(zeros);
                    } else if (cmdType.toLowerCase() === "oscillate" && device.oscillate) {
                        await device.oscillate(zeros);
                    } else if (cmdType.toLowerCase() === "rotate" && device.rotate) {
                        await device.rotate(zeros);
                    } else if (cmdType.toLowerCase() === "linear" && device.linear) {
                        await device.linear(zeros);
                    } else {
                        debugLog(`Device ${device.name} does not support command type: ${cmdType}`);
                    }
                    debugLog(`Sent stop command for ${cmdType} with zeros: ${JSON.stringify(zeros)} to ${device.name}`);
                } catch (err) {
                    debugLog(`Error sending stop command for ${cmdType} to ${device.name}: ${err}`);
                }
            });
        });
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

        // To track which device and commandType need an update.
        let deviceCmdMap = new Map();

        // For each mapping row, update its intensity based on the corresponding number.
        for (let i = 0; i < mappingConfig.length; i++) {
            const mappingObj = mappingConfig[i];
            const chatIndex = mappingObj.mapping - 1;
            if (chatIndex < numberMatches.length) {
                const newValue = parseInt(numberMatches[chatIndex], 10);
                if (newValue !== lastSentValues[i]) {
                    lastSentValues[i] = newValue;
                    mappingObj.intensity = newValue / 100;
                    if (oscillationTimers[i]) {
                        clearInterval(oscillationTimers[i]);
                        oscillationTimers[i] = null;
                    }
                    // Mark this device/commandType for update.
                    if(!deviceCmdMap.has(mappingObj.device)) {
                        deviceCmdMap.set(mappingObj.device, new Set());
                    }
                    deviceCmdMap.get(mappingObj.device).add(mappingObj.commandType);
                } else {
                    if (mappingObj.osc > 0) {
                        if (!oscillationTimers[i]) {
                            oscillationStartTime[i] = Date.now();
                            oscillationBases[i] = mappingObj.intensity;
                            oscillationTimers[i] = setInterval(() => {
                                const frequency = 0.5; // Hz
                                const t = (Date.now() - oscillationStartTime[i]) / 1000;
                                const amplitude = (mappingObj.osc / 100) * oscillationBases[i];
                                let oscillated = oscillationBases[i] + amplitude * Math.sin(2 * Math.PI * frequency * t);
                                oscillated = Math.max(0, Math.min(1, oscillated));
                                mappingObj.intensity = oscillated;
                                // Update immediately for this channel.
                                (async () => {
                                    await updateDeviceCommand(mappingObj.device, mappingObj.commandType);
                                })();
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
                debugLog(`Mapping row ${i+1}: No corresponding number found in the message.`);
            }
        }
        // Now update each affected device/commandType.
        deviceCmdMap.forEach((cmdSet, device) => {
            cmdSet.forEach(cmdType => {
                updateDeviceCommand(device, cmdType);
            });
        });
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
