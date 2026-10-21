/* =========================================================
   JGVRP Speedometer HUD - gaya Lexus LFA (MPH), tanpa animasi
   API (dipanggil dari game / CEF):
     setSpeed(m/s -> MPH)  setRPM(0.0-1.0)  setFuel(0-1 | 0-100)
     setHealth(0-1 | 0-1000)  setGear(n)  setHeadlights(0|1|2)
     setSeatbelts(bool)  setEngine(bool)  setOdometer(miles)  setOil(psi|null)
     setTheme('lfa'|'night'|'ice'|'gold')   setNeedleColor('#rrggbb' | null)
   NUI: postMessage({ action:'setTheme', theme:'night' }) / { action:'setNeedleColor', color:'#ff0000' }
   URL: ?theme=night&needle=ff0000
   ========================================================= */

const MPS_TO_MPH = 2.236936;
const MAX_RPM = 10;      // skala tachometer (x1000), RPM 0-1 -> 0-10
const REDLINE = 9;       // mulai zona merah (x1000)
const OIL_MAX = 100;     // skala oil pressure (psi)
const THEMES = ['lfa', 'night', 'ice', 'gold'];

const NOOP_EL = document.createElement('div');
const $ = (id) => document.getElementById(id) || NOOP_EL;
const elHud = $('hud');
const svg = $('dial');
const isTrueValue = (v) => v === true || v === 1 || v === '1' || v === 'true';
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- Geometri (derajat SVG: 0 = kanan, searah jarum jam) ----------
const CX = 400, CY = 262, SR = 300;
const P = (r, a) => [CX + r * Math.cos((a * Math.PI) / 180), CY + r * Math.sin((a * Math.PI) / 180)];
const f = (n) => n.toFixed(1);
const arcD = (r, a1, a2) => {
    const [x1, y1] = P(r, a1), [x2, y2] = P(r, a2);
    return `M${f(x1)} ${f(y1)}A${r} ${r} 0 ${Math.abs(a2 - a1) > 180 ? 1 : 0} ${a2 > a1 ? 1 : 0} ${f(x2)} ${f(y2)}`;
};
const sector = (r1, r2, a1, a2) => {
    const [a, b] = P(r2, a1), [c, d] = P(r2, a2), [e, g] = P(r1, a2), [h, i] = P(r1, a1);
    return `M${f(h)} ${f(i)}L${f(a)} ${f(b)}A${r2} ${r2} 0 0 1 ${f(c)} ${f(d)}L${f(e)} ${f(g)}A${r1} ${r1} 0 0 0 ${f(h)} ${f(i)}Z`;
};
// Skala tacho non-linear seperti LFA: 0-4 dirapatkan (15 derajat/angka), 4-10 renggang (30 derajat/angka)
const tachA = (v) => (v <= 4 ? 90 + 15 * v : 150 + 30 * (v - 4));

// Gauge samping: a0 = sudut nilai 0, a1 = sudut nilai penuh
const SIDE = {
    eng:  { a0: 187, a1: 218, lab: [['0', 0], ['50', 0.5], ['100', 1]] },
    fuel: { a0: 142, a1: 172, lab: [['E', 0], ['&#189;', 0.5], ['F', 1]] },
    oil:  { a0: 353, a1: 322, lab: [['0', 0], ['50', 0.5], ['100', 1]] },
};
function side(id, g) {
    const N = 10;
    let s = `<path class="track" d="${arcD(SR, g.a0, g.a1)}"/><path id="${id}-arc" class="lit" d="${arcD(SR, g.a0, g.a1)}" pathLength="100" stroke-dasharray="0 100"/>`;
    for (let i = 0; i <= N; i++) {
        const a = g.a0 + ((g.a1 - g.a0) * i) / N, maj = i % 5 === 0;
        const [x1, y1] = P(SR - 8, a), [x2, y2] = P(SR - (maj ? 16 : 12), a);
        s += `<line class="stk" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
    }
    g.lab.forEach(([t, v]) => {
        const [x, y] = P(SR + 20, g.a0 + (g.a1 - g.a0) * v);
        s += `<text class="sl" x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central">${t}</text>`;
    });
    return s;
}

