// sound-recipes.js
// Web Audio API node graph builders — one per soundscape category.
// Each returns: { master: GainNode, analyser: AnalyserNode, setIntensity(v), stop() }

window.__soundscape_recipes = {};

// ── Noise generators ────────────────────────────────────────────────────────

function makeNoise(ctx, type) {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  } else if (type === 'pink') {
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < bufferSize; i++) {
      const w = Math.random() * 2 - 1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
      b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
      b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      data[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (type === 'brown') {
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const w = Math.random() * 2 - 1;
      data[i] = (last + 0.02 * w) / 1.02;
      last = data[i];
      data[i] *= 3.5;
    }
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

function makeLFO(ctx, rate, depth, type = 'sine') {
  const lfo = ctx.createOscillator();
  const gain = ctx.createGain();
  lfo.type = type;
  lfo.frequency.value = rate;
  gain.gain.value = depth;
  lfo.connect(gain);
  lfo.start();
  return gain;
}

// Generates a convolution reverb from a synthetic impulse response.
function makeReverb(ctx, duration = 2.5, decay = 2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  const decayPerSample = Math.exp(-decay * 3 / length);
  for (let c = 0; c < 2; c++) {
    const ch = impulse.getChannelData(c);
    let env = 1;
    for (let i = 0; i < length; i++) {
      ch[i] = (Math.random() * 2 - 1) * env;
      env *= decayPerSample;
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

// Stereo panner with a slow LFO for subtle spatial movement
function makePanner(ctx) {
  const panner = ctx.createStereoPanner();
  const lfo = makeLFO(ctx, 0.04, 0.3);
  lfo.connect(panner.pan);
  return panner;
}

function scheduleRandomBursts(ctx, dest, opts) {
  const { minFreq, maxFreq, minInt, maxInt, vol, wave, attack, release } = opts;
  let stopped = false;
  let tid = null;

  function fire() {
    if (stopped) return;
    const freq = minFreq + Math.random() * (maxFreq - minFreq);
    const delay = (minInt + Math.random() * (maxInt - minInt)) * 1000;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave || 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, ctx.currentTime);
    env.gain.linearRampToValueAtTime(vol, ctx.currentTime + attack);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + attack + release);
    osc.connect(env);
    env.connect(dest);
    osc.start();
    osc.stop(ctx.currentTime + attack + release + 0.05);
    tid = setTimeout(fire, delay);
  }

  fire();
  return { stop() { stopped = true; if (tid) clearTimeout(tid); } };
}

// ── NATURE ──────────────────────────────────────────────────────────────────
// Three-band wind (low rumble + mid breath + high whistle), earth hum,
// cricket texture, and three distinct bird types.

window.__soundscape_recipes.nature = function(ctx, intensity) {
  const master = ctx.createGain();
  const panner = makePanner(ctx);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  master.connect(panner); panner.connect(analyser); analyser.connect(ctx.destination);
  const nodes = [], bursters = [], intensityGains = [];

  // Wind — low rumble (brown noise, sub-200 Hz)
  const windLow = makeNoise(ctx, 'brown');
  const wlf = ctx.createBiquadFilter(); wlf.type = 'lowpass'; wlf.frequency.value = 280;
  const wlLFO = makeLFO(ctx, 0.05, 90); wlLFO.connect(wlf.frequency);
  const wlg = ctx.createGain(); wlg.gain.value = 0.18;
  windLow.connect(wlf); wlf.connect(wlg); wlg.connect(master); windLow.start(); nodes.push(windLow);

  // Wind — mid breath (pink noise, 400-1200 Hz bandpass, slow LFO)
  const windMid = makeNoise(ctx, 'pink');
  const wmf = ctx.createBiquadFilter(); wmf.type = 'bandpass'; wmf.frequency.value = 700; wmf.Q.value = 0.9;
  const wmLFO = makeLFO(ctx, 0.09, 220); wmLFO.connect(wmf.frequency);
  const wmg = ctx.createGain(); wmg.gain.value = 0.10 * intensity;
  windMid.connect(wmf); wmf.connect(wmg); wmg.connect(master); windMid.start(); nodes.push(windMid);
  intensityGains.push({ node: wmg, base: 0.10 });

  // Wind — high whistle (white noise, narrow bandpass around 2.8kHz)
  const windHigh = makeNoise(ctx, 'white');
  const whf = ctx.createBiquadFilter(); whf.type = 'bandpass'; whf.frequency.value = 2800; whf.Q.value = 4;
  const whLFO = makeLFO(ctx, 0.13, 700); whLFO.connect(whf.frequency);
  const whg = ctx.createGain(); whg.gain.value = 0.025;
  windHigh.connect(whf); whf.connect(whg); whg.connect(master); windHigh.start(); nodes.push(windHigh);

  // Earth hum — deep fundamental
  const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 82;
  const hg = ctx.createGain(); hg.gain.value = 0.025;
  hum.connect(hg); hg.connect(master); hum.start(); nodes.push(hum);

  // Crickets — narrow bandpass pink noise around 5.5 kHz with 1.8 Hz AM
  const cricket = makeNoise(ctx, 'pink');
  const crf = ctx.createBiquadFilter(); crf.type = 'bandpass'; crf.frequency.value = 5500; crf.Q.value = 6;
  const crAM = ctx.createGain(); crAM.gain.value = 0.02;
  const crLFO = makeLFO(ctx, 1.8, 0.018); crLFO.connect(crAM.gain);
  cricket.connect(crf); crf.connect(crAM); crAM.connect(master); cricket.start(); nodes.push(cricket);

  // Birds — high melodic (warbler-like, 2.4–4.5 kHz, short trills)
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 2400, maxFreq: 4500, minInt: 3, maxInt: 9,
    vol: 0.05 * intensity, wave: 'sine', attack: 0.04, release: 0.3,
  }));
  // Birds — mid chirps (finch-like, 1.2–2.2 kHz, quick)
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 1200, maxFreq: 2200, minInt: 7, maxInt: 16,
    vol: 0.038 * intensity, wave: 'triangle', attack: 0.02, release: 0.18,
  }));
  // Birds — deep calls (thrush-like, 550–850 Hz, slower & longer)
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 550, maxFreq: 850, minInt: 18, maxInt: 40,
    vol: 0.028 * intensity, wave: 'sine', attack: 0.12, release: 0.9,
  }));

  return {
    master, analyser,
    setIntensity(v) { intensityGains.forEach(({ node, base }) => node.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.2)); },
    stop() { nodes.forEach(n => { try { n.stop(); } catch(e){} }); bursters.forEach(b => b.stop()); master.disconnect(); },
  };
};

