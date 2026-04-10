# SoundScape 🎵

> Procedural ambient audio for every webpage. Your browsing, scored.

SoundScape is a Firefox extension that listens to where you are on the web and plays a matching ambient soundscape — automatically. Open GitHub and hear a server room hum. Switch to a news site and feel the tension build. Land on a weather page and it starts to rain.

Everything is synthesized in real time using the Web Audio API. No samples, no streaming, no accounts — just sound that fits the moment.

---

## Features

- **Zero-click autoplay** — music starts the moment you open a tab, no interaction needed
- **Auto-detection** — classifies each page using URL patterns, meta tags, headings, and body text
- **Two-phase detection** — URL matching fires instantly at page load; full DOM analysis refines the result once the page is ready
- **Seamless tab switching** — audio crossfades when you move between tabs, matching the new page's category
- **SPA-aware** — detects client-side navigation and re-analyzes without a full page reload
- **Fully procedural** — every soundscape is built from oscillators, noise generators, filters, LFOs, and convolution reverb. Nothing is downloaded or streamed
- **Persistent across sessions** — volume, intensity, and play state are remembered between browser restarts

---

## Soundscapes

| | Category | What you hear |
|--|----------|--------------|
| 🌿 | **Nature** | Three-band wind (low rumble · mid breath · high whistle), cricket texture, three bird types (warbler · finch · thrush) |
| ⚡ | **Tech** | Harmonic server hum (4 overtones), cooling fan noise, electric hiss, data blips, process-completion tones |
| 🌌 | **Space** | Detuned drone cluster for beating effect, long reverb tail, ethereal sweep, upper shimmer, cosmic pings, deep pulsar thuds |
| 📡 | **News** | Pulsing tension drone + fifth, low room noise, sawtooth pad with filter sweep, staccato accent tones |
| ☁️ | **Calm** | C-major harmonic series (5 partials), slow breathing LFO, FM-synthesis singing bowls with 3 Hz shimmer |
| 🛍️ | **Commerce** | Cmaj7 chord pad, soft bass, ambient air, register dings, soft chime melody |
| 🎯 | **Focus** | True binaural alpha beats (200 Hz L / 210 Hz R = 10 Hz), 40 Hz gamma undertone, pink noise floor with breathing rhythm |
| 🌧️ | **Rain** | Four noise layers (heavy body · fine mist · surface splash · ground rumble), droplet impacts, distant thunder |
| ☕ | **Cafe** | Am9 jazz chord (5 voices + bass), vinyl crackle, record spin rumble, warm room hum, keyboard taps, mug clinks |

---

## How detection works

Detection runs in two phases so audio starts as fast as possible:

**Phase 1 — instant** (fires before the DOM exists)
Matches the page URL against ~100 hostname patterns. If `github.com` → Tech. If `bbc.com` → News. Latency: < 50 ms.

**Phase 2 — accurate** (fires after `DOMContentLoaded`)
Scores the full page text, meta tags, headings, and DOM structure against a keyword dictionary for each category. Headings and the page title are weighted double. DOM heuristics add bonus points (e.g. `<pre>`/`<code>` blocks → Tech, `[contenteditable]` fields → Focus).

The highest-scoring category wins. If Phase 2 agrees with Phase 1, no crossfade is triggered — the audio just keeps playing.

---

## Architecture

The `AudioContext` lives in the **persistent background page** (`manifest_version: 2`, `persistent: true`), not in content scripts. This is the key design decision:

- Content scripts run in web page context and are subject to Firefox's per-page autoplay policy — `AudioContext.resume()` requires a user gesture on each new origin
- Background pages are privileged extension contexts, permanently exempt from autoplay restrictions
- Result: audio plays automatically on every page load, with no clicks required, ever

```
┌─────────────────────────────────────────┐
│           Background Page               │
│  AudioContext · sound graph · tab map   │
│  Listens: PAGE_ANALYZED, PLAY, STOP…    │
└───────────┬────────────────┬────────────┘
            │                │
     sends PAGE_ANALYZED   GET_STATE / PLAY / STOP
            │                │
┌───────────▼──────┐  ┌──────▼────────────┐
│  Content Script  │  │      Popup        │
│  (analysis only) │  │  (UI / controls)  │
└──────────────────┘  └───────────────────┘
```

---

## Installation

### Temporary (development)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from this directory

The extension reloads automatically — no browser restart needed.

### Permanent

Submit to [addons.mozilla.org](https://addons.mozilla.org) or install a signed `.xpi` via `about:addons`.

---

## Controls

| Control | Description |
|---------|-------------|
| **▶ / ⏸** | Play or pause the current soundscape |
| **Volume** | Overall output level |
| **Intensity** | How prominent the dynamic, rhythmic elements are (bursts, blips, dings) |
| **Auto-detect** | Let the extension choose the soundscape based on page content |
| **Category buttons** | Lock to a specific soundscape regardless of the page |
| `Alt+S` | Toggle play/pause from anywhere without opening the popup |

---

## File structure

```
manifest.json          MV2 manifest — persistent background, content script injection
background.js          AudioContext host, crossfade engine, tab category tracking
content-analysis.js    Page classifier — URL patterns, keyword scoring, DOM heuristics
content.js             Content script — two-phase analysis, sends PAGE_ANALYZED to background
sound-recipes.js       Web Audio node graph builders, one function per soundscape category
popup.html             Extension popup markup
popup.js               Popup logic — communicates with background via runtime.sendMessage
popup.css              Popup styles
_locales/en/           i18n strings
images/                SVG extension icons (48px, 96px)
```

---

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Persists volume, intensity, and play state across sessions |
| `activeTab` | Tracks which tab is currently active for soundscape switching |
| `<all_urls>` | Injects the content script on every page for category detection |

---

## Tech notes

- **Noise generation**: white, pink (Voss–McCartney algorithm), and brown noise buffers, 2 s each, looped
- **Reverb**: synthetic convolution impulse response with running-multiply envelope (avoids `Math.pow` in the sample loop)
- **Binaural beats**: true stereo routing via `ChannelMergerNode` — left and right channels carry different carrier frequencies
- **Crossfades**: `exponentialRampToValueAtTime` over 0.8 s for natural fade-in/out
- **Waveform visualizer**: `AnalyserNode` → `getByteTimeDomainData` → canvas, polled at ~20 fps via `requestAnimationFrame` with 50 ms timestamp gating

---

## License

