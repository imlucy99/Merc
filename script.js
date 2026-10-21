/* =========================================================
   JGVRP Speedometer HUD
   API (dipanggil dari game / CEF):
     setSpeed(m/s)            setRPM(0.0 - 1.0)
     setFuel(0-1 | 0-100)     setHealth(0-1 | 0-1000)
     setGear(n)               setHeadlights(0 off | 1 low | 2 high)
     setSeatbelts(bool)       setLeftIndicator(bool) / setRightIndicator(bool)
     updateLockStatus(state)  setOdometer(miles)
   ========================================================= */

const MPS_TO_MPH = 2.236936;
const MAX_RPM = 10;         // skala tachometer (x1000)
const REDLINE = 9;         // mulai zona merah (x1000)

const NOOP_EL = document.createElement('div');   // pengaman kalau ada elemen yang sudah dihapus dari HTML
const $ = (id) => document.getElementById(id) || NOOP_EL;
const elHud = $('hud');
const svg = $('dial');

// ---------- Helper Parser (JGRP) ----------
function isLockedState(val) {
    return val === true || val === 1 || val === "1" || val === "true" || val === 2 || val === "2";
}
function isTrueValue(val) {
    return val === true || val === 1 || val === "1" || val === "true";
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- Geometri dial (gaya Lexus LFA: ring putih, hub gelap, jarum biru) ----------
const CX = 280, CY = 205;
const START = 90, SWEEP = 240;                 // 0 di bawah, searah jarum jam, celah di kanan bawah
const R_HUB = 100, R_FACE = 188, R_TICK = 184, R_NUM = 144;
const R_IN = R_HUB, R_FILL = R_FACE;
const rpmAngle = (ratio) => START + clamp01(ratio) * SWEEP;
const pol = (r, a) => { const t = (a * Math.PI) / 180; return [(CX + r * Math.cos(t)).toFixed(2), (CY + r * Math.sin(t)).toFixed(2)]; };
function sector(r1, r2, a1, a2) {
    if (a2 - a1 < 0.05) return '';
    const [x1, y1] = pol(r2, a1), [x2, y2] = pol(r2, a2), [x3, y3] = pol(r1, a2), [x4, y4] = pol(r1, a1);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${x1} ${y1}A${r2} ${r2} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 ${large} 0 ${x4} ${y4}Z`;
}
function arcPath(r, a1, a2) {
    const [x1, y1] = pol(r, a1), [x2, y2] = pol(r, a2);
    return `M${x1} ${y1}A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

// Gauge samping (segmen): kiri atas = suhu air, kiri bawah = FUEL, kanan atas = suhu oli, kanan bawah = OIL PRESS
const SIDE_R1 = 218, SIDE_R2 = 229, SIDE_SEGS = 14;
const SIDE = { fuel: [136, 172], wtr: [188, 224], oil: [44, 8], otp: [-8, -44] };   // bawah -> atas
function buildSideArc(cls, [aFrom, aTo]) {
    const step = (aTo - aFrom) / SIDE_SEGS, gap = 0.9 * Math.sign(step);
    let s = '';
    for (let i = 0; i < SIDE_SEGS; i++) {
        let a1 = aFrom + i * step + gap / 2, a2 = aFrom + (i + 1) * step - gap / 2;
        if (a1 > a2) [a1, a2] = [a2, a1];
        s += `<path class="seg ${cls}" d="${sector(SIDE_R1, SIDE_R2, a1, a2)}"/>`;
    }
    [0, 0.5, 1].forEach((t) => {
        const a = aFrom + (aTo - aFrom) * t, [x1, y1] = pol(SIDE_R2 + 4, a), [x2, y2] = pol(SIDE_R2 + 9, a);
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>`;
    });
    return s;
}

function buildDial() {
    const a9 = rpmAngle(REDLINE / MAX_RPM), a10 = rpmAngle(1);
    let s = `
    <defs>
      <radialGradient id="face" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY}" r="${R_FACE}">
        <stop offset="0.5" style="stop-color:var(--face-a)"/><stop offset="1" style="stop-color:var(--face-b)"/>
      </radialGradient>
      <radialGradient id="hub" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY}" r="${R_HUB}">
        <stop offset="0" stop-color="#0d1426"/><stop offset="0.82" stop-color="#04060d"/><stop offset="1" stop-color="#0b1c44"/>
      </radialGradient>
    </defs>
    <circle cx="${CX}" cy="${CY}" r="210" fill="#0c0d0f" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>
    <circle cx="${CX}" cy="${CY}" r="196" fill="none" stroke="#2b2d32" stroke-width="16"/>`;
    for (let a = 0; a < 360; a += 15) {                         // garis kecil di bezel
        const [x1, y1] = pol(199, a), [x2, y2] = pol(a % 45 ? 203 : 206, a);
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,${a % 45 ? 0.4 : 0.85})" stroke-width="1.6"/>`;
    }
    s += `<circle cx="${CX}" cy="${CY}" r="${R_FACE}" fill="url(#face)"/>
    <path id="redline-arc" class="zone" d="${sector(R_HUB, R_FACE, a9, a10)}"/>
    <g stroke-linecap="butt">`;
    for (let i = 0; i <= MAX_RPM * 10; i++) {
        const a = rpmAngle(i / (MAX_RPM * 10)), major = i % 10 === 0, half = i % 5 === 0;
        const [x1, y1] = pol(major ? 164 : half ? 172 : 178, a), [x2, y2] = pol(R_TICK, a);
        s += `<line class="tk" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${major ? 2.8 : half ? 1.8 : 0.9}"/>`;
    }
    s += '</g>';
    for (let v = 0; v <= MAX_RPM; v++) {
        const [x, y] = pol(R_NUM, rpmAngle(v / MAX_RPM));
        s += `<text class="num" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${v}</text>`;
    }
    s += `<text class="scale-lbl" x="${CX + 40}" y="${CY + 150}">&#215;1000 r/min</text>
    <circle cx="${CX}" cy="${CY}" r="${R_HUB + 4}" fill="none" style="stroke:var(--glow)" stroke-opacity="0.2" stroke-width="7"/>
    <circle cx="${CX}" cy="${CY}" r="${R_HUB}" fill="url(#hub)" style="stroke:var(--glow)" stroke-width="2.5"/>
    <g id="needle" transform="rotate(${START} ${CX} ${CY})">
      <line class="ndl" x1="${CX + 34}" y1="${CY}" x2="${CX + 170}" y2="${CY}" stroke-opacity="0.28" stroke-width="8" stroke-linecap="round"/>
      <line class="ndl" x1="${CX + 34}" y1="${CY}" x2="${CX + 170}" y2="${CY}" stroke-width="3" stroke-linecap="round"/>
    </g>`;
    for (const k in SIDE) s += buildSideArc(k, SIDE[k]);
    svg.innerHTML = s;
}
buildDial();
const segEls = {}, segCache = {};
Object.keys(SIDE).forEach((k) => { segEls[k] = svg.querySelectorAll('.seg.' + k); });
function setSegs(cls, ratio) {
    const n = Math.round(clamp01(ratio) * SIDE_SEGS);
    if (segCache[cls] === n) return;
    segCache[cls] = n;
    segEls[cls].forEach((el, i) => el.classList.toggle('on', i < n));
}

// ---------- Teks intro: ganti di index.html pada  data-text="ANNIS"  (huruf & ukuran diatur otomatis) ----------
(function () {
    const el = $('intro-text');
    if (el === NOOP_EL) return;
    const text = (el.dataset.text || el.textContent || 'ANNIS').trim().toUpperCase();
    const chars = Array.from(text);
    el.textContent = '';
    chars.forEach((ch, i) => {
        const span = document.createElement('span');
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.animationDelay = (0.3 + i * 0.09).toFixed(2) + 's';
        el.appendChild(span);
    });
    // ukuran huruf mengecil otomatis kalau tulisan panjang, supaya tetap muat di lingkaran dalam
    el.style.fontSize = Math.max(12, Math.min(28, Math.floor(138 / (chars.length * 0.95)))) + 'px';
})();

const needle = $('needle');
const clipPath = $('rpm-clip-path');
const trails = [$('trail-1'), $('trail-2'), $('trail-3')];
const ticks = svg.querySelectorAll('.tk');
const nums = svg.querySelectorAll('.num');

// ---------- State ----------
const state = {
    mph: 0,
    rpm: 0,          // target 0-1 dari game
    rpmShown: 0,     // nilai yang di-smooth untuk animasi
    health: 1,       // 0-1
    fuel: 0,
    healthShown: 0,  // 0-1, di-smooth untuk arc OIL PRESS
    lastTick: -1,
    lastMphShown: -1,
    trip: 0,
    belted: false,
    engine: false,   // dari setEngine(); alarm hanya bunyi saat mesin hidup
    mps: 0,          // kecepatan mentah (m/s)
};
let bootUntil = performance.now() + 1700;

let lastAngle = NaN, lastRedline = null;
function renderRpm(ratio) {
    const a = rpmAngle(ratio);
    if (!(Math.abs(a - lastAngle) < 0.05)) {          // tulis ke SVG hanya kalau jarum benar-benar bergerak
        lastAngle = a;
        needle.setAttribute('transform', `rotate(${a.toFixed(2)} ${CX} ${CY})`);
        clipPath.setAttribute('d', sector(R_IN, R_FILL + 1, START, a));
        trails[0].setAttribute('d', sector(R_IN + 40, R_FILL, Math.max(START, a - 34), a));
        trails[1].setAttribute('d', sector(R_IN + 55, R_FILL, Math.max(START, a - 16), a));
        trails[2].setAttribute('d', sector(R_IN + 70, R_FILL, Math.max(START, a - 6), a));
    }

    const lit = Math.round(ratio * MAX_RPM * 10);
    if (lit !== state.lastTick) {
        state.lastTick = lit;
        
        
    }
    const red = ratio >= REDLINE / MAX_RPM;
    if (red !== lastRedline) {
        lastRedline = red;
        elHud.classList.toggle('redline', red);
    }
}

// Helper: tulis DOM hanya kalau isinya memang berubah (hindari repaint sia-sia)
function setText(el, txt) { txt = String(txt); if (el.textContent !== txt) el.textContent = txt; }
function setClass(el, cls) { if (el.className !== cls) el.className = cls; }

function padDigits(n, len) {
    const s = String(Math.max(0, n)).padStart(len, '0');
    const firstSig = s.search(/[1-9]/);
    const cut = firstSig === -1 ? len - 1 : firstSig;
    return `<span class="dim">${s.slice(0, cut)}</span><span class="bright">${s.slice(cut)}</span>`;
}

// ---------- Loop animasi ----------
// Hemat FPS: loop BERHENTI saat tidak ada yang bergerak (jarum diam), dan dibatasi MAX_FPS.
const MAX_FPS = 40;
const FRAME_MS = 1000 / MAX_FPS;
let lastFrame = 0, rafId = 0;
function kick() {                         // bangunkan loop kalau sedang berhenti
    if (rafId) return;
    lastFrame = performance.now() - FRAME_MS;
    rafId = requestAnimationFrame(frame);
}
function frame(now) {
    rafId = 0;
    if (now - lastFrame < FRAME_MS - 2) { rafId = requestAnimationFrame(frame); return; }   // lewati frame (batas FPS)
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    let target = state.rpm;
    if (now < bootUntil) {
        // sweep jarum saat kontak ON
        const t = 1 - (bootUntil - now) / 1700;
        target = t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.55) / 0.45);
        if (t >= 0.45 && t < 0.55) target = 1;
    } else if (elHud.classList.contains('booting')) {
        elHud.classList.remove('booting');
    }

    const k = now < bootUntil ? 1 : Math.min(1, dt * 14);
    state.rpmShown += (target - state.rpmShown) * k;
    if (Math.abs(target - state.rpmShown) < 0.0005) state.rpmShown = target;
    renderRpm(state.rpmShown);

    // OIL PRESS = nilai setHealth (0-100%), di-smooth
    const hp = now < bootUntil ? target : state.health;
    state.healthShown += (hp - state.healthShown) * Math.min(1, dt * 6);
    if (Math.abs(hp - state.healthShown) < 0.0005) state.healthShown = hp;
    setText($('oil-val'), Math.round(state.healthShown * 100));
    setSegs('oil', state.healthShown);

    // lanjut hanya kalau masih ada yang bergerak
    if (now < bootUntil || state.rpmShown !== target || state.healthShown !== hp) rafId = requestAnimationFrame(frame);
}
kick();