// ── TECH ────────────────────────────────────────────────────────────────────
// Server room: harmonic hum (fundamental + 3 overtones), cooling fan noise,
// electric hiss, beating oscillators, and data-blip bursts.

window.__soundscape_recipes.tech = function(ctx, intensity) {
  const master = ctx.createGain();
  const panner = makePanner(ctx);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  master.connect(panner); panner.connect(analyser); analyser.connect(ctx.destination);
  const nodes = [], bursters = [], intensityGains = [];

  // Server hum — fundamental + harmonics for richer mechanical feel
  [[55, 0.10], [110, 0.05], [165, 0.025], [220, 0.012]].forEach(([freq, amp]) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq * 3;
    const g = ctx.createGain(); g.gain.value = amp;
    o.connect(f); f.connect(g); g.connect(master); o.start(); nodes.push(o);
  });

  // Cooling fan — bandpass white noise 1.8–3.5 kHz with slow amplitude wobble
  const fan = makeNoise(ctx, 'white');
  const fanF = ctx.createBiquadFilter(); fanF.type = 'bandpass'; fanF.frequency.value = 2400; fanF.Q.value = 1.2;
  const fanG = ctx.createGain(); fanG.gain.value = 0.04;
  const fanLFO = makeLFO(ctx, 0.11, 0.012); fanLFO.connect(fanG.gain);
  fan.connect(fanF); fanF.connect(fanG); fanG.connect(master); fan.start(); nodes.push(fan);

  // High-frequency electric hiss
  const hiss = makeNoise(ctx, 'white');
  const hissF = ctx.createBiquadFilter(); hissF.type = 'highpass'; hissF.frequency.value = 7500;
  const hissG = ctx.createGain(); hissG.gain.value = 0.022;
  hiss.connect(hissF); hissF.connect(hissG); hissG.connect(master); hiss.start(); nodes.push(hiss);

  // Beating oscillators — subtle electronic shimmer
  [440, 443].forEach(freq => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0.028;
    o.connect(g); g.connect(master); o.start(); nodes.push(o);
  });

  // Data blips — square-wave bursts through intensity gain
  const blipGain = ctx.createGain(); blipGain.gain.value = intensity; blipGain.connect(master);
  intensityGains.push({ node: blipGain, base: 1 });
  // Fast blips
  bursters.push(scheduleRandomBursts(ctx, blipGain, {
    minFreq: 700, maxFreq: 1400, minInt: 0.3, maxInt: 2,
    vol: 0.045, wave: 'square', attack: 0.008, release: 0.06,
  }));
  // Occasional longer tones (process completion feel)
  bursters.push(scheduleRandomBursts(ctx, blipGain, {
    minFreq: 880, maxFreq: 1760, minInt: 5, maxInt: 15,
    vol: 0.03, wave: 'sine', attack: 0.02, release: 0.3,
  }));

  return {
    master, analyser,
    setIntensity(v) { intensityGains.forEach(({ node, base }) => node.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.2)); },
    stop() { nodes.forEach(n => { try { n.stop(); } catch(e){} }); bursters.forEach(b => b.stop()); master.disconnect(); },
  };
};

