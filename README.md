# The Ai Peeps Intiface / Buttplug.IO Sync

This repository contains a Tampermonkey userscript that integrates with [Buttplug.io] (https://buttplug.io/) Intiface. The script connects to an Intiface server via a fixed WebSocket URL (`ws://localhost:12345`), scans for connected devices (up to 4), and maps chat message numbers to individual devices so that vibration commands can be triggered in real time based on chat input.

## Features

- **Device Scanning & Mapping**  
  - Automatically scans for up to 4 connected devices.
  - For each device, a mapping row is provided that displays:
    - The device name.
    - A dropdown to assign which chat message number controls that device.
    - A slider (range 0–50) to set an oscillation percentage.
  - The oscillation percentage determines how much the vibration intensity will oscillate (sine wave) around the base value if no new chat value is received. The resulting value is clamped between 0 and 100.

- **Start/Stop Toggle for Chat Processing**  
  - The mapping processing can be toggled on and off using a single button.
  - When "Start" is pressed, the button changes to "Stop" and processing begins.
  - When "Stop" is pressed, the script halts processing and sends a 0 command to every connected device (effectively stopping any vibrations).

- **Connection Toggle**  
  A single toggle button shows a red dot with "Connect" when disconnected and a green dot with "Disconnect" when connected.

- **Hideable UI**  
  The control panel is displayed in the bottom-right corner and can be hidden. A small restore button appears when hidden.

- **Documentation Popup**  
  A help ("?") button in the top left of the control panel toggles a popup that explains how the program works.

- **Oscillation**  
  Oscillation commands are sent every 175ms when activated, with intensity values logged rounded to three decimal places.

- **Connection Status Checks**  
  The script periodically checks the connection status (every 10 seconds) and updates the UI accordingly. When disconnected, connection status checking stops.

## Installation

1. **Install Tampermonkey:**  
   If you haven't already, install the [Tampermonkey extension](https://www.tampermonkey.net/) for your browser.

2. **Add the Script:**  
   - Create a new userscript in Tampermonkey.
   - Copy and paste the contents of the script from this repository into the new userscript.
   - Save the script.

## Usage

1. **Navigate to The AI Peeps Chat Website:**  
   Open the website where you want the script to operate.

2. **Open the Control Panel:**  
   The control panel appears in the bottom-right corner of the screen.

3. **Connect to Intiface:**  
   Click the **Connect** button. When connected, the button changes to **Disconnect** with a green indicator dot.

4. **Map Devices:**  
   - In the **Mapping Settings** section, each connected device appears with its name.
   - Use the dropdown to assign which chat message number controls each device.
   - Use the slider below each device row to set the oscillation percentage (0–50%). For example, setting it to 10 will cause the vibration intensity to oscillate ±10% around the base value if no new value arrives.
   - If you change any mapping or refresh devices, the **Start** button will change to **Restart**. Click it to reapply your mapping.

5. **Toggle Chat Processing:**  
   - Click **Start** to begin processing chat messages. The button will change to **Stop**.
   - While processing, the script listens for chat messages, extracts numbers, and sends vibration commands to the mapped devices.
   - When you press **Stop**, chat processing halts and a 0 command is sent to every device.

6. **Hide/Restore UI:**  
   - Click the **Hide UI** button (top right of the control panel) to minimize the panel.
   - A small restore button (displaying a sweat drop emoji) will appear in the bottom-right corner. Click it to bring back the control panel.

7. **View Documentation:**  
   Click the **?** button in the top left corner of the control panel to toggle the documentation popup.



## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