function buildDial() {
    let s = `<defs>
      <radialGradient id="bz" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#3a3e48"/><stop offset="1" stop-color="#0d0e12"/></radialGradient>
      <radialGradient id="fc" cx=".5" cy=".4" r=".65"><stop offset="0" style="stop-color:var(--face1)"/><stop offset="1" style="stop-color:var(--face2)"/></radialGradient>
      <linearGradient id="zn" x1="0" y1="1" x2="1" y2="0"><stop offset="0" style="stop-color:var(--zone1)"/><stop offset="1" style="stop-color:var(--zone2)"/></linearGradient>
      <linearGradient id="ac" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--acc1)"/><stop offset="1" style="stop-color:var(--acc2)"/></linearGradient>
    </defs>
    <rect class="plate" x="20" y="20" width="760" height="480" rx="70"/>
    <circle class="bezel" cx="${CX}" cy="${CY}" r="240"/>
    <circle class="face" cx="${CX}" cy="${CY}" r="206"/>`;

    // Zona merah 9.2 - 9.8
    s += `<path class="zone" d="${sector(128, 176, tachA(9.2), tachA(9.8))}"/>`;

    // Tick + angka tacho (angka 1 dan 3 tidak ditampilkan, sama seperti LFA)
    const vals = [0, 1, 2, 3, 4];
    for (let k = 4.5; k <= 10; k += 0.5) vals.push(k);
    const labeled = [0, 2, 4, 5, 6, 7, 8, 9, 10];
    vals.forEach((v) => {
        const a = tachA(v), big = Number.isInteger(v), len = labeled.includes(v) ? 20 : big ? 12 : 8;
        const [x1, y1] = P(198 - len, a), [x2, y2] = P(198, a);
        s += `<line class="tk${v >= REDLINE ? ' rl' : ''}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke-width="${labeled.includes(v) ? 2.6 : 1.4}"/>`;
    });
    labeled.forEach((v) => {
        const [x, y] = P(150, tachA(v));
        s += `<text class="num" x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central">${v}</text>`;
    });
    const [ux, uy] = P(176, 90);
    s += `<text class="small" x="${f(ux + 34)}" y="${f(uy - 8)}" style="fill:var(--num)">x1000 r/min</text>`;

    // Lingkaran gelap tengah + glow bawah + jarum
    s += `<circle class="inner" cx="${CX}" cy="${CY}" r="118"/><path class="glow" d="${arcD(116, 40, 140)}"/>`;
    s += `<g id="needle" class="needle"><polygon points="${CX + 36},${CY - 3.4} ${CX + 188},${CY - 0.7} ${CX + 188},${CY + 0.7} ${CX + 36},${CY + 3.4}"/></g>`;

    // Gauge samping
    s += side('eng', SIDE.eng) + side('fuel', SIDE.fuel) + side('oil', SIDE.oil);
    s += `<path class="track" style="stroke-width:2" d="${arcD(SR, 14, 52)}"/>`;

    // Ikon + nilai
    const ic = (x, y) => `x="${f(x - 12)}" y="${f(y - 12)}" width="24" height="24"`;
    let [x, y] = P(262, 202);
    s += `<svg id="eng-ico" class="ico" ${ic(x, y)} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6M3 12h2.2M5.2 8.5h3.1V6.3h5v2.2h2.1l1.5 2h3.1v6.2h-2.2l-1.4 1.8H8.8l-3.6-3.6z"/></svg>`;
    s += `<text id="eng-val" class="big" x="112" y="256" text-anchor="middle">100%</text><text class="small" x="112" y="274" text-anchor="middle">ENGINE</text>`;
    [x, y] = P(262, 157);
    s += `<svg id="fuel-ico" class="ico" ${ic(x, y)} viewBox="0 0 24 24" fill="currentColor"><path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>`;
    [x, y] = P(262, 338);
    s += `<svg id="oil-ico" class="ico" ${ic(x, y)} viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 10h4.2l1.3-2h2V6.5H8V5h6v1.5h-2V8h2.5l2 1.8 5-2.8 1 1.2-6.6 7.3H8.4L7 13H2.5zM20.2 14.6c0-.9 1.1-2.3 1.1-2.3s1.1 1.4 1.1 2.3c0 .6-.5 1.1-1.1 1.1s-1.1-.5-1.1-1.1z"/></svg>`;
    s += `<text id="oil-val" class="val" x="${f(x)}" y="${f(y + 26)}" text-anchor="middle">0 psi</text>`;
    s += `<text id="clock" class="big it" x="688" y="262" text-anchor="middle" dominant-baseline="central">00:00</text>`;
    svg.innerHTML = s;
}
buildDial();

