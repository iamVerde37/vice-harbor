// All sound is synthesized with WebAudio — no audio files, nothing fetched. The context is
// created lazily on the first user gesture (browsers refuse it before then). Continuous
// voices (engine, siren) are started once and steered by setters; one-shots (gunfire, crash,
// pickup, UI) are built per call from oscillators and shaped noise. A tiny lookahead
// scheduler loops a synthwave bass line under the game.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = null;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  }

  function noiseBuffer() {
    const len = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  let sharedNoise = null;

  function burst({ dur = 0.15, freq = 1200, q = 0.8, gain = 0.5, type = 'lowpass', sweepTo = null }) {
    if (!ensure()) return;
    if (!sharedNoise) sharedNoise = noiseBuffer();
    const src = ctx.createBufferSource();
    src.buffer = sharedNoise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(g).connect(master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  function blip({ freq = 660, dur = 0.12, gain = 0.25, type = 'sine', sweepTo = null, delay = 0 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // --- continuous voices -------------------------------------------------

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter).connect(engineGain).connect(master);
    engineOsc.start();
  }

  /** speedRatio 0..1; only audible while the player is driving. */
  function setEngine(speedRatio, driving) {
    if (!engineOsc) return;
    const target = driving ? 0.05 + Math.abs(speedRatio) * 0.05 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.09);
    engineOsc.frequency.setTargetAtTime(52 + Math.abs(speedRatio) * 118, ctx.currentTime, 0.06);
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    let high = false;
    sirenFlip = window.setInterval(() => {
      if (!ctx || !sirenOsc) return;
      high = !high;
      sirenOsc.frequency.setValueAtTime(high ? 950 : 700, ctx.currentTime);
    }, 380);
  }

  /** level 0..1 by the nearest police unit; 0 silences the siren. */
  function setSiren(level) {
    if (!sirenGain) return;
    sirenGain.gain.setTargetAtTime(level * 0.045, ctx.currentTime, 0.2);
  }

  // --- music: a moody A-minor bass loop with hats -------------------------

  const BASS = [55, 0, 55, 55, 0, 55, 0, 65.4, 0, 55, 0, 55, 49, 0, 73.4, 0]; // A1 pattern w/ C2, G1, D2
  function scheduleMusic() {
    if (!ctx) return;
    const SPB = 60 / 112 / 2; // 112 bpm, eighth notes
    while (nextNoteTime < ctx.currentTime + 0.18) {
      const step = musicStep % 16;
      const freq = BASS[step];
      if (freq) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.055, nextNoteTime);
        g.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + SPB * 0.95);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 500;
        osc.connect(f).connect(g).connect(master);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + SPB);
      }
      if (step % 2 === 0) {
        // hat tick
        if (!sharedNoise) sharedNoise = noiseBuffer();
        const src = ctx.createBufferSource();
        src.buffer = sharedNoise;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.016, nextNoteTime);
        g.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + 0.04);
        src.connect(f).connect(g).connect(master);
        src.start(nextNoteTime);
        src.stop(nextNoteTime + 0.05);
      }
      if (step === 0 && musicStep % 64 === 0) {
        blip({ freq: 220, dur: 1.6, gain: 0.02, type: 'sine' });
      }
      musicStep += 1;
      nextNoteTime += SPB;
    }
  }

  function startMusic() {
    if (!ensure() || musicTimer) return;
    startEngine();
    startSiren();
    nextNoteTime = ctx.currentTime + 0.06;
    musicStep = 0;
    musicTimer = window.setInterval(scheduleMusic, 42);
  }

  return {
    unlock: ensure,
    startMusic,
    setEngine,
    setSiren,
    gunshot() {
      burst({ dur: 0.16, freq: 2600, gain: 0.5, type: 'lowpass', sweepTo: 300 });
      blip({ freq: 150, dur: 0.1, gain: 0.3, type: 'square', sweepTo: 60 });
    },
    enemyShot() {
      burst({ dur: 0.12, freq: 1800, gain: 0.22, sweepTo: 300 });
    },
    crash(big = false) {
      burst({ dur: big ? 0.4 : 0.2, freq: 500, gain: big ? 0.6 : 0.35, sweepTo: 90 });
      blip({ freq: 90, dur: 0.18, gain: 0.25, type: 'sine', sweepTo: 40 });
    },
    pickup() {
      blip({ freq: 880, dur: 0.09, gain: 0.22, type: 'sine' });
      blip({ freq: 1318, dur: 0.14, gain: 0.22, type: 'sine', delay: 0.07 });
    },
    cash() {
      blip({ freq: 1046, dur: 0.08, gain: 0.2, type: 'triangle' });
      blip({ freq: 1568, dur: 0.16, gain: 0.2, type: 'triangle', delay: 0.06 });
    },
    success() {
      [523, 659, 784, 1046].forEach((f, i) => blip({ freq: f, dur: 0.16, gain: 0.2, type: 'triangle', delay: i * 0.09 }));
    },
    fail() {
      [392, 330, 262].forEach((f, i) => blip({ freq: f, dur: 0.2, gain: 0.2, type: 'triangle', delay: i * 0.12 }));
    },
    door() {
      blip({ freq: 190, dur: 0.07, gain: 0.25, type: 'square', sweepTo: 120 });
    },
    click() {
      blip({ freq: 740, dur: 0.05, gain: 0.15, type: 'sine' });
    },
  };
}
