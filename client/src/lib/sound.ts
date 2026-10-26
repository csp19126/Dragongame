class SoundManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private static VOLUME = 0.35;

  constructor() {
    try { this.muted = localStorage.getItem('muted') === '1'; } catch {}
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = this.muted ? 0 : SoundManager.VOLUME;
    }
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try { localStorage.setItem('muted', muted ? '1' : '0'); } catch {}
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : SoundManager.VOLUME;
  }

  private ensureContext() {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.1, delay: number = 0) {
    if (!this.audioContext || !this.masterGain) return;
    this.ensureContext();

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = type;
    osc.frequency.value = frequency;

    const t = this.audioContext.currentTime + delay;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.start(t);
    osc.stop(t + duration);
  }

  private playSweep(startFreq: number, endFreq: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.1, delay: number = 0) {
    if (!this.audioContext || !this.masterGain) return;
    this.ensureContext();

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = type;
    const t = this.audioContext.currentTime + delay;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.start(t);
    osc.stop(t + duration);
  }

  private playNoise(duration: number, volume: number = 0.05) {
    if (!this.audioContext || !this.masterGain) return;
    this.ensureContext();

    const bufferSize = this.audioContext.sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * volume;
    }

    const source = this.audioContext.createBufferSource();
    const gain = this.audioContext.createGain();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.masterGain);
    gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
    source.start();
  }

  private playChord(frequencies: number[], duration: number, type: OscillatorType = 'sine', volume: number = 0.06, delay: number = 0) {
    frequencies.forEach(f => this.playTone(f, duration, type, volume, delay));
  }

  spinStart() {
    this.playSweep(200, 600, 0.15, 'sine', 0.12);
    this.playTone(400, 0.05, 'square', 0.04);
    setTimeout(() => this.playSweep(300, 800, 0.12, 'sine', 0.1), 50);
    setTimeout(() => {
      this.playTone(500, 0.04, 'sine', 0.08);
      this.playTone(700, 0.04, 'sine', 0.06);
    }, 100);
    setTimeout(() => this.playSweep(500, 1200, 0.08, 'sine', 0.06), 140);
    this.playNoise(0.08, 0.03);
  }

  reelStop() {
    this.playTone(180, 0.12, 'square', 0.08);
    this.playTone(120, 0.08, 'sine', 0.04);
    this.playNoise(0.06, 0.04);
    setTimeout(() => this.playTone(90, 0.06, 'sine', 0.03), 30);
  }

  reelSlowing() {
    this.playSweep(800, 200, 0.4, 'sine', 0.06);
    for (let i = 0; i < 5; i++) {
      this.playTone(300 - i * 20, 0.08, 'sine', 0.04, i * 0.07);
    }
  }

  win(isJackpot: boolean = false) {
    if (isJackpot) {
      const notes = [440, 554, 659, 880, 1047, 1319, 1568];
      notes.forEach((f, i) => {
        this.playTone(f, 0.15, 'sine', 0.14, i * 0.06);
        this.playTone(f * 1.5, 0.12, 'sine', 0.06, i * 0.06 + 0.02);
      });
      setTimeout(() => {
        this.playChord([523, 659, 784, 1047], 0.5, 'sine', 0.08);
        this.coinShower();
      }, 500);
      setTimeout(() => {
        this.playChord([659, 784, 1047, 1319], 0.6, 'sine', 0.06);
      }, 900);
    } else {
      this.playChord([523, 659, 784], 0.12, 'sine', 0.1);
      setTimeout(() => this.playChord([659, 784, 1047], 0.15, 'sine', 0.08), 100);
      setTimeout(() => this.playTone(1047, 0.2, 'sine', 0.06), 200);
      setTimeout(() => this.coinDrop(), 250);
    }
  }

  nearMiss() {
    this.playSweep(500, 200, 0.3, 'sine', 0.1);
    setTimeout(() => this.playSweep(400, 150, 0.3, 'sine', 0.08), 150);
    setTimeout(() => {
      this.playTone(100, 0.4, 'sine', 0.06);
      this.playTone(103, 0.4, 'sine', 0.06);
    }, 350);
  }

  nearMissReveal() {
    this.playTone(350, 0.08, 'square', 0.1);
    setTimeout(() => this.playTone(250, 0.1, 'square', 0.08), 50);
    setTimeout(() => {
      this.playTone(150, 0.15, 'square', 0.06);
      this.playNoise(0.2, 0.05);
    }, 100);
    setTimeout(() => this.playSweep(200, 80, 0.3, 'sine', 0.04), 200);
  }

  bonus() {
    const notes = [750, 900, 1000, 1200, 1400, 1600];
    notes.forEach((f, i) => {
      this.playTone(f, 0.08, 'sine', 0.1, i * 0.04);
      if (i % 2 === 0) this.playTone(f / 2, 0.06, 'triangle', 0.04, i * 0.04);
    });
    setTimeout(() => this.playChord([1200, 1500, 1800], 0.2, 'sine', 0.06), 280);
  }

  freeSpin() {
    this.playSweep(400, 1200, 0.2, 'sine', 0.1);
    setTimeout(() => {
      this.playChord([784, 1047, 1319], 0.2, 'sine', 0.08);
      this.playTone(1568, 0.15, 'triangle', 0.04);
    }, 150);
    this.playNoise(0.06, 0.02);
  }

  streak() {
    for (let i = 0; i < 6; i++) {
      this.playTone(400 + i * 150, 0.08, 'sine', 0.1, i * 0.05);
      this.playTone(600 + i * 150, 0.06, 'triangle', 0.04, i * 0.05);
    }
    setTimeout(() => this.playChord([800, 1000, 1200], 0.15, 'sine', 0.06), 350);
  }

  coinDrop() {
    for (let i = 0; i < 4; i++) {
      this.playTone(2000 - i * 200, 0.04, 'sine', 0.06, i * 0.03);
      this.playTone(3000 - i * 300, 0.03, 'sine', 0.03, i * 0.03);
    }
    this.playNoise(0.05, 0.02);
  }

  coinShower() {
    for (let i = 0; i < 12; i++) {
      const freq = 1500 + Math.random() * 2000;
      this.playTone(freq, 0.04, 'sine', 0.04, i * 0.06);
      if (i % 3 === 0) this.playNoise(0.03, 0.015);
    }
  }

  tension() {
    for (let i = 0; i < 8; i++) {
      this.playTone(100 + i * 25, 0.12, 'sine', 0.05, i * 0.1);
      if (i > 3) this.playTone(100 + i * 25 + 3, 0.1, 'sine', 0.03, i * 0.1);
    }
    this.playSweep(80, 300, 0.8, 'sine', 0.03);
  }

  anticipation() {
    for (let i = 0; i < 4; i++) {
      this.playTone(200 + i * 50, 0.06, 'triangle', 0.06, i * 0.15);
    }
    this.playSweep(150, 400, 0.6, 'sine', 0.03);
  }

  bigWinFanfare() {
    const melody = [523, 659, 784, 1047, 784, 1047, 1319];
    melody.forEach((f, i) => {
      this.playTone(f, 0.18, 'sine', 0.12, i * 0.1);
      this.playTone(f / 2, 0.15, 'triangle', 0.04, i * 0.1);
    });
    setTimeout(() => {
      this.playChord([1047, 1319, 1568], 0.6, 'sine', 0.08);
      this.coinShower();
    }, 800);
    setTimeout(() => {
      this.playChord([1319, 1568, 2093], 0.8, 'sine', 0.06);
    }, 1200);
  }

  lossComfort() {
    this.playTone(400, 0.15, 'sine', 0.04);
    setTimeout(() => this.playTone(350, 0.2, 'sine', 0.03), 100);
  }

  /** A clear "you lost" for a gamble: a falling two-note buzz and a low thud */
  gambleLose() {
    this.playSweep(420, 160, 0.45, 'sawtooth', 0.06);
    this.playTone(90, 0.3, 'sine', 0.12, 0.05);
    setTimeout(() => this.playTone(220, 0.25, 'triangle', 0.06), 260);
    setTimeout(() => this.playTone(165, 0.4, 'triangle', 0.06), 420);
  }

  /** One coin flipping over */
  coinFlip() {
    this.playTone(1500, 0.03, 'triangle', 0.05);
    this.playTone(2200, 0.02, 'sine', 0.03, 0.02);
  }

  betChange() {
    this.playTone(800, 0.04, 'sine', 0.08);
    setTimeout(() => this.playTone(1000, 0.03, 'sine', 0.06), 25);
    this.playTone(1200, 0.02, 'triangle', 0.03, 0.04);
  }

  autoSpinToggle() {
    this.playSweep(400, 1000, 0.12, 'triangle', 0.1);
    setTimeout(() => this.playTone(1200, 0.06, 'sine', 0.06), 80);
  }

  buttonClick() {
    this.playTone(700, 0.03, 'square', 0.06);
    this.playTone(1400, 0.02, 'sine', 0.03);
  }

  multiplierHit(multiplier: number) {
    const base = 600;
    for (let i = 0; i < Math.min(multiplier, 5); i++) {
      this.playTone(base + i * 200, 0.1, 'sine', 0.1, i * 0.08);
      this.playTone(base + i * 200 + 5, 0.08, 'sine', 0.05, i * 0.08);
    }
    setTimeout(() => this.playChord([1000, 1250, 1500], 0.25, 'sine', 0.07), multiplier * 80);
  }

  diagonalWin() {
    this.playSweep(300, 1500, 0.25, 'sine', 0.1);
    setTimeout(() => this.playSweep(1500, 300, 0.15, 'sine', 0.06), 200);
    setTimeout(() => this.playChord([800, 1000, 1200], 0.2, 'sine', 0.08), 350);
  }

  countUp() {
    this.playTone(1200 + Math.random() * 400, 0.02, 'sine', 0.04);
  }

  /** Classic 777: the lever pulled and the reels whirring off */
  leverPull() {
    this.playNoise(0.12, 0.05);
    this.playSweep(140, 70, 0.18, 'square', 0.06);
    this.playSweep(250, 900, 0.22, 'sawtooth', 0.03, 0.06);
  }

  /** Classic 777: a reel slamming to a stop (each reel a little lower) */
  clunk(reel = 0) {
    this.playTone(130 - reel * 15, 0.14, 'square', 0.1);
    this.playTone(65 - reel * 6, 0.18, 'sine', 0.14);
    this.playNoise(0.05, 0.06);
    this.playTone(1800 - reel * 200, 0.025, 'triangle', 0.04, 0.01);
  }

  /** Classic 777: the ding-ding of a winning line, higher for bigger wins */
  bellDing(level = 0) {
    const base = 1046 + level * 131;
    this.playTone(base, 0.35, 'sine', 0.09);
    this.playTone(base * 2.01, 0.25, 'sine', 0.03);
    this.playTone(base * 1.26, 0.35, 'sine', 0.07, 0.11);
    this.playTone(base * 2.52, 0.25, 'sine', 0.025, 0.11);
  }

  /** The starting bell: a quick ring of a brass bell */
  raceBell() {
    for (let i = 0; i < 6; i++) {
      this.playTone(1320, 0.22, 'triangle', 0.09, i * 0.11);
      this.playTone(1980, 0.16, 'sine', 0.04, i * 0.11);
      this.playTone(2640, 0.1, 'sine', 0.02, i * 0.11);
    }
  }

  /** One stride of galloping hooves (call it every ~400 ms while the race runs) */
  hooves() {
    const beats = [0, 0.07, 0.13, 0.24];
    beats.forEach((d, i) => {
      this.playTone(85 + Math.random() * 30, 0.06, 'triangle', i === 3 ? 0.09 : 0.06, d);
      this.playTone(240 + Math.random() * 80, 0.025, 'square', 0.015, d);
    });
  }

  /** Social: a soft two-note chime for a notification or a new message */
  ping() {
    this.playTone(988, 0.12, 'sine', 0.07);
    this.playTone(1319, 0.18, 'sine', 0.06, 0.09);
  }

  /** Social: a little pop when a reaction is added */
  pop() {
    this.playSweep(500, 1100, 0.07, 'sine', 0.08);
  }

  /** Social: level up, a rising arpeggio with a sparkle on top */
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => this.playTone(f, 0.22, 'triangle', 0.08, i * 0.09));
    this.playChord([1047, 1319, 1568], 0.5, 'sine', 0.04, 0.4);
    this.playSweep(2000, 3200, 0.2, 'sine', 0.02, 0.45);
  }

  /** Darts: the swish of a dart leaving the hand */
  dartWhoosh() {
    if (!this.audioContext || !this.masterGain) return;
    this.ensureContext();
    const ctx = this.audioContext;
    const duration = 0.22;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    const t = ctx.currentTime;
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.start(t);
    source.stop(t + duration);
  }

  /** Darts: the thunk of a dart sinking into the board (a wire gives a little ting) */
  dartThunk(wire = false) {
    this.playTone(95, 0.12, 'sine', 0.22);
    this.playTone(180, 0.05, 'triangle', 0.08);
    this.playNoise(0.035, 0.08);
    if (wire) this.playTone(2400, 0.08, 'sine', 0.025, 0.01);
  }

  /** Darts: the dull clack of a dart hitting the wall and dropping */
  dartMiss() {
    this.playTone(320, 0.05, 'square', 0.05);
    this.playTone(140, 0.12, 'triangle', 0.06, 0.12);
  }

  /** Darts: a busted visit */
  dartBust() {
    this.playTone(196, 0.18, 'sawtooth', 0.06);
    this.playTone(147, 0.3, 'sawtooth', 0.06, 0.16);
  }

  /** Darts: the pub caller, in the time-honoured English (skipped when muted or without a voice) */
  caller(text: string) {
    if (this.muted) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB';
      const voice = synth.getVoices().find((v) => v.lang === 'en-GB') ?? synth.getVoices().find((v) => v.lang.startsWith('en'));
      if (voice) u.voice = voice;
      u.rate = 0.82;
      u.pitch = 0.9;
      synth.speak(u);
    } catch { /* no voice: the callout is on screen anyway */ }
  }

  /** The crowd roars as the winner crosses the line */
  cheer() {
    const ctx = this.audioContext;
    if (!ctx || !this.masterGain) return;
    this.ensureContext();
    const duration = 2.2;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.7;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.35);
    gain.gain.setValueAtTime(0.22, t + 1.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.start(t);
    source.stop(t + duration);
    // A few whistles over the roar
    this.playSweep(1800, 2600, 0.25, 'sine', 0.03, 0.3);
    this.playSweep(2000, 1500, 0.3, 'sine', 0.025, 0.8);
  }

  /** Football: boot meets ball, a deep thump with a slap on top */
  kick() {
    this.playSweep(180, 55, 0.14, 'sine', 0.22);
    this.playNoise(0.05, 0.08);
  }

  /** Football: the referee's whistle (two short peeps when `double`) */
  whistle(double = false) {
    this.playTone(2900, 0.16, 'square', 0.025);
    this.playTone(3050, 0.16, 'sine', 0.04);
    if (double) { this.playTone(2900, 0.3, 'square', 0.025, 0.22); this.playTone(3050, 0.3, 'sine', 0.04, 0.22); }
  }

  /** Football: ball off the woodwork, a ringing metal clang */
  clang() {
    [880, 1320, 2170, 3020].forEach((f, i) => this.playTone(f, 0.9 - i * 0.15, 'sine', 0.06 / (i + 1)));
    this.playNoise(0.04, 0.1);
  }

  /** Football: the keeper smothers it */
  thud() {
    this.playSweep(140, 70, 0.12, 'sine', 0.16);
    this.playNoise(0.08, 0.05);
  }

  /** Football: the crowd groans at a miss */
  groan() {
    this.playSweep(320, 180, 0.9, 'sawtooth', 0.025);
    this.playSweep(260, 150, 1.0, 'sawtooth', 0.02, 0.05);
  }

  /** Football: the stands clap a rhythm, clap-clap, clap-clap-clap */
  chant() {
    [0, 0.25, 0.75, 0.95, 1.15].forEach((d) => {
      const ctx = this.audioContext;
      if (!ctx || !this.masterGain) return;
      this.ensureContext();
      const len = Math.floor(ctx.sampleRate * 0.06);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      src.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      gain.gain.value = 0.35;
      src.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
      src.start(ctx.currentTime + d);
    });
  }
}

export const soundManager = new SoundManager();