// ---------- 1. Kecepatan ----------
window.setSpeed = function (speed) {
    const mph = Math.round(Number(speed || 0) * MPS_TO_MPH);
    state.mph = mph;
    state.mps = Number(speed || 0);
    if (mph !== state.lastMphShown) {                 // ganti DOM hanya kalau angkanya berubah
        state.lastMphShown = mph;
        $('speed-display').innerHTML = padDigits(mph, 3);
    }
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
    setText($('fuel-val'), Math.round(percent * 100));
    elHud.classList.toggle('fuel-low', percent < 0.20);
    setSegs('fuel', percent);
};

// ---------- 4. Engine Health -> arc OIL PRESS (nilai & arc langsung dari setHealth) ----------
window.setHealth = function (health) {
    const val = Number(health || 0);
    const percent = clamp01(val > 1 ? val / 1000 : val);
    if (percent === state.health) return;
    state.health = percent;
    kick();

    const warn = percent <= 0.5 && percent > 0.3;
    const crit = percent <= 0.3;
    elHud.classList.toggle('oil-warn', warn);
    elHud.classList.toggle('oil-crit', crit);

};

// ---------- 5. Gear ----------
window.setGear = function (gear) {
    let g = String(gear);
    if (gear == 0 || g === '0' || g.toUpperCase() === 'R') g = 'R';
    else if (gear === null || gear === undefined || g === '' || g.toUpperCase() === 'N') g = 'N';
    setText($('gear'), g);
    const col = g === 'R' ? '#ff2a2f' : '';
    if ($('gear').style.color !== col) $('gear').style.color = col;
};