// ── SPACE ────────────────────────────────────────────────────────────────────
// Detuned drone cluster, wide reverb, ethereal sweep, cosmic noise,
// and slow cosmic pings.

window.__soundscape_recipes.space = function(ctx, intensity) {
  const master = ctx.createGain();
  const reverb = makeReverb(ctx, 5, 1.2);
  const dryGain = ctx.createGain(); dryGain.gain.value = 0.55;
  const wetGain = ctx.createGain(); wetGain.gain.value = 0.5;
  const mix = ctx.createGain();
  master.connect(dryGain); dryGain.connect(mix);
  master.connect(reverb); reverb.connect(wetGain); wetGain.connect(mix);
  const panner = makePanner(ctx);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  mix.connect(panner); panner.connect(analyser); analyser.connect(ctx.destination);
  const nodes = [], bursters = [], intensityGains = [];

  // Detuned drone cluster — three sines closely spaced for beating / depth
  [[55, 0.14], [57.5, 0.08], [60, 0.05]].forEach(([freq, amp]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(amp, ctx.currentTime + 10);
    o.connect(g); g.connect(master); o.start(); nodes.push(o);
  });

  // Slow frequency-modulated sweep for ethereal character
  const sweep = ctx.createOscillator(); sweep.type = 'sine'; sweep.frequency.value = 920;
  const sLFO = makeLFO(ctx, 0.015, 320); sLFO.connect(sweep.frequency);
  const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1400;
  const sg = ctx.createGain(); sg.gain.value = 0.045 * intensity;
  sweep.connect(sf); sf.connect(sg); sg.connect(master); sweep.start(); nodes.push(sweep);
  intensityGains.push({ node: sg, base: 0.045 });

  // Cosmic background — bandpass pink noise, very wide
  const cosmic = makeNoise(ctx, 'pink');
  const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 120; cf.Q.value = 0.3;
  const cg = ctx.createGain(); cg.gain.value = 0.1;
  cosmic.connect(cf); cf.connect(cg); cg.connect(master); cosmic.start(); nodes.push(cosmic);

  // Upper harmonic shimmer
  const shimmer = makeNoise(ctx, 'white');
  const shf = ctx.createBiquadFilter(); shf.type = 'bandpass'; shf.frequency.value = 6000; shf.Q.value = 8;
  const shg = ctx.createGain(); shg.gain.value = 0.015;
  shimmer.connect(shf); shf.connect(shg); shg.connect(master); shimmer.start(); nodes.push(shimmer);

  // Distant cosmic pings
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 600, maxFreq: 1800, minInt: 10, maxInt: 28,
    vol: 0.06 * intensity, wave: 'triangle', attack: 0.15, release: 3.5,
  }));
  // Deep pulsar thud
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 40, maxFreq: 80, minInt: 20, maxInt: 50,
    vol: 0.09 * intensity, wave: 'sine', attack: 0.3, release: 2.0,
  }));

  return {
    master, analyser,
    setIntensity(v) { intensityGains.forEach(({ node, base }) => node.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.2)); },
    stop() { nodes.forEach(n => { try { n.stop(); } catch(e){} }); bursters.forEach(b => b.stop()); master.disconnect(); },
  };
};

