/* The Precession Clock: RealAether. Data: precession_data.json (built by compute.py + poi.py). */
(async function () {
  const D = await (await fetch('precession_data.json')).json();
  const [Y0, Y1, STEP] = D.years, S = D.samples, R2D = 180 / Math.PI, D2R = Math.PI / 180, MAS = D2R / 3600000;
  const E = D.E2000, NOW = 2026;
  const $ = id => document.getElementById(id);
  const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpius','Sagittarius','Capricornus','Aquarius','Pisces'];
  const CN = D.con_names;
  const grp = n => Math.abs(n) < 10000 ? n.toString() : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fmt = y => { const r = Math.round(y); return r <= 0 ? `${grp(1 - r)} BC` : `AD ${grp(r)}`; };
  const fmtShort = y => { const r = Math.round(y); return r <= 0 ? `${grp(1 - r)} BC` : `${grp(r)}`; };

  function samp(y) {
    const f = (y - Y0) / STEP, i = Math.max(0, Math.min(S.length - 2, Math.floor(f))), t = f - i, a = S[i], b = S[i + 1];
    const L = (p, q) => p + (q - p) * t;
    return { P: a.P.map((v, k) => L(v, b.P[k])), obl: L(a.obl, b.obl), drift: L(a.drift, b.drift), rate: L(a.rate, b.rate), ayan: L(a.ayan, b.ayan) };
  }
  const mul = (M, v) => [M[0]*v[0] + M[1]*v[1] + M[2]*v[2], M[3]*v[0] + M[4]*v[1] + M[5]*v[2], M[6]*v[0] + M[7]*v[1] + M[8]*v[2]];
  const norm = v => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0]/n, v[1]/n, v[2]/n]; };
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const sep = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * R2D;

  // stars: [hip, ra, dec, pmra, pmdec, mag, con]
  const ST = D.stars.map(s => {
    const a = s[1]*D2R, d = s[2]*D2R;
    return { hip: s[0], v0: [Math.cos(d)*Math.cos(a), Math.cos(d)*Math.sin(a), Math.sin(d)],
      ea: [-Math.sin(a), Math.cos(a), 0], ed: [-Math.sin(d)*Math.cos(a), -Math.sin(d)*Math.sin(a), Math.cos(d)],
      pa: s[3]*MAS, pd: s[4]*MAS, mag: s[5], con: s[6] };
  });
  const byHip = {}; ST.forEach(s => byHip[s.hip] = s);
  const starAt = (s, y) => { const t = y + 0.22 - 2000; return norm([0,1,2].map(k => s.v0[k] + (s.pa*s.ea[k] + s.pd*s.ed[k])*t)); };
  const poleAt = y => { const P = samp(y).P; return [P[6], P[7], P[8]]; };
  const ecl = v => { const w = mul(E, v); return [Math.atan2(w[1], w[0]), Math.asin(Math.max(-1, Math.min(1, w[2])))]; };
  const radec = v => [Math.atan2(v[1], v[0]), Math.asin(v[2])];
  const unitRD = (ra, de) => [Math.cos(de*D2R)*Math.cos(ra*D2R), Math.cos(de*D2R)*Math.sin(ra*D2R), Math.sin(de*D2R)];

  const ERAS = D.eras, CYC = ERAS.slice(1, ERAS.length - 1);
  const FIVE = ['τ Her', 'Thuban', 'Polaris', 'Errai', 'Alderamin'].map(n => CYC.find(e => e.name === n));
  const eraAt = y => ERAS.find(e => (e.from === null || y >= e.from) && (e.to === null || y < e.to));
  const QCOL = { good: '#f3d36b', fair: '#5ad1ff', none: '#4a4f6d' };
  const POI = {}; D.poi.forEach(p => POI[p.name] = p);
  const shownPoi = new Set(); ERAS.forEach(e => e.poi.forEach(n => shownPoi.add(n)));
  const cycleLen = 1296000 / samp(2000).rate;
  $('k-obl').textContent = samp(2000).obl.toFixed(1); $('k-cyc').textContent = grp(Math.round(cycleLen / 10) * 10);

  // ---------- sky chart ----------
  const cv = $('chart'), cx = cv.getContext('2d'), W = cv.width, C = W / 2, RMAX = 40, K = (W / 2 - 105) / RMAX;
  const proj = v => { const [l, b] = ecl(v); const c = 90 - b * R2D; return [C + K * c * Math.cos(l), C - K * c * Math.sin(l), c, l]; };
  const pathPts = []; for (let y = Y0; y <= Y1 - 1000; y += 20) pathPts.push([y, proj(poleAt(y))]);
  function poleAngle(y) { const [l] = ecl(poleAt(y)); return l; }
  function drawChart(y) {
    cx.clearRect(0, 0, W, W);
    cx.save(); cx.beginPath(); cx.arc(C, C, K * RMAX, 0, 2 * Math.PI); cx.clip();
    // grid
    cx.strokeStyle = '#ffffff10'; cx.lineWidth = 1;
    for (let r = 10; r <= RMAX; r += 10) { cx.beginPath(); cx.arc(C, C, K * r, 0, 2 * Math.PI); cx.stroke(); }
    // constellation lines
    cx.strokeStyle = '#5ad1ff22'; cx.lineWidth = 1;
    const pos = {}; ST.forEach(s => { const p = proj(starAt(s, y)); if (p[2] < RMAX + 4) pos[s.hip] = p; });
    for (const ab in D.lines) for (const [a, b] of D.lines[ab]) { const p = pos[a], q = pos[b]; if (p && q) { cx.beginPath(); cx.moveTo(p[0], p[1]); cx.lineTo(q[0], q[1]); cx.stroke(); } }
    // pole path coloured by era
    for (let i = 1; i < pathPts.length; i++) {
      const [ya, pa] = pathPts[i - 1], [, pb] = pathPts[i], e = eraAt(ya);
      cx.strokeStyle = QCOL[e.quality] + (ya <= y ? 'ee' : '66'); cx.lineWidth = 3; cx.beginPath(); cx.moveTo(pa[0], pa[1]); cx.lineTo(pb[0], pb[1]); cx.stroke();
    }
    // stars
    for (const h in pos) { const s = byHip[h], p = pos[h]; const r = Math.max(0.7, 3.6 - 0.62 * s.mag);
      cx.fillStyle = s.mag < 2 ? '#fff8e0' : '#dfe6ff'; cx.globalAlpha = Math.min(1, 1.15 - s.mag * 0.13); cx.beginPath(); cx.arc(p[0], p[1], r, 0, 2 * Math.PI); cx.fill(); }
    cx.globalAlpha = 1;
    // points of interest
    cx.font = '12px Segoe UI, Roboto, sans-serif';
    const eNow = eraAt(y), curPoi = new Set(eNow.poi);
    D.poi.forEach(o => { if (!shownPoi.has(o.name) && o.name !== "Cat's Eye Nebula") return; const p = proj(unitRD(o.ra, o.dec)); if (p[2] > RMAX) return;
      const hot = curPoi.has(o.name);
      const z = hot ? 6 : 3.5; cx.fillStyle = hot ? '#c9adff' : '#c9adff88'; cx.beginPath(); cx.moveTo(p[0], p[1] - z); cx.lineTo(p[0] + z, p[1]); cx.lineTo(p[0], p[1] + z); cx.lineTo(p[0] - z, p[1]); cx.closePath(); cx.fill();
      if (hot || o.name === "Cat's Eye Nebula") { cx.fillStyle = hot ? '#e2d3ff' : '#c9adff88'; cx.fillText(o.name.replace(/ \(.*\)$/, ''), p[0] + 8, p[1] + 4); } });
    // star names for era stars + bright
    const eraHips = new Set(ERAS.map(e => e.hip));
    cx.font = '600 13px Segoe UI, Roboto, sans-serif';
    for (const h in pos) { const s = byHip[h], p = pos[h]; const nm = D.names[h];
      if (!nm || !(eraHips.has(+h) || s.mag < 1.6)) continue; cx.fillStyle = eraHips.has(+h) ? '#f3d36b' : '#cfd6f0'; cx.fillText(nm, p[0] + 6, p[1] - 6); }
    // centre: pole of the ecliptic
    cx.strokeStyle = '#ffffff55'; cx.beginPath(); cx.moveTo(C - 6, C); cx.lineTo(C + 6, C); cx.moveTo(C, C - 6); cx.lineTo(C, C + 6); cx.stroke();
    cx.fillStyle = '#8d8aa0'; cx.font = '11px Segoe UI, Roboto, sans-serif'; cx.fillText('pole of Earth\u2019s orbit', C + 8, C + 16);
    // current pole + line to era star
    const pv = poleAt(y), pp = proj(pv), e = eraAt(y), es = byHip[e.hip];
    if (es) { const sp = proj(starAt(es, y)); cx.setLineDash([4, 4]); cx.strokeStyle = '#ff6b6b99'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(pp[0], pp[1]); cx.lineTo(sp[0], sp[1]); cx.stroke(); cx.setLineDash([]); }
    cx.strokeStyle = '#ff6b6b'; cx.lineWidth = 2; cx.beginPath(); cx.arc(pp[0], pp[1], 9, 0, 2 * Math.PI); cx.stroke();
    cx.fillStyle = '#ff6b6b'; cx.beginPath(); cx.arc(pp[0], pp[1], 2.5, 0, 2 * Math.PI); cx.fill();
    cx.restore();
    // clock ring: one slice per era
    const RR = K * RMAX + 22;
    CYC.forEach(er => {
      const a = er.from === null ? Y0 : er.from, b = er.to === null ? Y1 : er.to;
      const n = Math.max(2, Math.ceil((b - a) / 100)); cx.strokeStyle = QCOL[er.quality]; cx.lineWidth = er === e ? 20 : 12; cx.globalAlpha = er === e ? 1 : 0.75;
      cx.beginPath(); for (let i = 0; i <= n; i++) { const t = a + (b - a) * i / n, l = poleAngle(t); const X = C + RR * Math.cos(l), Y = C - RR * Math.sin(l); i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); } cx.stroke();
    });
    cx.globalAlpha = 1;
    // slice separators + labels (one cycle)
    cx.font = '600 12px Segoe UI, Roboto, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    CYC.forEach(er => {
      const l0 = poleAngle(er.from); cx.strokeStyle = '#05060c'; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(C + (RR - 11) * Math.cos(l0), C - (RR - 11) * Math.sin(l0)); cx.lineTo(C + (RR + 11) * Math.cos(l0), C - (RR + 11) * Math.sin(l0)); cx.stroke();
      if (er.dur < 400) return;
      const lm = poleAngle((er.from + er.to) / 2), X = C + (RR + 26) * Math.cos(lm), Y = C - (RR + 26) * Math.sin(lm);
      cx.fillStyle = er === e ? '#fff' : (er.quality === 'none' ? '#8d8aa0' : '#e6e3d6'); cx.fillText(er.name, X, Y);
    });
    // clock hand: ecliptic pole -> current pole direction, extended to the ring
    const lc = poleAngle(y); cx.strokeStyle = '#ff6b6b'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(C + (RR - 14) * Math.cos(lc), C - (RR - 14) * Math.sin(lc)); cx.lineTo(C + (RR + 12) * Math.cos(lc), C - (RR + 12) * Math.sin(lc)); cx.stroke();
    cx.textAlign = 'start'; cx.textBaseline = 'alphabetic';
  }

  // ---------- magnetic field + day length ----------
  const M = D.mag, MODELS = ['GGF100k', 'CALS10k.2', 'HFM.OL1.A1', 'SHA.DIF.14k'], MCOL = { 'GGF100k': '#f3d36b', 'CALS10k.2': '#ff9f6b', 'HFM.OL1.A1': '#7fe0a8', 'SHA.DIF.14k': '#c9adff' };
  $('m-dec').textContent = M.decline_1900_2025_pct.toFixed(1) + '%'; $('m-rate').textContent = Math.abs(M.rate_pct_cy).toFixed(1) + '%';
  function seriesAt(arr, y) { if (!arr.length || y < arr[0][0] || y > arr[arr.length - 1][0]) return null;
    let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m][0] <= y) lo = m; else hi = m; }
    const [y0, v0] = arr[lo], [y1, v1] = arr[hi]; return y1 === y0 ? v0 : v0 + (v1 - v0) * (y - y0) / (y1 - y0); }
  function magAt(y) {
    if (y > 2025 && y <= 2026) return `<b>${M.dm2025.toFixed(2)}</b> ×10²² A·m² <small>measured 2025 (IGRF-14), falling ~${Math.abs(M.rate_pct_cy).toFixed(1)}%/century</small>`;
    if (y > 2025) return `<b>unknown</b> <small>(the geodynamo can't be forecast)</small>`;
    if (y >= 1900) return `<b>${seriesAt(M.igrf, y).toFixed(2)}</b> ×10²² A·m² <small>measured (IGRF-14)</small>`;
    const v = MODELS.map(k => seriesAt(M.series[k], y)).filter(x => x !== null);
    return v.length ? `<b>${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)}</b> ×10²² A·m² <small>${v.length} model${v.length > 1 ? 's' : ''}</small>` : '—';
  }
  const sv = $('strip'), sx = sv.getContext('2d'), SW = sv.width, SH = sv.height, XL = 60, XR = SW - 60, Y0s = -13000, Y1s = 15000;
  const X = y => XL + (y - Y0s) / (Y1s - Y0s) * (XR - XL);
  const BAND = [8, 34], MAGR = [48, 300], LODR_ = [326, 400], MMIN = 0, MMAX = 12;
  const MY = m => MAGR[1] - (m - MMIN) / (MMAX - MMIN) * (MAGR[1] - MAGR[0]);
  const LY = l => LODR_[1] - (l + 260) / 520 * (LODR_[1] - LODR_[0]);
  function drawStrip(y) {
    sx.clearRect(0, 0, SW, SH); sx.font = '12px Segoe UI, Roboto, sans-serif';
    // era bands
    ERAS.forEach(e => { const a = Math.max(Y0s, e.from === null ? Y0s : e.from), b = Math.min(Y1s, e.to === null ? Y1s : e.to); if (b <= a) return;
      sx.fillStyle = QCOL[e.quality] + (e === eraAt(y) ? 'ff' : '99'); sx.fillRect(X(a) + 1, BAND[0], X(b) - X(a) - 2, BAND[1] - BAND[0]);
      if (X(b) - X(a) > 42) { sx.fillStyle = e.quality === 'good' ? '#000' : '#fff'; sx.textAlign = 'center'; sx.fillText(e.name, (X(a) + X(b)) / 2, BAND[0] + 17); } });
    // future shading
    sx.fillStyle = '#ffffff08'; sx.fillRect(X(2025), MAGR[0], XR - X(2025), MAGR[1] - MAGR[0]);
    sx.fillStyle = '#8d8aa0'; sx.textAlign = 'center'; sx.font = '600 14px Segoe UI, Roboto, sans-serif';
    sx.fillText('FUTURE FIELD: UNKNOWN', (X(2025) + XR) / 2 + 40, MY(9.2)); sx.font = '12px Segoe UI, Roboto, sans-serif';
    sx.fillText('core convection cannot be forecast; excursions and reversals are unpredictable', (X(2025) + XR) / 2 + 40, MY(9.2) + 18);
    // axes
    sx.strokeStyle = '#ffffff14'; sx.fillStyle = '#8d8aa0'; sx.textAlign = 'right';
    for (let m = 0; m <= 12; m += 2) { sx.beginPath(); sx.moveTo(XL, MY(m)); sx.lineTo(XR, MY(m)); sx.stroke(); sx.fillText(m, XL - 6, MY(m) + 4); }
    sx.save(); sx.translate(16, (MAGR[0] + MAGR[1]) / 2); sx.rotate(-Math.PI / 2); sx.textAlign = 'center'; sx.fillText('dipole moment, ×10²² A·m²', 0, 0); sx.restore();
    sx.textAlign = 'center';
    for (let t = -12000; t <= 14000; t += 2000) { sx.fillText(t <= 0 ? `${grp(1 - t)} BC` : `AD ${grp(t)}`, X(t), SH - 6); sx.beginPath(); sx.moveTo(X(t), MAGR[1]); sx.lineTo(X(t), MAGR[1] + 4); sx.stroke(); }
    // model series
    MODELS.forEach(k => { const a = M.series[k]; sx.strokeStyle = MCOL[k]; sx.lineWidth = 1.6; sx.beginPath(); let on = false;
      a.forEach(([t, m]) => { if (t < Y0s) return; const px = X(t), py = MY(m); on ? sx.lineTo(px, py) : sx.moveTo(px, py); on = true; }); sx.stroke(); });
    sx.strokeStyle = '#fff'; sx.lineWidth = 2.5; sx.beginPath(); M.igrf.forEach(([t, m], i) => i ? sx.lineTo(X(t), MY(m)) : sx.moveTo(X(t), MY(m))); sx.stroke();
    // straight-line illustration of today's trend (NOT a prediction)
    const r = M.rate_pct_cy / 100, y2 = 2500; sx.setLineDash([5, 5]); sx.strokeStyle = '#ffffffaa'; sx.lineWidth = 1.5;
    sx.beginPath(); sx.moveTo(X(2025), MY(M.dm2025)); sx.lineTo(X(y2), MY(M.dm2025 * (1 + r * (y2 - 2025) / 100))); sx.stroke(); sx.setLineDash([]);
    sx.textAlign = 'left'; sx.fillStyle = '#ffffffaa'; sx.fillText('straight line at today’s rate: illustration only, not a prediction', X(y2) + 6, MY(M.dm2025 * (1 + r * (y2 - 2025) / 100)) + 4);
    // day length row
    sx.strokeStyle = '#ffffff14'; sx.beginPath(); sx.moveTo(XL, LY(0)); sx.lineTo(XR, LY(0)); sx.stroke();
    sx.strokeStyle = '#5ad1ff'; sx.lineWidth = 2; sx.beginPath(); sx.moveTo(X(Y0s), LY(M.lod_rate_ms_cy * (Y0s - 2000) / 100)); sx.lineTo(X(Y1s), LY(M.lod_rate_ms_cy * (Y1s - 2000) / 100)); sx.stroke();
    sx.fillStyle = '#8d8aa0'; sx.textAlign = 'right'; sx.fillText('day length vs today', XL + 150, LODR_[0] - 4);
    [[-250, '−250 ms'], [0, 'today'], [250, '+250 ms']].forEach(([l, t]) => sx.fillText(t, XL - 6, LY(l) + 4));
    // cursor
    sx.strokeStyle = '#ff6b6b'; sx.lineWidth = 1.5; sx.beginPath(); sx.moveTo(X(y), BAND[0]); sx.lineTo(X(y), LODR_[1]); sx.stroke();
    sx.textAlign = 'start';
  }
  $('strip-legend').innerHTML = MODELS.map((k, i) => `<span><i class="lg m${i + 1}"></i>${k}</span>`).join('') + '<span><i class="lg mi"></i>IGRF-14 (measured)</span><span><i class="lg fair"></i>day length</span>';
  sv.addEventListener('click', ev => { const r = sv.getBoundingClientRect(), px = (ev.clientX - r.left) * SW / r.width; setY(Math.round(Y0s + (px - XL) / (XR - XL) * (Y1s - Y0s))); });

  // ---------- five great pole stars ----------
  $('five-cards').innerHTML = FIVE.slice().sort((a, b) => a.closest - b.closest).map(e => `<div class="card" data-y="${e.closest}"><div class="nm5">${e.name}</div><div class="yr5">${fmt(e.closest)}</div><small>${e.bayer} · mag ${byHip[e.hip] ? byHip[e.hip].mag : "?"} · ${e.sep.toFixed(2)}° from the pole</small><small>era ${fmt(e.from)} – ${fmt(e.to)}</small></div>`).join('');
  $('five-cards').querySelectorAll('[data-y]').forEach(c => c.addEventListener('click', () => setY(+c.dataset.y)));

  // ---------- readout ----------
  const IAU = D.iau_segments;
  const iauAt = y => { const s = IAU.find(g => (g.from === null || y >= g.from) && (g.to === null || y < g.to)); return s ? s.con : '?'; };
  const signAt = y => { const k = Math.floor(samp(y).ayan / 30); return SIGNS[(((11 - k) % 12) + 12) % 12]; };
  function update(y) {
    y = +y; const s = samp(y), e = eraAt(y), es = byHip[e.hip];
    $('r-year').textContent = fmt(y);
    const d = es ? sep(poleAt(y), starAt(es, y)) : NaN;
    $('r-era').innerHTML = `<b>${e.name}</b> <span class="q ${e.quality}">${e.quality === 'none' ? 'no good pole star' : e.quality}</span><br><small>${e.from === null ? 'before range' : fmt(e.from)} – ${e.to === null ? 'after range' : fmt(e.to)}</small>`;
    $('r-near').innerHTML = `${e.bayer}${e.name !== e.bayer ? ' (' + e.name + ')' : ''}, <b>${d.toFixed(2)}°</b> from the pole<br><small>closest: ${fmt(e.closest)}, ${e.sep.toFixed(2)}°</small>`;
    const dr = -s.drift; $('r-drift').innerHTML = `<b>${Math.abs(dr).toFixed(2)}°</b> ${dr >= 0 ? 'west' : 'east'} along the ecliptic`;
    $('r-rate').innerHTML = `<b>${s.rate.toFixed(2)}″</b> per year (1° every ${Math.round(3600 / s.rate)} yr)`;
    $('r-obl').innerHTML = `<b>${s.obl.toFixed(2)}°</b>`;
    const turn = ((Math.PI / 2 - poleAngle(y)) * R2D % 360 + 360) % 360;
    $('r-turn').innerHTML = `<b>${turn.toFixed(1)}°</b> of 360° past the AD 2000 position`;
    $('r-zod').innerHTML = `${CN[iauAt(y)] || iauAt(y)} / ${signAt(y)}`;
    $('r-mag').innerHTML = magAt(y);
    const lod = M.lod_rate_ms_cy * (y - 2000) / 100; $('r-lod').innerHTML = `<b>${lod >= 0 ? '+' : '−'}${Math.abs(lod).toFixed(0)} ms</b> ${lod >= 0 ? 'longer' : 'shorter'} <small>(tidal braking, long-term average)</small>`;
    drawStrip(y);
    drawChart(y); drawDawn(y);
    document.querySelectorAll('#era-table tbody tr').forEach(tr => tr.classList.toggle('now', +tr.dataset.from <= y && y < +tr.dataset.to));
  }
  const sl = $('slider'); sl.addEventListener('input', () => update(sl.value));
  const setY = y => { sl.value = y; update(y); };
  document.querySelectorAll('[data-y]').forEach(b => b.addEventListener('click', () => setY(+b.dataset.y)));
  const ANCH = [['Göbekli Tepe ~9600 BC', -9599, 'gobekli'], ['Thuban closest', ERAS.find(e => e.name === 'Thuban').closest, 'giza'], ['Giza ~2560 BC', -2559, 'giza'],
    ['Stonehenge ~2500 BC', -2499, 'stonehenge'], ['Hipparchus ~130 BC', -129, 'giza'], ['Polaris closest', ERAS.find(e => e.name === 'Polaris').closest],
    ['Errai', ERAS.find(e => e.name === 'Errai').closest], ['Alderamin', ERAS.find(e => e.name === 'Alderamin').closest], ['δ Cygni', ERAS.find(e => e.name === 'Fawaris').closest], ['Vega', ERAS.filter(e => e.name === 'Vega').pop().closest]];
  ANCH.forEach(([t, y, site]) => { const b = document.createElement('button'); b.textContent = t; b.title = fmt(y); b.onclick = () => { if (site) setSite(site); setY(y); }; $('anchors').appendChild(b); });
  let timer = null; $('play').onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $('play').textContent = '▶ Play'; return; }
    $('play').textContent = '❚❚ Pause'; timer = setInterval(() => { let y = +sl.value + 40; if (y > 15000) y = -13000; setY(y); }, 40);
  };

  // ---------- era table ----------
  function magCell(e) {
    const ms = Object.entries(e.mag).filter(([, v]) => v.cover >= 0.5);
    const rng = ms.length ? `${Math.min(...ms.map(([, v]) => v.mean)).toFixed(1)}–${Math.max(...ms.map(([, v]) => v.mean)).toFixed(1)}` : '—';
    const tip = ms.map(([k, v]) => `${k}: ${v.mean} (range ${v.min}–${v.max})`).join('; ');
    if (e.mag_status === 'future') return '<b>unknown</b><small>can\u2019t be forecast</small>';
    if (e.mag_status === 'mixed') return `<span title="${tip}">${rng}</span><small>era mean to 2025 (${ms.length} models); today ${M.dm2025.toFixed(2)} measured, falling ~${Math.abs(M.rate_pct_cy).toFixed(0)}%/century; after that unknown</small>`;
    return `<span title="${tip}">${rng}</span><small>era means from ${ms.length} model${ms.length > 1 ? 's' : ''}</small>`;
  }
  const tb = document.querySelector('#era-table tbody');
  CYC.forEach(e => {
    const tr = document.createElement('tr'); tr.dataset.from = e.from; tr.dataset.to = e.to;
    const pois = e.poi.length ? '<ul class="poi-l">' + e.poi.map(n => `<li><b>${POI[n].name}</b> <span>— ${POI[n].desc}</span></li>`).join('') + '</ul>'
      : '<span class="note">A quiet stretch: mostly faint, distant galaxies and galaxy clusters.</span>';
    tr.innerHTML = `<td class="nm"><b>${e.name}</b>${e.name !== e.bayer ? `<small>${e.bayer} · mag ${byHip[e.hip] ? byHip[e.hip].mag : "?"}</small>` : `<small>mag ${byHip[e.hip] ? byHip[e.hip].mag : "?"}</small>`}</td>
      <td>${fmt(e.from)}</td><td>${fmt(e.to)}</td><td>${grp(e.dur)} yr</td><td>${fmt(e.closest)}</td>
      <td>${e.sep.toFixed(2)}°<span class="q ${e.quality}">${e.quality === 'none' ? 'no good pole star' : e.quality}</span></td><td class="mag">${magCell(e)}</td>
      <td class="mag">${e.lod_ms >= 0 ? '+' : '−'}${Math.abs(e.lod_ms).toFixed(0)} ms</td><td>${pois}</td>`;
    tr.onclick = () => setY(e.closest); tb.appendChild(tr);
  });
  const first = ERAS[0], last = ERAS[ERAS.length - 1];
  $('era-note').innerHTML = `One full turn of the clock runs from ${fmt(CYC[0].from)} to ${fmt(CYC[CYC.length - 1].to)} (${grp(CYC[CYC.length - 1].to - CYC[0].from)} years). Before it, ${first.name} was nearest (closest ${fmt(first.closest)}, ${first.sep.toFixed(2)}°); after it, ${last.bayer} takes over and comes within ${last.sep.toFixed(2)}° in ${fmt(last.closest)}. The wobble doesn't repeat exactly: the stars move, and the planets slowly tilt Earth's orbit, so the same star can pass at a different distance next time. Click a row to jump the clock to that era's closest approach.`;

  // ---------- passes table ----------
  const pt = document.querySelector('#pass-table tbody');
  D.pole_table.forEach(p => { const tr = document.createElement('tr'); if (!p.notable) tr.className = 'minor';
    tr.innerHTML = `<td class="nm"><b>${p.name}</b>${p.name !== p.bayer ? `<small>${p.bayer}</small>` : ''}</td><td>${p.mag}</td><td>${fmt(p.year)}</td><td>${p.sep.toFixed(2)}°</td><td>${fmt(p.year_nopm)}</td><td>${p.sep_nopm.toFixed(2)}°</td>`;
    tr.onclick = () => setY(Math.max(-13000, Math.min(15000, p.year))); pt.appendChild(tr); });
  const nMinor = D.pole_table.filter(p => !p.notable).length;
  $('pass-toggle').textContent = `Show ${nMinor} fainter or more distant passes`;
  $('pass-toggle').onclick = () => { const t = document.getElementById('pass-table'); t.classList.toggle('all');
    $('pass-toggle').textContent = t.classList.contains('all') ? 'Show notable passes only' : `Show ${nMinor} fainter or more distant passes`; };

  // ---------- zodiac table ----------
  const LA = Object.entries(D.lahiri).map(([k, v]) => [+k, v]).sort((a, b) => a[0] - b[0]);
  const lah = LA.map(([k, v], i) => ({ sign: SIGNS[(((12 - (k + 1)) % 12) + 12) % 12], from: v, to: i + 1 < LA.length ? LA[i + 1][1] : null }));
  const zt = document.querySelector('#zod-table tbody');
  IAU.filter(g => g.from !== null && g.to !== null).forEach(g => {
    const nm = CN[g.con] || g.con, mid = (g.from + g.to) / 2;
    const L = lah.filter(l => l.sign === nm && l.to !== null).sort((a, b) => Math.abs((a.from + a.to) / 2 - mid) - Math.abs((b.from + b.to) / 2 - mid))[0];
    const tr = document.createElement('tr'); if (g.from <= NOW && NOW < g.to) tr.classList.add('now');
    tr.innerHTML = `<td class="nm"><b>${nm}</b>${g.con === 'Oph' ? '<small>not one of the 12 signs</small>' : ''}</td><td>${fmt(g.from)}</td><td>${fmt(g.to - 1)}</td><td>${grp(Math.round(g.to - g.from))} yr</td>
      <td>${L ? fmt(L.from) : '—'}</td><td>${L ? fmt(L.to - 1) : '—'}</td>`;
    tr.onclick = () => setY(Math.round(mid)); zt.appendChild(tr);
  });
  const iPsc = IAU.find(g => g.con === 'Psc' && g.from < NOW && NOW < g.to), iOph = IAU.find(g => g.con === 'Oph'), iSco = IAU.find(g => g.con === 'Sco' && g.from > 0);
  const lPsc = lah.find(l => l.sign === 'Pisces' && l.from < NOW && (l.to === null || NOW < l.to));
  $('zod-note').innerHTML = `"From" is the first year the March-equinox Sun is in that constellation; "to" is the last full year before it moves on. Now: the vernal point is in Pisces under both systems. IAU boundaries: Pisces since ${fmt(iPsc.from)}, Aquarius from ${fmt(iPsc.to)}. Equal signs (Lahiri): Pisces since ${fmt(lPsc.from)}, Aquarius from ${fmt(lPsc.to)}.
    The two disagree because real constellations have very different widths along the ecliptic (Ophiuchus holds the vernal point for ${grp(Math.round(iOph.to - iOph.from))} years, Scorpius for only ${grp(Math.round(iSco.to - iSco.from))}), and because there is no official start point for equal signs: other anchors (Fagan-Bradley, Raman, etc.) shift every sign date by decades. Cross-check: the IAU dates match the widely quoted values (Pisces from 68 BC; Aquarius in AD 2597, Meeus).`;

  // ---------- dawn view ----------
  const SITES = { gobekli: ['Göbekli Tepe', 37.223], giza: ['Giza', 29.979], stonehenge: ['Stonehenge', 51.179] };
  let site = 'gobekli';
  function setSite(k) { site = k; document.querySelectorAll('#sites button').forEach(b => b.classList.toggle('on', b.dataset.s === k)); drawDawn(+sl.value); }
  Object.entries(SITES).forEach(([k, [n, lat]]) => { const b = document.createElement('button'); b.textContent = `${n} (${lat.toFixed(1)}°N)`; b.dataset.s = k; b.onclick = () => setSite(k); $('sites').appendChild(b); });
  const dv = $('dawnc'), dx = dv.getContext('2d'), DW = dv.width, DH = dv.height, AZ0 = 35, AZ1 = 145, ALT1 = 55, GH = 40;
  const ax = az => (az - AZ0) / (AZ1 - AZ0) * DW, ay = alt => (DH - GH) - alt / ALT1 * (DH - GH);
  function altaz(v, lat, lst) {
    const [ra, de] = radec(v), h = lst - ra, f = lat * D2R;
    const alt = Math.asin(Math.sin(f) * Math.sin(de) + Math.cos(f) * Math.cos(de) * Math.cos(h));
    const az = Math.atan2(-Math.cos(de) * Math.sin(h), Math.sin(de) * Math.cos(f) - Math.cos(de) * Math.sin(f) * Math.cos(h));
    return [alt * R2D, ((az * R2D) % 360 + 360) % 360];
  }
  function drawDawn(y) {
    const [nm, lat] = SITES[site], s = samp(y), P = s.P, eps = s.obl * D2R;
    const H = -Math.acos(Math.sin(-12 * D2R) / Math.cos(lat * D2R)), lst = H;   // Sun at RA 0, Dec 0 of date
    dx.clearRect(0, 0, DW, DH);
    const pos = {}; ST.forEach(st => { const v = mul(P, starAt(st, y)); const [al, az] = altaz(v, lat, lst); if (al > -2 && az > AZ0 - 5 && az < AZ1 + 5) pos[st.hip] = [ax(az), ay(al), st]; });
    dx.strokeStyle = '#5ad1ff30'; dx.lineWidth = 1;
    for (const ab in D.lines) for (const [a, b] of D.lines[ab]) { const p = pos[a], q = pos[b]; if (p && q && Math.abs(p[0] - q[0]) < DW / 2) { dx.beginPath(); dx.moveTo(p[0], p[1]); dx.lineTo(q[0], q[1]); dx.stroke(); } }
    // ecliptic of date
    dx.setLineDash([6, 6]); dx.strokeStyle = '#d4af3799'; dx.lineWidth = 1.5; dx.beginPath(); let on = false;
    for (let l = -100; l <= 140; l += 1) { const v = [Math.cos(l * D2R), Math.sin(l * D2R) * Math.cos(eps), Math.sin(l * D2R) * Math.sin(eps)]; const [al, az] = altaz(v, lat, lst);
      if (az < AZ0 - 10 || az > AZ1 + 10 || al < -20) { on = false; continue; } const X = ax(az), Y = ay(al); on ? dx.lineTo(X, Y) : dx.moveTo(X, Y); on = true; }
    dx.stroke(); dx.setLineDash([]);
    for (const h in pos) { const [X, Y, st] = pos[h]; if (Y > DH - GH) continue; const r = Math.max(0.8, 4 - 0.7 * st.mag);
      dx.fillStyle = '#f4f1ff'; dx.globalAlpha = Math.min(1, 1.2 - st.mag * 0.14); dx.beginPath(); dx.arc(X, Y, r, 0, 2 * Math.PI); dx.fill(); }
    dx.globalAlpha = 1;
    // constellation labels at the mean of their drawn stars
    const sunCon = iauAt(y), groups = {};
    for (const h in pos) { const [X, Y, st] = pos[h]; if (Y > DH - GH - 4 || st.mag > 4.2) continue; (groups[st.con] = groups[st.con] || []).push([X, Y]); }
    dx.font = '600 13px Segoe UI, Roboto, sans-serif'; dx.textAlign = 'center';
    for (const c in groups) { const g = groups[c]; if (g.length < 2) continue; const X = g.reduce((a, p) => a + p[0], 0) / g.length, Y = g.reduce((a, p) => a + p[1], 0) / g.length;
      dx.fillStyle = c === sunCon ? '#f3d36b' : '#9fb3e8aa'; dx.fillText((CN[c] || c).toUpperCase(), X, Math.min(Y, DH - GH - 10)); }
    for (const h in pos) { const nmS = D.names[h], [X, Y, st] = pos[h]; if (!nmS || st.mag > 1.8 || Y > DH - GH) continue; dx.fillStyle = '#ffffffcc'; dx.font = '12px Segoe UI, Roboto, sans-serif'; dx.fillText(nmS, X, Y - 9); }
    // ground + compass
    dx.fillStyle = '#0a0d18'; dx.fillRect(0, DH - GH, DW, GH); dx.strokeStyle = '#d4af3766'; dx.beginPath(); dx.moveTo(0, DH - GH); dx.lineTo(DW, DH - GH); dx.stroke();
    dx.fillStyle = '#8d8aa0'; dx.font = '12px Segoe UI, Roboto, sans-serif';
    [[45, 'NE'], [90, 'E'], [135, 'SE']].forEach(([a, t]) => dx.fillText(t, ax(a), DH - 14));
    const [sal, saz] = altaz([1, 0, 0], lat, lst); dx.fillStyle = '#f3d36b'; dx.beginPath(); dx.arc(ax(saz), DH - GH + 14, 5, 0, 2 * Math.PI); dx.fill();
    dx.fillText(`Sun (${sal.toFixed(0)}°, below)`, ax(saz), DH - GH + 32);
    dx.textAlign = 'start';
    $('dawn-note').innerHTML = `${nm}, March equinox, ${fmt(y)}. The Sun is in <b>${CN[sunCon] || sunCon}</b> (IAU boundaries), so the stars of ${CN[sunCon] || sunCon} rise with it and are lost in the glow. The constellation just above it in the east is the one seen rising before the Sun. Era pole star: <b>${eraAt(y).name}</b>.`;
  }
  const qs = new URLSearchParams(location.search), qy = parseInt(qs.get('y'), 10), qsite = qs.get('site');
  setSite(SITES[qsite] ? qsite : 'gobekli'); setY(Number.isFinite(qy) ? Math.max(-13000, Math.min(15000, qy)) : NOW);
  if (qs.get('tab') === 'zodiac') document.getElementById('zodiac').scrollIntoView();
})();