// ---------- 6. Lock / Unlock Vehicle (Mendukung semua alternatif panggilan JGRP) ----------
window.updateLockStatus = function (state) {
    const locked = isLockedState(state);
    setClass($('door-lock'), locked ? 'icon-item locked' : 'icon-item');  // gembok tertutup kuning = terkunci
    elHud.classList.toggle('is-locked', locked);
};
window.setDoors = window.updateLockStatus;
window.setDoorLock = window.updateLockStatus;
window.setVehicleLocked = window.updateLockStatus;
window.setLocked = window.updateLockStatus;
window.setLock = window.updateLockStatus;
window.toggleLock = window.updateLockStatus;

// ---------- 7. Lampu (0 = mati, 1 = low beam, 2 = high beam) ----------
window.setHeadlights = function (state) {
    const val = Number(state || 0);
    // satu ikon saja: low = hijau (garis miring), high = biru (garis lurus), mati = redup
    setClass($('headlight'), val === 2 ? 'icon-item high-beam' : val === 1 ? 'icon-item active' : 'icon-item');
};

// ---------- 8. Sein (dinonaktifkan) ----------
window.setLeftIndicator = function () {};    // sein dihapus dari tampilan
window.setRightIndicator = function () {};

// ---------- 9. Seatbelt (true = terpasang) ----------
window.setSeatbelts = function (val) {
    const on = isTrueValue(val);
    state.belted = on;
    setClass($('seatbelts'), on ? 'icon-item active' : 'icon-item warn');
};

