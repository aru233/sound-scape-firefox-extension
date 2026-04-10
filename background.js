// background.js — MV2 persistent background page
// Hosts the AudioContext and all sound graph management.
// Content scripts do page analysis only; popup talks directly to us.

(function () {
  'use strict';

  const FADE = 0.8;

  let ctx = null;
  let current = null;   // { category, handle }
  let isPlaying = false;
  let volume = 0.6;
  let intensity = 0.7;
  let manualCategory = null;
  let activeTabId = null;

  // Detected category per tab (tabId → category string)
  const tabCategories = new Map();

  // ── AudioContext ──────────────────────────────────────────
  function getCtx() {
    if (!ctx) {
      ctx = new AudioContext();
      // Resume immediately — background page is a privileged extension
      // context, exempt from web autoplay policy.
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    }
    return ctx;
  }

  // ── Audio helpers ─────────────────────────────────────────
  function buildHandle(category) {
    const ac = getCtx();
    const recipe = window.__soundscape_recipes[category];
    if (!recipe) return null;
    try {
      const handle = recipe(ac, intensity);
      handle.master.gain.setValueAtTime(0, ac.currentTime);
      return handle;
    } catch (e) {
      return null;
    }
  }

  function fadeIn(gainNode, target, duration = FADE) {
    const ac = getCtx();
    gainNode.gain.cancelScheduledValues(ac.currentTime);
    gainNode.gain.setValueAtTime(0.001, ac.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(target, 0.001), ac.currentTime + duration);
  }

  function fadeOut(gainNode, cb) {
    const ac = getCtx();
    gainNode.gain.cancelScheduledValues(ac.currentTime);
    gainNode.gain.setValueAtTime(Math.max(gainNode.gain.value, 0.001), ac.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + FADE);
    setTimeout(cb, FADE * 1000 + 50);
  }

  function switchTo(category) {
    if (current?.category === category) return;
    const handle = buildHandle(category);
    if (!handle) return;

    if (current) {
      const old = current;
      fadeOut(old.handle.master, () => { try { old.handle.stop(); } catch (e) {} });
    }

    current = { category, handle };
    fadeIn(handle.master, volume, 0.5);

    // Notify popup of category change (if open)
    browser.runtime.sendMessage({ type: 'CATEGORY_CHANGED', category }).catch(() => {});
  }

  function start(category) {
    const cat = category || 'calm';
    if (isPlaying) {
      if (current?.category !== cat) switchTo(cat);
      return;
    }
    isPlaying = true;
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    switchTo(cat);
    browser.storage.local.set({ isPlaying: true });
  }

  function stop() {
    if (!isPlaying) return;
    isPlaying = false;
    if (current) {
      const old = current;
      fadeOut(old.handle.master, () => { try { old.handle.stop(); } catch (e) {} });
      current = null;
    }
    browser.storage.local.set({ isPlaying: false });
  }

  // ── Restore persisted settings on startup ─────────────────
  // Default isPlaying=true so audio starts automatically on fresh install.
  browser.storage.local.get(['volume', 'intensity', 'isPlaying']).then(saved => {
    if (saved.volume    != null) volume    = saved.volume;
    if (saved.intensity != null) intensity = saved.intensity;
    // Treat missing key (first install) as true → auto-start.
    isPlaying = saved.isPlaying !== false;
  }).catch(() => {});

  // ── Track the active tab ──────────────────────────────────
  browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    if (tabs[0]) activeTabId = tabs[0].id;
  }).catch(() => {});

  browser.tabs.onActivated.addListener(({ tabId }) => {
    activeTabId = tabId;
    if (!isPlaying) return;
    const cat = manualCategory || tabCategories.get(tabId) || 'calm';
    switchTo(cat);
  });

  browser.tabs.onRemoved.addListener(tabId => {
    tabCategories.delete(tabId);
  });

  // ── Message handler ───────────────────────────────────────
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {

      case 'PAGE_ANALYZED': {
        const tabId = sender.tab?.id;
        if (tabId != null) {
          const prev = tabCategories.get(tabId);
          tabCategories.set(tabId, msg.category);
          if (tabId === activeTabId) {
            // Skip redundant switch: full analysis (fast=false) confirming same
            // category as the URL phase (fast=true) — audio is already correct.
            if (msg.fast === false && prev === msg.category) { sendResponse({ ok: true }); break; }
            if (isPlaying) {
              if (!manualCategory) switchTo(msg.category);
            } else {
              // Auto-start: plays immediately on every new page load
              start(manualCategory || msg.category);
            }
          }
        }
        sendResponse({ ok: true });
        break;
      }

      case 'GET_STATE': {
        const detected = tabCategories.get(activeTabId) || current?.category || 'calm';
        sendResponse({
          isPlaying,
          volume,
          intensity,
          category:         current?.category || detected,
          detectedCategory: detected,
          manualCategory,
        });
        break;
      }

      case 'PLAY': {
        const cat = manualCategory || tabCategories.get(activeTabId) || 'calm';
        start(cat);
        sendResponse({ ok: true });
        break;
      }

      case 'STOP': {
        stop();
        sendResponse({ ok: true });
        break;
      }

      case 'TOGGLE_PLAY': {
        if (isPlaying) stop();
        else {
          const cat = manualCategory || tabCategories.get(activeTabId) || 'calm';
          start(cat);
        }
        sendResponse({ ok: true });
        break;
      }

      case 'SET_VOLUME': {
        volume = msg.value;
        if (current && isPlaying) {
          const ac = getCtx();
          current.handle.master.gain.cancelScheduledValues(ac.currentTime);
          current.handle.master.gain.linearRampToValueAtTime(volume, ac.currentTime + 0.1);
        }
        browser.storage.local.set({ volume });
        sendResponse({ ok: true });
        break;
      }

      case 'SET_INTENSITY': {
        intensity = msg.value;
        if (isPlaying && current?.handle?.setIntensity) current.handle.setIntensity(intensity);
        browser.storage.local.set({ intensity });
        sendResponse({ ok: true });
        break;
      }

      case 'SET_CATEGORY': {
        manualCategory = msg.category || null;
        const cat = manualCategory || tabCategories.get(activeTabId) || 'calm';
        if (isPlaying) switchTo(cat);
        else start(cat);
        sendResponse({ ok: true });
        break;
      }

      case 'GET_WAVEFORM': {
        if (!current?.handle?.analyser) { sendResponse({ data: null }); break; }
        const a = current.handle.analyser;
        const d = new Uint8Array(a.frequencyBinCount);
        a.getByteTimeDomainData(d);
        sendResponse({ data: Array.from(d) });
        break;
      }
    }
    return true; // keep channel open for async sendResponse
  });

  // ── Keyboard shortcut ─────────────────────────────────────
  browser.commands.onCommand.addListener(command => {
    if (command === 'toggle-play') {
      if (isPlaying) stop();
      else {
        const cat = manualCategory || tabCategories.get(activeTabId) || 'calm';
        start(cat);
      }
    }
  });

})();