// ── NEWS ─────────────────────────────────────────────────────────────────────
// Urgent tension: pulsing drone, room tone, sawtooth pad with filter sweep,
// staccato accent bursts, and rhythmic tick for urgency.

window.__soundscape_recipes.news = function(ctx, intensity) {
  const master = ctx.createGain();
  const panner = makePanner(ctx);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  master.connect(panner); panner.connect(analyser); analyser.connect(ctx.destination);
  const nodes = [], bursters = [], intensityGains = [];

  // Pulsing tension drone — fundamental + 5th
  [[130, 0.09], [195, 0.035]].forEach(([freq, amp]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const pulseLFO = makeLFO(ctx, 0.25, 0.06, 'square');
    const g = ctx.createGain(); g.gain.value = amp;
    pulseLFO.connect(g.gain);
    o.connect(g); g.connect(master); o.start(); nodes.push(o);
  });

  // Room noise — low filtered brown noise for presence
  const room = makeNoise(ctx, 'brown');
  const rmf = ctx.createBiquadFilter(); rmf.type = 'lowpass'; rmf.frequency.value = 400;
  const rmg = ctx.createGain(); rmg.gain.value = 0.09;
  room.connect(rmf); rmf.connect(rmg); rmg.connect(master); room.start(); nodes.push(room);

  // Tension pad — sawtooth with slow rising filter
  const pad = ctx.createOscillator(); pad.type = 'sawtooth'; pad.frequency.value = 196;
  const pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 550;
  const pLFO = makeLFO(ctx, 0.025, 180); pLFO.connect(pf.frequency);
  const pg = ctx.createGain(); pg.gain.value = 0.055 * intensity;
  pad.connect(pf); pf.connect(pg); pg.connect(master); pad.start(); nodes.push(pad);
  intensityGains.push({ node: pg, base: 0.055 });

  // Staccato accent tones — news-ticker urgency
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 550, maxFreq: 700, minInt: 3, maxInt: 7,
    vol: 0.04 * intensity, wave: 'triangle', attack: 0.04, release: 0.5,
  }));
  // Sharp accent clicks
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 1200, maxFreq: 1800, minInt: 6, maxInt: 14,
    vol: 0.025, wave: 'square', attack: 0.005, release: 0.08,
  }));

  return {
    master, analyser,
    setIntensity(v) { intensityGains.forEach(({ node, base }) => node.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.2)); },
    stop() { nodes.forEach(n => { try { n.stop(); } catch(e){} }); bursters.forEach(b => b.stop()); master.disconnect(); },
  };
};

// ── CALM ─────────────────────────────────────────────────────────────────────
// Warm reverb, C-major harmonic series (7 partials), pink warmth,
// slow breathing LFO on master, and FM-synthesis singing bowls.

