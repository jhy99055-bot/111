type SoundName = 'bet' | 'cashOut' | 'crash';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}

export function unlockAudio() {
  const context = getAudioContext();
  if (context?.state === 'suspended') void context.resume();
}

interface ToneOptions {
  type: OscillatorType;
  frequency: number;
  endFrequency?: number;
  start: number;
  duration: number;
  gain: number;
}

function scheduleTone(context: AudioContext, options: ToneOptions) {
  const t0 = context.currentTime + options.start;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.frequency, t0);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, t0 + options.duration);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(options.gain, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + options.duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(t0);
  oscillator.stop(t0 + options.duration + 0.02);
}

const SOUND_PATTERNS: Record<SoundName, ToneOptions[]> = {
  bet: [{ type: 'sine', frequency: 520, endFrequency: 780, start: 0, duration: 0.12, gain: 0.12 }],
  cashOut: [
    { type: 'triangle', frequency: 660, start: 0, duration: 0.2, gain: 0.12 },
    { type: 'triangle', frequency: 880, start: 0.08, duration: 0.2, gain: 0.12 },
    { type: 'triangle', frequency: 1320, start: 0.16, duration: 0.3, gain: 0.12 },
  ],
  crash: [
    { type: 'triangle', frequency: 320, endFrequency: 50, start: 0, duration: 0.7, gain: 0.2 },
    { type: 'sine', frequency: 110, endFrequency: 35, start: 0, duration: 0.9, gain: 0.18 },
  ],
};

export function playSound(name: SoundName) {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') void context.resume();
  SOUND_PATTERNS[name].forEach((tone) => scheduleTone(context, tone));
}
