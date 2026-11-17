// SOLARA HEAT — audio.js
// One job: all sound, synthesized live with the WebAudio API — no audio
// files, no network. Engine hum follows speed, the siren wails in two tones,
// and a tiny procedural bassline plays as the city's radio.

export function createAudio() {
  let ctx = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenLfo = null;
  let musicTimer = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      // Engine: two detuned saws through a lowpass, gain follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      // Siren: sine alternating 700 / 950 Hz via an LFO on frequency.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 820;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 1.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 130;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start(); sirenLfo.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1800;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }

  // A lazy sunset bassline: root notes of Am–F–C–G, one bar each.
  const BASSLINE = [55, 43.65, 65.41, 49];
  let bar = 0;
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (muted) return;
      const root = BASSLINE[bar % BASSLINE.length];
      bar += 1;
      [0, 0.5, 0.75].forEach((off, i) => {
        window.setTimeout(() => {
          if (muted) return;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = root * (i === 2 ? 1.5 : 1);
          g.gain.setValueAtTime(0.09, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
          o.connect(g).connect(ctx.destination);
          o.start(); o.stop(ctx.currentTime + 0.45);
        }, off * 1000);
      });
    }, 2000);
  }

  // Two-tone car horn: a short fifth, the sound traffic makes when the
  // player blocks the road.
  function hornBlast() {
    if (!ctx || muted) return;
    for (const f of [370, 466]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.06, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.36);
    }
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); startMusic(); },
    setEngine(speed01, on) {
      if (!ctx || !engineGain) return;
      const target = on && !muted ? 0.02 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, ctx.currentTime, 0.1);
    },
    setSiren(on, nearestDist) {
      if (!ctx || !sirenGain) return;
      // The wail fades with distance so a far chase sounds far away.
      const dist = typeof nearestDist === 'number' ? nearestDist : 0;
      const falloff = dist <= 0 ? 1 : Math.max(0.15, 1 - dist / 220);
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 * falloff : 0, ctx.currentTime, 0.15);
    },
    horn() { hornBlast(); },
    // Tyre squeal on a hard brake — short filtered noise, quiet on purpose.
    skid() { noiseBurst(0.18, 0.1, 1400); },
    // Rising whoosh when a mission starts or a wreck goes up.
    whoosh() { noiseBurst(0.5, 0.22, 700); },
    pickup() { blip(880, 0.12, 'sine', 0.18); window.setTimeout(() => blip(1320, 0.15, 'sine', 0.15), 70); },
    mission() { [523, 659, 784].forEach((f, i) => window.setTimeout(() => blip(f, 0.2, 'triangle', 0.16), i * 110)); },
    shot() { noiseBurst(0.14, 0.35, 2400); },
    punch() { noiseBurst(0.09, 0.3, 500); },
    crash() { noiseBurst(0.25, 0.4, 900); },
    busted() { [392, 311, 233].forEach((f, i) => window.setTimeout(() => blip(f, 0.3, 'sawtooth', 0.12), i * 160)); },
    click() { blip(660, 0.06, 'square', 0.08); },
    toggleMute() { muted = !muted; return muted; },
    isStarted() { return started; },
  };
}