window.__soundscape_recipes.calm = function(ctx, intensity) {
  const master = ctx.createGain();
  const reverb = makeReverb(ctx, 4, 1.8);
  const dryGain = ctx.createGain(); dryGain.gain.value = 0.65;
  const wetGain = ctx.createGain(); wetGain.gain.value = 0.4;
  const mix = ctx.createGain();
  master.connect(dryGain); dryGain.connect(mix);
  master.connect(reverb); reverb.connect(wetGain); wetGain.connect(mix);
  const panner = makePanner(ctx);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  mix.connect(panner); panner.connect(analyser); analyser.connect(ctx.destination);
  const nodes = [], bursters = [], intensityGains = [];

  // Breathing master LFO — very slow, subtle
  const breathLFO = makeLFO(ctx, 0.07, 0.04);
  breathLFO.connect(master.gain);
  master.gain.value = 0.7;

  // C-major triad with overtones — richer harmonic series
  // Fundamental C3, E3, G3, plus softer upper partials
  [
    [130.81, 0.07, 0.028], // C3
    [164.81, 0.07, 0.035], // E3
    [196.00, 0.06, 0.041], // G3
    [261.63, 0.04, 0.016], // C4 (octave)
    [329.63, 0.03, 0.022], // E4
  ].forEach(([freq, amp, lfoRate]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = amp;
    const lfo = makeLFO(ctx, lfoRate, amp * 0.5); lfo.connect(g.gain);
    o.connect(g); g.connect(master); o.start(); nodes.push(o);
  });

  // Warmth — low pink noise
  const w = makeNoise(ctx, 'pink');
  const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 600;
  const wg = ctx.createGain(); wg.gain.value = 0.035;
  w.connect(wf); wf.connect(wg); wg.connect(master); w.start(); nodes.push(w);

  // FM singing bowls — carrier modulated by a close harmonic for bell-like shimmer
  const bowlGain = ctx.createGain(); bowlGain.gain.value = intensity; bowlGain.connect(master);
  intensityGains.push({ node: bowlGain, base: 1 });

  // Bowl 1 — 432 Hz with 435 Hz modulator (3 Hz shimmer)
  const bowlCarrier = ctx.createOscillator(); bowlCarrier.type = 'sine'; bowlCarrier.frequency.value = 432;
  const bowlMod = ctx.createOscillator(); bowlMod.type = 'sine'; bowlMod.frequency.value = 435;
  const bowlModGain = ctx.createGain(); bowlModGain.gain.value = 8;
  bowlMod.connect(bowlModGain); bowlModGain.connect(bowlCarrier.frequency);
  const bowlEnv = ctx.createGain(); bowlEnv.gain.value = 0.06;
  bowlCarrier.connect(bowlEnv); bowlEnv.connect(bowlGain);
  bowlCarrier.start(); bowlMod.start(); nodes.push(bowlCarrier, bowlMod);

  // Stochastic bowl strikes
  bursters.push(scheduleRandomBursts(ctx, bowlGain, {
    minFreq: 396, maxFreq: 528, minInt: 14, maxInt: 30,
    vol: 0.07, wave: 'sine', attack: 1.2, release: 4.0,
  }));

  return {
    master, analyser,
    setIntensity(v) { intensityGains.forEach(({ node, base }) => node.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.2)); },
    stop() { nodes.forEach(n => { try { n.stop(); } catch(e){} }); bursters.forEach(b => b.stop()); master.disconnect(); },
  };
};

// ── COMMERCE ──────────────────────────────────────────────────────────────────
// Bright retail muzak: full major 7th chord pad, subtle air, soft bass,
// and bright ding bursts.