const nNeedle = $('needle'), aEng = $('eng-arc'), aFuel = $('fuel-arc'), aOil = $('oil-arc');

// ---------- State & render (langsung, tanpa animasi) ----------
const state = { mph: 0, mps: 0, rpm: 0, fuel: 1, health: 1, oilOverride: null, belted: false, engine: false, lastMph: -1 };
const dash = (el, r) => el.setAttribute('stroke-dasharray', `${(clamp01(r) * 100).toFixed(1)} 100`);
const setText = (el, t) => { t = String(t); if (el.textContent !== t) el.textContent = t; };
const setClass = (el, c) => { if (el.className !== c) el.className = c; };

function oilTarget() {
    if (state.oilOverride !== null) return Math.min(OIL_MAX, state.oilOverride);
    if (!state.engine) return 0;
    return Math.min(OIL_MAX, (18 + state.rpm * 52) * (0.45 + 0.55 * state.health));
}
function render() {
    const rpmV = state.rpm * MAX_RPM;
    nNeedle.setAttribute('transform', `rotate(${tachA(rpmV).toFixed(2)} ${CX} ${CY})`);
    dash(aEng, state.health);
    dash(aFuel, state.fuel);
    const oil = oilTarget();
    dash(aOil, oil / OIL_MAX);
    setText($('oil-val'), Math.round(oil) + ' psi');
    elHud.classList.toggle('redline', rpmV >= REDLINE);
    elHud.classList.toggle('oil-low', state.engine && oil < 15);
}

const padDigits = (n, len) => {
    const s = String(Math.max(0, n)).padStart(len, '0');
    const i = s.search(/[1-9]/), cut = i === -1 ? len - 1 : i;
    return `<span class="dim">${s.slice(0, cut)}</span><span class="bright">${s.slice(cut)}</span>`;
};

