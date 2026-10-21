/* =========================================================
   JGVRP Speedometer HUD v2 (speedometer analog, satuan MPH)
   API (dipanggil dari game / CEF):
     setSpeed(m/s -> MPH)     setRPM(0.0 - 1.0)
     setFuel(0-1 | 0-100)     setHealth(0-1 | 0-1000)   -> ENGINE HEALTH
     setGear(n)               setHeadlights(0 off | 1 low | 2 high)
     setSeatbelts(bool)       setEngine(bool)
     setOdometer(miles)       setOil(psi 0-100 | null)
   ========================================================= */

const MPS_TO_MPH = 2.236936;
const MAX_MPH = 160;        // skala speedometer
const MAX_RPM = 7;          // skala tachometer (x1000)
const REDLINE = 6;          // mulai zona merah (x1000)
const OIL_MAX = 100;        // skala oil pressure (psi)
const SEGS = 10;            // jumlah blok bar ENGINE / OIL

const NOOP_EL = document.createElement('div');   // pengaman kalau ada elemen yang dihapus dari HTML
const $ = (id) => document.getElementById(id) || NOOP_EL;
const elHud = $('hud');
const svg = $('dial');

function isTrueValue(val) { return val === true || val === 1 || val === "1" || val === "true"; }
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- Geometri gauge (derajat: 0 = kanan, searah jarum jam) ----------
const G = {
    spd:  { cx: 600, cy: 146, r: 118, start: 165, sweep: 210 },
    rpm:  { cx: 330, cy: 126, r: 66,  start: 150, sweep: 215 },
    fuel: { cx: 870, cy: 126, r: 66,  start: 205, sweep: 130 },
};
const pt = (g, r, a) => {
    const t = (a * Math.PI) / 180;
    return [g.cx + r * Math.cos(t), g.cy + r * Math.sin(t)];
};
const f1 = (n) => n.toFixed(1);
function arcPath(g, r) {
    const [x1, y1] = pt(g, r, g.start), [x2, y2] = pt(g, r, g.start + g.sweep);
    return `M${f1(x1)} ${f1(y1)}A${r} ${r} 0 ${g.sweep > 180 ? 1 : 0} 1 ${f1(x2)} ${f1(y2)}`;
}

// Tick + angka melingkar. o = { cls, ncls, n, major, labels[], lr, red(i), redNum(k) }
function ticks(g, o) {
    let s = '';
    for (let i = 0; i <= o.n; i++) {
        const a = g.start + (g.sweep * i) / o.n;
        const maj = i % o.major === 0;
        const len = maj ? 13 : 7;
        const [x1, y1] = pt(g, g.r - len, a), [x2, y2] = pt(g, g.r, a);
        s += `<line class="${o.cls}${o.red(i) ? ' rl' : ''}" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke-width="${maj ? 2.4 : 1.3}"/>`;
        if (maj) {
            const k = i / o.major;
            const [tx, ty] = pt(g, g.r - len - o.lr, a);
            s += `<text class="${o.ncls}${o.redNum(k) ? ' rl' : ''}" x="${f1(tx)}" y="${f1(ty)}" text-anchor="middle" dominant-baseline="central">${o.labels[k]}</text>`;
        }
    }
    return s;
}
const arcs = (g, id) =>
    `<path class="track" d="${arcPath(g, g.r + 6)}"/>` +
    `<path id="${id}" class="prog" d="${arcPath(g, g.r + 6)}" pathLength="100" stroke-dasharray="0 100"/>`;
const needle = (id, g, r0, r1) =>
    `<g id="${id}" class="ndl"><line class="nd" x1="${g.cx + r0}" y1="${g.cy}" x2="${g.cx + r1}" y2="${g.cy}"/></g>`;
const segs = (cls, x0, y) =>
    Array.from({ length: SEGS }, (_, i) => `<rect class="seg ${cls}" x="${x0 + i * 12}" y="${y}" width="10" height="7" rx="1.5"/>`).join('');