window.__soundscape_recipes.commerce = function(ctx, intensity) {
  const master = ctx.createGain();
  const panner = makePanner(ctx);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  master.connect(panner); panner.connect(analyser); analyser.connect(ctx.destination);
  const nodes = [], bursters = [], intensityGains = [];

  // Cmaj7 pad — C-E-G-B (soft and bright)
  [[261.63, 0.048], [329.63, 0.042], [392.00, 0.038], [493.88, 0.030]].forEach(([freq, amp]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = amp;
    const lfo = makeLFO(ctx, 0.055 + Math.random() * 0.02, amp * 0.4); lfo.connect(g.gain);
    o.connect(g); g.connect(master); o.start(); nodes.push(o);
  });

  // Soft bass (C2)
  const bass = ctx.createOscillator(); bass.type = 'sine'; bass.frequency.value = 65.41;
  const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 200;
  const bg = ctx.createGain(); bg.gain.value = 0.06;
  bass.connect(bf); bf.connect(bg); bg.connect(master); bass.start(); nodes.push(bass);

  // Ambient air
  const air = makeNoise(ctx, 'white');
  const af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 4500; af.Q.value = 0.7;
  const ag = ctx.createGain(); ag.gain.value = 0.018;
  air.connect(af); af.connect(ag); ag.connect(master); air.start(); nodes.push(air);

  // Register dings
  const dingGain = ctx.createGain(); dingGain.gain.value = intensity; dingGain.connect(master);
  intensityGains.push({ node: dingGain, base: 1 });
  bursters.push(scheduleRandomBursts(ctx, dingGain, {
    minFreq: 880, maxFreq: 1320, minInt: 4, maxInt: 11,
    vol: 0.055, wave: 'triangle', attack: 0.015, release: 1.4,
  }));
  // Soft chime melody
  bursters.push(scheduleRandomBursts(ctx, dingGain, {
    minFreq: 1320, maxFreq: 2200, minInt: 8, maxInt: 20,
    vol: 0.03, wave: 'sine', attack: 0.04, release: 0.9,
  }));

  return {
    master, analyser,
    setIntensity(v) { intensityGains.forEach(({ node, base }) => node.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.2)); },
    stop() { nodes.forEach(n => { try { n.stop(); } catch(e){} }); bursters.forEach(b => b.stop()); master.disconnect(); },
  };
};

// ── FOCUS ─────────────────────────────────────────────────────────────────────
// True binaural beats: 200 Hz (L) / 210 Hz (R) = 10 Hz alpha.
// Plus optional 40 Hz gamma undertone, and a soft noise masker.

window.__soundscape_recipes.focus = function(ctx, intensity) {
  const merger = ctx.createChannelMerger(2);
  const master = ctx.createGain();
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  merger.connect(master); master.connect(analyser); analyser.connect(ctx.destination);
  const nodes = [], intensityGains = [];

  // Alpha binaural — 10 Hz beat (200 Hz L, 210 Hz R)
  const oAlphaL = ctx.createOscillator(); oAlphaL.type = 'sine'; oAlphaL.frequency.value = 200;
  const gAlphaL = ctx.createGain(); gAlphaL.gain.value = 0.10 * intensity;
  oAlphaL.connect(gAlphaL); gAlphaL.connect(merger, 0, 0); oAlphaL.start(); nodes.push(oAlphaL);
  intensityGains.push({ node: gAlphaL, base: 0.10 });

  const oAlphaR = ctx.createOscillator(); oAlphaR.type = 'sine'; oAlphaR.frequency.value = 210;
  const gAlphaR = ctx.createGain(); gAlphaR.gain.value = 0.10 * intensity;
  oAlphaR.connect(gAlphaR); gAlphaR.connect(merger, 0, 1); oAlphaR.start(); nodes.push(oAlphaR);
  intensityGains.push({ node: gAlphaR, base: 0.10 });

  // Gamma undertone — 40 Hz (both channels, very subtle)
  const oGamma = ctx.createOscillator(); oGamma.type = 'sine'; oGamma.frequency.value = 40;
  const gGamma = ctx.createGain(); gGamma.gain.value = 0.025;
  oGamma.connect(gGamma); gGamma.connect(master); oGamma.start(); nodes.push(oGamma);

  // Soft pink noise floor — masks distractions, very quiet
  const noise = makeNoise(ctx, 'pink');
  const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1200;
  const ng = ctx.createGain(); ng.gain.value = 0.018;
  noise.connect(nf); nf.connect(ng); ng.connect(master); noise.start(); nodes.push(noise);

  // Very slow breathing rhythm on noise layer — calming
  const breathLFO = makeLFO(ctx, 0.08, 0.012); breathLFO.connect(ng.gain);

  return {
    master, analyser,
    setIntensity(v) { intensityGains.forEach(({ node, base }) => node.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.2)); },
    stop() { nodes.forEach(n => { try { n.stop(); } catch(e){} }); merger.disconnect(); master.disconnect(); },
  };
};

