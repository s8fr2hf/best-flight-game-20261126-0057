// Procedural sound: the engine hum, the wind, and the chimes are all
// synthesised with WebAudio, so the game ships no audio files at all.
// Everything here is guarded — a browser with no audio, or a headless one
// taking screenshots, simply stays silent.

export function makeAudio() {
  return {
    context: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    windGain: null,
    windSource: null,
    muted: false,
    started: false,
  };
}

export function startAudio(audio) {
  if (audio.started) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audio.context = ctx;
    // Engine: two detuned saws through a low-pass, the way a prop sounds.
    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 62;
    audio.engineOsc2 = ctx.createOscillator();
    audio.engineOsc2.type = 'sawtooth';
    audio.engineOsc2.frequency.value = 93;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(filter);
    audio.engineOsc2.connect(filter);
    filter.connect(audio.engineGain);
    audio.engineGain.connect(ctx.destination);
    audio.engineOsc.start();
    audio.engineOsc2.start();
    // Wind: looped filtered noise, louder the faster you fly.
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    audio.windSource = ctx.createBufferSource();
    audio.windSource.buffer = buffer;
    audio.windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    audio.windGain = ctx.createGain();
    audio.windGain.gain.value = 0;
    audio.windSource.connect(windFilter);
    windFilter.connect(audio.windGain);
    audio.windGain.connect(ctx.destination);
    audio.windSource.start();
    audio.started = true;
  } catch {
    audio.context = null;
  }
}

export function updateAudio(audio, plane) {
  if (!audio.context || audio.muted) return;
  const t = audio.context.currentTime;
  const rpm = 50 + plane.throttle * 70 + plane.speed * 0.4;
  audio.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
  audio.engineOsc2.frequency.setTargetAtTime(rpm * 1.5, t, 0.08);
  const engineLevel = plane.onGround && plane.speed < 1 ? 0.015 : 0.03 + plane.throttle * 0.05;
  audio.engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
  const windLevel = Math.min(0.09, Math.max(0, (plane.speed - 25) * 0.0016));
  audio.windGain.gain.setTargetAtTime(windLevel, t, 0.15);
}

function tone(audio, frequency, duration, type, level, when = 0) {
  if (!audio.context || audio.muted) return;
  const ctx = audio.context;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  const start = ctx.currentTime + when;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export function playRingChime(audio) {
  tone(audio, 880, 0.35, 'sine', 0.16);
  tone(audio, 1318, 0.45, 'sine', 0.12, 0.07);
}

export function playLandChime(audio) {
  tone(audio, 523, 0.3, 'sine', 0.15);
  tone(audio, 659, 0.3, 'sine', 0.15, 0.12);
  tone(audio, 784, 0.6, 'sine', 0.15, 0.24);
}

export function playCrashThud(audio) {
  tone(audio, 70, 0.7, 'triangle', 0.3);
  tone(audio, 48, 0.9, 'sine', 0.25, 0.05);
}

export function playClick(audio) {
  tone(audio, 660, 0.08, 'square', 0.06);
}
