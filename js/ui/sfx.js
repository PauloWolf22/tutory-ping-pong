// Sons opcionais, sintetizados na hora: nenhum arquivo de áudio para licenciar ou carregar.
let ctx = null;
let enabled = false;

export const soundOn = () => enabled;

// Navegadores só liberam áudio depois de um gesto do usuário; o botão de som chama esta função.
export function setSound(on) {
  enabled = on;
  if (on) {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume?.();
  }
}

function tone(freq, start, dur, { type = 'sine', gain = 0.16, to = null } = {}) {
  if (!enabled || !ctx) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  point() { tone(1400, 0, 0.07, { type: 'triangle', gain: 0.22 }); tone(760, 0.03, 0.09, { type: 'triangle', gain: 0.12 }); },
  roll() { for (let i = 0; i < 12; i++) tone(900 + Math.random() * 800, i * 0.085, 0.05, { type: 'triangle', gain: 0.07 }); },
  reveal() { tone(220, 0, 0.5, { to: 880, gain: 0.14 }); tone(660, 0.32, 0.5, { gain: 0.14 }); tone(990, 0.42, 0.6, { gain: 0.08 }); },
  versus() { tone(90, 0, 0.5, { type: 'sawtooth', gain: 0.18, to: 45 }); tone(440, 0.02, 0.22, { type: 'square', gain: 0.07 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.42, { type: 'triangle', gain: 0.16 })); },
  fanfare() {
    const seq = [[523, 0], [523, 0.16], [523, 0.32], [659, 0.48], [784, 0.72], [1047, 1.0], [784, 1.22], [1047, 1.42]];
    seq.forEach(([f, t]) => { tone(f, t, 0.42, { type: 'sawtooth', gain: 0.08 }); tone(f / 2, t, 0.42, { type: 'triangle', gain: 0.12 }); });
    tone(1568, 1.42, 1.3, { gain: 0.1 });
  },
};
