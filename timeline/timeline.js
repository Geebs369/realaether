/* RealAether impact & solar timeline. Architect: 3TH3R3AL1 · Builder: Geebs */
(function () {
  "use strict";

  const NOW = 2026.9;
  const state = {
    data: null,
    kind: "all",   // all | impact | solar | study
    era: "all",    // all | deep | late | historical | modern
    selected: null
  };

  const eraOf = (e) => {
    const y = e.year_ce;
    if (y < NOW - 100000) return "deep";
    if (y < 1500) return "late";
    if (y < 1900) return "historical";
    return "modern";
  };

  const kindMatch = (e, kind) => kind === "all" || e.kind === kind;
  const eraMatch = (e, era) => era === "all" || eraOf(e) === era;

  const visible = () => {
    if (!state.data) return [];
    return state.data.events.filter((e) => kindMatch(e, state.kind) && eraMatch(e, state.era));
  };

  const ageYears = (e) => Math.max(0.05, NOW - e.year_ce);

  const evById = (id) => state.data.events.find((e) => e.id === id);

  const evidenceLabel = {
    confirmed: "Confirmed",
    debated: "Debated",
    unverified: "Unverified",
    model: "Model"
  };

  const kindLabel = { impact: "Impact", solar: "Solar", study: "Our study" };

  const fmtMetrics = (m) => {
    if (!m) return "";
    const bits = [];
    if (m.dst_nT !== undefined) bits.push("Dst " + (typeof m.dst_nT === "number" ? m.dst_nT + " nT" : m.dst_nT));
    if (m.kp !== undefined) bits.push("Kp " + m.kp);
    if (m.dst_time) bits.push(m.dst_time);
    if (m.smoothed_sunspot_number) bits.push("smoothed sunspot number " + m.smoothed_sunspot_number);
    if (m.note) bits.push(m.note);
    return bits.join(" · ");
  };

  const citeHTML = (cites) => {
    if (!cites || !cites.length) return "";
    return "<ul class=\"cites\">" + cites.map((c) => {
      const t = escapeHtml(c.text);
      return c.url ? `<li><a href="${escapeAttr(c.url)}">${t}</a></li>` : `<li>${t}</li>`;
    }).join("") + "</ul>";
  };

  const escapeHtml = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escapeAttr = (s) => escapeHtml(s).replace(/'/g, "&#39;");

  const metaLine = (e) => {
    const parts = [e.date_label, kindLabel[e.kind] || e.kind];
    if (e.subtype) parts.push(e.subtype.replace(/-/g, " "));
    if (e.place) parts.push(e.place);
    if (e.size) parts.push(e.size);
    const met = fmtMetrics(e.metrics);
    if (met) parts.push(met);
    return parts.join(" · ");
  };

  const detailHTML = (e) => {
    const badge = `<span class="badge badge-${escapeAttr(e.evidence)}">${evidenceLabel[e.evidence] || e.evidence}</span>`;
    return `<h3>${escapeHtml(e.title)} ${badge}</h3>
      <p class="meta">${escapeHtml(metaLine(e))}</p>
      <p>${escapeHtml(e.summary)}</p>
      ${citeHTML(e.citations)}`;
  };

  function renderList() {
    const list = document.getElementById("event-list");
    const count = document.getElementById("tl-count");
    const vis = new Set(visible().map((e) => e.id));
    const items = list.querySelectorAll(".tl-item");
    let n = 0;
    items.forEach((el) => {
      const on = vis.has(el.dataset.id);
      el.classList.toggle("is-hidden", !on);
      el.classList.toggle("is-selected", state.selected === el.dataset.id);
      if (on) n += 1;
    });
    if (count) {
      const total = state.data.events.length;
      count.textContent = n === total
        ? `${total} events`
        : `Showing ${n} of ${total} events`;
    }
  }

  function renderDetail() {
    const box = document.getElementById("tl-detail");
    if (!box) return;
    const e = state.selected ? evById(state.selected) : null;
    if (!e) {
      box.innerHTML = '<p class="tl-placeholder">Select a point on the timeline, or an event in the list, to read the details and sources.</p>';
      return;
    }
    box.innerHTML = detailHTML(e);
  }

  function domainOf(list) {
    if (!list.length) return { t0: 0, t1: 1 };
    if (state.era === "all") {
      // log age domain
      return { mode: "log", amin: 0.2, amax: Math.max(...list.map(ageYears), 2.1e9) };
    }
    const years = list.map((e) => e.year_ce);
    let lo = Math.min(...years);
    let hi = Math.max(...years);
    const pad = Math.max( (hi - lo) * 0.06, 1 );
    return { mode: "linear", lo: lo - pad, hi: hi + pad };
  }

  function xOf(e, x0, x1, dom) {
    if (dom.mode === "log") {
      const t = Math.log10(ageYears(e));
      const a = Math.log10(dom.amin);
      const b = Math.log10(dom.amax);
      // older to the left: larger log-age -> smaller x
      const u = (t - a) / (b - a);
      return x0 + (1 - u) * (x1 - x0);
    }
    const u = (e.year_ce - dom.lo) / (dom.hi - dom.lo);
    return x0 + u * (x1 - x0);
  }

  function tickAges() {
    // nice log ticks in years ago
    return [
      { age: 1, label: "2026" },
      { age: 10, label: "10 yr ago" },
      { age: 50, label: "50 yr" },
      { age: 100, label: "100 yr" },
      { age: 200, label: "1820s" },
      { age: 500, label: "500 yr" },
      { age: 1000, label: "1,000 yr" },
      { age: 2000, label: "AD 26" },
      { age: 5000, label: "5,000 yr" },
      { age: 10000, label: "10 ka" },
      { age: 12900, label: "YDB" },
      { age: 50000, label: "50 ka" },
      { age: 1e5, label: "100 ka" },
      { age: 1e6, label: "1 Ma" },
      { age: 1e7, label: "10 Ma" },
      { age: 66e6, label: "K–Pg" },
      { age: 2e8, label: "200 Ma" },
      { age: 1e9, label: "1 Ga" },
      { age: 2e9, label: "2 Ga" }
    ];
  }

  function linearTicks(dom) {
    const span = dom.hi - dom.lo;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2e8, 5e8, 1e9];
    let step = steps[0];
    for (const s of steps) {
      if (span / s <= 8) { step = s; break; }
      step = s;
    }
    const ticks = [];
    const start = Math.ceil(dom.lo / step) * step;
    for (let y = start; y <= dom.hi; y += step) {
      ticks.push({ year: y, label: yearLabel(y) });
    }
    return ticks;
  }

  function yearLabel(y) {
    if (y >= 1500) return String(Math.round(y));
    if (y >= 1) return "AD " + Math.round(y);
    const bc = Math.round(1 - y); // astronomical year 0 = 1 BC
    if (bc >= 1e6) return (bc / 1e6).toFixed(bc >= 1e7 ? 0 : 1) + " Ma BC";
    if (bc >= 10000) return Math.round(bc / 1000) + " ka BC";
    return bc.toLocaleString("en-US") + " BC";
  }

  function renderAxis() {
    const svg = document.getElementById("tl-svg");
    if (!svg) return;
    const vis = visible();
    const W = 1100, H = 220;
    const x0 = 56, x1 = W - 16;
    const lanes = { impact: 70, solar: 120, study: 170 };
    const dom = domainOf(vis);

    let ticks = "";
    if (dom.mode === "log") {
      for (const t of tickAges()) {
        if (t.age < dom.amin || t.age > dom.amax) continue;
        const u = (Math.log10(t.age) - Math.log10(dom.amin)) / (Math.log10(dom.amax) - Math.log10(dom.amin));
        const x = x0 + (1 - u) * (x1 - x0);
        ticks += `<line class="tick-line" x1="${x.toFixed(1)}" y1="28" x2="${x.toFixed(1)}" y2="200"/>`;
        ticks += `<text class="tick-label" x="${x.toFixed(1)}" y="20" text-anchor="middle">${escapeHtml(t.label)}</text>`;
      }
    } else {
      for (const t of linearTicks(dom)) {
        const u = (t.year - dom.lo) / (dom.hi - dom.lo);
        const x = x0 + u * (x1 - x0);
        ticks += `<line class="tick-line" x1="${x.toFixed(1)}" y1="28" x2="${x.toFixed(1)}" y2="200"/>`;
        ticks += `<text class="tick-label" x="${x.toFixed(1)}" y="20" text-anchor="middle">${escapeHtml(t.label)}</text>`;
      }
    }

    const laneLabels = Object.entries(lanes).map(([k, y]) =>
      `<text class="lane-label" x="8" y="${y + 4}">${k === "study" ? "study" : k}</text>`
    ).join("");

    const all = state.data.events;
    // dim points that fail the filter but stay in the current era domain? Better hide them.
    const dots = vis.map((e) => {
      const x = xOf(e, x0, x1, dom);
      const y = lanes[e.kind] || 120;
      const r = e.evidence === "unverified" ? 4.5 : (e.subtype === "crater" && e.size && /1[0-9]{2} km/.test(e.size) ? 7 : 5.5);
      const sel = state.selected === e.id ? " is-selected" : "";
      return `<circle class="tl-dot ${e.kind}${sel}" data-id="${escapeAttr(e.id)}" cx="${x.toFixed(1)}" cy="${y}" r="${r}" role="button" tabindex="0" aria-label="${escapeAttr(e.title + ", " + e.date_label)}"><title>${escapeHtml(e.title)} — ${escapeHtml(e.date_label)}</title></circle>`;
    }).join("");

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <line class="axis-line" x1="${x0}" y1="36" x2="${x1}" y2="36"/>
      ${ticks}
      ${laneLabels}
      <g id="tl-dots">${dots}</g>
    `;
    svg.querySelectorAll(".tl-dot").forEach((c) => {
      const pick = () => selectEvent(c.getAttribute("data-id"));
      c.addEventListener("click", pick);
      c.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); }
      });
    });
    void all;
  }

  function selectEvent(id) {
    state.selected = id;
    renderAxis();
    renderList();
    renderDetail();
    const item = document.querySelector(`.tl-item[data-id="${CSS.escape(id)}"]`);
    if (item) item.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function setPressed(group, value) {
    document.querySelectorAll(`[data-group="${group}"]`).forEach((btn) => {
      const on = btn.getAttribute("data-value") === value;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("active", on);
    });
  }

  function applyFilters() {
    setPressed("kind", state.kind);
    setPressed("era", state.era);
    renderAxis();
    renderList();
  }

  function wire() {
    document.querySelectorAll("[data-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-group");
        const v = btn.getAttribute("data-value");
        state[g] = v;
        applyFilters();
      });
    });
    document.getElementById("event-list").addEventListener("click", (ev) => {
      const item = ev.target.closest(".tl-item");
      if (item) selectEvent(item.dataset.id);
    });
  }

  function boot(data) {
    state.data = data;
    wire();
    applyFilters();
    renderDetail();
  }

  fetch("events.json")
    .then((r) => {
      if (!r.ok) throw new Error("Could not load events.json");
      return r.json();
    })
    .then(boot)
    .catch((err) => {
      const box = document.getElementById("tl-detail");
      if (box) box.innerHTML = `<p class="tl-placeholder">Could not load the timeline data. You can open <a href="events.json">events.json</a> directly. (${escapeHtml(err.message)})</p>`;
    });
})();