function buildDial() {
    const shell = 'M6 112C6 98 20 86 40 80L250 58C340 51 430 47 490 43L532 28C556 15 578 9 600 9C622 9 644 15 668 28L710 43C770 47 860 51 950 58L1160 80C1180 86 1194 98 1194 112C1190 142 1172 168 1148 182C1122 196 1088 201 1048 201L690 201C650 208 550 208 510 201L152 201C112 201 78 196 52 182C28 168 10 142 6 112Z';
    const bar = 'M30 150C80 164 120 166 200 166L470 166C505 166 525 178 548 186';
    let s = `
    <defs>
      <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1e25"/><stop offset=".35" stop-color="#0b0c10"/><stop offset="1" stop-color="#040406"/></linearGradient>
      <linearGradient id="rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient>
      <linearGradient id="rim2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".55" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>
      <linearGradient id="arcg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f7dff"/><stop offset="1" stop-color="#bfe3ff"/></linearGradient>
      <radialGradient id="dialg" cx=".5" cy=".45" r=".65"><stop offset="0" stop-color="#10131a"/><stop offset="1" stop-color="#030304"/></radialGradient>
      <clipPath id="clip"><path d="${shell}"/></clipPath>
    </defs>
    <path d="${shell}" fill="url(#shell)" stroke="url(#rim)" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="${bar}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.2"/>
    <g transform="translate(1200 0) scale(-1 1)"><path d="${bar}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.2"/></g>
    <path d="M218 168V196M972 168V196" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
    <g clip-path="url(#clip)">
      <circle cx="600" cy="146" r="134" fill="url(#dialg)" stroke="url(#rim2)" stroke-width="2.4"/>
      <circle cx="330" cy="126" r="74" fill="url(#dialg)" stroke="url(#rim2)" stroke-width="1.8"/>
      <circle cx="870" cy="126" r="74" fill="url(#dialg)" stroke="url(#rim2)" stroke-width="1.8"/>
    </g>`;

    // SPEED 0-160 MPH
    s += arcs(G.spd, 'spd-arc');
    s += ticks(G.spd, { cls: 'tk', ncls: 'n', n: 40, major: 5, lr: 14, labels: [0, 20, 40, 60, 80, 100, 120, 140, 160], red: () => false, redNum: () => false });
    s += needle('spd-needle', G.spd, 70, 104);

    // RPM x1000
    s += arcs(G.rpm, 'rpm-arc');
    s += ticks(G.rpm, { cls: 'tk', ncls: 'n sm', n: MAX_RPM * 2, major: 2, lr: 11, labels: [0, 1, 2, 3, 4, 5, 6, 7], red: (i) => i >= REDLINE * 2, redNum: (k) => k >= REDLINE });
    s += `<text class="lbl" x="342" y="148">RPM</text><text class="lbl sm" x="342" y="160">x1000</text>`;
    s += needle('rpm-needle', G.rpm, 10, 54) + `<circle class="pivot" cx="330" cy="126" r="4"/>`;

    // FUEL E - F
    s += arcs(G.fuel, 'fuel-arc').replace('class="prog"', 'class="prog hid"');
    s += ticks(G.fuel, { cls: 'tk fb', ncls: 'n sm', n: 20, major: 10, lr: 11, labels: ['E', '&#189;', 'F'], red: (i) => i <= 3, redNum: (k) => k === 0 });
    s += needle('fuel-needle', G.fuel, 10, 54) + `<circle class="pivot" cx="870" cy="126" r="4"/>`;
    s += '<svg id="fuel-ico" class="ico" x="858" y="138" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>';

    // Sayap kiri: ENGINE health
    s += '<svg id="eng-ico" class="ico" x="120" y="88" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6M3 12h2.2M5.2 8.5h3.1V6.3h5v2.2h2.1l1.5 2h3.1v6.2h-2.2l-1.4 1.8H8.8l-3.6-3.6z"/></svg>';
    s += segs('eg', 75, 124) + `<text id="eng-val" class="val" x="134" y="150" text-anchor="middle">100%</text>`;

    // Sayap kanan: OIL pressure
    s += '<svg id="oil-ico" class="ico" x="1050" y="88" width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 10h4.2l1.3-2h2V6.5H8V5h6v1.5h-2V8h2.5l2 1.8 5-2.8 1 1.2-6.6 7.3H8.4L7 13H2.5zM20.2 14.6c0-.9 1.1-2.3 1.1-2.3s1.1 1.4 1.1 2.3c0 .6-.5 1.1-1.1 1.1s-1.1-.5-1.1-1.1z"/></svg>';
    s += segs('og', 1006, 124) + `<text id="oil-val" class="val" x="1065" y="150" text-anchor="middle">0 psi</text>`;

    svg.innerHTML = s;
}
buildDial();

