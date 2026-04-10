// content.js — analysis-only content script
// Phase 1 (runs immediately at document_start): URL-pattern analysis → instant category
// Phase 2 (runs at DOMContentLoaded): full DOM analysis → accurate category
// All audio lives in background.js.

(function () {
  'use strict';

  function send(category, fast) {
    browser.runtime.sendMessage({ type: 'PAGE_ANALYZED', category, fast }).catch(() => {});
  }

  // ── Phase 1: URL analysis — runs before any DOM exists ───────────────────
  // __soundscape_analyze_url only reads location.hostname + pathname, so it's
  // safe at document_start when document.body is still null.
  try {
    const r = window.__soundscape_analyze_url();
    send(r.category, true);
  } catch (e) {}

  // ── Phase 2: full DOM analysis — runs after DOMContentLoaded ────────────
  function runFullAnalysis() {
    try {
      const r = window.__soundscape_analyze();
      send(r.category, false);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runFullAnalysis);
  } else {
    runFullAnalysis();
  }

  // ── SPA navigation ────────────────────────────────────────────────────────
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Immediate URL pass
      try { send(window.__soundscape_analyze_url().category, true); } catch (e) {}
      // Full analysis after new page content settles
      setTimeout(runFullAnalysis, 400);
    }
  }).observe(document, { subtree: true, childList: true });

})();