window.setSpeed = function (speed) {
    state.mps = Number(speed || 0);
    state.mph = state.mps * MPS_TO_MPH;
    const mph = Math.round(state.mph);
    if (mph !== state.lastMph) { state.lastMph = mph; $('speed-display').innerHTML = padDigits(mph, 3); }
};
window.setRPM = function (rpm) { state.rpm = clamp01(Number(rpm || 0)); render(); };
window.setFuel = function (fuel) {
    const v = Number(fuel || 0);
    state.fuel = clamp01(v > 1 ? v / 100 : v);
    elHud.classList.toggle('fuel-low', state.fuel < 0.2);
    render();
};
window.setHealth = function (health) {
    const v = Number(health || 0);
    state.health = clamp01(v > 1 ? v / 1000 : v);
    setText($('eng-val'), Math.round(state.health * 100) + '%');
    elHud.classList.toggle('eng-warn', state.health <= 0.5 && state.health > 0.3);
    elHud.classList.toggle('eng-crit', state.health <= 0.3);
    render();
};
window.setOil = function (psi) {
    state.oilOverride = (psi === null || psi === undefined || psi === '') ? null : Math.max(0, Number(psi) || 0);
    render();
};
window.setGear = function (gear) {
    let g = String(gear);
    if (gear == 0 || g === '0' || g.toUpperCase() === 'R') g = 'R';
    else if (gear === null || gear === undefined || g === '' || g.toUpperCase() === 'N') g = 'N';
    setText($('gear'), g);
    $('gear').style.color = g === 'R' ? 'var(--red)' : '';
};
window.setHeadlights = function (st) {
    const v = Number(st || 0);
    setClass($('headlight'), v === 2 ? 'icon-item high-beam' : v === 1 ? 'icon-item active' : 'icon-item');
};
window.setSeatbelts = function (val) {
    state.belted = isTrueValue(val);
    setClass($('seatbelts'), state.belted ? 'icon-item active' : 'icon-item warn');
};
window.setEngine = function (on) {
    state.engine = isTrueValue(on);
    setClass($('enginelamp'), state.engine ? 'icon-item active' : 'icon-item');
    render();
};
window.setOdometer = function (d) {
    setText($('odometer'), Number(d || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
};
window.playIntro = function () {};   // intro dihapus (dibiarkan agar pemanggilan lama tidak error)
window.setLeftIndicator = window.setRightIndicator = window.setLocked = function () {};

// ---------- Tema & warna jarum ----------
window.setTheme = function (name) {
    if (!THEMES.includes(name)) return;
    elHud.dataset.theme = name;
    window.setNeedleColor(null);    // pakai warna jarum bawaan tema
    try { localStorage.setItem('hudTheme', name); } catch (e) {}
};
window.setNeedleColor = function (color) {
    if (color && /^#?[0-9a-f]{3,8}$/i.test(String(color))) {
        const c = String(color).startsWith('#') ? color : '#' + color;
        elHud.style.setProperty('--needle', c);
        try { localStorage.setItem('hudNeedle', c); } catch (e) {}
    } else {
        elHud.style.removeProperty('--needle');
        try { localStorage.removeItem('hudNeedle'); } catch (e) {}
    }
};
(function () {
    const q = new URLSearchParams(location.search);
    let theme = q.get('theme'), needle = q.get('needle');
    try { theme = theme || localStorage.getItem('hudTheme'); needle = needle || localStorage.getItem('hudNeedle'); } catch (e) {}
    if (THEMES.includes(theme)) elHud.dataset.theme = theme;
    if (needle) window.setNeedleColor(needle);
})();

// ---------- Jam ----------
function tickClock() {
    const d = new Date();
    setText($('clock'), String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
}
tickClock();
setInterval(tickClock, 10000);

// ---------- Suara peringatan (Web Audio) - matikan: setHudSound(false) ----------
const SND = { enabled: true, volume: 0.3, seatbeltEvery: 2000, seatbeltMinSpeed: 1, fuelBelow: 0.2, fuelEvery: 30000 };
try {
    const q = new URLSearchParams(location.search);
    ['nosound', 'mute', 'silent', 'noalarm', 'noseatbelt', 'nobelt'].forEach((k) => {
        if (q.has(k) && !['0', 'false', 'no', 'off'].includes((q.get(k) || '').toLowerCase())) SND.enabled = false;
    });
    if (q.has('volume') && !isNaN(parseFloat(q.get('volume')))) SND.volume = clamp01(parseFloat(q.get('volume')));
} catch (e) {}
let audioCtx = null;
function getAudio() {
    if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; audioCtx = new AC(); }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}
function tone(freq, start, dur, type, vol) {
    const a = getAudio(); if (!a) return;
    const t0 = a.currentTime + start, osc = a.createOscillator(), gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, SND.volume * vol), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
}
window.playHudSound = function (kind) {
    if (!SND.enabled) return;
    if (kind === 'seatbelt') { tone(1000, 0, 0.14, 'triangle', 1); tone(1000, 0.22, 0.14, 'triangle', 1); }
    else if (kind === 'fuel') { tone(988, 0, 0.45, 'sine', 1); tone(1976, 0, 0.3, 'sine', 0.25); tone(740, 0.3, 0.7, 'sine', 1); tone(1480, 0.3, 0.45, 'sine', 0.25); }
};
window.setHudSound = function (on, volume) { SND.enabled = !!on; if (volume !== undefined) SND.volume = clamp01(Number(volume)); };
window.setSeatbeltSoundEnabled = (on) => window.setHudSound(!!on);
window.setSeatbeltVolume = (v) => { const n = parseFloat(v); if (!isNaN(n)) window.setHudSound(SND.enabled, n); };
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, getAudio, { once: true }));

