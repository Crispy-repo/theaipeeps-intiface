# The Ai Peeps Intiface / Buttplug.IO

This repository contains a Tampermonkey userscript that integrates with [Buttplug.io] (https://buttplug.io/) Intiface. The script connects to an Intiface server via a fixed WebSocket URL (`ws://localhost:12345`), scans for connected devices (up to 4), and maps chat message numbers to individual devices so that vibration commands can be triggered in real time based on chat input.

## Features

- **Fixed Connection:**  
  Connects to Intiface using a fixed URL (`ws://localhost:12345`).

- **Device Scanning & Mapping:**  
  Automatically scans for connected devices and supports up to 4 devices. Use dropdowns to assign which chat number controls each device.  
  - If devices are refreshed or the mapping is changed, you must reapply your mapping by clicking the **Restart** (or **Start**) button.

- **Chat Message Processing:**  
  Listens for chat messages on the target website, extracts the most recent valid number(s), and sends corresponding vibration commands to the mapped devices.

- **Connection Toggle:**  
  A single toggle button shows connection status via an indicator dot (red when disconnected, green when connected) and toggles between connecting and disconnecting.

- **Hideable UI:**  
  The control panel can be hidden, with a small restore button available to bring it back.

- **Documentation Popup:**  
  A help ("?") button inside the panel opens a documentation popup explaining how the script works.

- **Periodic Connection Check:**  
  The script checks the connection status every 10 seconds and updates the UI accordingly.

## Installation

1. **Install Tampermonkey:**  
   If you haven't already, install the [Tampermonkey extension](https://www.tampermonkey.net/) for your browser.

2. **Add the Script:**  
   - Create a new userscript in Tampermonkey.
   - Copy and paste the contents of the script from this repository into the new userscript.
   - Save the script.

## Usage

1. **Navigate to TheAiPeeps Website:**  
   Open the website where you want the script to operate.

2. **Open the Control Panel:**  
   The control panel appears in the bottom-right corner of the screen.

3. **Connect to Intiface:**  
   Click the **Connect** button. When connected, the button changes to **Disconnect** with a green indicator dot.

4. **Map Devices:**  
   - The script automatically scans for devices (up to 4) and displays mapping dropdowns.
   - Use the dropdowns to assign which chat message number controls each device.
   - If you change any dropdown or click **Refresh Devices**, the **Start** button will change to **Restart**. Click it to reapply your mapping.

5. **Start Chat Processing:**  
   Click **Start** (or **Restart**) to begin processing chat messages. The script will continuously check for valid numbers in the latest chat messages and send vibration commands to the mapped devices.

6. **Hide/Restore UI:**  
   Use the **Hide UI** button to minimize the control panel. A restore button (displaying a sweat drop emoji) will appear in the bottom-right. Click it to bring the control panel back.

7. **View Documentation:**  
   Click the **?** button (located at the top left inside the control panel) to toggle the documentation popup with details about the script's operation.



## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

*Note: This script requires the Buttplug.io library, which is included via a CDN in the script header.*
