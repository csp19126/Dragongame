// Sound effect system for Vietnamese-market gaming
// Using Web Audio API for real-time sound generation

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

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = type;
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + duration);
  }

  spinStart() {
    // Spinning wheel sound - ascending tone
    this.playTone(400, 0.1, 'sine');
    setTimeout(() => this.playTone(500, 0.1, 'sine'), 50);
    setTimeout(() => this.playTone(600, 0.1, 'sine'), 100);
  }

  win(isJackpot: boolean = false) {
    if (isJackpot) {
      // Jackpot fanfare - ascending then descending
      this.playTone(440, 0.1, 'sine');
      setTimeout(() => this.playTone(550, 0.1, 'sine'), 50);
      setTimeout(() => this.playTone(660, 0.1, 'sine'), 100);
      setTimeout(() => this.playTone(880, 0.15, 'sine'), 150);
    } else {
      // Regular win - double beep
      this.playTone(523, 0.1, 'sine');
      setTimeout(() => this.playTone(659, 0.15, 'sine'), 100);
    }
  }

  bonus() {
    // Bonus round activation - sparkly sound
    this.playTone(750, 0.08, 'sine');
    setTimeout(() => this.playTone(900, 0.08, 'sine'), 40);
    setTimeout(() => this.playTone(1000, 0.12, 'sine'), 80);
  }

  freeSpin() {
    // Free spin notification - pleasant chime
    this.playTone(554, 0.1, 'sine');
    setTimeout(() => this.playTone(659, 0.15, 'sine'), 80);
  }

  streak() {
    // Consecutive win streak - escalating tones
    for (let i = 0; i < 3; i++) {
      setTimeout(() => this.playTone(400 + i * 100, 0.08, 'sine'), i * 60);
    }
  }

  coinDrop() {
    // Token/coin drop sound - descending
    this.playTone(600, 0.08, 'sine');
    setTimeout(() => this.playTone(500, 0.12, 'sine'), 50);
  }
}

export const soundManager = new SoundManager();