// ── RAIN ──────────────────────────────────────────────────────────────────────
// Four noise layers (heavy rain, fine mist, surface spray, deep rumble),
// high-frequency droplet impacts, and realistic distant thunder.

window.__soundscape_recipes.rain = function(ctx, intensity) {
  const master = ctx.createGain();
  const panner = makePanner(ctx);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  master.connect(panner); panner.connect(analyser); analyser.connect(ctx.destination);
  const nodes = [], bursters = [], intensityGains = [];

  // Heavy rain body — white noise, wide bandpass 600–5000 Hz, with slow swell
  const rainMain = makeNoise(ctx, 'white');
  const rmf = ctx.createBiquadFilter(); rmf.type = 'bandpass'; rmf.frequency.value = 2200; rmf.Q.value = 0.6;
  const rmLFO = makeLFO(ctx, 0.06, 350); rmLFO.connect(rmf.frequency);
  const rmg = ctx.createGain(); rmg.gain.value = 0.30 * intensity;
  rainMain.connect(rmf); rmf.connect(rmg); rmg.connect(master); rainMain.start(); nodes.push(rainMain);
  intensityGains.push({ node: rmg, base: 0.30 });

  // Fine mist — high-pass white noise (5–12 kHz)
  const mist = makeNoise(ctx, 'white');
  const mf = ctx.createBiquadFilter(); mf.type = 'highpass'; mf.frequency.value = 5000;
  const mf2 = ctx.createBiquadFilter(); mf2.type = 'lowpass'; mf2.frequency.value = 12000;
  const mg = ctx.createGain(); mg.gain.value = 0.055;
  mist.connect(mf); mf.connect(mf2); mf2.connect(mg); mg.connect(master); mist.start(); nodes.push(mist);

  // Surface splash — mid bandpass pink noise (1.2–3.5 kHz)
  const splash = makeNoise(ctx, 'pink');
  const spf = ctx.createBiquadFilter(); spf.type = 'bandpass'; spf.frequency.value = 2000; spf.Q.value = 1.4;
  const spg = ctx.createGain(); spg.gain.value = 0.08 * intensity;
  splash.connect(spf); spf.connect(spg); spg.connect(master); splash.start(); nodes.push(splash);
  intensityGains.push({ node: spg, base: 0.08 });

  // Ground rumble — very low brown noise below 100 Hz
  const rumble = makeNoise(ctx, 'brown');
  const ruf = ctx.createBiquadFilter(); ruf.type = 'lowpass'; ruf.frequency.value = 90;
  const rug = ctx.createGain(); rug.gain.value = 0.14;
  rumble.connect(ruf); ruf.connect(rug); rug.connect(master); rumble.start(); nodes.push(rumble);

  // Individual droplet impacts — very short triangle bursts
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 900, maxFreq: 2800, minInt: 0.04, maxInt: 0.22,
    vol: 0.018 * intensity, wave: 'triangle', attack: 0.003, release: 0.05,
  }));

  // Distant thunder (longer gaps, low frequency, slow attack/release)
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 45, maxFreq: 100, minInt: 25, maxInt: 70,
    vol: 0.13 * intensity, wave: 'sine', attack: 0.5, release: 2.5,
  }));

  return {
    master, analyser,
    setIntensity(v) { intensityGains.forEach(({ node, base }) => node.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.2)); },
    stop() { nodes.forEach(n => { try { n.stop(); } catch(e){} }); bursters.forEach(b => b.stop()); master.disconnect(); },
  };
};

