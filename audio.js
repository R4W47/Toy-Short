"use strict";

// =====================================================================
// SONIDO Y MÚSICA DE TOY SORT (mismo motor que Marshmallow Pals)
// =====================================================================
// Todo el audio se genera aquí mismo con la Web Audio API del navegador:
// no hay archivos de sonido ni grabaciones de terceros.
// - Los efectos son sintetizados.
// - La música son canciones infantiles tradicionales de DOMINIO PÚBLICO
//   (melodías de más de 100 años), con arreglos propios escritos abajo nota por nota.
//   No se usa ninguna grabación ni arreglo de otra persona, así que no hay licencias.
//
// Uso desde index.html:
//   Sound.play("place", { k: 1 })       efecto de sonido
//   Sound.music("menu")                 canción (o "game1".."game4"; null = silencio)
//   Sound.settings                      { music: true/false, sfx: true/false }
//   Sound.setMusic(bool) / Sound.setSfx(bool)

window.Sound = (() => {
  const SETTINGS_KEY = "toysort.sound.v1";

  // ---------- Volúmenes (0 a 1) ----------
  const VOLUME = {
    master: 0.9,
    music: 0.24,   // la música de fondo (antes 0.15: se perdía frente a las piezas)
    sfx: 0.4,      // efectos de las piezas (antes 0.55: tapaban la música)
  };

  // ---------- Preferencias guardadas ----------
  const settings = { music: true, sfx: true };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (saved) Object.assign(settings, saved);
  } catch (e) { /* sin acceso a localStorage: se usan los valores por defecto */ }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* nada */ }
  }

  // ---------- Motor de audio ----------
  // Los navegadores no dejan sonar nada hasta que el jugador toca la pantalla,
  // así que el contexto se crea (o se reanuda) con el primer toque.
  let ctx = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuffer = null;
  let unlocked = false;

  function setup() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // navegador sin Web Audio: el juego funciona en silencio
    ctx = new AC();

    // un compresor suave al final evita que las explosiones grandes "revienten"
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;

    const master = ctx.createGain();
    master.gain.value = VOLUME.master;
    master.connect(comp).connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = settings.music ? VOLUME.music : 0;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = settings.sfx ? VOLUME.sfx : 0;
    sfxBus.connect(master);

    // ruido blanco (para olas, percusión, explosiones)
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function unlock() {
    setup();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    if (!unlocked) {
      unlocked = true;
      if (wantedTheme) startTheme(wantedTheme);
    }
  }
  for (const type of ["pointerdown", "keydown", "touchend"]) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }

  // Al salir de la app (otra pestaña, pantalla apagada) se pausa todo
  document.addEventListener("visibilitychange", () => {
    if (!ctx || !unlocked) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  const ready = () => ctx && unlocked && ctx.state === "running";
  const now = () => ctx.currentTime;
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- Bloques básicos de síntesis ----------

  // Envolvente: sube rápido, se sostiene y se apaga de forma natural
  function envelope(param, t, { attack = 0.005, peak = 1, hold = 0, decay = 0.3 }) {
    peak = Math.max(peak, 0.0002);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + attack);
    if (hold > 0) param.setValueAtTime(peak, t + attack + hold);
    const end = t + attack + hold + decay;
    param.exponentialRampToValueAtTime(0.0001, end);
    return end;
  }

  // Un oscilador con su propia envolvente. freq puede ser un número o [desde, hasta]
  function osc(dest, t, { type = "sine", freq = 440, vol = 0.3, attack, hold, decay = 0.3,
                          detune = 0, glide = null, vibrato = 0 }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.detune.value = detune;
    if (Array.isArray(freq)) {
      o.frequency.setValueAtTime(freq[0], t);
      o.frequency.exponentialRampToValueAtTime(freq[1], t + (glide || decay));
    } else {
      o.frequency.setValueAtTime(freq, t);
    }
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(vibrato, t + 0.25);
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + (attack || 0.005) + (hold || 0) + decay + 0.05);
    }
    const end = envelope(g.gain, t, { attack, peak: vol, hold, decay });
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(end + 0.05);
    return end;
  }

  // Ráfaga de ruido filtrado (percusión, aire, chispas)
  function noise(dest, t, { vol = 0.3, attack = 0.002, hold = 0, decay = 0.1,
                            filter = "highpass", freq = 2000, freqTo = null, q = 0.7 }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + attack + hold + decay);
    const g = ctx.createGain();
    const end = envelope(g.gain, t, { attack, peak: vol, hold, decay });
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(end + 0.05);
    return end;
  }

  // ---------- Instrumentos (los usan la música y algunos efectos) ----------
  const INSTRUMENTS = {
    // cajita de música: campanita brillante que se queda sonando
    musicbox(dest, t, f, len, v = 1) {
      osc(dest, t, { freq: f, vol: 0.22 * v, decay: 1.1 });
      osc(dest, t, { freq: f * 2.76, vol: 0.06 * v, decay: 0.45 });
      osc(dest, t, { freq: f * 5.4, vol: 0.025 * v, decay: 0.15 });
    },
    // piano de juguete: golpe metálico corto
    toypiano(dest, t, f, len, v = 1) {
      osc(dest, t, { type: "triangle", freq: f, vol: 0.22 * v, decay: Math.min(0.6, 0.2 + len * 0.6) });
      osc(dest, t, { freq: f * 3.98, vol: 0.05 * v, decay: 0.12 });
      osc(dest, t, { freq: f * 2.01, vol: 0.06 * v, decay: 0.25 });
    },
    // xilófono de madera
    xylo(dest, t, f, len, v = 1) {
      osc(dest, t, { freq: f, vol: 0.3 * v, decay: Math.min(0.45, 0.2 + len * 0.3) });
      osc(dest, t, { freq: f * 3.93, vol: 0.06 * v, decay: 0.05 });
      noise(dest, t, { vol: 0.015 * v, decay: 0.02, filter: "bandpass", freq: f * 4, q: 2 });
    },
    // kalimba (piano de pulgares): ataque con "clic" y cola dulce
    kalimba(dest, t, f, len, v = 1) {
      osc(dest, t, { freq: f, vol: 0.27 * v, decay: 0.7 });
      osc(dest, t, { freq: f * 5.95, vol: 0.06 * v, decay: 0.05 });
      osc(dest, t, { type: "triangle", freq: f * 2, vol: 0.04 * v, decay: 0.2 });
    },
    // flauta dulce
    flute(dest, t, f, len, v = 1) {
      osc(dest, t, { type: "triangle", freq: f, vol: 0.2 * v, attack: 0.04,
                     hold: Math.max(0, len - 0.1), decay: 0.15, vibrato: f * 0.01 });
      noise(dest, t, { vol: 0.01 * v, attack: 0.03, hold: Math.max(0, len - 0.08), decay: 0.08,
                       filter: "bandpass", freq: f * 2, q: 3 });
    },
    // acordes punteados
    pluck(dest, t, f, len, v = 1) {
      osc(dest, t, { type: "triangle", freq: f, vol: 0.08 * v, decay: 0.22 });
    },
    // colchón suave (acordes largos)
    pad(dest, t, f, len, v = 1) {
      osc(dest, t, { type: "triangle", freq: f, vol: 0.045 * v, attack: 0.2, hold: Math.max(0, len - 0.3), decay: 0.4, detune: -6 });
      osc(dest, t, { type: "sine", freq: f, vol: 0.045 * v, attack: 0.2, hold: Math.max(0, len - 0.3), decay: 0.4, detune: 6 });
    },
    // bajo redondito
    bass(dest, t, f, len, v = 1) {
      osc(dest, t, { type: "triangle", freq: f, vol: 0.28 * v, attack: 0.01, hold: Math.max(0, len * 0.5), decay: 0.12 });
      osc(dest, t, { freq: f, vol: 0.18 * v, attack: 0.01, hold: Math.max(0, len * 0.5), decay: 0.12 });
    },
  };

  const DRUMS = {
    kick: (d, t, v = 1) => osc(d, t, { freq: [130, 45], vol: 0.45 * v, decay: 0.16, glide: 0.12 }),
    snare: (d, t, v = 1) => noise(d, t, { vol: 0.08 * v, decay: 0.09, freq: 1800 }),
    hat: (d, t, v = 1) => noise(d, t, { vol: 0.035 * v, decay: 0.035, freq: 7000 }),
    shaker: (d, t, v = 1) => noise(d, t, { vol: 0.03 * v, attack: 0.02, decay: 0.05, filter: "bandpass", freq: 6000, q: 1 }),
    tom: (d, t, v = 1) => osc(d, t, { freq: [210, 120], vol: 0.25 * v, decay: 0.22 }),
    conga: (d, t, v = 1) => osc(d, t, { freq: [360, 250], vol: 0.18 * v, decay: 0.12 }),
    // cascabeles de trineo (dos sacudidas rapiditas)
    sleigh: (d, t, v = 1) => {
      noise(d, t, { vol: 0.03 * v, attack: 0.003, decay: 0.07, filter: "bandpass", freq: 8500, q: 2 });
      noise(d, t + 0.035, { vol: 0.02 * v, attack: 0.003, decay: 0.06, filter: "bandpass", freq: 9500, q: 2 });
    },
    clap: (d, t, v = 1) => noise(d, t, { vol: 0.06 * v, decay: 0.08, filter: "bandpass", freq: 1500, q: 1.2 }),
  };

  // =====================================================================
  // EFECTOS DE SONIDO
  // =====================================================================

  const lastPlayed = {};
  const MIN_GAP = { pick: 0.03, up: 0.03, place: 0.03, slot: 0.04, click: 0.04, coin: 0.05 };
  const DO_MI_SOL = [72, 76, 79]; // cada juguete que entra en la vitrina sube una nota

  const SFX = {
    // tocar un juguete: "pop" suavecito
    pick(d, t) {
      osc(d, t, { freq: [600, 900], vol: 0.18, decay: 0.07, glide: 0.05 });
      noise(d, t, { vol: 0.03, decay: 0.03, filter: "bandpass", freq: 2500, q: 2 });
    },
    // el juguete sube volando hacia su caja: "fiuuu" que sube (más agudo con cada juguete de la caja)
    up(d, t, { k = 0 } = {}) {
      const b = 520 * Math.pow(1.26, k);
      osc(d, t, { type: "sine", freq: [b, b * 2.2], vol: 0.14, attack: 0.01, decay: 0.26, glide: 0.24 });
      osc(d, t, { type: "triangle", freq: [b * 1.5, b * 3.3], vol: 0.04, attack: 0.01, decay: 0.2, glide: 0.2 });
      noise(d, t, { vol: 0.05, attack: 0.03, decay: 0.2, filter: "bandpass", freq: 1500, freqTo: 5000, q: 1.6 });
    },
    // el juguete cae en la vitrina: notita de xilófono (do, mi, sol)
    place(d, t, { k = 0 } = {}) {
      INSTRUMENTS.xylo(d, t, midiToFreq(DO_MI_SOL[Math.max(0, Math.min(2, k))]), 0.15, 1);
    },
    // vitrina llena: "¡pum!" de confeti, arpegio brillante, acorde y lluvia de destellos
    box(d, t, { combo = 1 } = {}) {
      const up = Math.min(combo - 1, 4) * 2; // si se llenan cajas seguidas, suena cada vez más agudo
      osc(d, t, { freq: [220, 70], vol: 0.3, decay: 0.16, glide: 0.12 });                      // golpe
      noise(d, t, { vol: 0.16, attack: 0.002, decay: 0.18, filter: "bandpass", freq: 1800, q: 0.8 }); // confeti
      [72, 76, 79, 84, 88].forEach((m, i) => INSTRUMENTS.toypiano(d, t + 0.04 + i * 0.055, midiToFreq(m + up), 0.12, 1));
      [72, 76, 79].forEach((m) => INSTRUMENTS.musicbox(d, t + 0.33, midiToFreq(m + 12 + up), 0.5, 0.8));
      for (let i = 0; i < 6; i++) {                                                              // destellos
        osc(d, t + 0.35 + i * 0.06, { freq: midiToFreq(96 + ((i * 5) % 12) + up), vol: 0.035, decay: 0.12 });
      }
      noise(d, t + 0.3, { vol: 0.06, attack: 0.05, decay: 0.5, filter: "highpass", freq: 7000 });
    },
    // el juguete va a la espera: golpecito de madera grave
    slot(d, t) {
      osc(d, t, { type: "triangle", freq: [330, 220], vol: 0.2, decay: 0.12, glide: 0.08 });
      noise(d, t, { vol: 0.05, decay: 0.04, filter: "bandpass", freq: 900, q: 1.5 });
    },
    // la espera casi llena: aviso de dos notas
    warn(d, t) {
      osc(d, t, { type: "triangle", freq: 494, vol: 0.13, decay: 0.1 });
      osc(d, t + 0.12, { type: "triangle", freq: 440, vol: 0.13, decay: 0.14 });
    },
    // botones
    click(d, t) {
      osc(d, t, { freq: [520, 760], vol: 0.18, decay: 0.07, glide: 0.04 });
    },
    // monedas
    coin(d, t) {
      osc(d, t, { type: "square", freq: 988, vol: 0.05, decay: 0.06 });
      osc(d, t + 0.07, { type: "square", freq: 1319, vol: 0.05, decay: 0.2 });
      osc(d, t, { freq: 1976, vol: 0.06, decay: 0.25 });
    },
    // nivel superado: fanfarria de juguete
    win(d, t) {
      const notes = [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.52], [84, 0.64]];
      notes.forEach(([m, dt]) => INSTRUMENTS.toypiano(d, t + dt, midiToFreq(m), 0.15, 1.1));
      [60, 64, 67].forEach((m) => INSTRUMENTS.pad(d, t + 0.64, midiToFreq(m), 0.9, 1.4));
      noise(d, t + 0.64, { vol: 0.06, attack: 0.02, decay: 0.5, filter: "highpass", freq: 7000 });
    },
    // sin espacio: tres notas tristes hacia abajo
    lose(d, t) {
      [[67, 0], [63, 0.22], [60, 0.44]].forEach(([m, dt]) =>
        osc(d, t + dt, { type: "triangle", freq: midiToFreq(m), vol: 0.16, decay: dt > 0.4 ? 0.6 : 0.2, vibrato: dt > 0.4 ? 4 : 0 }));
    },
    // potenciadores
    boost(d, t) { // genérico: destello mágico
      noise(d, t, { vol: 0.12, attack: 0.08, decay: 0.25, filter: "bandpass", freq: 800, freqTo: 6000, q: 1.2 });
      [79, 84, 88].forEach((m, i) => INSTRUMENTS.musicbox(d, t + 0.12 + i * 0.05, midiToFreq(m), 0.1, 0.6));
    },
    magnet(d, t) { // zumbido que sube
      osc(d, t, { type: "sawtooth", freq: [180, 720], vol: 0.05, attack: 0.05, decay: 0.35, glide: 0.35 });
      osc(d, t, { freq: [360, 1440], vol: 0.12, attack: 0.05, decay: 0.35, glide: 0.35 });
    },
    undo(d, t) { // "rebobinar"
      osc(d, t, { type: "triangle", freq: [900, 300], vol: 0.14, decay: 0.22, glide: 0.2 });
      noise(d, t, { vol: 0.06, attack: 0.02, decay: 0.2, filter: "bandpass", freq: 3000, freqTo: 800, q: 1.5 });
    },
    shuffle(d, t) { // barajar: varios "fiu"
      for (let i = 0; i < 4; i++) {
        noise(d, t + i * 0.07, { vol: 0.12, attack: 0.02, decay: 0.08, filter: "bandpass", freq: 1200 + i * 500, freqTo: 3000 + i * 500, q: 1.5 });
      }
    },
    unlock(d, t) { // vitrina que se abre / espacio extra
      osc(d, t, { type: "square", freq: 660, vol: 0.06, decay: 0.05 });
      [76, 81, 88].forEach((m, i) => INSTRUMENTS.musicbox(d, t + 0.08 + i * 0.07, midiToFreq(m), 0.2, 0.8));
    },
    // regalo de potenciador nuevo
    gift(d, t) {
      [72, 79, 84, 88, 91].forEach((m, i) => INSTRUMENTS.musicbox(d, t + i * 0.07, midiToFreq(m), 0.2, 0.75));
    },
  };

  function play(name, opts) {
    if (!settings.sfx || !ready() || !SFX[name]) return;
    const t = now() + 0.01;
    const gap = MIN_GAP[name];
    if (gap && lastPlayed[name] && t - lastPlayed[name] < gap) return;
    lastPlayed[name] = t;
    try { SFX[name](sfxBus, t, opts || {}); } catch (e) { /* un sonido nunca debe romper el juego */ }
  }

  // =====================================================================
  // MÚSICA: canciones infantiles tradicionales (dominio público), arreglos propios
  // =====================================================================
  // Formato (igual que Marshmallow Pals): cada "compás" tiene 8 casillas.
  // En estas canciones cada casilla es una SEMICORCHEA y cada compás dura 2 tiempos
  // (por eso el bpm escrito es el doble del tempo real): negra = "x . . .", blanca = "x . . . . . . .".
  //   "1".."7"  nota de la escala     "'" una octava arriba, "," una octava abajo
  //   "."       sigue sonando la nota anterior       "-"  silencio
  // Acordes en números romanos (I, ii, iii, IV, V, vi). Bajo: "R" fundamental, "5" quinta.
  // "sections": cómo se repite: "melody" = la canción, "arp" = arpegios suaves sobre los mismos acordes.

  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  const ROMAN = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5 };

  const TW_A = ["1 . . . 1 . . .", "5 . . . 5 . . .", "6 . . . 6 . . .", "5 . . . . . . .",
                "4 . . . 4 . . .", "3 . . . 3 . . .", "2 . . . 2 . . .", "1 . . . . . . ."];
  const TW_B = ["5 . . . 5 . . .", "4 . . . 4 . . .", "3 . . . 3 . . .", "2 . . . . . . ."];

  const THEMES = {
    // Portada: "Twinkle Twinkle Little Star" (melodía francesa del s. XVIII) en cajita de música
    menu: {
      key: 72, bpm: 168, lead: "musicbox", chordInst: "pad", chordPattern: "x . . . . . . .",
      bass: "R . . . . . . .", drums: {}, sections: ["melody", "arp"],
      chords: ["I", "I", "IV", "I", "IV", "I", "V", "I", "I", "IV", "I", "V", "I", "IV", "I", "V",
               "I", "I", "IV", "I", "IV", "I", "V", "I"],
      melody: [...TW_A, ...TW_B, ...TW_B, ...TW_A],
    },
    // Niveles 1, 5, 9...: "Mary Had a Little Lamb" (Lowell Mason, 1830) en piano de juguete
    game1: {
      key: 67, bpm: 220, lead: "toypiano", chordInst: "pluck", chordPattern: "- - x . - - x .",
      bass: "R . . . 5 . . .", drums: { kick: "x - - - - - - -", shaker: "- - x - - - x -" },
      sections: ["melody", "melody", "arp"],
      chords: ["I", "I", "I", "I", "V", "V", "I", "I", "I", "I", "I", "I", "V", "V", "I", "I"],
      melody: [
        "3 . . . 2 . . .", "1 . . . 2 . . .", "3 . . . 3 . . .", "3 . . . . . . .",
        "2 . . . 2 . . .", "2 . . . . . . .", "3 . . . 5 . . .", "5 . . . . . . .",
        "3 . . . 2 . . .", "1 . . . 2 . . .", "3 . . . 3 . . .", "3 . . . 3 . . .",
        "2 . . . 2 . . .", "3 . . . 2 . . .", "1 . . . . . . .", "- - - - - - - -",
      ],
    },
    // Niveles 2, 6, 10...: "London Bridge Is Falling Down" (tradicional inglesa) en xilófono
    game2: {
      key: 65, bpm: 216, lead: "xylo", chordInst: "pluck", chordPattern: "- - x . - - x .",
      bass: "R . . . 5 . . .", drums: { kick: "x - - - - - - -", hat: "- - x - - - x -" },
      sections: ["melody", "melody", "arp"],
      chords: ["I", "I", "V", "I", "I", "I", "V", "I"],
      melody: [
        "5 . . 6 5 . 4 .", "3 . 4 . 5 . . .", "2 . 3 . 4 . . .", "3 . 4 . 5 . . .",
        "5 . . 6 5 . 4 .", "3 . 4 . 5 . . .", "2 . . . 5 . . .", "3 . 1 . . . . .",
      ],
    },
    // Niveles 3, 7, 11...: "Old MacDonald Had a Farm" (tradicional) en kalimba
    game3: {
      key: 67, bpm: 232, lead: "kalimba", chordInst: "pluck", chordPattern: "- - x . - - x .",
      bass: "R . . . 5 . . .", drums: { kick: "x - - - - - - -", clap: "- - - - x - - -" },
      sections: ["melody", "melody", "arp"],
      chords: ["I", "I", "IV", "I", "I", "V", "I", "I", "I", "I", "IV", "I", "I", "V", "I", "I"],
      melody: [
        "1 . . . 1 . . .", "1 . . . 5, . . .", "6, . . . 6, . . .", "5, . . . . . . .",
        "3 . . . 3 . . .", "2 . . . 2 . . .", "1 . . . . . . .", "- - - - 5, . . .",
        "1 . . . 1 . . .", "1 . . . 5, . . .", "6, . . . 6, . . .", "5, . . . . . . .",
        "3 . . . 3 . . .", "2 . . . 2 . . .", "1 . . . . . . .", "- - - - - - - -",
      ],
    },
    // Niveles 4, 8, 12...: "Frère Jacques" (tradicional francesa) en flauta dulce
    game4: {
      key: 72, bpm: 208, lead: "flute", chordInst: "pad", chordPattern: "x . . . . . . .",
      bass: "R . . . 5 . . .", drums: { shaker: "- - x - - - x -" },
      sections: ["melody", "melody", "arp"],
      chords: ["I", "I", "I", "I", "I", "I", "I", "I", "I", "V", "I", "V", "I", "V", "I", "I"],
      melody: [
        "1 . . . 2 . . .", "3 . . . 1 . . .", "1 . . . 2 . . .", "3 . . . 1 . . .",
        "3 . . . 4 . . .", "5 . . . . . . .", "3 . . . 4 . . .", "5 . . . . . . .",
        "5 . 6 . 5 . 4 .", "3 . . . 1 . . .", "5 . 6 . 5 . 4 .", "3 . . . 1 . . .",
        "1 . . . 5, . . .", "1 . . . . . . .", "1 . . . 5, . . .", "1 . . . . . . .",
      ],
    },
  };

  // Convierte "5 . 1' -" en notas con duración (en corcheas)
  function parseLine(line) {
    const tokens = line.trim().split(/\s+/);
    const notes = [];
    tokens.forEach((tok, i) => {
      if (tok === "." || tok === "-") return;
      let len = 1;
      while (tokens[i + len] === ".") len++;
      notes.push({ step: i, len, tok });
    });
    return notes;
  }

  // Grado de la escala (con octavas) a nota MIDI
  function degreeToMidi(tok, key) {
    const m = tok.match(/^(\d)([#b]?)([',]*)$/); // "4#" = cuarto grado medio tono arriba
    if (!m) return null;
    const deg = Number(m[1]) - 1;
    let octave = 0;
    for (const c of m[3]) octave += c === "'" ? 1 : -1;
    return key + SCALE[deg] + 12 * octave + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  }

  // Notas del acorde (fundamental, tercera, quinta) en MIDI
  function chordMidi(roman, key) {
    const d = ROMAN[roman];
    return [0, 2, 4].map((k) => {
      const idx = d + k;
      return key + SCALE[idx % 7] + 12 * Math.floor(idx / 7);
    });
  }

  // Prepara una canción: precalcula todas las notas de cada compás
  function compile(theme) {
    const bars = theme.chords.map((roman, b) => {
      let chord = chordMidi(roman, theme.key - 12);
      while (chord[0] < 52) chord = chord.map((m) => m + 12); // que no quede muy grave
      while (chord[0] > 63) chord = chord.map((m) => m - 12);
      const root = chord[0] - 12; // bajo una octava más abajo
      return {
        chord,
        melody: parseLine(theme.melody[b]).map((n) => ({ ...n, midi: degreeToMidi(n.tok, theme.key) })),
        bass: parseLine(theme.bass).map((n) => ({
          ...n, midi: n.tok === "5" ? root + 7 : n.tok === "O" ? root + 12 : root,
        })),
        chords: parseLine(theme.chordPattern),
        // puente: arpegio de corcheas sobre el acorde
        arp: [0, 1, 2, 1, 2, 0, 1, 2].map((k, i) => ({
          step: i, len: 1, midi: chord[k] + 12 + (i === 4 ? 12 : 0),
        })),
      };
    });
    const drums = Object.entries(theme.drums || {}).map(([name, pattern]) => ({
      name, hits: pattern.trim().split(/\s+/).map((x) => x === "x"),
    }));
    return { ...theme, bars, drums };
  }

  const compiled = {};
  const themeFor = (id) => (compiled[id] = compiled[id] || compile(THEMES[id] || THEMES.menu));

  // ---------- Reproductor con "mirada hacia adelante" ----------
  // Cada 25 ms se programan las notas de los próximos 120 ms: así el ritmo
  // queda exacto aunque el navegador esté ocupado animando el tablero.
  const LOOKAHEAD = 0.12;
  const SECTIONS = ["melody", "melody", "arp"]; // si la canción no dice otra cosa: tema, tema, puente

  let wantedTheme = null; // la canción que debería sonar (aunque aún no se pueda)
  let current = null;     // { id, theme, out, step, next, timer }

  function scheduleStep(song, t) {
    const { theme } = song;
    const barCount = theme.bars.length;
    const totalSteps = barCount * 8;
    const secs = theme.sections || SECTIONS;
    const section = secs[Math.floor(song.step / totalSteps) % secs.length];
    const barIdx = Math.floor(song.step / 8) % barCount;
    const pos = song.step % 8;
    const bar = theme.bars[barIdx];
    const eighth = 60 / theme.bpm / 2;
    const out = song.out;
    const lead = INSTRUMENTS[theme.lead];

    const lineNotes = section === "arp" ? bar.arp : bar.melody;
    for (const n of lineNotes) {
      if (n.step === pos && n.midi != null) {
        lead(out, t, midiToFreq(n.midi), n.len * eighth, section === "arp" ? 0.55 : 1);
      }
    }
    for (const n of bar.bass) {
      if (n.step === pos) INSTRUMENTS.bass(out, t, midiToFreq(n.midi), n.len * eighth);
    }
    for (const n of bar.chords) {
      if (n.step === pos) {
        for (const m of bar.chord) INSTRUMENTS[theme.chordInst](out, t, midiToFreq(m), n.len * eighth);
      }
    }
    for (const d of theme.drums) {
      if (d.hits[pos]) DRUMS[d.name](out, t);
    }
  }

  function tick(song) {
    if (current !== song || !ctx) return;
    while (song.next < now() + LOOKAHEAD) {
      if (song.next < now() - 0.2) song.next = now() + 0.05; // se atrasó (pestaña dormida)
      scheduleStep(song, song.next);
      song.next += 60 / song.theme.bpm / 2;
      song.step++;
    }
  }

  function stopCurrent(fade = 0.6) {
    if (!current) return;
    const song = current;
    current = null;
    clearInterval(song.timer);
    const t = now();
    song.out.gain.cancelScheduledValues(t);
    song.out.gain.setValueAtTime(song.out.gain.value, t);
    song.out.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => song.out.disconnect(), (fade + 1.5) * 1000);
  }

  function startTheme(id) {
    if (!ctx || !unlocked) return;
    if (current && current.id === id) return;
    stopCurrent();
    const theme = themeFor(id);
    const out = ctx.createGain();
    const t = now();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(1, t + 1.2);
    out.connect(musicBus);
    const song = { id, theme, out, step: 0, next: t + 0.15 };
    song.timer = setInterval(() => tick(song), 25);
    current = song;
    tick(song);
  }

  // Cambia la canción. null = silencio (con un desvanecido corto)
  function music(id) {
    wantedTheme = id;
    if (!ctx || !unlocked) return;
    if (id) startTheme(id);
    else stopCurrent(0.5);
  }

  // ---------- Preferencias ----------
  function fadeBus(bus, on, vol) {
    if (!ctx) return;
    const t = now();
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(on ? vol : 0, t + 0.25);
  }

  function setMusic(on) {
    settings.music = !!on;
    saveSettings();
    fadeBus(musicBus, settings.music, VOLUME.music);
  }

  function setSfx(on) {
    settings.sfx = !!on;
    saveSettings();
    fadeBus(sfxBus, settings.sfx, VOLUME.sfx);
  }

  return { play, music, settings, setMusic, setSfx, themes: Object.keys(THEMES) };
})();