const eSegs = svg.querySelectorAll('.eg');
const oSegs = svg.querySelectorAll('.og');
const nSpd = $('spd-needle'), nRpm = $('rpm-needle'), nFuel = $('fuel-needle');
const aSpd = $('spd-arc'), aRpm = $('rpm-arc');

// ---------- State ----------
const state = {
    mph: 0, mps: 0,          // kecepatan (float)
    rpm: 0, fuel: 0, health: 1,
    oilOverride: null,
    belted: false,
    engine: false,           // dari setEngine(); alarm hanya bunyi saat mesin hidup
    lastMphShown: -1, lastEngLit: -1, lastOilLit: -1,
};
const sh = { spd: 0, rpm: 0, fuel: 0, eng: 0, oil: 0 };   // nilai tampil (di-smooth), 0-1
let bootUntil = performance.now() + 1700;
let lastRedline = null;

// Helper: tulis DOM hanya kalau isinya memang berubah
function setText(el, txt) { txt = String(txt); if (el.textContent !== txt) el.textContent = txt; }
function setClass(el, cls) { if (el.className !== cls) el.className = cls; }
const ease = (cur, tar, k) => { const v = cur + (tar - cur) * k; return Math.abs(tar - v) < 0.0005 ? tar : v; };

const rotate = (el, g, ratio) => el.setAttribute('transform', `rotate(${(g.start + clamp01(ratio) * g.sweep).toFixed(2)} ${g.cx} ${g.cy})`);
const dash = (el, ratio) => el.setAttribute('stroke-dasharray', `${(clamp01(ratio) * 100).toFixed(2)} 100`);

function renderSegs(list, ratio, key) {
    const lit = ratio > 0.005 ? Math.max(1, Math.round(ratio * SEGS)) : 0;
    if (lit === state[key]) return;
    state[key] = lit;
    list.forEach((s, i) => s.classList.toggle('on', i < lit));
}

function padDigits(n, len) {
    const s = String(Math.max(0, n)).padStart(len, '0');
    const firstSig = s.search(/[1-9]/);
    const cut = firstSig === -1 ? len - 1 : firstSig;
    return `<span class="dim">${s.slice(0, cut)}</span><span class="bright">${s.slice(cut)}</span>`;
}

// Oil pressure otomatis: naik mengikuti RPM, turun kalau engine health rusak, 0 saat mesin mati
function oilTarget() {
    if (state.oilOverride !== null) return Math.min(OIL_MAX, state.oilOverride);
    if (!state.engine) return 0;
    return Math.min(OIL_MAX, (18 + state.rpm * 52) * (0.45 + 0.55 * state.health));
}

// ---------- Loop animasi (berhenti saat tidak ada yang bergerak, maks 40 FPS) ----------
const FRAME_MS = 1000 / 40;
let lastFrame = 0, rafId = 0;
function kick() {
    if (rafId) return;
    lastFrame = performance.now() - FRAME_MS;
    rafId = requestAnimationFrame(frame);
}
function frame(now) {
    rafId = 0;
    if (now - lastFrame < FRAME_MS - 2) { rafId = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    // Saat kontak ON: semua gauge naik lalu turun
    const booting = now < bootUntil;
    let t = 0;
    if (booting) {
        const p = 1 - (bootUntil - now) / 1700;
        t = p < 0.45 ? p / 0.45 : p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.45);
    } else if (elHud.classList.contains('booting')) {
        elHud.classList.remove('booting');
    }

    const k = booting ? 1 : Math.min(1, dt * 12);
    const tgt = booting
        ? { spd: t, rpm: t, fuel: t, eng: t, oil: t }
        : { spd: state.mph / MAX_MPH, rpm: state.rpm, fuel: state.fuel, eng: state.health, oil: oilTarget() / OIL_MAX };
    let moving = false;
    for (const key in tgt) {
        const v = ease(sh[key], clamp01(tgt[key]), key === 'spd' ? Math.min(1, dt * 8) : k);
        if (v !== clamp01(tgt[key])) moving = true;
        sh[key] = v;
    }

    rotate(nSpd, G.spd, sh.spd);   dash(aSpd, sh.spd);
    rotate(nRpm, G.rpm, sh.rpm);   dash(aRpm, sh.rpm);
    rotate(nFuel, G.fuel, sh.fuel);
    renderSegs(eSegs, sh.eng, 'lastEngLit');
    renderSegs(oSegs, sh.oil, 'lastOilLit');
    setText($('oil-val'), Math.round(sh.oil * OIL_MAX) + ' psi');

    const red = sh.rpm >= REDLINE / MAX_RPM;
    if (red !== lastRedline) { lastRedline = red; elHud.classList.toggle('redline', red); }
    if (!booting) elHud.classList.toggle('oil-low', state.engine && sh.oil * OIL_MAX < 15);

    if (booting || moving) rafId = requestAnimationFrame(frame);
}
kick();

