/* Universal Live Stream Sync Content Script */

(function() {
  'use strict';

  console.log('[Live Stream Sync] Content script injected on page:', window.location.href);

  // Constants
  const PREFS_KEY_PREFIX = 'live_sync_';
  const SCAN_INTERVAL_MS = 1500;
  const UPDATE_INTERVAL_MS = 250;
  const HARD_SYNC_THRESHOLD = 4.5; // If behind by more than this, perform a hard jump
  const COOL_DOWN_MS = 2000;       // Buffer time after a hard seek to let the player stabilize

  // State
  let videoEl = null;
  let panelEl = null;
  let updateIntervalId = null;
  let isCooldown = false;
  
  // User preferences
  let settings = {
    targetLatency: 1.5,
    autoSync: false,
    isCollapsed: false,
    panelTop: null,
    panelLeft: null,
    forceLive: false
  };

  // 1. Storage Helpers (wrapped in try-catch to support Brave's privacy settings)
  function loadSettings() {
    Object.keys(settings).forEach(key => {
      if (key === 'isCollapsed') return; // Always start expanded on page load
      try {
        const stored = localStorage.getItem(PREFS_KEY_PREFIX + key);
        if (stored !== null) {
          settings[key] = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('[Live Stream Sync] Error reading preference from localStorage:', key, e);
      }
    });
  }

  function saveSetting(key, value) {
    settings[key] = value;
    try {
      localStorage.setItem(PREFS_KEY_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('[Live Stream Sync] Error saving preference to localStorage:', key, e);
    }
  }

  // 2. DOM Injection
  function createPanel() {
    const existingPanel = document.getElementById('vrt-sync-panel');
    if (existingPanel) {
      panelEl = existingPanel;
      return false;
    }

    // Create and inject styles in document head
    if (!document.getElementById('vrt-sync-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'vrt-sync-styles';
      styleEl.textContent = `
        .vrt-sync-panel {
          position: fixed;
          bottom: 100px;
          right: 24px;
          width: 320px;
          background: rgba(18, 18, 24, 0.82);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
          color: #f3f4f6;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          z-index: 2147483647;
          overflow: hidden;
          transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), height 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), border-radius 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s, background 0.3s, box-shadow 0.3s;
          user-select: none;
        }
        .vrt-sync-panel.collapsed {
          width: 48px;
          height: 48px;
          border-radius: 24px;
          bottom: 100px;
          right: 24px;
          background: rgba(18, 18, 24, 0.95);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }
        .vrt-sync-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.03);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .vrt-sync-title {
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #ffcc00;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .vrt-sync-logo-dot {
          width: 8px;
          height: 8px;
          background: #ffcc00;
          border-radius: 50%;
          box-shadow: 0 0 8px #ffcc00;
        }
        .vrt-sync-controls-top {
          display: flex;
          gap: 8px;
        }
        .vrt-sync-icon-btn {
          background: transparent;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .vrt-sync-icon-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
        }
        .vrt-sync-content {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .vrt-sync-panel.collapsed .vrt-sync-header,
        .vrt-sync-panel.collapsed .vrt-sync-content {
          display: none;
        }
        .vrt-sync-mini-trigger {
          display: none;
          width: 48px;
          height: 48px;
          cursor: pointer;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .vrt-sync-panel.collapsed .vrt-sync-mini-trigger {
          display: flex;
        }
        .vrt-sync-mini-indicator {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
        }
        .vrt-sync-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .vrt-sync-stat-box {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.04);
          padding: 10px;
          border-radius: 10px;
          text-align: center;
        }
        .vrt-sync-stat-label {
          font-size: 11px;
          color: #9ca3af;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .vrt-sync-stat-val {
          font-size: 20px;
          font-weight: 700;
          font-family: monospace;
          color: #ffffff;
        }
        .vrt-sync-stat-val.synced {
          color: #10b981;
          text-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
        }
        .vrt-sync-stat-val.lagging {
          color: #f59e0b;
          text-shadow: 0 0 10px rgba(245, 158, 11, 0.3);
        }
        .vrt-sync-stat-val.delayed {
          color: #ef4444;
          text-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
        }
        .vrt-sync-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          background: rgba(255, 255, 255, 0.02);
          padding: 8px 12px;
          border-radius: 8px;
        }
        .vrt-sync-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
        }
        .vrt-sync-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #9ca3af;
        }
        .vrt-sync-status-dot.active {
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
          animation: pulse-dot 1.5s infinite;
        }
        .vrt-sync-status-dot.matching {
          background: #ffcc00;
          box-shadow: 0 0 6px #ffcc00;
          animation: pulse-dot 1s infinite;
        }
        @keyframes pulse-dot {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        .vrt-sync-setting {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .vrt-sync-setting-label {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #d1d5db;
        }
        .vrt-sync-setting-val {
          font-weight: 600;
          color: #ffcc00;
        }
        .vrt-sync-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.1);
          outline: none;
          cursor: pointer;
        }
        .vrt-sync-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffcc00;
          box-shadow: 0 0 8px rgba(255, 204, 0, 0.5);
          cursor: pointer;
          transition: transform 0.1s;
        }
        .vrt-sync-slider::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }
        .vrt-sync-toggle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .vrt-sync-switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }
        .vrt-sync-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .vrt-sync-toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(255, 255, 255, 0.15);
          transition: .3s;
          border-radius: 24px;
        }
        .vrt-sync-toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          border-radius: 50%;
        }
        .vrt-sync-switch input:checked + .vrt-sync-toggle-slider {
          background-color: #10b981;
        }
        .vrt-sync-switch input:checked + .vrt-sync-toggle-slider:before {
          transform: translateX(20px);
        }
        .vrt-sync-btn {
          background: linear-gradient(135deg, #ffcc00 0%, #ff9900 100%);
          color: #121218;
          font-weight: 700;
          border: none;
          padding: 10px 16px;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 13px;
          box-shadow: 0 4px 15px rgba(255, 204, 0, 0.25);
          transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        .vrt-sync-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255, 204, 0, 0.4);
        }
        .vrt-sync-btn:active {
          transform: translateY(0);
        }
        .vrt-sync-btn svg {
          transition: transform 0.4s ease;
        }
        .vrt-sync-btn:hover svg {
          transform: rotate(180deg);
        }
        .vrt-sync-panel::-webkit-scrollbar {
          width: 6px;
        }
        .vrt-sync-panel::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 3px;
        }
      `;
      document.head.appendChild(styleEl);
    }

    panelEl = document.createElement('div');
    panelEl.id = 'vrt-sync-panel';
    panelEl.className = 'vrt-sync-panel';
    if (settings.isCollapsed) {
      panelEl.classList.add('collapsed');
    }

    // Set saved positions if they exist, clamped to current viewport
    if (settings.panelTop && settings.panelLeft) {
      const topVal = parseFloat(settings.panelTop);
      const leftVal = parseFloat(settings.panelLeft);
      if (!isNaN(topVal) && !isNaN(leftVal)) {
        const panelWidth = settings.isCollapsed ? 48 : 320;
        const panelHeight = settings.isCollapsed ? 48 : 340;
        const maxLeft = Math.max(0, window.innerWidth - panelWidth - 10);
        const maxTop = Math.max(0, window.innerHeight - panelHeight - 10);
        const finalLeft = Math.max(10, Math.min(leftVal, maxLeft));
        const finalTop = Math.max(10, Math.min(topVal, maxTop));
        panelEl.style.top = finalTop + "px";
        panelEl.style.left = finalLeft + "px";
        panelEl.style.bottom = 'auto';
        panelEl.style.right = 'auto';
      }
    }

    panelEl.innerHTML = `
      <!-- Header -->
      <div class="vrt-sync-header" id="vrt-sync-header" style="cursor: move;">
        <div class="vrt-sync-title">
          <span class="vrt-sync-logo-dot"></span>
          <span class="vrt-sync-header-title">Live Stream Sync</span>
        </div>
        <div class="vrt-sync-controls-top">
          <button class="vrt-sync-icon-btn" id="vrt-sync-minimize-btn" title="Minimize">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      </div>
      <!-- Main Content -->
      <div class="vrt-sync-content">
        <div class="vrt-sync-stats">
          <div class="vrt-sync-stat-box">
            <div class="vrt-sync-stat-label">Live Delay</div>
            <div class="vrt-sync-stat-val" id="vrt-sync-latency-val">--.-s</div>
          </div>
          <div class="vrt-sync-stat-box">
            <div class="vrt-sync-stat-label">Speed</div>
            <div class="vrt-sync-stat-val" id="vrt-sync-speed-val">1.0x</div>
          </div>
        </div>

        <div class="vrt-sync-status-row">
          <span class="vrt-sync-status-badge">
            <span class="vrt-sync-status-dot" id="vrt-sync-status-dot"></span>
            <span id="vrt-sync-status-text">Detecting live edge...</span>
          </span>
          <span style="color: #9ca3af; font-family: monospace; font-size: 11px;" id="vrt-sync-buffer-val">Buf: 0.0s</span>
        </div>

        <div class="vrt-sync-setting">
          <div class="vrt-sync-setting-label">
            <span>Target Latency</span>
            <span class="vrt-sync-setting-val" id="vrt-sync-target-val">${settings.targetLatency.toFixed(1)}s</span>
          </div>
          <input type="range" class="vrt-sync-slider" id="vrt-sync-target-slider" min="1.0" max="8.0" step="0.5" value="${settings.targetLatency}">
        </div>

        <div class="vrt-sync-toggle-row">
          <span style="font-weight: 500; font-size: 12px; color: #d1d5db;">Auto-Sync Speedup</span>
          <label class="vrt-sync-switch">
            <input type="checkbox" id="vrt-sync-autosync-toggle" ${settings.autoSync ? 'checked' : ''}>
            <span class="vrt-sync-toggle-slider"></span>
          </label>
        </div>

        <div class="vrt-sync-toggle-row">
          <span style="font-weight: 500; font-size: 12px; color: #d1d5db;">Force Live Mode</span>
          <label class="vrt-sync-switch" title="Force extension to treat this video as a live stream even if the site doesn't report it as one.">
            <input type="checkbox" id="vrt-sync-forcelive-toggle" ${settings.forceLive ? 'checked' : ''}>
            <span class="vrt-sync-toggle-slider"></span>
          </label>
        </div>

        <button class="vrt-sync-btn" id="vrt-sync-now-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Sync to Live Edge
        </button>
      </div>
      <!-- Mini Trigger when collapsed -->
      <div class="vrt-sync-mini-trigger" id="vrt-sync-mini-trigger" title="Restore Live Sync">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffcc00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span class="vrt-sync-mini-indicator" id="vrt-sync-mini-indicator"></span>
      </div>
    `;

    document.body.appendChild(panelEl);

    // Setup event handlers
    setupPanelEvents();
    return true;
  }

  // 3. Panel Controls
  function setupPanelEvents() {
    if (!panelEl) return;
    
    const minimizeBtn = panelEl.querySelector('#vrt-sync-minimize-btn');
    const miniTrigger = panelEl.querySelector('#vrt-sync-mini-trigger');
    const targetSlider = panelEl.querySelector('#vrt-sync-target-slider');
    const autoSyncToggle = panelEl.querySelector('#vrt-sync-autosync-toggle');
    const syncNowBtn = panelEl.querySelector('#vrt-sync-now-btn');
    const header = panelEl.querySelector('#vrt-sync-header');

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        panelEl.classList.add('collapsed');
        saveSetting('isCollapsed', true);
      });
    }

    if (miniTrigger) {
      makeDraggable(panelEl, miniTrigger, true);
    }

    if (targetSlider) {
      targetSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const targetValEl = panelEl.querySelector('#vrt-sync-target-val');
        if (targetValEl) targetValEl.textContent = val.toFixed(1) + 's';
        saveSetting('targetLatency', val);
      });
      targetSlider.addEventListener('change', () => {
        triggerHardSync();
      });
    }

    if (autoSyncToggle) {
      autoSyncToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        saveSetting('autoSync', val);
        if (!val && videoEl) {
          videoEl.playbackRate = 1.0; // Reset playback rate if toggled off
        }
      });
    }

    const forceLiveToggle = panelEl.querySelector('#vrt-sync-forcelive-toggle');
    if (forceLiveToggle) {
      forceLiveToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        saveSetting('forceLive', val);
        triggerHardSync();
      });
    }

    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', () => {
        triggerHardSync();
      });
    }

    if (header) {
      makeDraggable(panelEl, header);
    }
  }

  // Draggable logic
  function makeDraggable(element, handle, isMiniTrigger = false) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let startX = 0, startY = 0;
    let hasMoved = false;
    
    handle.onmousedown = dragMouseDown;
    handle.ontouchstart = dragMouseDown;

    function dragMouseDown(e) {
      // Don't drag if clicking mini controls/buttons/inputs inside handle
      if (e.target.closest('button') || e.target.closest('input')) return;
      
      e = e || window.event;
      // Prevent browser default actions like text selection or touch gestures
      e.preventDefault();
      
      const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
      const clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
      
      pos3 = clientX;
      pos4 = clientY;
      startX = clientX;
      startY = clientY;
      hasMoved = false;
      
      document.onmouseup = closeDragElement;
      document.ontouchend = closeDragElement;
      document.onmousemove = elementDrag;
      document.ontouchmove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      
      const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
      const clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
      
      pos1 = pos3 - clientX;
      pos2 = pos4 - clientY;
      pos3 = clientX;
      pos4 = clientY;
      
      if (Math.abs(clientX - startX) > 5 || Math.abs(clientY - startY) > 5) {
        hasMoved = true;
      }
      
      const newTop = element.offsetTop - pos2;
      const newLeft = element.offsetLeft - pos1;
      
      // Boundaries check
      const boundX = window.innerWidth - element.offsetWidth - 10;
      const boundY = window.innerHeight - element.offsetHeight - 10;
      
      const finalLeft = Math.max(10, Math.min(newLeft, boundX));
      const finalTop = Math.max(10, Math.min(newTop, boundY));
      
      element.style.top = finalTop + "px";
      element.style.left = finalLeft + "px";
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.ontouchend = null;
      document.onmousemove = null;
      document.ontouchmove = null;
      
      saveSetting('panelTop', element.style.top);
      saveSetting('panelLeft', element.style.left);

      if (isMiniTrigger && !hasMoved) {
        // It was a click, not a drag! Restore/expand.
        element.classList.remove('collapsed');
        saveSetting('isCollapsed', false);
      }
    }
  }

  // 4. Latency Mitigation Engine
  function triggerHardSync() {
    if (!videoEl || !videoEl.buffered.length) return;
    
    isCooldown = true;
    const liveEdge = videoEl.buffered.end(videoEl.buffered.length - 1);
    
    // Jump closer to the target latency, but leave a safe margin
    const targetPosition = liveEdge - settings.targetLatency;
    
    console.log(`[Live Stream Sync] Performing hard seek from ${videoEl.currentTime.toFixed(2)} to ${targetPosition.toFixed(2)} (Live edge: ${liveEdge.toFixed(2)})`);
    
    videoEl.currentTime = Math.max(0, targetPosition);
    videoEl.playbackRate = 1.0;
    
    // Update indicator immediately
    if (panelEl) {
      const statusText = panelEl.querySelector('#vrt-sync-status-text');
      const statusDot = panelEl.querySelector('#vrt-sync-status-dot');
      if (statusText) statusText.textContent = 'Syncing...';
      if (statusDot) {
        statusDot.className = 'vrt-sync-status-dot matching';
      }
    }

    setTimeout(() => {
      isCooldown = false;
    }, COOL_DOWN_MS);
  }

  function monitorLiveStats() {
    if (!videoEl) return;

    // Check if the video element is still active or valid (isConnected handles Shadow DOM)
    if (!videoEl.isConnected) {
      videoEl = null;
      clearInterval(updateIntervalId);
      updateIntervalId = null;
      resetUI();
      return;
    }

    // Is it a live stream? Duration is Infinity for HLS/DASH livestreams, but can be NaN/null on VRT Max.
    // Live streams also use Unix/wall-clock timestamps (currentTime > 1,000,000,000) or are on livestream URLs.
    const isLive = settings.forceLive ||
                   videoEl.duration === Infinity || 
                   isNaN(videoEl.duration) || 
                   videoEl.currentTime > 1000000000 || 
                   location.pathname.includes('/livestream/') ||
                   location.pathname.includes('/live-tv');
    
    if (!isLive) {
      // Hide or show disabled status if it's VOD
      updateUIDisabled("Active on livestreams only");
      videoEl.playbackRate = 1.0;
      return;
    }

    if (!videoEl.buffered || videoEl.buffered.length === 0) {
      updateUIStatus("Buffering...", "lagging");
      return;
    }

    // Get live buffer boundary
    const liveEdge = videoEl.buffered.end(videoEl.buffered.length - 1);
    const latency = Math.max(0, liveEdge - videoEl.currentTime);
    
    // Calculate size of buffered forward window
    let forwardBuffer = 0;
    for (let i = 0; i < videoEl.buffered.length; i++) {
      if (videoEl.currentTime >= videoEl.buffered.start(i) && videoEl.currentTime <= videoEl.buffered.end(i)) {
        forwardBuffer = videoEl.buffered.end(i) - videoEl.currentTime;
        break;
      }
    }

    // Sync Logic
    if (!isCooldown && videoEl.paused === false) {
      if (settings.autoSync) {
        if (latency > HARD_SYNC_THRESHOLD) {
          // Stream is too far behind, force a direct seek
          triggerHardSync();
          return;
        } else if (latency > settings.targetLatency + 0.3) {
          // Stream is slightly behind target, speed up to catch up
          // 1.12x is ideal: fast enough to catch up, slow enough that audio pitch filter handles it smoothly
          videoEl.playbackRate = 1.12; 
        } else if (latency <= settings.targetLatency) {
          // Synced! Run normal speed
          videoEl.playbackRate = 1.0;
        }
      } else {
        // AutoSync is off, make sure we maintain normal speed
        if (videoEl.playbackRate !== 1.0) {
          videoEl.playbackRate = 1.0;
        }
      }
    }

    // Update UI Stats
    updateUI(latency, videoEl.playbackRate, forwardBuffer);
  }

  // 5. UI Updates
  function resetUI() {
    if (!panelEl) return;
    
    const latencyVal = panelEl.querySelector('#vrt-sync-latency-val');
    const speedVal = panelEl.querySelector('#vrt-sync-speed-val');
    const bufferVal = panelEl.querySelector('#vrt-sync-buffer-val');
    const statusText = panelEl.querySelector('#vrt-sync-status-text');
    const statusDot = panelEl.querySelector('#vrt-sync-status-dot');
    const miniIndicator = panelEl.querySelector('#vrt-sync-mini-indicator');

    if (latencyVal) latencyVal.textContent = '--.-s';
    if (speedVal) speedVal.textContent = '1.0x';
    if (bufferVal) bufferVal.textContent = 'Buf: 0.0s';
    if (statusText) statusText.textContent = 'Waiting for player...';
    if (statusDot) statusDot.className = 'vrt-sync-status-dot';
    if (miniIndicator) miniIndicator.style.background = '#9ca3af';
  }

  function updateUIDisabled(message) {
    resetUI();
    if (!panelEl) return;
    const statusText = panelEl.querySelector('#vrt-sync-status-text');
    if (statusText) statusText.textContent = message;
  }

  function updateUIStatus(text, statusClass) {
    if (!panelEl) return;
    const statusText = panelEl.querySelector('#vrt-sync-status-text');
    const statusDot = panelEl.querySelector('#vrt-sync-status-dot');
    if (statusText) statusText.textContent = text;
    if (statusDot) {
      statusDot.className = `vrt-sync-status-dot ${statusClass}`;
    }
  }

  function updateUI(latency, playbackRate, bufferSize) {
    if (!panelEl) return;
    
    const latencyVal = panelEl.querySelector('#vrt-sync-latency-val');
    const speedVal = panelEl.querySelector('#vrt-sync-speed-val');
    const bufferVal = panelEl.querySelector('#vrt-sync-buffer-val');
    const statusText = panelEl.querySelector('#vrt-sync-status-text');
    const statusDot = panelEl.querySelector('#vrt-sync-status-dot');
    const miniIndicator = panelEl.querySelector('#vrt-sync-mini-indicator');

    if (latencyVal) {
      latencyVal.textContent = latency.toFixed(1) + 's';
      if (latency <= settings.targetLatency + 0.3) {
        latencyVal.className = 'vrt-sync-stat-val synced';
      } else if (latency <= HARD_SYNC_THRESHOLD) {
        latencyVal.className = 'vrt-sync-stat-val lagging';
      } else {
        latencyVal.className = 'vrt-sync-stat-val delayed';
      }
    }

    if (speedVal) {
      speedVal.textContent = playbackRate.toFixed(2) + 'x';
    }

    if (bufferVal) {
      bufferVal.textContent = 'Buf: ' + bufferSize.toFixed(1) + 's';
    }

    // Status message and color
    if (statusText && statusDot) {
      if (videoEl.paused) {
        statusText.textContent = 'Paused';
        statusDot.className = 'vrt-sync-status-dot';
        if (miniIndicator) miniIndicator.style.background = '#9ca3af';
      } else if (isCooldown) {
        statusText.textContent = 'Stabilizing...';
        statusDot.className = 'vrt-sync-status-dot matching';
        if (miniIndicator) miniIndicator.style.background = '#ffcc00';
      } else if (latency <= settings.targetLatency + 0.3) {
        statusText.textContent = 'Realtime (Synced)';
        statusDot.className = 'vrt-sync-status-dot active';
        if (miniIndicator) miniIndicator.style.background = '#10b981';
      } else {
        statusText.textContent = settings.autoSync ? 'Catching up...' : 'Lagging';
        statusDot.className = 'vrt-sync-status-dot matching';
        if (miniIndicator) miniIndicator.style.background = '#ffcc00';
      }
    }
  }

  // 6. Player Detection loop with Shadow DOM traversal
  function findVideo(node = document.documentElement) {
    if (!node) return null;
    if (node.tagName === 'VIDEO') return node;
    
    // Check shadow root
    if (node.shadowRoot) {
      const found = findVideo(node.shadowRoot);
      if (found) return found;
    }
    
    // Check children
    let child = node.firstElementChild;
    while (child) {
      const found = findVideo(child);
      if (found) return found;
      child = child.nextElementSibling;
    }
    
    return null;
  }

  let lastScanResult = null;
  function scanForVideoPlayer() {
    const foundVideo = findVideo();
    const videoStateChanged = (foundVideo !== null) !== lastScanResult;
    
    if (videoStateChanged) {
      lastScanResult = foundVideo !== null;
      console.log('[Live Stream Sync] Video player detection status changed. Found video player:', lastScanResult);
    }
    
    const hasPanel = document.getElementById('vrt-sync-panel') !== null;
    if (foundVideo && (!hasPanel || foundVideo !== videoEl)) {
      console.log('[Live Stream Sync] Initializing on new video player tag:', foundVideo);
      videoEl = foundVideo;
      
      // Inject panel if needed
      if (createPanel()) {
        console.log('[Live Stream Sync] Panel injected.');
      }
      
      // Reset cooldown and UI
      isCooldown = false;
      resetUI();

      // One-time sync on first play / if already playing
      let initialSyncDone = false;
      const doInitialSync = () => {
        if (!initialSyncDone) {
          initialSyncDone = true;
          console.log('[Live Stream Sync] Performing initial sync to live edge...');
          setTimeout(() => {
            triggerHardSync();
          }, 1000);
        }
      };

      if (videoEl.readyState >= 2 && !videoEl.paused) {
        doInitialSync();
      } else {
        videoEl.addEventListener('playing', doInitialSync, { once: true });
      }

      // Begin update loop
      if (updateIntervalId) clearInterval(updateIntervalId);
      updateIntervalId = setInterval(monitorLiveStats, UPDATE_INTERVAL_MS);
    }
  }

  // Helper to keep the panel within visible viewport bounds
  function clampPanelPosition() {
    if (!panelEl) return;
    let leftVal = parseFloat(panelEl.style.left);
    let topVal = parseFloat(panelEl.style.top);
    if (isNaN(leftVal) || isNaN(topVal)) return;

    const panelWidth = panelEl.classList.contains('collapsed') ? 48 : 320;
    const panelHeight = panelEl.classList.contains('collapsed') ? 48 : (panelEl.offsetHeight || 334);

    const maxLeft = Math.max(10, window.innerWidth - panelWidth - 10);
    const maxTop = Math.max(10, window.innerHeight - panelHeight - 10);

    const finalLeft = Math.max(10, Math.min(leftVal, maxLeft));
    const finalTop = Math.max(10, Math.min(topVal, maxTop));

    panelEl.style.left = finalLeft + 'px';
    panelEl.style.top = finalTop + 'px';

    saveSetting('panelTop', panelEl.style.top);
    saveSetting('panelLeft', panelEl.style.left);
  }

  // Handle Fullscreen transitions to keep the panel visible
  document.addEventListener('fullscreenchange', () => {
    console.log('[Live Stream Sync] fullscreenchange event triggered. fullscreenElement:', document.fullscreenElement);
    if (document.fullscreenElement) {
      if (panelEl && !document.fullscreenElement.contains(panelEl)) {
        try {
          console.log('[Live Stream Sync] Appending panel to fullscreen element');
          document.fullscreenElement.appendChild(panelEl);
        } catch (e) {
          console.warn('[Live Stream Sync] Failed to append panel to fullscreen element:', e);
        }
      }
    } else {
      if (panelEl && panelEl.parentElement !== document.body) {
        console.log('[Live Stream Sync] Exited fullscreen. Returning panel to document.body');
        document.body.appendChild(panelEl);
      }
      setTimeout(clampPanelPosition, 100);
    }
  });

  // Clamp position on window resize to prevent panel from going off-screen
  window.addEventListener('resize', clampPanelPosition);

  // Initial setup
  loadSettings();
  
  // Run scan periodically to support SPA page transitions
  setInterval(scanForVideoPlayer, SCAN_INTERVAL_MS);
  
  // Run once immediately
  setTimeout(scanForVideoPlayer, 1000);

})();