// ---------- 10. Odometer (mil) ----------
window.setOdometer = function (distance) {
    setText($('odometer'), Number(distance || 0).toFixed(1));
};

// ---------- Intro ANNIS (bisa dipanggil ulang: playIntro()) ----------
let introTimer;
window.playIntro = function () {
    elHud.classList.remove('intro-on');
    void elHud.offsetWidth;                 // restart animasi CSS
    elHud.classList.add('intro-on');
    bootUntil = performance.now() + 1700;   // jarum RPM ikut menyapu
    kick();
    clearTimeout(introTimer);
    introTimer = setTimeout(() => elHud.classList.remove('intro-on'), 2750);
};

// ---------- Suara peringatan (dibuat lewat Web Audio, tanpa file mp3) ----------
// Ubah nilai di SND untuk mengatur suara. Matikan semua: setHudSound(false)
const SND = {
    enabled: true,
    volume: 0.3,            // 0 - 1
    seatbeltEvery: 2000,    // ms jeda antar bunyi seatbelt (berulang terus sampai seatbelt dipasang)
    seatbeltMinSpeed: 1,    // m/s: seatbelt hanya bunyi saat mobil bergerak lebih cepat dari ini (0 = selalu, 1 m/s ~ 2 mph)
    fuelBelow: 0.20,        // bensin di bawah 20%
    fuelEvery: 30000,       // ms jeda antar chime bensin
};
// Suara hanya bunyi kalau mesin HIDUP (setEngine(true)).
// Matikan via link: ?nosound / ?mute / ?silent / ?noalarm   Volume via link: ?volume=0.0-1.0
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
    if (kind === 'seatbelt') {                       // beep-beep
        tone(1000, 0.00, 0.14, 'triangle', 1);
        tone(1000, 0.22, 0.14, 'triangle', 1);
    } else if (kind === 'fuel') {                    // ding-dong
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
// Browser butuh interaksi pertama untuk membuka audio (di CEF/FiveM biasanya langsung jalan)
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, getAudio, { once: true }));

