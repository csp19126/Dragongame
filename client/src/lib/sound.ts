class SoundManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = 0.3;
    }
  }

  private ensureContext() {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.1) {
    if (!this.audioContext || !this.masterGain) return;
    this.ensureContext();

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = type;
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + duration);
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

  spinStart() {
    this.playTone(500, 0.06, 'sine', 0.12);
    setTimeout(() => this.playTone(600, 0.06, 'sine', 0.12), 30);
    setTimeout(() => this.playTone(700, 0.06, 'sine', 0.1), 60);
    setTimeout(() => this.playTone(800, 0.04, 'sine', 0.08), 90);
  }

  reelStop() {
    this.playTone(200, 0.08, 'square', 0.06);
    this.playNoise(0.05, 0.03);
  }

  win(isJackpot: boolean = false) {
    if (isJackpot) {
      this.playTone(440, 0.08, 'sine', 0.15);
      setTimeout(() => this.playTone(554, 0.08, 'sine', 0.15), 40);
      setTimeout(() => this.playTone(659, 0.08, 'sine', 0.15), 80);
      setTimeout(() => this.playTone(880, 0.12, 'sine', 0.18), 120);
      setTimeout(() => this.playTone(1047, 0.15, 'sine', 0.15), 170);
      setTimeout(() => this.playTone(1319, 0.2, 'sine', 0.12), 220);
    } else {
      this.playTone(523, 0.08, 'sine', 0.12);
      setTimeout(() => this.playTone(659, 0.1, 'sine', 0.12), 60);
      setTimeout(() => this.playTone(784, 0.12, 'sine', 0.1), 120);
    }
  }

  nearMiss() {
    this.playTone(300, 0.15, 'sine', 0.08);
    setTimeout(() => this.playTone(280, 0.15, 'sine', 0.08), 100);
    setTimeout(() => this.playTone(260, 0.2, 'sine', 0.06), 200);
    setTimeout(() => this.playTone(200, 0.3, 'sine', 0.04), 350);
  }

  nearMissReveal() {
    this.playTone(400, 0.06, 'square', 0.08);
    setTimeout(() => this.playTone(300, 0.08, 'square', 0.06), 50);
    setTimeout(() => this.playTone(200, 0.12, 'square', 0.04), 100);
    this.playNoise(0.15, 0.04);
  }

  bonus() {
    this.playTone(750, 0.06, 'sine', 0.12);
    setTimeout(() => this.playTone(900, 0.06, 'sine', 0.12), 30);
    setTimeout(() => this.playTone(1000, 0.08, 'sine', 0.12), 60);
    setTimeout(() => this.playTone(1200, 0.1, 'sine', 0.1), 100);
  }

  freeSpin() {
    this.playTone(554, 0.08, 'sine', 0.1);
    setTimeout(() => this.playTone(659, 0.08, 'sine', 0.1), 50);
    setTimeout(() => this.playTone(784, 0.1, 'sine', 0.08), 100);
  }

  streak() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.playTone(400 + i * 120, 0.06, 'sine', 0.1), i * 40);
    }
  }

  coinDrop() {
    this.playTone(600, 0.06, 'sine', 0.08);
    setTimeout(() => this.playTone(500, 0.08, 'sine', 0.06), 40);
  }

  tension() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this.playTone(150 + i * 30, 0.08, 'sine', 0.04);
      }, i * 80);
    }
  }
}

export const soundManager = new SoundManager();
