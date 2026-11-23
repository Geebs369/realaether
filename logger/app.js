(function () {
  const TZ = 'America/New_York';
  const COL = { GREEN: '#6bff9e', YELLOW: '#ffe066', ORANGE: '#ff9f43', RED: '#ff5252' };
  const fmt = (ts) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts * 1000));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const chip = (c) => c ? `<span class="chip ${esc(c)}">${esc(c)}</span>` : '—';

  Promise.all([fetch('data/summary.json').then(r => r.json()), fetch('data/wind_hourly.csv').then(r => r.text())]).then(([s, csv]) => {
    const W = s.rule.window_h;
    document.getElementById('win').textContent = W;
    document.querySelectorAll('.winh').forEach(e => e.textContent = W);
    const wind = csv.trim().split('\n').slice(1).map(l => l.split(',')).map(a => ({ x: +a[1] * 1000, y: +a[2] }));

    // tally
    const t = s.tally;
    const lt = s.lull_tally || {};
    const any48 = (lt.any && lt.any.h0_48) || {};
    const any27 = (lt.any && lt.any.d2_7) || {};
    document.getElementById('tally').innerHTML = [
      [`${t.coincident} / ${t.tested}`, 'Alert changes with a spike within ±' + W + ' h'],
      [t.expected_by_chance.toFixed(2), 'Matches expected from chance alone'],
      [(t.window_cover * 100).toFixed(1) + '%', 'Share of the record near a spike'],
      [s.spikes.length, 'Solar wind spikes logged'],
      [(s.lulls || []).length, 'Solar wind lulls logged'],
      [((any48.flagged || 0) + ' / ' + (any48.complete || 0)), 'Lulls flagged in 0–48 h (complete)'],
      [((any27.flagged || 0) + ' / ' + (any27.complete || 0)), 'Lulls flagged in days 2–7 (complete)'],
    ].map(([b, l]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(l)}</span></div>`).join('');
    document.getElementById('tally-note').textContent = t.tested
      ? `One-sided binomial p ≈ ${t.p_value}. Small numbers: a single match moves this a lot. Testing, not proof.`
      : 'No alert changes inside the solar wind record yet.';
    document.getElementById('elevated').innerHTML = (s.elevated || []).length
      ? s.elevated.map(v => `${chip(v.color)} ${esc(v.name)} <span style="opacity:.7">(${esc(v.level)}, ${esc(v.obs)})</span>`).join('<br>')
      : 'No U.S. volcanoes above GREEN/NORMAL.';

    // tables
    const ch = s.changes.slice().reverse();
    const KIND = { speed_drop: 'speed drop', pdyn_drop: 'pressure drop', storm_end: 'storm-end lull' };
    const lullCell = (c) => {
      if (c.after_lull_h == null) return 'no';
      const w = c.after_lull_window === 'h0_48' ? '0–48 h' : 'days 2–7';
      const up = c.direction === 'up' ? ' <span class="yes">(raised alert)</span>' : '';
      return `<span class="yes">${c.after_lull_h} h after a ${esc(KIND[c.after_lull_kind] || c.after_lull_kind)} (${w})</span>${up}`;
    };
    document.querySelector('#changes tbody').innerHTML = ch.map(c => {
      const tested = +c.event_unix >= s.wind.first + s.rule.baseline_hours[0] * 3600 && +c.event_unix <= s.wind.last;
      const near = c.nearest_spike_h === null ? '—' : (c.nearest_spike_h > 0 ? `${c.nearest_spike_h} h after` : `${-c.nearest_spike_h} h before`);
      return `<tr><td>${fmt(+c.event_unix)}</td><td>${esc(c.volcano)}</td><td>${esc(c.observatory)}</td>
        <td>${chip(c.prev_color)} → ${chip(c.color)} <span style="opacity:.7">${esc(c.prev_level)} → ${esc(c.level)}</span></td>
        <td>${tested ? esc(near) : '<span style="opacity:.6">before record</span>'}</td>
        <td>${tested ? (c.coincident ? '<span class="yes">match</span>' : 'no') : '<span style="opacity:.6">not tested</span>'}</td>
        <td>${lullCell(c)}</td>
        <td>${c.notice_url ? `<a href="${esc(c.notice_url)}" target="_blank" rel="noopener">USGS</a>` : esc(c.source)}</td></tr>`;
    }).join('') || '<tr><td colspan="8">None logged yet.</td></tr>';
    document.querySelector('#spikes tbody').innerHTML = s.spikes.slice().reverse().map(p =>
      `<tr><td>${fmt(p.start)}</td><td>${p.baseline} km/s</td><td>${p.speed} km/s</td><td>+${p.rise} km/s</td><td>${p.peak24} km/s</td><td>${p.rule === 'jump' ? 'jump ≥ ' + s.rule.jump_kms : 'crossed ' + s.rule.fast_kms}</td></tr>`
    ).join('') || '<tr><td colspan="6">No spikes in the record yet.</td></tr>';

    const flagCell = (w) => {
      if (!w) return '—';
      if (w.status === 'pending') return '<span style="opacity:.6">pending</span>';
      if (w.status === 'in_progress') return `<span style="opacity:.6">in progress (${w.n_declustered} decl., ${w.n_m6} M6+, ${w.n_volc_up} raised)</span>`;
      if (w.flagged) {
        const bits = [];
        if (w.n_m6) bits.push(w.n_m6 + ' M6+');
        if (w.cluster) bits.push('M4.5+ cluster (' + w.n_declustered + ' vs ' + w.expected + ' expected)');
        if (w.n_volc_up) bits.push(w.n_volc_up + ' raised volcano alert' + (w.n_volc_up > 1 ? 's' : ''));
        return '<span class="yes">flagged</span> — ' + esc(bits.join('; '));
      }
      return `no (${w.n_declustered} decl., ${w.n_m6} M6+, ${w.n_volc_up} raised)`;
    };
    const kindLabel = (e) => {
      const base = KIND[e.kind] || e.kind;
      return e.charge ? base + ' · charge then release' : base;
    };
    const details = (e) => {
      if (e.kind === 'speed_drop') {
        let t = `${e.dV_24h} km/s in 24 h, speed ${e.speed} km/s`;
        if (e.charge) t += `, prior 3-day mean ${e.charge_mean} km/s`;
        return t;
      }
      if (e.kind === 'pdyn_drop') return `ΔP ${e.dP_24h} nPa in 24 h (P ${e.pdyn} nPa)`;
      if (e.kind === 'storm_end') return `Kp fell to ${e.kp} after a G1+ storm`;
      return e.rule || '';
    };
    const lulls = (s.lulls || []).slice().reverse();
    const lullBody = document.querySelector('#lull-table tbody');
    if (lullBody) {
      lullBody.innerHTML = lulls.map(e =>
        `<tr${e.coincident ? ' class="selected"' : ''}><td>${fmt(e.start)}</td><td>${esc(kindLabel(e))}</td><td>${esc(details(e))}</td>
          <td>${flagCell(e.h0_48)}</td><td>${flagCell(e.d2_7)}</td></tr>`
      ).join('') || '<tr><td colspan="5">No lulls in the live record yet. The 20-year test below already covers hundreds of them.</td></tr>';
    }
    const ls = document.getElementById('lull-stats');
    if (ls) {
      const sd = lt.speed_drop || {}, pd = lt.pdyn_drop || {}, se = lt.storm_end || {};
      ls.innerHTML = [
        [sd.n || 0, 'Speed drops' + (sd.n_charge ? ` (${sd.n_charge} charge-then-release)` : '')],
        [pd.n || 0, 'Pressure drops'],
        [se.n || 0, 'Storm-end lulls'],
        [((any48.flagged || 0) + (any27.flagged || 0) === 0 ? '0' : (any48.flagged || 0) + ' / ' + (any27.flagged || 0)), 'Unique hours flagged in 0–48 h / days 2–7'],
      ].map(([b, l]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(l)}</span></div>`).join('');
    }
    const ln = document.getElementById('lull-note');
    if (ln) {
      ln.textContent = (s.lulls || []).length
        ? 'Flags use the 20-year mean rate for clusters and are only set once a window has finished. The live record is short, so these counts will move a lot; the 20-year downtick test further down the page is the one to read.'
        : 'No lulls yet in the live solar-wind record (it only goes back a few days). Density for pressure drops starts once the feed has proton density; older back-filled hours have speed only.';
    }
    const r = s.rule;
    const ruleEl = document.getElementById('rule');
    if (ruleEl) ruleEl.textContent = `Spike rule (fixed in advance): an hour whose median speed is at least ${r.jump_kms} km/s above the median of hours ${r.baseline_hours[0]} to ${r.baseline_hours[1]} before it, or an hour that crosses up through ${r.fast_kms} km/s. A new spike needs ${r.refractory_h} h since the previous one. Match window: ±${r.window_h} h from a spike start.`;
    document.getElementById('gen').textContent = `Updated ${s.generated_et}. Solar wind record: ${fmt(s.wind.first)} to ${fmt(s.wind.last)} ET (${s.wind.hours} hours).`;

    // chart
    const lo = wind.length ? wind[0].x : Date.now() - 7 * 864e5;
    const ymax = Math.max(600, ...wind.map(p => p.y)) * 1.08;
    const spikePts = s.spikes.map(p => ({ x: p.start * 1000, y: p.speed, p }));
    const lullPts = (s.lulls || []).filter(u => u.speed != null).map(u => ({ x: u.start * 1000, y: u.speed, u }));
    const lullPtsKp = (s.lulls || []).filter(u => u.speed == null).map(u => ({ x: u.start * 1000, y: ymax * 0.78, u }));
    const qPts = ((s.quakes && s.quakes.big) || []).filter(q => q.time_unix * 1000 >= lo).map(q => ({ x: q.time_unix * 1000, y: ymax * 0.86, q }));
    const chPts = s.changes.filter(c => +c.event_unix * 1000 >= lo - 864e5).map(c => ({ x: +c.event_unix * 1000, y: ymax * 0.94, c }));
    new Chart(document.getElementById('chart'), {
      data: { datasets: [
        { type: 'line', label: 'Solar wind speed (km/s)', data: wind, borderColor: '#5ad1ff', backgroundColor: '#5ad1ff22', borderWidth: 1.5, pointRadius: 0, fill: true, tension: .2 },
        { type: 'scatter', label: 'Spike start', data: spikePts, pointStyle: 'rectRot', pointRadius: 7, backgroundColor: '#f3d36b', borderColor: '#000' },
        { type: 'scatter', label: 'Lull start', data: lullPts.concat(lullPtsKp), pointStyle: 'rectRot', pointRadius: 6, backgroundColor: '#5ad1ff', borderColor: '#000' },
        { type: 'scatter', label: 'Volcano alert change', data: chPts, pointStyle: 'triangle', pointRadius: 9,
          rotation: chPts.map(p => p.c.direction === 'down' ? 180 : 0), backgroundColor: chPts.map(p => COL[p.c.color] || '#ccc'), borderColor: '#000' },
        { type: 'scatter', label: 'M6+ earthquake', data: qPts, pointStyle: 'circle', pointRadius: qPts.map(p => 4 + (p.q.mag - 6) * 4), backgroundColor: '#ff5a5acc', borderColor: '#000' },
      ] },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        scales: { x: { type: 'time', min: lo, adapters: { date: {} }, time: { tooltipFormat: 'MMM d HH:mm', displayFormats: { hour: 'HH:mm', day: 'MMM d' } }, ticks: { color: '#8d8aa0' }, grid: { color: '#262a44' } },
                  y: { min: 200, max: ymax, title: { display: true, text: 'km/s', color: '#8d8aa0' }, ticks: { color: '#8d8aa0' }, grid: { color: '#262a44' } } },
        plugins: { legend: { labels: { color: '#e6e3d6' } }, tooltip: { callbacks: {
          title: (it) => fmt(it[0].raw.x / 1000) + ' ET',
          label: (it) => it.raw.q ? `M${it.raw.q.mag} earthquake: ${it.raw.q.place}` : it.raw.c ? `${it.raw.c.volcano}: ${it.raw.c.prev_color} → ${it.raw.c.color} (${it.raw.c.prev_level} → ${it.raw.c.level})`
            : it.raw.u ? `Lull: ${it.raw.u.kind}${it.raw.u.charge ? ' (charge then release)' : ''}${it.raw.u.dV_24h != null ? ', dV ' + it.raw.u.dV_24h + ' km/s' : ''}${it.raw.u.dP_24h != null ? ', dP ' + it.raw.u.dP_24h + ' nPa' : ''}${it.raw.u.kp != null ? ', Kp ' + it.raw.u.kp : ''}`
            : it.raw.p ? `Spike: ${it.raw.p.baseline} → ${it.raw.p.speed} km/s (peak ${it.raw.p.peak24})` : `${it.raw.y} km/s` } } } }
    });
  }).catch(e => { document.getElementById('gen').textContent = 'Could not load data: ' + e; });
})();
