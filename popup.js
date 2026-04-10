// popup.js

(async function () {
  'use strict';

  const THEME = {
    nature:   { color: '#4ade80', bg: '#052e16', icon: '🌿', label: 'Nature',   sub: 'Wind, leaves & birdsong' },
    tech:     { color: '#818cf8', bg: '#1e1b4b', icon: '⚡', label: 'Tech',     sub: 'Server hum & data blips' },
    space:    { color: '#c084fc', bg: '#2e1065', icon: '🌌', label: 'Space',    sub: 'Cosmic drones & pings' },
    news:     { color: '#f87171', bg: '#450a0a', icon: '📡', label: 'News',     sub: 'Tension & urgency' },
    commerce: { color: '#fbbf24', bg: '#451a03', icon: '🛍️', label: 'Commerce', sub: 'Soft muzak & dings' },
    calm:     { color: '#67e8f9', bg: '#083344', icon: '☁️', label: 'Calm',     sub: 'Breathing tones & warmth' },
    focus:    { color: '#a78bfa', bg: '#2e1065', icon: '🎯', label: 'Focus',    sub: 'Binaural beats & silence' },
    rain:     { color: '#93c5fd', bg: '#1e3a5f', icon: '🌧️', label: 'Rain',     sub: 'Rainfall & distant thunder' },
    cafe:     { color: '#d4a96a', bg: '#2a1a00', icon: '☕', label: 'Cafe',     sub: 'Lo-fi warmth & chatter' },
  };

  // DOM
  const canvas      = document.getElementById('vis');
  const c           = canvas.getContext('2d');
  const dot         = document.getElementById('dot');
  const npIcon      = document.getElementById('npIcon');
  const npName      = document.getElementById('npName');
  const npSub       = document.getElementById('npSub');
  const playBtn     = document.getElementById('playBtn');
  const volSlider   = document.getElementById('vol');
  const intSlider   = document.getElementById('intensity');
  const volVal      = document.getElementById('volVal');
  const intVal      = document.getElementById('intVal');
  const catBtns     = document.querySelectorAll('.cat-btn');
  const unavailable = document.getElementById('unavailable');

  let isPlaying = false;
  let rafId = null;
  let rafRunning = false;

  // ── Canvas setup ──────────────────────────────────────────
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvas.offsetWidth  * dpr;
    canvas.height = canvas.offsetHeight * dpr;
  }
  resizeCanvas();

  // ── Send message to background page ──────────────────────
  async function send(msg) {
    try {
      return await browser.runtime.sendMessage(msg);
    } catch (e) { return null; }
  }

  // ── Apply theme ───────────────────────────────────────────
  function applyTheme(category, isAuto, detectedCat) {
    const t = THEME[category] || THEME.calm;
    document.documentElement.style.setProperty('--accent',    t.color);
    document.documentElement.style.setProperty('--accent-bg', t.bg);
    npIcon.textContent = t.icon;
    npName.textContent = t.label;
    npName.style.color = t.color;

    let sub = isAuto && detectedCat ? `Auto-detected · ${t.sub}` : (isAuto ? t.sub : `Manual · ${t.sub}`);
    if (category === 'focus') sub += ' · 🎧 Use headphones';
    npSub.textContent = sub;
  }

  // ── Waveform ──────────────────────────────────────────────
  function drawWave(data) {
    const w = canvas.width, h = canvas.height;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#0f0f2e';
    c.fillRect(0, 0, w, h);

    if (!data || !isPlaying) {
      c.beginPath();
      c.strokeStyle = accent + '44';
      c.lineWidth = 1.5;
      c.moveTo(0, h / 2); c.lineTo(w, h / 2);
      c.stroke();
      return;
    }

    const sw = w / data.length;

    // Glow layer
    c.beginPath();
    c.strokeStyle = accent + '44';
    c.lineWidth = 5;
    c.lineJoin = 'round';
    data.forEach((v, i) => {
      const y = (v / 128) * (h / 2);
      i === 0 ? c.moveTo(0, y) : c.lineTo(i * sw, y);
    });
    c.stroke();

    // Main line
    c.beginPath();
    c.strokeStyle = accent;
    c.lineWidth = 2;
    c.lineJoin = 'round';
    data.forEach((v, i) => {
      const y = (v / 128) * (h / 2);
      i === 0 ? c.moveTo(0, y) : c.lineTo(i * sw, y);
    });
    c.stroke();
  }

  // rAF-based waveform loop — throttled to ~20fps via timestamp gating
  function startPoll() {
    if (rafRunning) return;
    rafRunning = true;
    let lastTime = 0;

    async function loop(ts) {
      if (!rafRunning) return;
      if (ts - lastTime >= 50) {
        lastTime = ts;
        if (!isPlaying) {
          drawWave(null);
        } else {
          const res = await send({ type: 'GET_WAVEFORM' });
          drawWave(res?.data || null);
        }
      }
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
  }

  function stopPoll() {
    rafRunning = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    drawWave(null);
  }

  // ── Sync entire UI from state ─────────────────────────────
  function syncUI(state) {
    isPlaying = state.isPlaying;
    const cat = state.manualCategory || state.detectedCategory || 'calm';
    applyTheme(cat, !state.manualCategory, state.detectedCategory);

    playBtn.textContent = isPlaying ? '⏸' : '▶';
    playBtn.classList.toggle('on', isPlaying);
    dot.classList.toggle('on', isPlaying);

    volSlider.value = Math.round((state.volume    || 0.6) * 100);
    intSlider.value = Math.round((state.intensity || 0.7) * 100);
    volVal.textContent = volSlider.value + '%';
    intVal.textContent = intSlider.value + '%';

    const activeSel = state.manualCategory || 'auto';
    catBtns.forEach(b => b.classList.toggle('active', b.dataset.cat === activeSel));

    isPlaying ? startPoll() : stopPoll();
  }

  // ── Persist volume/intensity across sessions ──────────────
  async function loadSavedSettings() {
    try {
      const saved = await browser.storage.local.get(['volume', 'intensity']);
      if (saved.volume   != null) volSlider.value = Math.round(saved.volume    * 100);
      if (saved.intensity != null) intSlider.value = Math.round(saved.intensity * 100);
      volVal.textContent = volSlider.value + '%';
      intVal.textContent = intSlider.value + '%';
    } catch (e) {}
  }

  // ── Init ──────────────────────────────────────────────────
  drawWave(null);
  await loadSavedSettings();
  const state = await send({ type: 'GET_STATE' });

  if (state) {
    syncUI(state);
  } else {
    unavailable.style.display = 'flex';
    applyTheme('calm', true, null);
  }

  // ── Play/Pause ────────────────────────────────────────────
  playBtn.addEventListener('click', async () => {
    const res = await send({ type: isPlaying ? 'STOP' : 'PLAY' });
    if (!res?.ok) return;
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? '⏸' : '▶';
    playBtn.classList.toggle('on', isPlaying);
    dot.classList.toggle('on', isPlaying);
    isPlaying ? startPoll() : stopPoll();
  });

  // ── Volume ────────────────────────────────────────────────
  volSlider.addEventListener('input', async () => {
    volVal.textContent = volSlider.value + '%';
    await send({ type: 'SET_VOLUME', value: volSlider.value / 100 });
  });

  // ── Intensity ─────────────────────────────────────────────
  intSlider.addEventListener('input', async () => {
    intVal.textContent = intSlider.value + '%';
    await send({ type: 'SET_INTENSITY', value: intSlider.value / 100 });
  });

  // ── Category buttons ──────────────────────────────────────
  catBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      catBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const manual = btn.dataset.cat === 'auto' ? null : btn.dataset.cat;
      await send({ type: 'SET_CATEGORY', category: manual });
      const fresh = await send({ type: 'GET_STATE' });
      if (fresh) syncUI(fresh);
    });
  });

  // ── Category change pushed from background ────────────────
  browser.runtime.onMessage.addListener(msg => {
    if (msg.type === 'CATEGORY_CHANGED') applyTheme(msg.category, true, msg.category);
  });

})();
