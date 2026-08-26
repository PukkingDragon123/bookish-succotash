// Everything you hear is synthesised at runtime — no audio files. A tiny
// WebAudio toolkit (tones, noise bursts, filters) drives both the SFX bank and
// a layered procedural score that reacts to how dangerous things currently are.

const A4 = 440;
const SCALE_MINOR_PENT = [0, 3, 5, 7, 10];
const SCALE_AEOLIAN = [0, 2, 3, 5, 7, 8, 10];

function midi(n) { return A4 * Math.pow(2, (n - 69) / 12); }

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterVol = 0.7;
    this.musicVol = 0.5;
    this.sfxVol = 0.85;
    this.intensity = 0;        // 0 calm .. 1 boss
    this.targetIntensity = 0;
    this._noise = null;
    this._nextNote = 0;
    this._step = 0;
    this._bpm = 96;
    this._fireBed = null;
    this._started = false;
    this._recent = new Map();  // name -> last play time, for throttling
  }

  // Must be called from a user gesture.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = this.masterVol;
    this.master.connect(c.destination);

    // A gentle bus compressor stops the bullet-hell from clipping.
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;
    this.comp.connect(this.master);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.comp);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.comp);

    // Shared convolution-free "space": a short feedback delay used as reverb-ish.
    this.delay = c.createDelay(0.6);
    this.delay.delayTime.value = 0.22;
    this.delayFb = c.createGain();
    this.delayFb.gain.value = 0.28;
    this.delayFilter = c.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 2200;
    this.delaySend = c.createGain();
    this.delaySend.gain.value = 0.3;
    this.delaySend.connect(this.delay);
    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delayFilter.connect(this.comp);

    this._buildNoise();
    this._buildMusicLayers();
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx && !this._started) {
      this._started = true;
      this._nextNote = this.ctx.currentTime + 0.1;
    }
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  _buildNoise() {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * 2);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  }

  // --- primitives ----------------------------------------------------------
  /** One oscillator with an ADSR-ish envelope and optional pitch sweep. */
  tone(o = {}) {
    if (!this.ctx || !this.enabled) return null;
    const c = this.ctx;
    const t0 = o.at != null ? o.at : c.currentTime;
    const osc = c.createOscillator();
    osc.type = o.type || 'square';
    const f0 = o.freq || 440;
    const f1 = o.freq2 != null ? o.freq2 : f0;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) {
      if (o.expo === false) osc.frequency.linearRampToValueAtTime(f1, t0 + (o.dur || 0.2));
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + (o.dur || 0.2));
    }
    if (o.detune) osc.detune.value = o.detune;

    const g = c.createGain();
    const vol = (o.vol == null ? 0.25 : o.vol);
    const atk = o.attack == null ? 0.004 : o.attack;
    const dur = o.dur || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + atk);
    if (o.sustain) {
      g.gain.setValueAtTime(Math.max(0.0002, vol), t0 + dur * 0.6);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let node = osc;
    if (o.filter) {
      const bq = c.createBiquadFilter();
      bq.type = o.filter;
      bq.frequency.setValueAtTime(o.cutoff || 1200, t0);
      if (o.cutoff2) bq.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoff2), t0 + dur);
      bq.Q.value = o.q == null ? 1 : o.q;
      node.connect(bq); node = bq;
    }
    node.connect(g);
    g.connect(o.bus || this.sfxBus);
    if (o.send) { const s = c.createGain(); s.gain.value = o.send; g.connect(s); s.connect(this.delaySend); }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return { osc, gain: g };
  }

  /** Filtered noise burst — impacts, explosions, wind, footsteps. */
  noise(o = {}) {
    if (!this.ctx || !this.enabled) return null;
    const c = this.ctx;
    const t0 = o.at != null ? o.at : c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;

    const bq = c.createBiquadFilter();
    bq.type = o.filter || 'bandpass';
    const f0 = o.freq || 900;
    const f1 = o.freq2 != null ? o.freq2 : f0;
    bq.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + (o.dur || 0.2));
    bq.Q.value = o.q == null ? 1.2 : o.q;

    const g = c.createGain();
    const vol = o.vol == null ? 0.25 : o.vol;
    const dur = o.dur || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + (o.attack == null ? 0.005 : o.attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(bq); bq.connect(g); g.connect(o.bus || this.sfxBus);
    if (o.send) { const s = c.createGain(); s.gain.value = o.send; g.connect(s); s.connect(this.delaySend); }
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    return { src, gain: g, filter: bq };
  }

  // Prevents 40 simultaneous identical hits from turning into a wall of mud.
  _throttle(name, ms) {
    const now = performance.now();
    const last = this._recent.get(name) || -1e9;
    if (now - last < ms) return true;
    this._recent.set(name, now);
    return false;
  }

  // --- the SFX bank --------------------------------------------------------
  play(name, opt = {}) {
    if (!this.ctx || !this.enabled) return;
    const v = opt.vol == null ? 1 : opt.vol;
    switch (name) {
      case 'shoot':
        if (this._throttle('shoot', 24)) return;
        this.tone({ type: 'square', freq: 780, freq2: 190, dur: 0.09, vol: 0.16 * v, filter: 'lowpass', cutoff: 3800, cutoff2: 700 });
        this.noise({ freq: 2600, freq2: 500, dur: 0.07, vol: 0.10 * v, filter: 'highpass', q: 0.7 });
        break;
      case 'shotgun':
        this.noise({ freq: 1400, freq2: 180, dur: 0.24, vol: 0.28 * v, filter: 'lowpass', q: 0.6 });
        this.tone({ type: 'sawtooth', freq: 240, freq2: 60, dur: 0.2, vol: 0.18 * v });
        break;
      case 'rifle':
        this.tone({ type: 'sawtooth', freq: 1100, freq2: 140, dur: 0.13, vol: 0.19 * v, filter: 'lowpass', cutoff: 5200, cutoff2: 600 });
        this.noise({ freq: 3400, freq2: 700, dur: 0.11, vol: 0.14 * v, filter: 'highpass' });
        break;
      case 'sparker':
        if (this._throttle('sparker', 40)) return;
        this.tone({ type: 'square', freq: 1500, freq2: 2600, dur: 0.06, vol: 0.09 * v });
        this.noise({ freq: 5200, freq2: 2200, dur: 0.05, vol: 0.07 * v, filter: 'highpass' });
        break;
      case 'lob':
        this.tone({ type: 'sine', freq: 300, freq2: 640, dur: 0.16, vol: 0.16 * v });
        break;
      case 'hit':
        if (this._throttle('hit', 18)) return;
        this.noise({ freq: 2000, freq2: 420, dur: 0.06, vol: 0.14 * v, filter: 'bandpass', q: 1.2 });
        break;
      case 'flesh':
        if (this._throttle('flesh', 30)) return;
        this.noise({ freq: 700, freq2: 180, dur: 0.09, vol: 0.16 * v, filter: 'lowpass' });
        break;
      case 'metal':
        if (this._throttle('metal', 30)) return;
        this.tone({ type: 'square', freq: 1800, freq2: 900, dur: 0.06, vol: 0.07 * v });
        this.noise({ freq: 4200, freq2: 1800, dur: 0.07, vol: 0.09 * v, filter: 'highpass' });
        break;
      case 'explode':
        this.noise({ freq: 900, freq2: 60, dur: 0.62, vol: 0.36 * v, filter: 'lowpass', q: 0.7, send: 0.4 });
        this.tone({ type: 'sine', freq: 160, freq2: 32, dur: 0.5, vol: 0.3 * v });
        break;
      case 'bigexplode':
        this.noise({ freq: 1200, freq2: 40, dur: 1.1, vol: 0.44 * v, filter: 'lowpass', q: 0.6, send: 0.6 });
        this.tone({ type: 'sine', freq: 120, freq2: 24, dur: 0.9, vol: 0.34 * v });
        this.tone({ type: 'sawtooth', freq: 90, freq2: 20, dur: 0.7, vol: 0.16 * v, filter: 'lowpass', cutoff: 500 });
        break;
      case 'chop':
        this.noise({ freq: 620, freq2: 150, dur: 0.16, vol: 0.24 * v, filter: 'lowpass', q: 1.4 });
        this.tone({ type: 'triangle', freq: 210, freq2: 90, dur: 0.13, vol: 0.13 * v });
        break;
      case 'timber':
        this.noise({ freq: 400, freq2: 90, dur: 1.0, vol: 0.24 * v, filter: 'lowpass', q: 0.8, send: 0.4 });
        break;
      case 'mine':
        this.noise({ freq: 3000, freq2: 800, dur: 0.11, vol: 0.2 * v, filter: 'bandpass', q: 2.4 });
        this.tone({ type: 'square', freq: 520, freq2: 240, dur: 0.08, vol: 0.09 * v });
        break;
      case 'pick':
        this.tone({ type: 'sine', freq: 900, freq2: 1500, dur: 0.09, vol: 0.12 * v });
        break;
      case 'pickup':
        this.tone({ type: 'square', freq: 700, freq2: 1250, dur: 0.09, vol: 0.11 * v, send: 0.2 });
        break;
      case 'coinup':
        this.tone({ type: 'square', freq: 880, dur: 0.07, vol: 0.11 * v });
        this.tone({ type: 'square', freq: 1320, dur: 0.11, vol: 0.11 * v, at: this.t + 0.07 });
        break;
      case 'craft':
        [0, 4, 7, 12].forEach((s, i) => this.tone({ type: 'triangle', freq: midi(60 + s), dur: 0.28, vol: 0.13 * v, at: this.t + i * 0.07, send: 0.4 }));
        break;
      case 'deliver':
        this.tone({ type: 'sine', freq: midi(64), dur: 0.14, vol: 0.13 * v });
        this.tone({ type: 'sine', freq: midi(71), dur: 0.2, vol: 0.12 * v, at: this.t + 0.09, send: 0.3 });
        break;
      case 'quest':
        [0, 5, 9, 12, 16].forEach((s, i) => this.tone({ type: 'triangle', freq: midi(60 + s), dur: 0.4, vol: 0.12 * v, at: this.t + i * 0.09, send: 0.5 }));
        break;
      case 'recruit':
        [0, 7, 12, 19].forEach((s, i) => this.tone({ type: 'sawtooth', freq: midi(52 + s), dur: 0.6, vol: 0.1 * v, at: this.t + i * 0.11, filter: 'lowpass', cutoff: 2600, send: 0.5 }));
        break;
      case 'ui':
        this.tone({ type: 'square', freq: 620, dur: 0.04, vol: 0.07 * v });
        break;
      case 'uiselect':
        this.tone({ type: 'square', freq: 520, freq2: 880, dur: 0.08, vol: 0.09 * v });
        break;
      case 'deny':
        this.tone({ type: 'square', freq: 220, freq2: 130, dur: 0.16, vol: 0.11 * v });
        break;
      case 'dash':
        this.noise({ freq: 500, freq2: 3200, dur: 0.18, vol: 0.14 * v, filter: 'bandpass', q: 0.8 });
        break;
      case 'hurt':
        this.tone({ type: 'sawtooth', freq: 420, freq2: 110, dur: 0.26, vol: 0.24 * v, filter: 'lowpass', cutoff: 2000 });
        this.noise({ freq: 1200, freq2: 200, dur: 0.2, vol: 0.16 * v });
        break;
      case 'shieldbreak':
        this.tone({ type: 'square', freq: 1600, freq2: 300, dur: 0.3, vol: 0.16 * v, filter: 'bandpass', q: 4 });
        break;
      case 'chip':
        this.tone({ type: 'square', freq: 1200, dur: 0.05, vol: 0.1 * v });
        this.tone({ type: 'square', freq: 1800, dur: 0.05, vol: 0.1 * v, at: this.t + 0.05 });
        this.tone({ type: 'square', freq: 2400, dur: 0.12, vol: 0.1 * v, at: this.t + 0.1, send: 0.4 });
        break;
      case 'scan':
        this.tone({ type: 'sine', freq: 1800, freq2: 400, dur: 0.5, vol: 0.1 * v, send: 0.5 });
        this.tone({ type: 'sine', freq: 2700, freq2: 600, dur: 0.45, vol: 0.05 * v, at: this.t + 0.04 });
        break;
      case 'geyser':
        this.noise({ freq: 300, freq2: 2600, dur: 1.6, vol: 0.22 * v, filter: 'bandpass', q: 0.5, attack: 0.4, send: 0.5 });
        break;
      case 'bubble':
        if (this._throttle('bubble', 220)) return;
        this.tone({ type: 'sine', freq: 200 + Math.random() * 200, freq2: 500, dur: 0.13, vol: 0.05 * v });
        break;
      case 'wavewarn':
        this.tone({ type: 'sawtooth', freq: 160, freq2: 320, dur: 0.7, vol: 0.16 * v, filter: 'lowpass', cutoff: 900, send: 0.5 });
        this.tone({ type: 'sawtooth', freq: 240, dur: 0.7, vol: 0.08 * v, at: this.t + 0.36 });
        break;
      case 'wavestart':
        [0, 0.12, 0.24].forEach((d, i) => this.tone({ type: 'square', freq: midi(48 + i * 5), dur: 0.3, vol: 0.15 * v, at: this.t + d, filter: 'lowpass', cutoff: 1800 }));
        this.noise({ freq: 120, freq2: 60, dur: 0.9, vol: 0.2 * v, filter: 'lowpass' });
        break;
      case 'waveclear':
        [0, 4, 7, 12, 16, 19].forEach((s, i) => this.tone({ type: 'triangle', freq: midi(60 + s), dur: 0.5, vol: 0.12 * v, at: this.t + i * 0.08, send: 0.6 }));
        break;
      case 'alarm':
        this.tone({ type: 'square', freq: 880, freq2: 660, dur: 0.4, vol: 0.13 * v, filter: 'bandpass', q: 3 });
        break;
      case 'talk':
        if (this._throttle('talk', 45)) return;
        this.tone({ type: 'square', freq: (opt.pitch || 1) * (500 + Math.random() * 220), dur: 0.035, vol: 0.055 * v, filter: 'lowpass', cutoff: 1800 });
        break;
      case 'step':
        if (this._throttle('step', 90)) return;
        this.noise({ freq: 380 + Math.random() * 160, freq2: 160, dur: 0.06, vol: 0.055 * v, filter: 'lowpass', q: 1.1 });
        break;
      case 'splash':
        this.noise({ freq: 1600, freq2: 400, dur: 0.3, vol: 0.16 * v, filter: 'bandpass', q: 0.6 });
        break;
      case 'roar':
        this.tone({ type: 'sawtooth', freq: 90, freq2: 60, dur: 1.2, vol: 0.28 * v, filter: 'lowpass', cutoff: 700, cutoff2: 260, send: 0.5 });
        this.noise({ freq: 240, freq2: 90, dur: 1.2, vol: 0.16 * v, filter: 'lowpass' });
        break;
      case 'laser':
        this.tone({ type: 'sawtooth', freq: 180, freq2: 1400, dur: 0.9, vol: 0.14 * v, filter: 'bandpass', q: 6, send: 0.3 });
        break;
      case 'laserfire':
        this.tone({ type: 'square', freq: 2200, freq2: 300, dur: 0.4, vol: 0.2 * v, filter: 'bandpass', q: 3 });
        this.noise({ freq: 3000, freq2: 600, dur: 0.4, vol: 0.14 * v });
        break;
      case 'firewhoosh':
        this.noise({ freq: 400, freq2: 1800, dur: 1.4, vol: 0.2 * v, filter: 'bandpass', q: 0.5, attack: 0.5, send: 0.6 });
        break;
      case 'rescue':
        [0, 7, 12].forEach((s, i) => this.tone({ type: 'sine', freq: midi(67 + s), dur: 0.35, vol: 0.12 * v, at: this.t + i * 0.08, send: 0.5 }));
        break;
      case 'levelup':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone({ type: 'square', freq: midi(60 + s), dur: 0.4, vol: 0.1 * v, at: this.t + i * 0.06, send: 0.5 }));
        break;
      case 'die':
        this.tone({ type: 'sawtooth', freq: 300, freq2: 40, dur: 1.6, vol: 0.24 * v, filter: 'lowpass', cutoff: 1400, cutoff2: 180, send: 0.6 });
        break;
      default: break;
    }
  }

  // --- music ---------------------------------------------------------------
  _buildMusicLayers() {
    const c = this.ctx;
    const mk = (vol) => { const g = c.createGain(); g.gain.value = vol; g.connect(this.musicBus); return g; };
    this.layers = {
      pad: mk(0.5),
      arp: mk(0.35),
      bass: mk(0.5),
      drums: mk(0.5),
      lead: mk(0.4),
    };
    const send = c.createGain();
    send.gain.value = 0.35;
    this.layers.arp.connect(send);
    this.layers.lead.connect(send);
    send.connect(this.delaySend);
  }

  setIntensity(v) { this.targetIntensity = Math.max(0, Math.min(1, v)); }

  /** Called once per frame. Schedules music ~0.4s ahead of the clock. */
  update(dt) {
    if (!this.ctx || !this.enabled || !this._started) return;
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 0.9);
    this.musicBus.gain.value = this.musicVol;

    const c = this.ctx;
    const spb = 60 / this._bpm;
    const step = spb / 4;                    // sixteenth notes
    let guard = 0;
    while (this._nextNote < c.currentTime + 0.4 && guard++ < 64) {
      this._scheduleStep(this._step, this._nextNote, step);
      this._step = (this._step + 1) % 64;
      this._nextNote += step;
    }
  }

  _scheduleStep(s, t, stepDur) {
    const I = this.intensity;
    const L = this.layers;
    const bar = Math.floor(s / 16);
    // A slow, bleak minor progression: i - VI - III - VII
    const roots = [45, 41, 48, 43];
    const root = roots[bar % 4];
    const scale = I > 0.45 ? SCALE_AEOLIAN : SCALE_MINOR_PENT;
    this._bpm = 88 + I * 44;

    // Pad — always present, opens up as things calm down.
    if (s % 16 === 0) {
      const padVol = 0.05 + (1 - I) * 0.05;
      for (const iv of [0, 7, 12]) {
        this.tone({ type: 'triangle', freq: midi(root - 12 + iv), dur: stepDur * 16, vol: padVol, attack: 0.4, bus: L.pad, at: t, filter: 'lowpass', cutoff: 700 + I * 900 });
      }
    }

    // Arpeggio — the "wandering the basin" voice.
    if ((1 - I) > 0.25 && s % 2 === 0) {
      const idx = (s / 2) % scale.length;
      const oct = ((s / 2) % 8) < 4 ? 12 : 24;
      this.tone({
        type: 'square', freq: midi(root + scale[idx] + oct), dur: stepDur * 1.7,
        vol: 0.035 * (1 - I) + 0.008, bus: L.arp, at: t, filter: 'lowpass', cutoff: 2400,
      });
    }

    // Bass — drives everything once combat starts.
    if (I > 0.2) {
      const pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
      if (pat[s % 16]) {
        this.tone({
          type: 'sawtooth', freq: midi(root - 12), dur: stepDur * 1.6, vol: 0.075 * I,
          bus: L.bass, at: t, filter: 'lowpass', cutoff: 340 + I * 900, q: 5,
        });
      }
    }

    // Drums.
    if (I > 0.15) {
      const kick = [0, 6, 8, 14];
      const snare = [4, 12];
      if (kick.includes(s % 16)) {
        this.tone({ type: 'sine', freq: 150, freq2: 42, dur: 0.19, vol: 0.16 * I, bus: L.drums, at: t });
      }
      if (snare.includes(s % 16)) {
        this.noise({ freq: 1700, freq2: 700, dur: 0.15, vol: 0.1 * I, bus: L.drums, at: t, filter: 'bandpass', q: 0.8 });
      }
      if (I > 0.5 && s % 2 === 1) {
        this.noise({ freq: 8000, dur: 0.035, vol: 0.032 * I, bus: L.drums, at: t, filter: 'highpass' });
      }
    }

    // Lead — a defiant motif that only shows up when it's really bad.
    if (I > 0.72 && s % 16 === 0) {
      const motif = [0, 3, 7, 10, 7, 3];
      motif.forEach((iv, i) => {
        this.tone({
          type: 'sawtooth', freq: midi(root + 12 + iv), dur: stepDur * 2.2,
          vol: 0.05 * I, bus: L.lead, at: t + i * stepDur * 2,
          filter: 'lowpass', cutoff: 2200, q: 3,
        });
      });
    }
  }

  /** A looping crackle bed for the forest-fire sequence. */
  setFire(level) {
    if (!this.ctx || !this.enabled) return;
    if (level > 0.02 && !this._fireBed) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this._noise; src.loop = true;
      const bq = c.createBiquadFilter(); bq.type = 'bandpass'; bq.frequency.value = 900; bq.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(bq); bq.connect(g); g.connect(this.comp);
      src.start();
      this._fireBed = { src, gain: g, filter: bq };
    }
    if (this._fireBed) {
      const target = Math.min(0.34, level * 0.34);
      this._fireBed.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.6);
      this._fireBed.filter.frequency.setTargetAtTime(500 + level * 1400, this.ctx.currentTime, 0.8);
    }
  }

  setMuted(m) {
    this.enabled = !m;
    if (this.master) this.master.gain.value = m ? 0 : this.masterVol;
  }
}

export const audio = new Audio();
