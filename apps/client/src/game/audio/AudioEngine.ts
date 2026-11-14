const MUSIC_URL = `${import.meta.env.BASE_URL}audio/race-music.mp3`;

/**
 * zero audio assets; recorded samples can be layered in later (e.g. via Howler) without changing callers.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private engine: { oscA: OscillatorNode; oscB: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private wind: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private nitroLoop: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private scrapeGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private musicMissing = false;
  private volumes = { master: 0.8, sfx: 0.9, music: 0.5 };

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.connect(this.master);
      this.noiseBuffer = this.createNoise();
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(master: number, sfx: number, music: number) {
    this.volumes = { master, sfx, music };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.35, t, 0.05);
  }

  private createNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseSource(loop = false) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = loop;
    return src;
  }

  startRaceAudio() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 4;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.detune.value = 7;
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.6;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    oscA.connect(filter);
    oscB.connect(bGain).connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(gain).connect(this.sfx);
    [oscA, oscB, sub].forEach((o) => o.start());
    this.engine = { oscA, oscB, sub, filter, gain };

    const wSrc = this.noiseSource(true);
    const wFilter = ctx.createBiquadFilter();
    wFilter.type = 'bandpass';
    wFilter.frequency.value = 600;
    wFilter.Q.value = 0.6;
    const wGain = ctx.createGain();
    wGain.gain.value = 0;
    wSrc.connect(wFilter).connect(wGain).connect(this.sfx);
    wSrc.start();
    this.wind = { src: wSrc, filter: wFilter, gain: wGain };

    const nSrc = this.noiseSource(true);
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.value = 1800;
    const nGain = ctx.createGain();
    nGain.gain.value = 0;
    nSrc.connect(nFilter).connect(nGain).connect(this.sfx);
    nSrc.start();
    this.nitroLoop = { src: nSrc, filter: nFilter, gain: nGain };

    const sSrc = this.noiseSource(true);
    const sFilter = ctx.createBiquadFilter();
    sFilter.type = 'bandpass';
    sFilter.frequency.value = 3200;
    sFilter.Q.value = 3;
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    sSrc.connect(sFilter).connect(this.scrapeGain).connect(this.sfx);
    sSrc.start();

    this.startMusic();
  }

  stopRaceAudio() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engine) {
      const e = this.engine;
      e.gain.gain.setTargetAtTime(0, t, 0.05);
      [e.oscA, e.oscB, e.sub].forEach((o) => o.stop(t + 0.3));
      this.engine = null;
    }
    for (const loop of [this.wind, this.nitroLoop]) {
      if (loop) {
        loop.gain.gain.setTargetAtTime(0, t, 0.05);
        loop.src.stop(t + 0.3);
      }
    }
    this.wind = null;
    this.nitroLoop = null;
    this.scrapeGain = null;
    this.stopMusic();
  }

  /** Called every frame with the player's state. */
  updateEngine(speed: number, rpm: number, throttle: number, nitro: boolean, paused: boolean) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const base = 38 + rpm * 120;
    this.engine.oscA.frequency.setTargetAtTime(base, t, 0.04);
    this.engine.oscB.frequency.setTargetAtTime(base * 1.5, t, 0.04);
    this.engine.sub.frequency.setTargetAtTime(base * 0.5, t, 0.04);
    this.engine.filter.frequency.setTargetAtTime(500 + rpm * 1800 + throttle * 900, t, 0.05);
    this.engine.gain.gain.setTargetAtTime(paused ? 0 : 0.11 + throttle * 0.07, t, 0.08);
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(paused ? 0 : Math.min(0.25, speed / 300), t, 0.1);
      this.wind.filter.frequency.setTargetAtTime(300 + speed * 12, t, 0.1);
    }
    if (this.nitroLoop) this.nitroLoop.gain.gain.setTargetAtTime(nitro && !paused ? 0.22 : 0, t, 0.06);
  }

  setScrape(amount: number) {
    if (!this.ctx || !this.scrapeGain) return;
    this.scrapeGain.gain.setTargetAtTime(Math.min(0.3, amount), this.ctx.currentTime, 0.03);
  }

  private burst(duration: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass', q = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  private tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', when = 0, slideTo?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  crash(intensity: number) {
    const i = Math.min(1, intensity / 40);
    this.burst(0.5 + i * 0.6, 900, 0.5 + i * 0.5);
    this.burst(0.25, 3500, 0.25 * (0.5 + i), 'bandpass', 2);
    this.tone(90, 0.4, 0.4 * (0.5 + i), 'sine', 0, 40);
  }

  wreck() {
    this.burst(1.4, 600, 0.9);
    this.burst(0.8, 2500, 0.4, 'bandpass', 1.5);
    this.tone(70, 0.9, 0.6, 'triangle', 0, 30);
  }

  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 0.5);
  }

  nitroIgnite() {
    this.burst(0.6, 1200, 0.35, 'highpass');
    this.tone(180, 0.5, 0.12, 'sawtooth', 0, 520);
  }

  countdownBeep(go: boolean) {
    this.tone(go ? 880 : 440, go ? 0.6 : 0.25, 0.25, 'square');
  }

  ui(kind: 'hover' | 'click' | 'back' = 'click') {
    if (kind === 'hover') this.tone(1400, 0.05, 0.03, 'sine');
    else if (kind === 'back') this.tone(500, 0.1, 0.06, 'triangle', 0, 300);
    else this.tone(700, 0.08, 0.07, 'triangle', 0, 1100);
  }

  stunt() {
    [660, 880, 1320].forEach((f, i) => this.tone(f, 0.15, 0.1, 'triangle', i * 0.06));
  }

  /** Short airy swing; `gain` lets distant fights be quieter. */
  swing(gain = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(2200, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * gain, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 0.2);
  }

  punch(gain = 1) {
    this.burst(0.12, 700, 0.6 * gain);
    this.tone(150, 0.12, 0.45 * gain, 'sine', 0, 60);
  }

  kick(gain = 1) {
    this.burst(0.18, 500, 0.75 * gain);
    this.tone(110, 0.2, 0.6 * gain, 'sine', 0, 45);
  }

  weaponHit(weapon: 'bat' | 'chain', gain = 1) {
    if (weapon === 'bat') {
      this.burst(0.08, 3000, 0.5 * gain, 'bandpass', 3);
      this.tone(220, 0.16, 0.4 * gain, 'triangle', 0, 90);
      this.burst(0.2, 600, 0.6 * gain);
    } else {
      [1800, 2400, 3100].forEach((f, i) => this.tone(f, 0.25, 0.08 * gain, 'square', i * 0.02));
      this.burst(0.15, 900, 0.5 * gain);
    }
  }

  block(gain = 1) {
    this.tone(900, 0.18, 0.18 * gain, 'square', 0, 700);
    this.tone(1350, 0.14, 0.1 * gain, 'triangle');
    this.burst(0.06, 4000, 0.25 * gain, 'highpass');
  }

  pickup() {
    [523, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 0.12, 'square', i * 0.05));
  }

  weaponBreak() {
    this.burst(0.25, 2500, 0.4, 'bandpass', 2);
    this.tone(300, 0.25, 0.2, 'sawtooth', 0, 80);
  }

  knockout() {
    this.tone(196, 0.18, 0.18, 'square');
    this.tone(294, 0.18, 0.18, 'square', 0.12);
    this.tone(392, 0.4, 0.2, 'square', 0.24);
  }

  victory(win: boolean) {
    const notes = win ? [523, 659, 784, 1047, 784, 1047] : [440, 415, 392, 330];
    notes.forEach((f, i) => this.tone(f, 0.3, 0.14, win ? 'square' : 'triangle', i * 0.14));
  }

  /** Plays public/audio/race-music.mp3 if present; otherwise falls back to the procedural beat. */
  private startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    if (this.musicMissing) {
      this.startProceduralMusic();
      return;
    }
    if (this.musicEl) {
      void this.musicEl.play().catch(() => {});
      return;
    }
    const el = new Audio(MUSIC_URL);
    el.loop = true;
    el.preload = 'auto';
    this.musicEl = el;
    this.ctx.createMediaElementSource(el).connect(this.music);
    const fallback = () => {
      if (this.musicEl !== el) return;
      this.disposeMusicEl();
      this.musicMissing = true;
      if (this.engine) this.startProceduralMusic();
    };
    el.addEventListener('error', fallback, { once: true });
    el.play().catch(fallback);
  }

  private disposeMusicEl() {
    if (!this.musicEl) return;
    this.musicEl.pause();
    this.musicEl.removeAttribute('src');
    this.musicEl.load();
    this.musicEl = null;
  }

  /** Lightweight procedural driving beat (bass + hats) as background music. */
  private startProceduralMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    const ctx = this.ctx;
    const bpm = 128;
    const stepDur = 60 / bpm / 4;
    const bassline = [41, 41, 53, 41, 44, 44, 56, 44, 39, 39, 51, 39, 46, 46, 58, 46];
    let step = 0;
    let nextTime = ctx.currentTime + 0.1;
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const schedule = () => {
      while (nextTime < ctx.currentTime + 0.2) {
        const t = nextTime;
        const bar = Math.floor(step / 16) % 4;
        if (step % 2 === 0) {
          const note = bassline[((step / 2) % 8) + (bar % 2) * 8];
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = midi(note);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(900, t);
          f.frequency.exponentialRampToValueAtTime(200, t + stepDur * 1.8);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.5, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.9);
          osc.connect(f).connect(g).connect(this.music);
          osc.start(t);
          osc.stop(t + stepDur * 2);
        }
        if (step % 4 === 0) {
          const k = ctx.createOscillator();
          k.frequency.setValueAtTime(140, t);
          k.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          const kg = ctx.createGain();
          kg.gain.setValueAtTime(0.9, t);
          kg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          k.connect(kg).connect(this.music);
          k.start(t);
          k.stop(t + 0.2);
        }
        if (step % 2 === 1) {
          const h = this.noiseSource();
          const hf = ctx.createBiquadFilter();
          hf.type = 'highpass';
          hf.frequency.value = 7000;
          const hg = ctx.createGain();
          hg.gain.setValueAtTime(0.18, t);
          hg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          h.connect(hf).connect(hg).connect(this.music);
          h.start(t);
          h.stop(t + 0.06);
        }
        step++;
        nextTime += stepDur;
      }
    };
    this.musicTimer = window.setInterval(schedule, 50);
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.disposeMusicEl();
    this.musicMissing = false;
  }

  private pauseMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.musicEl?.pause();
  }

  suspend(paused: boolean) {
    if (!this.ctx) return;
    if (paused) this.pauseMusic();
    else if (this.engine) this.startMusic();
  }
}

export const audio = new AudioEngine();