let lastSeat = -Infinity, lastFuel = -Infinity;
setInterval(() => {
    if (!SND.enabled) return;
    const now = performance.now();
    const seatWarn = state.engine && !state.belted && state.mps > SND.seatbeltMinSpeed;
    if (!seatWarn) lastSeat = -Infinity;
    else if (now - lastSeat >= SND.seatbeltEvery) { lastSeat = now; window.playHudSound('seatbelt'); }
    const fuelWarn = state.engine && state.fuel < SND.fuelBelow;
    if (!fuelWarn) lastFuel = -Infinity;
    else if (now - lastFuel >= SND.fuelEvery) { lastFuel = now; window.playHudSound('fuel'); }
}, 250);

// ---------- Pesan NUI ----------
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
            case 'setTheme': window.setTheme(d.theme); break;
            case 'setNeedleColor': window.setNeedleColor(d.color); break;
            case 'muteSeatbelt': window.setSeatbeltSoundEnabled(false); break;
            case 'unmuteSeatbelt': window.setSeatbeltSoundEnabled(true); break;
            case 'setSeatbeltSound': window.setSeatbeltSoundEnabled(d.enabled !== undefined ? !!d.enabled : !d.disabled); break;
            case 'setVolume': window.setSeatbeltVolume(d.volume !== undefined ? d.volume : d.value); break;
        }
    } catch (e) {}
});

// ---------- Nilai awal ----------
window.setSpeed(0); window.setRPM(0); window.setFuel(100); window.setHealth(1000);
window.setGear('N'); window.setHeadlights(0); window.setSeatbelts(false); window.setEngine(false); window.setOdometer(0);

// ---------- Demo (otomatis di preview Netlify atau dengan ?demo) ----------
const params = new URLSearchParams(location.search);
const isPreview = params.has('demo') || (/netlify\.app$/.test(location.hostname) && !params.has('nodemo'));
if (isPreview) {
    document.body.classList.add('preview');
    const fit = () => document.documentElement.style.setProperty('--scale', Math.min(1, window.innerWidth / 860, window.innerHeight / 560));
    fit(); window.addEventListener('resize', fit);

    // Panel pilih tema + warna jarum (hanya muncul di demo)
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:12px;left:12px;display:flex;gap:6px;align-items:center;font:600 13px Rajdhani,sans-serif;color:#cfd6e4;z-index:9';
    THEMES.forEach((t) => {
        const b = document.createElement('button');
        b.textContent = t;
        b.style.cssText = 'padding:4px 10px;border:1px solid #444;background:#111;color:#fff;border-radius:4px;cursor:pointer';
        b.onclick = () => window.setTheme(t);
        bar.appendChild(b);
    });
    const pick = document.createElement('input');
    pick.type = 'color'; pick.value = '#2f7bff'; pick.title = 'Warna jarum';
    pick.oninput = () => window.setNeedleColor(pick.value);
    bar.append('jarum:', pick);
    document.body.appendChild(bar);

    const GEAR_TOP = [0, 28, 48, 72, 98, 128, 165];
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
            const rpm = 0.11 + clamp01((mph - lo) / (hi - lo)) * (throttle ? 0.86 : 0.6);
            health = Math.max(180, health - 0.9); if (health <= 180) health = 1000;
            fuel = fuel <= 4 ? 86 : fuel - 0.02;
            odo += (mph * 0.05) / 3600;
            setSpeed(mps); setRPM(rpm); setGear(gear); setHealth(health); setFuel(fuel); setOdometer(odo);
            setHeadlights(Math.floor(t / 9) % 3 === 2 ? 2 : 1);
        }, 50);
    }, 1000);
}
