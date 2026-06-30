# Universal Live Stream Sync Chrome Extension

A lightweight, premium browser extension that synchronizes live video streams to the absolute live edge, controls latency, and dynamically matches playback speed on any streaming website.

---

## ✨ Key Features

- **📺 Universal Site Support:** Works on any streaming platform (YouTube, Twitch, ZDF, VRT Max, and others) using Chrome's native site permission settings.
- **⚡ Ultra-Low Latency Controls:** Choose your target latency (e.g. `1.5s` to `3.0s`) using an interactive slider.
- **📈 Auto-Sync Speedup:** Automatically speeds up the player to `1.12x` if it falls slightly behind, catching up smoothly without audio pitch distortions (and returning to `1.0x` when synced).
- **🔄 Instant Catch-up:** A single click on the "Sync to Live Edge" button performs a hard jump straight into the latest buffered frame.
- **🛠️ Force Live Mode (Override):** Treat any video as a live stream even if the player reports a finite DVR duration or standard VOD.
- **🎨 Glassmorphic Draggable UI:** A floating, responsive control card that remembers its position across page reloads and resizes, with auto-clamping to prevent it from going off-screen.

---

## 🛠️ Installation & Local Testing (Developer Mode)

To run the extension locally:

1. **Open the Extensions Page:**
   - In Google Chrome/Brave, navigate to `chrome://extensions/`.
   - In Microsoft Edge, navigate to `edge://extensions/`.

2. **Enable Developer Mode:**
   - Toggle the **Developer mode** switch in the top-right corner to **ON**.

3. **Load the Unpacked Folder:**
   - Click the **Load unpacked** button in the top-left corner.
   - Select the extension folder:
     📁 `c:\Users\Khoka Moni\Downloads\ULSS`

---

## 🚀 How to Use & Site Permissions

Because this extension uses universal matching, Chrome allows you to control which sites it runs on:

1. **Setting Site Access:**
   - Click the **Extensions** (jigsaw puzzle) icon next to your browser address bar.
   - Right-click **Universal Live Stream Sync**.
   - Under **"This can read and change site data"**, choose:
     * *When you click the extension:* Injets the control panel only when you click the icon.
     * *On [current site] (e.g. www.zdf.de):* Restricts it to run specifically on that domain.
     * *On all sites:* Injects the control panel on all streaming pages automatically.

2. **Syncing Streams:**
   - If a website doesn't automatically activate the dashboard, toggle **Force Live Mode** on in the settings panel to override the checks and display the live delay.
   - Adjust the **Target Latency** slider or toggle **Auto-Sync Speedup** to maintain real-time sync.

---

## 📦 How to Publish to the Chrome Web Store

The extension has been packaged into a production-ready ZIP archive:
👉 `universal-live-stream-sync.zip`

To upload it to the Chrome Web Store:

1. Go to the [Chrome Web Store Developer Console](https://developer.chrome.com/webstore/publish).
2. Log in with your developer account.
3. Click **Add new item**.
4. Upload `universal-live-stream-sync.zip`.
5. Fill out the store listing details (Title, Description, Screenshots, and Icons).
6. Submit for review!