// ---------- 1. Kecepatan (m/s -> MPH) ----------
window.setSpeed = function (speed) {
    const mps = Number(speed || 0);
    state.mps = mps;
    state.mph = mps * MPS_TO_MPH;
    const mph = Math.round(state.mph);
    if (mph !== state.lastMphShown) {
        state.lastMphShown = mph;
        $('speed-display').innerHTML = padDigits(mph, 3);
    }
    kick();
};

// ---------- 2. RPM (0.0 - 1.0) ----------
window.setRPM = function (rpm) {
    const r = clamp01(Number(rpm || 0));
    if (r === state.rpm) return;
    state.rpm = r;
    kick();
};

// ---------- 3. Fuel ----------
window.setFuel = function (fuel) {
    const val = Number(fuel || 0);
    const percent = clamp01(val > 1 ? val / 100 : val);
    state.fuel = percent;
    elHud.classList.toggle('fuel-low', percent < 0.20);
    kick();
};

// ---------- 4. Engine Health: >50% normal | 30-50% kuning | <30% merah berkedip ----------
window.setHealth = function (health) {
    const val = Number(health || 0);
    const percent = clamp01(val > 1 ? val / 1000 : val);
    state.health = percent;
    setText($('eng-val'), Math.round(percent * 100) + '%');
    elHud.classList.toggle('eng-warn', percent <= 0.5 && percent > 0.3);
    elHud.classList.toggle('eng-crit', percent <= 0.3);
    kick();   // oil ikut turun kalau health jelek
};

// ---------- 4b. Oil manual (opsional) ----------
window.setOil = function (psi) {
    state.oilOverride = (psi === null || psi === undefined || psi === '') ? null : Math.max(0, Number(psi) || 0);
    kick();
};

// ---------- 5. Gear ----------
window.setGear = function (gear) {
    let g = String(gear);
    if (gear == 0 || g === '0' || g.toUpperCase() === 'R') g = 'R';
    else if (gear === null || gear === undefined || g === '' || g.toUpperCase() === 'N') g = 'N';
    setText($('gear'), g);
    const col = g === 'R' ? 'var(--red)' : '';
    if ($('gear').style.color !== col) $('gear').style.color = col;
};

// ---------- 6. Lampu (0 = mati, 1 = low beam, 2 = high beam) ----------
window.setHeadlights = function (st) {
    const val = Number(st || 0);
    setClass($('headlight'), val === 2 ? 'icon-item high-beam' : val === 1 ? 'icon-item active' : 'icon-item');
};

// ---------- 7. Seatbelt (true = terpasang) ----------
window.setSeatbelts = function (val) {
    const on = isTrueValue(val);
    state.belted = on;
    setClass($('seatbelts'), on ? 'icon-item active' : 'icon-item warn');
};

