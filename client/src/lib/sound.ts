class SoundManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = 0.35;
    }
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
}

export const soundManager = new SoundManager();
