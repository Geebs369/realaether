(function () {
  const TZ = 'America/New_York';
  const fmt = (ts) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts * 1000));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (id) => document.getElementById(id);
  const stat = (b, l) => `<div class="stat"><b>${esc(b)}</b><span>${esc(l)}</span></div>`;
  const pct = (r) => (r >= 1 ? '+' : '−') + Math.abs((r - 1) * 100).toFixed(1) + '%';
  const TRIG = { spikes: 'Solar wind spikes', kp_storms: 'Geomagnetic storms (Kp ≥ 5)', bz_south: 'Strong southward IMF (Bz ≤ −10 nT)' };
  const SETS = { declustered: 'Declustered M4.5+', raw: 'All M4.5+ (raw)', m6: 'M6+ (raw)', energy_declustered: 'Energy, declustered' };

  fetch('data/quake_baseline.json').then(r => r.json()).then(b => {
    $('qb-period').textContent = b.period.start.slice(0, 4) + '–' + b.period.end.slice(0, 7);
    const P = b.results.spikes.declustered;
    $('qb-stats').innerHTML = [
      stat(P.observed.toFixed(2), 'Declustered quakes per 48 h after a spike'),
      stat(P.null_mean.toFixed(2), 'Same, at random times'),
      stat(pct(P.ratio), 'Difference'),
      stat(P.p_one_sided.toFixed(2), 'p-value (main test)'),
      stat(b.counts.spikes.toLocaleString(), 'Solar wind spikes tested'),
      stat(b.counts.quakes_m45.toLocaleString(), 'M4.5+ quakes in the catalog'),
    ].join('');
    const anyHit = Object.values(b.results).some(t => Object.values(t).some(x => x.p_one_sided < b.bonferroni_alpha));
    $('qb-note').innerHTML = `Main test result: after ${b.counts.spikes.toLocaleString()} solar wind spikes there were <b>${P.observed.toFixed(2)}</b> declustered M4.5+ quakes per 48 h,
      versus <b>${P.null_mean.toFixed(2)}</b> when the same spikes are slid to random times (random range ${P.null_p2_5.toFixed(2)}–${P.null_p97_5.toFixed(2)}).
      That is ${pct(P.ratio)}, p = ${P.p_one_sided.toFixed(2)}: <b>no sign that spikes come before more earthquakes.</b>
      ${anyHit ? 'One of the side tests passes the multiple-test bar; see the table.' : `None of the ${b.tests} tests in the table passes the multiple-test bar (p &lt; ${b.bonferroni_alpha}).`}`;
    const rows = [];
    for (const t of Object.keys(TRIG)) for (const k of Object.keys(SETS)) {
      const x = b.results[t][k];
      const dig = k === 'energy_declustered' ? 2 : 2;
      rows.push(`<tr${t === 'spikes' && k === 'declustered' ? ' class="selected"' : ''}><td>${esc(TRIG[t])}</td><td>${esc(SETS[k])}${k === 'energy_declustered' ? ' <span style="opacity:.6">(10¹⁵ J)</span>' : ''}</td><td class="num">${x.n_triggers}</td>
        <td class="num">${x.observed.toFixed(dig)}</td><td class="num">${x.null_mean.toFixed(dig)} <span style="opacity:.6">(${x.null_p2_5.toFixed(dig)}–${x.null_p97_5.toFixed(dig)})</span></td>
        <td class="num">${x.ratio.toFixed(2)}</td><td class="num">${x.p_one_sided < b.bonferroni_alpha ? '<span class="yes">' + x.p_one_sided.toFixed(3) + '</span>' : x.p_one_sided.toFixed(3)}</td></tr>`);
    }
    document.querySelector('#qb-table tbody').innerHTML = rows.join('');
    $('qb-foot').innerHTML = `Highlighted row = the main test. ${b.tests} tests are shown, so a single p below 0.05 is expected about once by luck alone; the bar for "worth a closer look" is p &lt; ${b.bonferroni_alpha} (0.05 ÷ ${b.tests}).
      Energy totals are dominated by a few giant quakes (one M9 releases more energy than thousands of M5s), so the energy rows swing a lot and are the least reliable.
      Period ${esc(b.period.start)} to ${esc(b.period.end)} UTC; solar wind hours available ${(b.counts.wind_hour_coverage * 100).toFixed(0)}%; ${b.counts.declustered.toLocaleString()} quakes left after declustering; ${b.n_perm.toLocaleString()} random shifts per test. Built ${esc(b.generated_et)}.`;

    // superposed epoch chart
    let chart = null;
    const draw = (t) => {
      const s = b.sea[t];
      const ds = [
        { label: 'random range', data: s.null_hi, borderColor: 'transparent', backgroundColor: '#5ad1ff22', pointRadius: 0, fill: '+1' },
        { label: 'random low', data: s.null_lo, borderColor: 'transparent', pointRadius: 0, fill: false },
        { label: 'random average', data: s.null_mean, borderColor: '#5ad1ff', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false },
        { label: TRIG[t] + ' (average)', data: s.mean, borderColor: '#f3d36b', backgroundColor: '#f3d36b', borderWidth: 2, pointRadius: 3, fill: false },
      ];
      if (chart) chart.destroy();
      chart = new Chart($('qchart'), { type: 'line', data: { labels: s.days.map(d => (d > 0 ? '+' : '') + d), datasets: ds },
        options: { responsive: true, maintainAspectRatio: false, animation: false,
          scales: { x: { title: { display: true, text: 'days from trigger (day 0 = trigger day)', color: '#8d8aa0' }, ticks: { color: '#8d8aa0' }, grid: { color: '#262a44' } },
                    y: { title: { display: true, text: 'declustered M4.5+ quakes per day', color: '#8d8aa0' }, ticks: { color: '#8d8aa0' }, grid: { color: '#262a44' } } },
          plugins: { legend: { labels: { color: '#e6e3d6', filter: (i) => i.text !== 'random low' } } } } });
      document.querySelectorAll('#qb-btns button').forEach(x => x.classList.toggle('on', x.dataset.t === t));
    };
    $('qb-btns').innerHTML = Object.entries(TRIG).map(([k, v]) => `<button type="button" data-t="${k}">${esc(v)}</button>`).join('');
    document.querySelectorAll('#qb-btns button').forEach(x => x.onclick = () => draw(x.dataset.t));
    draw('spikes');
  }).catch(e => { $('qb-note').textContent = 'Could not load the 20-year test: ' + e; });

  fetch('data/summary.json').then(r => r.json()).then(s => {
    const q = s.quakes;
    if (!q) { $('ql-note').textContent = 'Earthquake logging starts with the next run.'; return; }
    const D = q.declustered, R = q.raw;
    $('ql-stats').innerHTML = [
      stat(R.total, `M${q.min_mag}+ quakes logged`),
      stat(D.total, 'After declustering'),
      stat(D.spikes, 'Spikes with a full 48 h after'),
      stat(D.spikes ? `${D.quakes_after} / ${D.expected}` : '—', 'Declustered after spikes / expected'),
    ].join('');
    $('ql-note').textContent = D.spikes
      ? `Poisson p ≈ ${D.p_value} (declustered), ${R.p_value} (raw). The live record is short, so these numbers will move a lot; the 20-year test above is the one to read.`
      : 'No solar wind spike with a complete 48-hour window yet in the live record, so there is nothing to tally. The 20-year test above already covers ' + 'thousands of spikes.';
    document.querySelector('#qbig tbody').innerHTML = (q.big || []).map(e => `<tr><td>${fmt(e.time_unix)}</td><td class="num"><b>M${esc(e.mag)}</b></td><td class="num">${esc(e.depth_km)} km</td><td>${esc(e.place)}</td>
      <td>${e.after_spike_h === null ? 'no' : '<span class="yes">' + e.after_spike_h + ' h after a spike</span>'}</td><td><a href="${esc(e.url)}" target="_blank" rel="noopener">event</a></td></tr>`).join('')
      || '<tr><td colspan="6">No M6+ quakes in the live record yet.</td></tr>';
  });
})();