// ---------- 8. Odometer (mil) ----------
window.setOdometer = function (distance) {
    setText($('odometer'), Number(distance || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
};

// ---------- Fitur lama yang dinonaktifkan (sein, lock/unlock) ----------
window.setLeftIndicator = function () {};
window.setRightIndicator = function () {};
window.setLocked = function () {};

// ---------- Jam ----------
function tickClock() {
    const d = new Date();
    setText($('clock'), String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
}
tickClock();
setInterval(tickClock, 10000);

// ---------- Teks intro: ganti di index.html pada data-text="OBEY" ----------
(function () {
    const el = $('intro-text');
    if (el === NOOP_EL) return;
    const text = (el.dataset.text || el.textContent || 'OBEY').trim().toUpperCase();
    const chars = Array.from(text);
    el.textContent = '';
    chars.forEach((ch, i) => {
        const span = document.createElement('span');
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.animationDelay = (0.3 + i * 0.09).toFixed(2) + 's';
        el.appendChild(span);
    });
    el.style.fontSize = Math.max(14, Math.min(34, Math.floor(180 / (chars.length * 0.95)))) + 'px';
})();

// ---------- Intro (bisa dipanggil ulang: playIntro()) ----------
let introTimer;
window.playIntro = function () {
    elHud.classList.remove('intro-on');
    void elHud.offsetWidth;
    elHud.classList.add('intro-on');
    bootUntil = performance.now() + 1700;
    kick();
    clearTimeout(introTimer);
    introTimer = setTimeout(() => elHud.classList.remove('intro-on'), 2750);
};

// ---------- Suara peringatan (Web Audio, tanpa file mp3) ----------
// Matikan semua: setHudSound(false)
const SND = {
    enabled: true,
    volume: 0.3,            // 0 - 1
    seatbeltEvery: 2000,    // ms jeda antar bunyi seatbelt
    seatbeltMinSpeed: 1,    // m/s: seatbelt hanya bunyi saat bergerak lebih cepat dari ini
    fuelBelow: 0.20,        // bensin di bawah 20%
    fuelEvery: 30000,       // ms jeda antar chime bensin
};
try {
    const q = new URLSearchParams(location.search);
    ['nosound', 'mute', 'silent', 'noalarm', 'noseatbelt', 'nobelt'].forEach((k) => {
        if (q.has(k) && !['0', 'false', 'no', 'off'].includes((q.get(k) || '').toLowerCase())) SND.enabled = false;
    });
    if (q.has('volume') && !isNaN(parseFloat(q.get('volume')))) SND.volume = Math.max(0, Math.min(1, parseFloat(q.get('volume'))));
} catch (e) {}
let audioCtx = null;
function getAudio() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}
function tone(freq, start, dur, type, vol) {
    const a = getAudio();
    if (!a) return;
    const t0 = a.currentTime + start;
    const osc = a.createOscillator(), gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, SND.volume * vol), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
}
window.playHudSound = function (kind) {
    if (!SND.enabled) return;
    if (kind === 'seatbelt') {
        tone(1000, 0.00, 0.14, 'triangle', 1);
        tone(1000, 0.22, 0.14, 'triangle', 1);
    } else if (kind === 'fuel') {
        tone(988, 0.00, 0.45, 'sine', 1);
        tone(1976, 0.00, 0.30, 'sine', 0.25);
        tone(740, 0.30, 0.70, 'sine', 1);
        tone(1480, 0.30, 0.45, 'sine', 0.25);
    }
};
window.setHudSound = function (on, volume) {
    SND.enabled = !!on;
    if (volume !== undefined) SND.volume = clamp01(Number(volume));
};
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, getAudio, { once: true }));

let lastSeatBeep = -Infinity, lastFuelChime = -Infinity;
setInterval(() => {
    if (!SND.enabled || elHud.classList.contains('intro-on')) return;
    const now = performance.now();

    const seatWarn = state.engine && !state.belted && state.mps > SND.seatbeltMinSpeed;
    if (!seatWarn) lastSeatBeep = -Infinity;
    else if (now - lastSeatBeep >= SND.seatbeltEvery) {
        lastSeatBeep = now;
        window.playHudSound('seatbelt');
    }

    const fuelWarn = state.engine && state.fuel < SND.fuelBelow;
    if (!fuelWarn) lastFuelChime = -Infinity;
    else if (now - lastFuelChime >= SND.fuelEvery) {
        lastFuelChime = now;
        window.playHudSound('fuel');
    }
}, 250);

// ---------- Engine (setEngine(true/false)) ----------
window.setEngine = function (on) {
    state.engine = isTrueValue(on);
    setClass($('enginelamp'), state.engine ? 'icon-item active' : 'icon-item');
    kick();   // oil pressure naik/turun saat mesin hidup/mati
};
window.setSeatbeltSoundEnabled = (on) => window.setHudSound(!!on);
window.setSeatbeltVolume = (v) => { const n = parseFloat(v); if (!isNaN(n)) window.setHudSound(SND.enabled, n); };

