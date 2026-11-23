/* global document, fetch, requestAnimationFrame */
(function () {
  "use strict";

  const dataDir = "data/";
  const state = {
    latest: null,
    upcoming: [],
    validation: [],
    orbits: {},
    sortKey: "jd_tdb",
    sortDir: 1,
    valSortKey: "ddist_km",
    valSortDir: -1,
    selectedDes: null,
    selectedIso: null,
  };

  const $ = (id) => document.getElementById(id);

  function fmtNum(x, digits) {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    return Number(x).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }

  function fmtKm(km) {
    if (km === null || km === undefined) return "—";
    if (Math.abs(km) >= 1e6) return fmtNum(km / 1e6, 2) + " million km";
    return fmtNum(km, 0) + " km";
  }

  function fmtSize(row) {
    if (row.diameter_km === null || row.diameter_km === undefined) return "—";
    const km = row.diameter_km;
    const label = km >= 1 ? fmtNum(km, 2) + " km" : fmtNum(km * 1000, 0) + " m";
    if (row.diameter_source === "jpl_measured") return label;
    return "~" + label;
  }

  function sizeTitle(row) {
    if (row.diameter_source === "jpl_measured") {
      const sig = row.diameter_sigma_km != null ? " ± " + fmtNum(row.diameter_sigma_km, 3) + " km" : "";
      return "JPL-measured diameter" + sig;
    }
    if (row.diameter_source === "H_and_albedo") {
      return "Estimated from H and the published albedo (Fowler & Chillemi 1992).";
    }
    if (row.diameter_source === "H_assumed_pV_0.154") {
      const lo = row.diameter_km_low;
      const hi = row.diameter_km_high;
      let range = "";
      if (lo != null && hi != null) {
        range = " Range at pV 0.25–0.05: " + (lo >= 1 ? fmtNum(lo, 2) + "–" + fmtNum(hi, 2) + " km" : fmtNum(lo * 1000, 0) + "–" + fmtNum(hi * 1000, 0) + " m") + ".";
      }
      return "Estimated from H with pV = 0.154 (CNEOS Sentry convention)." + range;
    }
    return "Size unknown";
  }

  function fmtLD(ld) {
    if (ld === null || ld === undefined) return "—";
    return fmtNum(ld, 2) + " LD";
  }

  function loadJSON(name) {
    return fetch(dataDir + name, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("Failed to load " + name + " (" + r.status + ")");
      return r.json();
    });
  }

  function tickCountdown() {
    const latest = state.latest;
    if (!latest || !latest.next_earth) return;
    const iso = latest.next_earth.iso_et;
    const target = new Date(iso).getTime();
    const now = Date.now();
    const el = $("next-count");
    if (!el) return;
    let diff = target - now;
    if (diff <= 0) {
      el.textContent = "Happening / passed";
      return;
    }
    const sec = Math.floor(diff / 1000);
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    el.textContent = days + "d " + pad(hours) + "h " + pad(mins) + "m " + pad(secs) + "s";
  }

  function renderNext(latest) {
    const rec = latest.next_earth;
    $("next-loading").hidden = true;
    if (!rec) {
      $("next-loading").hidden = false;
      $("next-loading").textContent = "No upcoming Earth approaches in the current CNEOS window.";
      return;
    }
    $("next-body").hidden = false;
    const a = $("next-name");
    a.textContent = rec.fullname;
    a.href = rec.sbdb_url;
    $("next-when").textContent = rec.datetime_et;
    $("next-tz").textContent = "Date and time, " + (rec.tzname || "ET") + " (24-hour)";
    $("next-dist").textContent = fmtKm(rec.dist_km) + " · " + fmtLD(rec.dist_ld);
    $("next-vel").textContent = rec.v_rel_kms != null ? fmtNum(rec.v_rel_kms, 2) + " km/s" : "—";
    $("next-size").textContent = fmtSize(rec);
    $("next-size").title = sizeTitle(rec);
    $("next-note").textContent =
      "CNEOS nominal distance. The independent REBOUND check of a close / well-constrained subset is in the panel below. " +
      "Snapshot generated " + latest.generated_et_label + ".";
    tickCountdown();
  }

  function renderSnap(latest) {
    const c = latest.counts || {};
    const v = latest.validation_summary || {};
    const cells = [
      [fmtNum(c.upcoming_earth, 0), "Earth flybys"],
      [fmtNum(c.upcoming_moon, 0), "Moon flybys"],
      [fmtNum(c.upcoming_mars, 0), "Mars flybys"],
      [fmtNum(c.sbdb_neos, 0), "NEOs in SBDB"],
    ];
    if (v.n_ok != null) cells.push([fmtNum(v.n_ok, 0), "Validated approaches"]);
    if (v.abs_ddist_km_median != null) cells.push([fmtNum(v.abs_ddist_km_median, 1) + " km", "Median |Δ distance|"]);
    $("snap-stats").innerHTML = cells.map(([b, s]) => "<div class=\"stat\"><b>" + b + "</b><span>" + s + "</span></div>").join("");
    const src = (latest.sources || []).map((s) => s.name).join("; ");
    $("src-note").textContent = "Sources used in this snapshot: " + src + ".";
  }

  function rowMatches(rec) {
    const body = $("flt-body").value;
    if (body !== "all" && rec.body !== body) return false;
    const win = $("flt-window").value;
    if (win !== "all") {
      const days = rec.days_from_now;
      if (days == null || days > Number(win)) return false;
    }
    if ($("flt-pha").checked && !rec.pha) return false;
    if ($("flt-close").checked && !(rec.dist_au <= 0.01)) return false;
    const q = $("flt-q").value.trim().toLowerCase();
    if (q) {
      const blob = ((rec.fullname || "") + " " + (rec.des || "") + " " + (rec.name || "")).toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  }

  function sortedRows(rows, key, dir) {
    const copy = rows.slice();
    copy.sort((a, b) => {
      let va = a[key], vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string") return va.localeCompare(vb) * dir;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return copy;
  }

  function renderTable() {
    const rows = sortedRows(state.upcoming.filter(rowMatches), state.sortKey, state.sortDir);
    $("flt-count").textContent = rows.length + " shown";
    const tb = $("flybys").querySelector("tbody");
    const html = rows.map((r) => {
      const sel = r.des === state.selectedDes && r.iso_et === state.selectedIso ? " selected" : "";
      const pha = r.pha ? " pha" : "";
      return "<tr class=\"" + sel + pha + "\" data-des=\"" + escapeAttr(r.des) + "\" data-iso=\"" + escapeAttr(r.iso_et) + "\">" +
        "<td><a href=\"" + escapeAttr(r.sbdb_url) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(r.fullname) + "</a></td>" +
        "<td class=\"body-" + escapeAttr(r.body) + "\">" + escapeHtml(r.body) + "</td>" +
        "<td>" + escapeHtml(r.datetime_et) + (r.tzname ? " " + r.tzname : "") + "</td>" +
        "<td class=\"num\">" + fmtNum(r.dist_km, 0) + "</td>" +
        "<td class=\"num\">" + fmtNum(r.dist_ld, 3) + "</td>" +
        "<td class=\"num\">" + (r.v_rel_kms != null ? fmtNum(r.v_rel_kms, 2) : "—") + "</td>" +
        "<td class=\"num\" title=\"" + escapeAttr(sizeTitle(r)) + "\">" + escapeHtml(fmtSize(r)) + "</td>" +
        "<td class=\"num\">" + (r.h != null ? fmtNum(r.h, 2) : "—") + "</td>" +
        "<td>" + (r.pha ? "Yes" : "No") + (r.on_sentry ? " · Sentry" : "") + "</td>" +
        "</tr>";
    }).join("");
    tb.innerHTML = html || "<tr><td colspan=\"9\">No flybys match these filters.</td></tr>";
  }

  function renderValidation(doc) {
    const s = (doc && doc.summary) || (state.latest && state.latest.validation_summary) || {};
    const results = ((doc && doc.results) || []).filter((r) => r.status === "ok").map((r) => ({
      des: r.des,
      fullname: r.fullname,
      datetime_et: r.datetime_et,
      iso_et: r.iso_et,
      cneos_km: r.cneos && r.cneos.dist_km,
      pred_km: r.predicted && r.predicted.dist_au != null ? r.predicted.dist_au * 149597870.7 : null,
      ddist_km: r.residual && r.residual.ddist_km,
      dt_minutes: r.residual && r.residual.dt_minutes,
    }));
    state.validation = results;
    const cells = [
      [fmtNum(s.n_ok, 0) + (s.n_selected != null ? " / " + s.n_selected : ""), "Approaches checked"],
      [s.abs_ddist_km_median != null ? fmtNum(s.abs_ddist_km_median, 2) + " km" : "—", "Median |Δ distance|"],
      [s.abs_ddist_km_max != null ? fmtNum(s.abs_ddist_km_max, 2) + " km" : "—", "Worst |Δ distance|"],
      [s.abs_dt_minutes_median != null ? fmtNum(s.abs_dt_minutes_median, 2) + " min" : "—", "Median |Δ time|"],
    ];
    $("val-stats").innerHTML = cells.map(([b, l]) => "<div class=\"stat\"><b>" + b + "</b><span>" + l + "</span></div>").join("");
    const worst = s.worst_ddist;
    let note = "CNEOS is the public list. Residuals are our N-body minus CNEOS, for the close / well-constrained subset only.";
    if (worst) {
      note += " Largest distance residual: " + worst.fullname + " on " + worst.datetime_et + " (" + fmtNum(worst.ddist_km, 2) + " km).";
    }
    if (s.n_error) note += " " + s.n_error + " approach(es) could not be integrated; see validation.json.";
    $("val-note").textContent = note;
    renderValTable();
  }

  function renderValTable() {
    const rows = sortedRows(state.validation, state.valSortKey, state.valSortDir);
    const tb = $("val-table").querySelector("tbody");
    tb.innerHTML = rows.map((r) => {
      const cls = Math.abs(r.ddist_km) > 100 ? "bad" : Math.abs(r.ddist_km) > 10 ? "warn" : "ok";
      return "<tr data-des=\"" + escapeAttr(r.des) + "\">" +
        "<td>" + escapeHtml(r.fullname) + "</td>" +
        "<td>" + escapeHtml(r.datetime_et) + "</td>" +
        "<td class=\"num\">" + fmtNum(r.cneos_km, 0) + "</td>" +
        "<td class=\"num\">" + fmtNum(r.pred_km, 0) + "</td>" +
        "<td class=\"num " + cls + "\">" + (r.ddist_km >= 0 ? "+" : "") + fmtNum(r.ddist_km, 2) + "</td>" +
        "<td class=\"num\">" + (r.dt_minutes >= 0 ? "+" : "") + fmtNum(r.dt_minutes, 2) + "</td>" +
        "</tr>";
    }).join("");
  }

  function uniqueUpcomingEarth() {
    const seen = new Set();
    const out = [];
    for (const r of state.upcoming) {
      if (r.body !== "Earth") continue;
      if (seen.has(r.des)) continue;
      seen.add(r.des);
      out.push(r);
    }
    return out;
  }

  function fillOrbitSelect() {
    const sel = $("orbit-select");
    const rows = uniqueUpcomingEarth();
    const next = state.latest && state.latest.next_earth;
    sel.innerHTML = rows.map((r) => {
      return "<option value=\"" + escapeAttr(r.des) + "\">" + escapeHtml(r.fullname) + " — " + escapeHtml(r.datetime_et) + "</option>";
    }).join("");
    if (state.selectedDes && [...sel.options].some((o) => o.value === state.selectedDes)) {
      sel.value = state.selectedDes;
    } else if (next) {
      sel.value = next.des;
      state.selectedDes = next.des;
      state.selectedIso = next.iso_et;
    }
  }

  function keplerNu(Mdeg, e) {
    let M = ((Mdeg % 360) + 360) % 360;
    if (M > 180) M -= 360;
    const Mr = M * Math.PI / 180;
    let E = Mr;
    for (let i = 0; i < 12; i++) {
      E = E - (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
    }
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    return nu;
  }

  function xyzFromElements(el, nu) {
    const a = el.a_au, e = el.e;
    const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
    const om = el.om_deg * Math.PI / 180;
    const w = el.w_deg * Math.PI / 180;
    const inc = el.i_deg * Math.PI / 180;
    const cw = Math.cos(w + nu), sw = Math.sin(w + nu);
    const x = r * (Math.cos(om) * cw - Math.sin(om) * sw * Math.cos(inc));
    const y = r * (Math.sin(om) * cw + Math.cos(om) * sw * Math.cos(inc));
    return [x, y];
  }

  function meanAnomalyAt(el, jd) {
    let n = el.n_deg_per_day;
    if (n == null && el.a_au) {
      // Gaussian k in deg/day: 180/pi * 0.01720209895
      n = (180 / Math.PI) * 0.01720209895 * Math.pow(el.a_au, -1.5);
    }
    if (n == null || el.epoch_jd == null || el.ma_deg == null) return el.ma_deg;
    return el.ma_deg + n * (jd - el.epoch_jd);
  }

  function isoToJdApprox(iso) {
    // Sufficient for a sketch: Unix ms to Julian Date (UTC ≈ TDB at this scale).
    const ms = new Date(iso).getTime();
    return ms / 86400000 + 2440587.5;
  }

  function drawOrbit() {
    const canvas = $("orbit-canvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#05060c";
    ctx.fillRect(0, 0, w, h);

    const des = $("orbit-select").value;
    const el = state.orbits[des];
    const maxA = Math.max(1.7, el && el.a_au ? el.a_au * (1 + (el.e || 0)) + 0.15 : 1.7);
    const pad = 36;
    const scale = (Math.min(w, h) / 2 - pad) / maxA;
    const cx = w / 2, cy = h / 2;
    const xy = (x, y) => [cx + x * scale, cy - y * scale];

    function ring(au, color, label) {
      ctx.beginPath();
      const [x, y] = xy(au, 0);
      ctx.arc(cx, cy, au * scale, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (label) {
        ctx.fillStyle = color;
        ctx.font = "11px Segoe UI, sans-serif";
        ctx.fillText(label, x + 4, cy - 4);
      }
    }

    // Mean-distance circular orbits, schematic scale only.
    ring(0.387, "#6f7388", "Mercury");
    ring(0.723, "#9aa0b8", "Venus");
    ring(1.0, "#5ad1ff", "Earth");
    ring(1.524, "#e08a6a", "Mars");

    // Sun
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#f3d36b";
    ctx.fill();

    if (!el || el.a_au == null || el.e == null) {
      ctx.fillStyle = "#8d8aa0";
      ctx.font = "13px Segoe UI, sans-serif";
      ctx.fillText("No osculating elements in this snapshot for the selected object.", 20, 28);
      return;
    }

    ctx.beginPath();
    const steps = 360;
    for (let i = 0; i <= steps; i++) {
      const nu = (i / steps) * 2 * Math.PI;
      const [x, y] = xy(...xyzFromElements(el, nu));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Mark a position: close approach or "now".
    let jdMark = null;
    const rec = state.upcoming.find((r) => r.des === des && r.body === "Earth") ||
                state.upcoming.find((r) => r.des === des);
    const mode = $("orbit-mark").value;
    if (mode === "ca" && rec) jdMark = rec.jd_tdb;
    else if (mode === "now" && state.latest && state.latest.generated_utc) {
      jdMark = isoToJdApprox(state.latest.generated_utc);
    }
    if (jdMark != null && el.e < 1) {
      const nu = keplerNu(meanAnomalyAt(el, jdMark), el.e);
      const [px, py] = xy(...xyzFromElements(el, nu));
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f3d36b";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Earth position at the same epoch (circular, schematic).
    if (jdMark != null) {
      // Rough Earth mean longitude is not needed for a ring; skip exact Earth marker
      // to avoid inventing a planetary theory. The Earth orbit ring is the scale.
    }

    ctx.fillStyle = "#e6e3d6";
    ctx.font = "13px Segoe UI, sans-serif";
    ctx.fillText(el.fullname + "  a=" + fmtNum(el.a_au, 3) + " au  e=" + fmtNum(el.e, 3) + "  i=" + fmtNum(el.i_deg, 1) + "°", 16, 22);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function bindSort(tableId, which) {
    document.querySelectorAll("#" + tableId + " thead th").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.getAttribute("data-key");
        if (!key) return;
        if (which === "flybys") {
          if (state.sortKey === key) state.sortDir *= -1;
          else { state.sortKey = key; state.sortDir = key === "fullname" || key === "body" ? 1 : 1; }
          document.querySelectorAll("#flybys thead th").forEach((x) => x.removeAttribute("aria-sort"));
          th.setAttribute("aria-sort", state.sortDir > 0 ? "asc" : "desc");
          renderTable();
        } else {
          if (state.valSortKey === key) state.valSortDir *= -1;
          else { state.valSortKey = key; state.valSortDir = -1; }
          document.querySelectorAll("#val-table thead th").forEach((x) => x.removeAttribute("aria-sort"));
          th.setAttribute("aria-sort", state.valSortDir > 0 ? "asc" : "desc");
          renderValTable();
        }
      });
    });
  }

  function bindFilters() {
    ["flt-body", "flt-window", "flt-q", "flt-pha", "flt-close"].forEach((id) => {
      $(id).addEventListener("input", renderTable);
      $(id).addEventListener("change", renderTable);
    });
    $("flybys").addEventListener("click", (ev) => {
      const tr = ev.target.closest("tr[data-des]");
      if (!tr) return;
      state.selectedDes = tr.getAttribute("data-des");
      state.selectedIso = tr.getAttribute("data-iso");
      $("orbit-select").value = state.selectedDes;
      renderTable();
      drawOrbit();
    });
    $("orbit-select").addEventListener("change", () => {
      state.selectedDes = $("orbit-select").value;
      drawOrbit();
    });
    $("orbit-mark").addEventListener("change", drawOrbit);
    $("val-table").addEventListener("click", (ev) => {
      const tr = ev.target.closest("tr[data-des]");
      if (!tr) return;
      state.selectedDes = tr.getAttribute("data-des");
      $("orbit-select").value = state.selectedDes;
      drawOrbit();
    });
  }

  function boot() {
    bindSort("flybys", "flybys");
    bindSort("val-table", "val");
    bindFilters();
    Promise.all([loadJSON("latest.json"), loadJSON("upcoming.json"), loadJSON("validation.json"), loadJSON("orbits.json")])
      .then(([latest, upcoming, validation, orbits]) => {
        state.latest = latest;
        state.upcoming = upcoming.approaches || [];
        // If the daily snapshot's "next approach" has already passed, roll forward to the next future Earth flyby.
        const nowMs = Date.now();
        if (latest.next_earth && new Date(latest.next_earth.iso_et).getTime() <= nowMs) {
          const nxt = state.upcoming.filter((r) => r.body === "Earth" && r.iso_et && new Date(r.iso_et).getTime() > nowMs)
            .sort((x, y) => new Date(x.iso_et) - new Date(y.iso_et))[0];
          if (nxt) latest.next_earth = nxt;
        }
        state.orbits = (orbits && orbits.objects) || {};
        renderNext(latest);
        renderSnap(latest);
        renderTable();
        renderValidation(validation);
        fillOrbitSelect();
        drawOrbit();
        setInterval(tickCountdown, 1000);
      })
      .catch((err) => {
        $("next-loading").textContent = "Could not load the catalog JSON: " + err.message;
        $("next-loading").className = "err";
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