let lastSeatBeep = -Infinity, lastFuelChime = -Infinity;
setInterval(() => {
    if (!SND.enabled || elHud.classList.contains('intro-on')) return;
    const now = performance.now();

    // Seatbelt: mesin hidup + belum dipasang + mobil bergerak
    const seatWarn = state.engine && !state.belted && state.mps > SND.seatbeltMinSpeed;
    if (!seatWarn) lastSeatBeep = -Infinity;          // kondisi hilang -> siap bunyi lagi saat muncul
    else if (now - lastSeatBeep >= SND.seatbeltEvery) {
        lastSeatBeep = now;
        window.playHudSound('seatbelt');
    }

    // Bensin < 20% dan mesin hidup
    const fuelWarn = state.engine && state.fuel < SND.fuelBelow;
    if (!fuelWarn) lastFuelChime = -Infinity;
    else if (now - lastFuelChime >= SND.fuelEvery) {
        lastFuelChime = now;
        window.playHudSound('fuel');
    }
}, 250);

// ---------- Engine (JGVRP: setEngine(true/false)) ----------
window.setEngine = function (on) {
    state.engine = isTrueValue(on);
};
// Alias kontrol suara (nama sama dengan template JGVRP)
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

// ---------- Message handler ----------
window.addEventListener('message', function (event) {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'setDoors' || data.action === 'setDoors' || data.type === 'lock') {
        window.updateLockStatus(data.status !== undefined ? data.status : data.state);
    }
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
window.updateLockStatus(false);
window.setOdometer(0);
// ---------- Tema ----------
const THEMES = [['lfa', 'LFA Putih'], ['night', 'Night Merah'], ['ice', 'Ice Biru'], ['amber', 'Amber'], ['mono', 'Mono Hijau']];
let themeIdx = 0, swapTimer;
window.setTheme = function (name, animate) {
    let i = typeof name === 'number' ? name : THEMES.findIndex((t) => t[0] === name);
    if (i < 0) i = 0;
    themeIdx = ((i % THEMES.length) + THEMES.length) % THEMES.length;
    document.body.dataset.theme = THEMES[themeIdx][0];
    setText($('theme-name'), THEMES[themeIdx][1]);
    try { localStorage.setItem('hudTheme', THEMES[themeIdx][0]); } catch (e) {}
    if (animate === false) return;
    elHud.classList.remove('swap'); void elHud.offsetWidth; elHud.classList.add('swap');
    bootUntil = performance.now() + 1700;      // jarum menyapu lagi
    kick();
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => elHud.classList.remove('swap'), 1000);
};
window.nextTheme = () => window.setTheme(themeIdx + 1);
$('theme-btn').addEventListener('click', window.nextTheme);
window.addEventListener('keydown', (e) => { if (e.key === 't' || e.key === 'T') window.nextTheme(); });
window.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.action === 'setTheme') window.setTheme(d.theme !== undefined ? d.theme : d.state);
    if (d && d.action === 'nextTheme') window.nextTheme();
});
(function () {
    const q = new URLSearchParams(location.search);
    if (q.has('button')) document.body.classList.add('show-btn');
    let saved = q.get('theme');
    try { saved = saved || localStorage.getItem('hudTheme'); } catch (e) {}
    window.setTheme(saved || 'lfa', false);
    setSegs('wtr', 0.55); setSegs('otp', 0.5);
    const tick = () => { const d = new Date(); setText($('clock'), d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')); };
    tick(); setInterval(tick, 15000);
    window.setTemp = (c) => setText($('temp-val'), Math.round(Number(c) || 0));
})();

window.playIntro();   // animasi ANNIS saat HUD pertama kali dipakai

// ---------- Demo (otomatis di preview Netlify atau dengan ?demo) ----------
const params = new URLSearchParams(location.search);
const isPreview = params.has('demo') || (/netlify\.app$/.test(location.hostname) && !params.has('nodemo'));

if (isPreview) {
    document.body.classList.add('preview');
    const GEAR_TOP = [0, 28, 48, 72, 98, 128, 165];   // batas mph per gigi
    let mps = 0, gear = 1, throttle = true, odo = 18452.3, health = 1000, fuel = 86, t = 0;

    setTimeout(() => {
        setEngine(true);
        setTimeout(() => setSeatbelts(true), 9000);   // belum dipasang 9 detik pertama -> terdengar beep
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
            setLeftIndicator(Math.floor(t / 6) % 4 === 1);
            setRightIndicator(Math.floor(t / 6) % 4 === 3);
            setHeadlights(Math.floor(t / 9) % 3 === 2 ? 2 : 1);
            updateLockStatus(Math.floor(t / 7) % 2);
        }, 50);
    }, 3000);
}