// ── CAFE ──────────────────────────────────────────────────────────────────────
// Lo-fi jazz warmth: Am9 chord (5 voices + bass), vinyl crackle
// (multi-band), warm hum, steam/coffee sounds, soft keyboard taps.

window.__soundscape_recipes.cafe = function(ctx, intensity) {
  const master = ctx.createGain();
  const panner = makePanner(ctx);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  master.connect(panner); panner.connect(analyser); analyser.connect(ctx.destination);
  const nodes = [], bursters = [], intensityGains = [];

  // Am9 chord pad — A-C-E-G-B with individual slow LFOs for natural breathe
  // A2=110, C3=130.81, E3=164.81, G3=196, B3=246.94
  [
    [110,    0.042, 0.024],
    [130.81, 0.038, 0.031],
    [164.81, 0.034, 0.019],
    [196.00, 0.028, 0.027],
    [246.94, 0.022, 0.033],
  ].forEach(([freq, amp, lfoRate]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = amp;
    const lfo = makeLFO(ctx, lfoRate, amp * 0.45); lfo.connect(g.gain);
    o.connect(g); g.connect(master); o.start(); nodes.push(o);
  });

  // Deep bass (A1 = 55 Hz) — warmth anchor
  const bass = ctx.createOscillator(); bass.type = 'sine'; bass.frequency.value = 55;
  const bassF = ctx.createBiquadFilter(); bassF.type = 'lowpass'; bassF.frequency.value = 180;
  const bassG = ctx.createGain(); bassG.gain.value = 0.055;
  bass.connect(bassF); bassF.connect(bassG); bassG.connect(master); bass.start(); nodes.push(bass);

  // Vinyl crackle — layered: high-freq pink + white bursts
  const vinyl = makeNoise(ctx, 'pink');
  const vf = ctx.createBiquadFilter(); vf.type = 'highpass'; vf.frequency.value = 5500;
  const vg = ctx.createGain(); vg.gain.value = 0.035 * intensity;
  vinyl.connect(vf); vf.connect(vg); vg.connect(master); vinyl.start(); nodes.push(vinyl);
  intensityGains.push({ node: vg, base: 0.035 });

  // Subtle vinyl rumble (record spin)
  const spin = makeNoise(ctx, 'brown');
  const spf = ctx.createBiquadFilter(); spf.type = 'bandpass'; spf.frequency.value = 60; spf.Q.value = 2;
  const spg = ctx.createGain(); spg.gain.value = 0.04;
  spin.connect(spf); spf.connect(spg); spg.connect(master); spin.start(); nodes.push(spin);

  // Warm ambient hum (room HVAC)
  const hum = makeNoise(ctx, 'brown');
  const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 220;
  const hg = ctx.createGain(); hg.gain.value = 0.045;
  hum.connect(hf); hf.connect(hg); hg.connect(master); hum.start(); nodes.push(hum);

  // Soft keyboard taps
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 2200, maxFreq: 4400, minInt: 1.5, maxInt: 5,
    vol: 0.012 * intensity, wave: 'triangle', attack: 0.004, release: 0.045,
  }));
  // Distant mug clink / spoon
  bursters.push(scheduleRandomBursts(ctx, master, {
    minFreq: 800, maxFreq: 1600, minInt: 8, maxInt: 22,
    vol: 0.02, wave: 'sine', attack: 0.008, release: 0.25,
  }));

  return {
    master, analyser,
    setIntensity(v) { intensityGains.forEach(({ node, base }) => node.gain.linearRampToValueAtTime(base * v, ctx.currentTime + 0.2)); },
    stop() { nodes.forEach(n => { try { n.stop(); } catch(e){} }); bursters.forEach(b => b.stop()); master.disconnect(); },
  };
};