// Pesan gaya NUI: window.postMessage({ action: 'setEngine', state: true })
window.addEventListener('message', function (event) {
    const d = event.data;
    if (!d || typeof d !== 'object' || !d.action) return;
    try {
        switch (d.action) {
            case 'setEngine': window.setEngine(d.state); break;
            case 'setSpeed': window.setSpeed(Number(d.speed) || 0); break;
            case 'setRPM': window.setRPM(Number(d.rpm) || 0); break;
            case 'setFuel': window.setFuel(Number(d.fuel) || 0); break;
            case 'setHealth': window.setHealth(Number(d.health) || 0); break;
            case 'setOil': window.setOil(d.oil !== undefined ? d.oil : d.psi); break;
            case 'setGear': window.setGear(d.gear !== undefined ? d.gear : 'N'); break;
            case 'setHeadlights': window.setHeadlights(Number(d.state) || 0); break;
            case 'setSeatbelts': window.setSeatbelts(!!d.state); break;
            case 'setOdometer': window.setOdometer(Number(d.distance) || 0); break;
            case 'muteSeatbelt': window.setSeatbeltSoundEnabled(false); break;
            case 'unmuteSeatbelt': window.setSeatbeltSoundEnabled(true); break;
            case 'setSeatbeltSound': window.setSeatbeltSoundEnabled(d.enabled !== undefined ? !!d.enabled : !d.disabled); break;
            case 'setVolume': window.setSeatbeltVolume(d.volume !== undefined ? d.volume : d.value); break;
        }
    } catch (e) { /* abaikan pesan rusak */ }
});

// ---------- Message handler (intro) ----------
window.addEventListener('message', function (event) {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'playIntro' || data.action === 'playIntro') window.playIntro();
});

// ---------- Nilai awal ----------
window.setSpeed(0);
window.setRPM(0);
window.setFuel(100);
window.setHealth(1000);
window.setGear('N');
window.setHeadlights(0);
window.setSeatbelts(false);
window.setEngine(false);
window.setOdometer(0);
window.playIntro();

// ---------- Demo (otomatis di preview Netlify atau dengan ?demo) ----------
const params = new URLSearchParams(location.search);
const isPreview = params.has('demo') || (/netlify\.app$/.test(location.hostname) && !params.has('nodemo'));

if (isPreview) {
    document.body.classList.add('preview');
    const fit = () => document.documentElement.style.setProperty('--scale', Math.min(1, window.innerWidth / 1260));
    fit();
    window.addEventListener('resize', fit);

    const GEAR_TOP = [0, 28, 48, 72, 98, 128, 165];   // batas mph per gigi
    let mps = 0, gear = 1, throttle = true, odo = 18452.3, health = 1000, fuel = 86, t = 0;

    setTimeout(() => {
        setEngine(true);
        setTimeout(() => setSeatbelts(true), 9000);
        setHeadlights(1);
        setInterval(() => {
            t += 0.05;
            const mph = mps * MPS_TO_MPH;
            if (throttle) mps += 0.38 / gear; else mps -= 0.55;
            if (mph > 150) throttle = false;
            if (mps <= 0) { mps = 0; throttle = true; }

            while (gear < 6 && mph > GEAR_TOP[gear]) gear++;
            while (gear > 1 && mph < GEAR_TOP[gear - 1] - 6) gear--;
            const lo = GEAR_TOP[gear - 1], hi = GEAR_TOP[gear];
            const rpm = 0.11 + clamp01((mph - lo) / (hi - lo)) * (throttle ? 0.82 : 0.6);

            health = Math.max(180, health - 0.9);
            if (health <= 180) health = 1000;
            fuel = fuel <= 4 ? 86 : fuel - 0.02;
            odo += (mph * 0.05) / 3600;

            setSpeed(mps);
            setRPM(rpm);
            setGear(gear);
            setHealth(health);
            setFuel(fuel);
            setOdometer(odo);
            setHeadlights(Math.floor(t / 9) % 3 === 2 ? 2 : 1);
        }, 50);
    }, 3000);
}
