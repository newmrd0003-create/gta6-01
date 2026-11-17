// SOLARA HEAT — audio
// Every sound is cooked live by the WebAudio API — no audio files, no
// network. The engine hum tracks speed, the siren wails in two tones and
// fades with distance, and a small procedural bassline is the city radio.

export function makeAudio() {
  let ac = null;
  let engOsc = null, engGain = null, engFilter = null;
  let sirOsc = null, sirGain = null, sirLfo = null;
  let radioTimer = null;
  let silent = false;
  let live = false;

  function boot() {
    if (ac) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      // Engine: two detuned saws through a lowpass, gain tracks speed.
      engOsc = ac.createOscillator();
      engOsc.type = 'sawtooth';
      engOsc.frequency.value = 55;
      engFilter = ac.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 320;
      engGain = ac.createGain();
      engGain.gain.value = 0;
      engOsc.connect(engFilter);
      engFilter.connect(engGain);
      engGain.connect(ac.destination);
      engOsc.start();
      // Siren: a sine that swings 700 / 950 Hz on a square-wave LFO.
      sirOsc = ac.createOscillator();
      sirOsc.type = 'sine';
      sirOsc.frequency.value = 820;
      sirLfo = ac.createOscillator();
      sirLfo.type = 'square';
      sirLfo.frequency.value = 1.6;
      const swing = ac.createGain();
      swing.gain.value = 130;
      sirLfo.connect(swing);
      swing.connect(sirOsc.frequency);
      sirGain = ac.createGain();
      sirGain.gain.value = 0;
      sirOsc.connect(sirGain);
      sirGain.connect(ac.destination);
      sirOsc.start();
      sirLfo.start();
      live = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, len, kind, vol) {
    if (!ac || silent) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = kind || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + len);
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + len);
  }

  function burst(len, vol, cutoff) {
    if (!ac || silent) return;
    const n = Math.floor(ac.sampleRate * len);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff || 1800;
    const g = ac.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    src.start();
  }

  // A lazy sunset bassline: Am–F–C–G roots, one bar each.
  const ROOTS = [55, 43.65, 65.41, 49];
  let barNo = 0;
  function startRadio() {
    if (!ac || radioTimer) return;
    radioTimer = window.setInterval(() => {
      if (silent) return;
      const root = ROOTS[barNo % ROOTS.length];
      barNo += 1;
      [0, 0.5, 0.75].forEach((off, i) => {
        window.setTimeout(() => {
          if (silent) return;
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = 'triangle';
          o.frequency.value = root * (i === 2 ? 1.5 : 1);
          g.gain.setValueAtTime(0.09, ac.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
          o.connect(g);
          g.connect(ac.destination);
          o.start();
          o.stop(ac.currentTime + 0.45);
        }, off * 1000);
      });
    }, 2000);
  }

  // Two-note horn, a fifth apart — what traffic sounds like when Leo
  // parks across the road.
  function honk() {
    if (!ac || silent) return;
    for (const f of [370, 466]) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.06, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.36);
    }
  }

  return {
    unlock() {
      if (boot() && ac.state === 'suspended') ac.resume();
      startRadio();
    },
    engine(level01, on) {
      if (!ac || !engGain) return;
      const target = on && !silent ? 0.02 + level01 * 0.06 : 0;
      engGain.gain.setTargetAtTime(target, ac.currentTime, 0.08);
      engOsc.frequency.setTargetAtTime(50 + level01 * 130, ac.currentTime, 0.08);
      engFilter.frequency.setTargetAtTime(280 + level01 * 900, ac.currentTime, 0.1);
    },
    siren(on, dist) {
      if (!ac || !sirGain) return;
      // A far chase sounds far away: the wail fades with distance.
      const d = typeof dist === 'number' ? dist : 0;
      const fall = d <= 0 ? 1 : Math.max(0.15, 1 - d / 220);
      sirGain.gain.setTargetAtTime(on && !silent ? 0.045 * fall : 0, ac.currentTime, 0.15);
    },
    horn() { honk(); },
    // Tyre squeal on a hard stop — short filtered noise, quiet by design.
    skid() { burst(0.18, 0.1, 1400); },
    // Rising whoosh for a mission start or a car going up.
    whoosh() { burst(0.5, 0.22, 700); },
    coin() {
      tone(880, 0.12, 'sine', 0.18);
      window.setTimeout(() => tone(1320, 0.15, 'sine', 0.15), 70);
    },
    sting() {
      [523, 659, 784].forEach((f, i) =>
        window.setTimeout(() => tone(f, 0.2, 'triangle', 0.16), i * 110));
    },
    bang() { burst(0.14, 0.35, 2400); },
    thud() { burst(0.09, 0.3, 500); },
    smash() { burst(0.25, 0.4, 900); },
    defeat() {
      [392, 311, 233].forEach((f, i) =>
        window.setTimeout(() => tone(f, 0.3, 'sawtooth', 0.12), i * 160));
    },
    tick() { tone(660, 0.06, 'square', 0.08); },
    toggleMute() { silent = !silent; return silent; },
    ready() { return live; },
  };
}
