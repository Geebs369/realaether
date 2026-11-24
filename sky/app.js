/* Sky Companion — vanilla client-side PWA. No backend. */
(function () {
  "use strict";

  var STORAGE_LOC = "skycompanion.location";
  var STORAGE_ALERTS = "skycompanion.alerts";
  var STORAGE_NOTIFIED = "skycompanion.notified";

  var URLS = {
    kp1m: "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
    kp3h: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
    kpForecast: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
    windSpeed: "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json",
    windMag: "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json",
    flux: "https://services.swpc.noaa.gov/products/summary/10cm-flux.json",
    flares: "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json",
    xrays: "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json",
    ovation: "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
    cad: "https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B60&dist-max=0.05&sort=date&fullname=true",
    flybys: "./data/flybys.json",
    impactUpcoming: "../impact/data/upcoming.json",
    quakes: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
    tle: "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle",
    tleFallback: "https://tle.ivanstanojevic.me/api/tle/25544",
    issNow: "https://api.wheretheiss.at/v1/satellites/25544",
    geo: "https://geocoding-api.open-meteo.com/v1/search"
  };

  var SOURCES_HTML =
    'NOAA SWPC (Kp, solar wind summaries, 10.7 cm flux, GOES X-rays, OVATION) · ' +
    'RealAether NEO tracker (same-origin flybys) · ' +
    'Celestrak / satellite.js (ISS passes) · Where The ISS At (position fallback) · ' +
    'USGS M4.5+ earthquakes · Open-Meteo geocoding · moon phase and twilight computed on-device.';

  var DEFAULT_ALERTS = { kp: 5, flare: "M", aurora: 25, quake: 6, iss: true, notify: false };

  var state = {
    location: null,
    alerts: loadAlerts(),
    data: {},
    errors: {},
    updatedAt: null,
    loading: false
  };

  function $(id) { return document.getElementById(id); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function loadLoc() {
    try {
      var raw = localStorage.getItem(STORAGE_LOC);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (typeof o.lat !== "number" || typeof o.lon !== "number") return null;
      if (o.lat < -90 || o.lat > 90 || o.lon < -180 || o.lon > 180) return null;
      return o;
    } catch (e) { return null; }
  }

  function saveLoc(loc) {
    state.location = loc;
    if (!loc) localStorage.removeItem(STORAGE_LOC);
    else localStorage.setItem(STORAGE_LOC, JSON.stringify(loc));
    syncLocChip();
  }

  function loadAlerts() {
    try {
      return Object.assign({}, DEFAULT_ALERTS, JSON.parse(localStorage.getItem(STORAGE_ALERTS) || "{}"));
    } catch (e) { return Object.assign({}, DEFAULT_ALERTS); }
  }

  function saveAlerts() {
    var a = {
      kp: +$("th-kp").value,
      flare: $("th-flare").value,
      aurora: +$("th-aurora").value,
      quake: +$("th-quake").value,
      iss: $("th-iss").checked,
      notify: $("th-notify").checked
    };
    state.alerts = a;
    localStorage.setItem(STORAGE_ALERTS, JSON.stringify(a));
    $("alert-status").textContent = "Thresholds saved on this device.";
    maybeNotify(true);
  }

  function tzOf() {
    return (state.location && state.location.tz) || undefined;
  }

  function fmtTime(date, opts) {
    if (!date) return "—";
    var o = Object.assign({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, opts || {});
    if (tzOf()) o.timeZone = tzOf();
    try { return new Intl.DateTimeFormat(undefined, o).format(date); }
    catch (e) { return date.toLocaleString(); }
  }

  function fmtClock(date) {
    return fmtTime(date, { month: undefined, day: undefined, hour: "numeric", minute: "2-digit" });
  }

  function relTime(date) {
    if (!date) return "";
    var s = Math.round((date.getTime() - Date.now()) / 1000);
    if (Math.abs(s) < 10) return "just now";
    var past = s <= 0;
    s = Math.abs(s);
    var t;
    if (s < 90) t = s + "s";
    else if (s < 90 * 60) t = Math.round(s / 60) + " min";
    else if (s < 36 * 3600) t = (Math.floor(s / 3600) + "h " + Math.round((s % 3600) / 60) + "m");
    else t = Math.round(s / 86400) + "d";
    return past ? t + " ago" : "in " + t;
  }

  function parseWhen(v) {
    if (v == null) return null;
    if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
    var s = String(v).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) && s.indexOf("T") < 0) s = s.replace(" ", "T") + "Z";
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function asRows(data) {
    if (!Array.isArray(data) || !data.length) return [];
    if (Array.isArray(data[0])) {
      var keys = data[0];
      return data.slice(1).map(function (r) {
        var o = {};
        keys.forEach(function (k, i) { o[k] = r[i]; });
        return o;
      });
    }
    return data;
  }

  function last(arr) { return arr && arr.length ? arr[arr.length - 1] : null; }

  function num(v) {
    if (v == null || v === "") return null;
    var n = +v;
    return isFinite(n) ? n : null;
  }

  function fetchJson(url, timeout) {
    return fetchText(url, timeout).then(function (t) { return JSON.parse(t); });
  }

  function fetchText(url, timeout) {
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, timeout || 18000);
    return fetch(url, { signal: ctrl.signal, cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .finally(function () { clearTimeout(to); });
  }

  function settled(name, promise) {
    return promise.then(function (v) {
      state.data[name] = v;
      delete state.errors[name];
      return v;
    }, function (err) {
      state.errors[name] = err && err.message ? err.message : String(err);
      return null;
    });
  }

  /* ---------- domain helpers ---------- */

  function kpValue(row) {
    if (!row) return null;
    return num(row.estimated_kp != null ? row.estimated_kp : (row.Kp != null ? row.Kp : (row.kp != null ? row.kp : row.kp_index)));
  }

  function gScale(kp) {
    if (kp == null) return "—";
    if (kp >= 9) return "G5 extreme";
    if (kp >= 8) return "G4 severe";
    if (kp >= 7) return "G3 strong";
    if (kp >= 6) return "G2 moderate";
    if (kp >= 5) return "G1 minor storm";
    if (kp >= 4) return "Active";
    if (kp >= 3) return "Unsettled";
    return "Quiet";
  }

  function kpClass(kp) {
    if (kp == null) return "";
    if (kp >= 5) return "storm";
    if (kp >= 4) return "watch";
    return "quiet";
  }

  function fluxToClass(f) {
    if (f == null || f < 0) return null;
    var bands = [["X", 1e-4], ["M", 1e-5], ["C", 1e-6], ["B", 1e-7], ["A", 1e-8]];
    for (var i = 0; i < bands.length; i++) {
      if (f >= bands[i][1]) {
        var n = f / bands[i][1];
        return bands[i][0] + n.toFixed(n >= 10 ? 0 : 1);
      }
    }
    return "A0.0";
  }

  function flareRank(cls) {
    if (!cls) return 0;
    var s = String(cls).trim().toUpperCase();
    var L = s.charAt(0);
    var n = parseFloat(s.slice(1));
    if (!isFinite(n)) n = 0;
    var base = { A: 0, B: 1, C: 2, M: 3, X: 4 }[L];
    if (base == null) return 0;
    return base + Math.min(n, 9.9) / 10;
  }

  function bandLabel(score) {
    if (score >= 3.5) return "excellent";
    if (score >= 2.5) return "good";
    if (score >= 1.5) return "fair";
    if (score >= 0.5) return "poor";
    return "closed";
  }

  function estimateBands(sfi, kp, flareCls) {
    sfi = sfi == null ? 70 : sfi;
    kp = kp == null ? 2 : kp;
    var sfiAdj = sfi >= 180 ? 1.2 : sfi >= 150 ? 0.8 : sfi >= 120 ? 0.4 : sfi >= 90 ? 0 : sfi >= 70 ? -0.4 : -1;
    var kpAdj = kp >= 7 ? -2 : kp >= 5 ? -1.4 : kp >= 4 ? -0.6 : 0;
    var defs = [
      { name: "80m", day: 1.2, night: 3.2 },
      { name: "40m", day: 2.0, night: 3.6 },
      { name: "20m", day: 3.2, night: 3.0 },
      { name: "15m", day: sfi >= 90 ? 3.0 : 2.0, night: sfi >= 130 ? 2.0 : 0.8 },
      { name: "10m", day: sfi >= 120 ? 3.2 : sfi >= 90 ? 2.0 : 0.8, night: sfi >= 160 ? 1.5 : 0.2 }
    ];
    return defs.map(function (b) {
      var day = Math.max(0, Math.min(4, b.day + sfiAdj + kpAdj));
      var night = Math.max(0, Math.min(4, b.night + sfiAdj * 0.5 + kpAdj));
      if (flareRank(flareCls) >= 3.5) day = Math.max(0, day - 2); /* M5+ dayside absorption */
      if (flareRank(flareCls) >= 4) day = 0;
      return { name: b.name, day: day, night: night, dayL: bandLabel(day), nightL: bandLabel(night) };
    });
  }

  function wrapLon(lon) {
    return ((lon % 360) + 360) % 360;
  }

  function ovationAt(grid, lon, lat) {
    if (!grid || !grid.length) return null;
    var L = Math.round(wrapLon(lon));
    if (L === 360) L = 0;
    var B = Math.max(-90, Math.min(90, Math.round(lat)));
    var hit = null, maxAtLon = 0, maxLat = null;
    for (var i = 0; i < grid.length; i++) {
      var p = grid[i];
      if (!p || p.length < 3) continue;
      if (p[0] === L) {
        if (p[2] > maxAtLon) { maxAtLon = p[2]; maxLat = p[1]; }
        if (p[1] === B) hit = p[2];
      }
    }
    return { value: hit, maxAtLon: maxAtLon, maxLat: maxLat };
  }

  /* Rough Kp/latitude fallback if OVATION is missing. */
  function auroraFromKp(lat, kp) {
    if (lat == null || kp == null) return null;
    var edge = 67.5 - 2.0 * kp; /* equatorward oval, geographic approx */
    var ml = Math.abs(lat);
    if (ml >= edge + 3) return { pct: Math.min(90, 40 + (ml - edge) * 6 + kp * 4), via: "kp" };
    if (ml >= edge) return { pct: Math.min(70, 20 + (ml - edge) * 8 + kp * 3), via: "kp" };
    if (ml >= edge - 6) return { pct: Math.max(2, 12 - (edge - ml) * 2 + kp), via: "kp" };
    return { pct: Math.max(0, Math.round(kp)), via: "kp" };
  }

  function padTle(line) {
    var l = String(line).replace(/\r/g, "").trimEnd();
    if (l.length < 69) l = (l + "                                                                   ").slice(0, 69);
    return l;
  }

  function parseTle(text) {
    var lines = String(text).replace(/\r/g, "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    var l1 = lines.find(function (l) { return /^1 25544/.test(l); });
    var l2 = lines.find(function (l) { return /^2 25544/.test(l); });
    if (l1 && l2) return { name: "ISS (ZARYA)", line1: padTle(l1), line2: padTle(l2) };
    return null;
  }

  function satSunlit(eci, date) {
    if (!window.Astro || !eci) return null;
    var sun = Astro.sunEciKm(date);
    var su = Math.sqrt(sun.x * sun.x + sun.y * sun.y + sun.z * sun.z) || 1;
    var ux = sun.x / su, uy = sun.y / su, uz = sun.z / su;
    var proj = eci.x * ux + eci.y * uy + eci.z * uz;
    if (proj > 0) return true;
    var peri2 = eci.x * eci.x + eci.y * eci.y + eci.z * eci.z - proj * proj;
    var Re = 6378.137;
    return peri2 > Re * Re;
  }

  function issPasses(tle, lat, lon) {
    if (!window.satellite || !tle || lat == null || lon == null) return [];
    var satrec = satellite.twoline2satrec(tle.line1, tle.line2);
    var observer = {
      longitude: satellite.degreesToRadians(lon),
      latitude: satellite.degreesToRadians(lat),
      height: 0.05
    };
    var start = Date.now();
    var end = start + 36 * 3600 * 1000;
    var step = 30 * 1000;
    var passes = [];
    var cur = null;
    var minEl = 10 * Math.PI / 180;
    for (var t = start; t <= end; t += step) {
      var date = new Date(t);
      var pv = satellite.propagate(satrec, date);
      if (!pv || !pv.position) continue;
      var gmst = satellite.gstime(date);
      var ecf = satellite.eciToEcf(pv.position, gmst);
      var look = satellite.ecfToLookAngles(observer, ecf);
      var el = look.elevation;
      var vis = (window.Astro && Astro.isNight(date, lat, lon, -6) && satSunlit(pv.position, date));
      if (el >= minEl) {
        if (!cur) {
          cur = { aos: date, aosEl: el, maxEl: el, maxAt: date, los: date, azAos: look.azimuth, visible: !!vis };
        } else {
          cur.los = date;
          if (el > cur.maxEl) { cur.maxEl = el; cur.maxAt = date; cur.azMax = look.azimuth; }
          cur.visible = cur.visible || !!vis;
        }
      } else if (cur) {
        cur.maxElDeg = cur.maxEl * 180 / Math.PI;
        cur.azAosDeg = (cur.azAos || 0) * 180 / Math.PI;
        passes.push(cur);
        cur = null;
        if (passes.length >= 8) break;
      }
    }
    if (cur && passes.length < 8) {
      cur.maxElDeg = cur.maxEl * 180 / Math.PI;
      passes.push(cur);
    }
    return passes;
  }

  function paintMoonFace(el, phase) {
    if (!el || !phase) return;
    el.className = "moon-face";
    var pct = phase.percent;
    if (pct <= 5) el.classList.add("new");
    else if (pct >= 95) el.classList.add("full");
    /* waxing: shadow on the left; waning: shadow on the right, approx with inset */
    var shift = Math.round((50 - pct / 2));
    if (phase.waxing) {
      el.style.boxShadow = "inset " + (-Math.round(28 * (1 - pct / 100))) + "px 0 0 0 #0a0d1b, 0 0 0 2px #d4af37aa";
    } else {
      el.style.boxShadow = "inset " + Math.round(28 * (1 - pct / 100)) + "px 0 0 0 #0a0d1b, 0 0 0 2px #d4af37aa";
    }
    if (pct <= 5 || pct >= 95) el.style.boxShadow = "";
  }

  function renderBands(into, bands) {
    if (!into) return;
    if (!bands) { into.innerHTML = ""; return; }
    var html = '<span></span><span class="hd">Day</span><span class="hd">Night</span>';
    bands.forEach(function (b) {
      html += "<span>" + esc(b.name) + "</span>" +
        '<span class="pill ' + b.dayL + '">' + b.dayL + "</span>" +
        '<span class="pill ' + b.nightL + '">' + b.nightL + "</span>";
    });
    into.innerHTML = html;
  }

  /* ---------- render ---------- */

  function syncLocChip() {
    var chip = $("loc-chip");
    if (!chip) return;
    if (state.location) {
      chip.textContent = state.location.label || (state.location.lat.toFixed(2) + "°, " + state.location.lon.toFixed(2) + "°");
      chip.classList.remove("unset");
    } else {
      chip.textContent = "Set location";
      chip.classList.add("unset");
    }
  }

  function fillAlertsForm() {
    var a = state.alerts;
    $("th-kp").value = a.kp;
    $("th-kp-val").textContent = a.kp;
    $("th-flare").value = a.flare;
    $("th-aurora").value = a.aurora;
    $("th-aurora-val").textContent = a.aurora;
    $("th-quake").value = a.quake;
    $("th-quake-val").textContent = Number(a.quake).toFixed(1);
    $("th-iss").checked = !!a.iss;
    $("th-notify").checked = !!a.notify;
    $("alerts-sources").innerHTML = SOURCES_HTML;
    $("source-line").innerHTML = SOURCES_HTML;
  }

  function render() {
    var d = state.data;
    var loc = state.location;
    var now = new Date();

    var kpNow = kpValue(d.kp1m);
    var kp3 = kpValue(d.kp3h);
    var kpEl = $("kp-now");
    kpEl.textContent = kpNow == null ? "—" : kpNow.toFixed(2);
    kpEl.className = "metric " + kpClass(kpNow);
    $("kp-label").textContent = kpNow == null
      ? (state.errors.kp1mRaw ? "Kp 1-minute feed failed: " + state.errors.kp1mRaw : "Loading…")
      : ("1-minute estimated Kp · " + gScale(kpNow) + (d.kp1mTime ? " · " + relTime(d.kp1mTime) : ""));
    $("kp-3h").textContent = kp3 == null ? "—" : Number(kp3).toFixed(2);
    $("kp-scale").textContent = gScale(kp3);
    $("kp-updated").textContent = state.updatedAt ? (relTime(state.updatedAt) === "just now" ? "just now" : "updated " + relTime(state.updatedAt)) : "live";

    var bars = $("kp-bars");
    bars.innerHTML = "";
    (d.kp3hSeries || []).slice(-16).forEach(function (r, i, arr) {
      var v = kpValue(r);
      var iel = document.createElement("i");
      iel.style.height = Math.max(4, Math.min(100, (v || 0) / 9 * 100)) + "%";
      if (v >= 5) iel.style.background = "#ff6b6b";
      else if (v >= 4) iel.style.background = "#ffb020";
      if (i === arr.length - 1) iel.className = "now";
      iel.title = (r.time_tag || "") + " Kp " + v;
      bars.appendChild(iel);
    });

    /* Aurora */
    var aurPct = null, aurNote = "";
    if (loc && d.ovation) {
      var ov = ovationAt(d.ovation.coordinates, loc.lon, loc.lat);
      if (ov && ov.value != null) {
        aurPct = Math.max(0, Math.min(100, ov.value));
        aurNote = "OVATION model at " + loc.lat.toFixed(1) + "°, " + loc.lon.toFixed(1) + "°";
        if (ov.maxAtLon != null) {
          aurNote += ". Peak along this longitude is " + Math.round(ov.maxAtLon) + "%" +
            (ov.maxLat != null ? " near " + ov.maxLat + "° latitude" : "");
        }
        if (d.ovation["Forecast Time"]) aurNote += " · forecast " + fmtTime(parseWhen(d.ovation["Forecast Time"]));
      }
    }
    if (aurPct == null && loc && state.errors.ovation) {
      var fb = auroraFromKp(loc.lat, kpNow != null ? kpNow : kp3);
      if (fb) {
        aurPct = Math.round(fb.pct);
        aurNote = "OVATION unavailable (" + state.errors.ovation + "). Fallback estimate from Kp and geographic latitude (not magnetic latitude).";
      }
    }
    var aurPending = loc && !d.ovation && !state.errors.ovation && aurPct == null;
    if (!loc) {
      $("aurora-metric").textContent = "—";
      $("aurora-metric").className = "metric";
      $("aurora-detail").textContent = "Set a location to see aurora chance at your latitude. Planetary Kp is " +
        (kpNow == null ? "loading" : kpNow.toFixed(2) + " (" + gScale(kpNow) + ")") + ".";
    } else if (aurPending) {
      $("aurora-metric").textContent = "…";
      $("aurora-metric").className = "metric";
      $("aurora-detail").textContent = "Loading the OVATION aurora model for your latitude…";
    } else {
      $("aurora-metric").textContent = aurPct == null ? "—" : Math.round(aurPct) + "%";
      $("aurora-metric").className = "metric " + (aurPct >= 40 ? "storm" : aurPct >= 15 ? "watch" : "quiet");
      $("aurora-detail").textContent = aurNote || "Computing…";
    }
    $("sky-aurora").textContent = loc
      ? (aurNote || "No aurora data yet.")
      : "Set a location to evaluate the oval at your latitude.";

    /* Solar wind */
    if (d.windSpeed != null) $("wind-speed").textContent = Math.round(d.windSpeed) + " km/s";
    else $("wind-speed").textContent = state.errors.windSpeedRaw ? "err" : "—";
    if (d.windBt != null) $("wind-bt").textContent = Number(d.windBt).toFixed(1) + " nT";
    else $("wind-bt").textContent = "—";
    if (d.windBz != null) {
      var bz = Number(d.windBz);
      $("wind-bz").textContent = (bz > 0 ? "+" : "") + bz.toFixed(1) + " nT";
      $("wind-bz").style.color = bz < -4 ? "var(--red)" : bz < 0 ? "var(--orange)" : "var(--gold2)";
    } else $("wind-bz").textContent = "—";
    var wbits = [];
    if (d.windTime) wbits.push(relTime(d.windTime));
    if (d.windSpeed != null && d.windSpeed >= 600) wbits.push("fast stream");
    if (d.windBz != null && d.windBz <= -5) wbits.push("southward Bz — storm-friendly");
    $("wind-note").textContent = (wbits.length ? wbits.join(" · ") + ". " : "") +
      "NOAA’s compact summary feed is used instead of the multi-megabyte 1-minute plasma file, so density is not shown.";

    /* Flares */
    $("flare-now").textContent = d.flareNow || (state.errors.xraysRaw ? "—" : "—");
    $("flare-now-sub").textContent = d.flareNow
      ? ("Current GOES 0.1–0.8 nm class" + (d.flareNowTime ? " · " + relTime(d.flareNowTime) : ""))
      : (state.errors.xraysRaw ? "X-ray flux failed: " + state.errors.xraysRaw : "Loading current X-ray class…");
    $("flare-last").textContent = d.flareLastClass || "—";
    $("flare-last-when").textContent = d.flareLastTime ? (fmtTime(d.flareLastTime) + " · " + relTime(d.flareLastTime)) : "—";

    /* HF */
    var sfi = d.sfi;
    var bands = estimateBands(sfi, kpNow != null ? kpNow : kp3, d.flareNow || d.flareLastClass);
    d.bands = bands;
    var dayNow = loc && window.Astro ? !Astro.isNight(now, loc.lat, loc.lon, -0.833) : (now.getHours() >= 6 && now.getHours() < 18);
    $("hf-meta").textContent = "SFI " + (sfi == null ? "—" : sfi) + " · Kp " +
      (kpNow == null ? "—" : kpNow.toFixed(2)) + " · " + (dayNow ? "daytime" : "nighttime") +
      (loc ? " at your location" : " (device clock; set a location for a local day/night split)") +
      ". Estimate only — not a measured ionosonde or VOACAP forecast.";
    renderBands($("hf-grid"), bands);
    renderBands($("radio-grid"), bands);
    $("radio-sfi").textContent = sfi == null ? "—" : String(sfi);
    $("radio-kp").textContent = kpNow == null ? "—" : kpNow.toFixed(2);
    $("radio-flare").textContent = d.flareNow || d.flareLastClass || "—";
    var watch = [];
    if (flareRank(d.flareNow || d.flareLastClass) >= 3.5) watch.push("Possible dayside HF absorption from a strong flare.");
    if ((kpNow != null ? kpNow : 0) >= 5 || (kp3 != null ? kp3 : 0) >= 5) watch.push("Geomagnetic storm levels — polar paths and higher bands may degrade. Useful GMRS net heads-up.");
    var nextStorm = (d.kpForecast || []).find(function (r) { return kpValue(r) >= 5 && parseWhen(r.time_tag) > now; });
    if (nextStorm) watch.push("Forecast Kp " + kpValue(nextStorm).toFixed(2) + " at " + fmtTime(parseWhen(nextStorm.time_tag)) + ".");
    $("radio-watch").textContent = watch.length ? watch.join(" ") : "No flare blackout or Kp-storm watch right now.";
    $("radio-blurb").textContent = "HF ratings are a simple estimate from solar flux (SFI " +
      (sfi == null ? "—" : sfi) + ") and Kp, split by day and night" +
      (loc ? " at " + (loc.label || "your location") : " (using this device’s clock until a location is set)") +
      ". They are not a substitute for real ionosonde data or a propagation forecast.";

    /* Moon */
    var phase = window.Astro ? Astro.moonPhase(now) : null;
    if (phase) {
      $("moon-pct").textContent = phase.percent + "%";
      $("moon-name").textContent = phase.name + " · age " + phase.ageDays.toFixed(1) + " days";
      $("sky-moon-name").textContent = phase.name;
      $("sky-moon-detail").textContent = phase.percent + "% illuminated · " + phase.ageDays.toFixed(1) + " days since new. Computed on-device, not from a weather API.";
      paintMoonFace($("moon-face"), phase);
      paintMoonFace($("moon-face-2"), phase);
    }

    var darkText = "Set a location for tonight’s astronomical-dark window (sun 18° below the horizon).";
    if (loc && window.Astro) {
      var dw = Astro.darkWindow(now, loc.lat, loc.lon);
      d.dark = dw;
      if (dw && dw.polar === "no-dark") darkText = "The sun does not reach 18° below the horizon here tonight — no full astronomical darkness.";
      else if (dw && dw.polar === "all-dark") darkText = "The sun stays below 18° — astronomical darkness all period.";
      else if (dw && dw.dusk && dw.dawn) {
        darkText = "Astronomical dark " + fmtClock(dw.dusk) + " – " + fmtClock(dw.dawn) + ".";
        if (dw.dusk.getTime() > Date.now()) darkText += " Starts " + relTime(dw.dusk).replace(/^in /, "") + ".";
        else if (dw.dawn.getTime() > Date.now()) darkText += " Underway, ends " + relTime(dw.dawn).replace(/^in /, "") + ".";
        if (phase && phase.percent >= 70) darkText += " Bright moon (" + phase.percent + "% lit) will wash out faint targets.";
        else if (phase && phase.percent <= 20) darkText += " Dark moon — a good deep-sky window if skies are clear.";
      } else darkText = "Could not solve twilight times for this latitude.";
    }
    $("dark-window").textContent = darkText;
    $("sky-dark").textContent = loc ? darkText : "Set a location to compute dusk, dawn, and tonight’s dark window.";
    $("sky-summary").textContent = (phase ? phase.name + ", " + phase.percent + "% lit. " : "") + (loc ? darkText : "Add a location for passes and darkness.");

    /* ISS */
    if (d.issNow) {
      $("iss-now").textContent = "ISS now " + d.issNow.latitude.toFixed(1) + "°, " + d.issNow.longitude.toFixed(1) +
        "° · " + Math.round(d.issNow.altitude) + " km" +
        (d.issNow.visibility ? " · " + d.issNow.visibility : "");
    } else if (state.errors.issNow && !d.tle) {
      $("iss-now").textContent = "ISS position unavailable.";
    }
    var passes = d.passes || [];
    if (!loc) {
      $("iss-next").textContent = "—";
      $("iss-detail").textContent = "Set a location to predict passes over you. Current ISS position still updates above.";
      $("iss-list").innerHTML = '<li class="muted">Set a location first.</li>';
    } else if ((state.errors.tle || state.errors.tleText) && !d.tle) {
      $("iss-next").textContent = "—";
      $("iss-detail").textContent = "TLE fetch failed (" + (state.errors.tle || state.errors.tleText) + "). Pass predictions need a two-line element set.";
      $("iss-list").innerHTML = '<li class="err">No TLE available.</li>';
    } else if (state.data.passesPending || d.passes == null) {
      $("iss-next").textContent = "…";
      $("iss-detail").textContent = "Computing upcoming passes from the ISS two-line element set…";
      $("iss-list").innerHTML = '<li class="muted">Computing passes…</li>';
    } else if (!passes.length) {
      $("iss-next").textContent = "None in 36h";
      $("iss-detail").textContent = "No passes above 10° elevation in the next 36 hours.";
      $("iss-list").innerHTML = '<li class="muted">None in the next 36 hours above 10° elevation.</li>';
    } else {
      var p0 = passes[0];
      $("iss-next").textContent = (p0.visible ? "Visible " : "Pass ") + relTime(p0.aos);
      $("iss-detail").textContent = fmtTime(p0.aos) + " · max " + Math.round(p0.maxElDeg) + "°" +
        (p0.visible ? " · likely visible (you in twilight/night, ISS sunlit)" : " · daylight or ISS in shadow");
      $("iss-list").innerHTML = passes.map(function (p) {
        return "<li><span>" + esc(fmtTime(p.aos)) + " · max " + Math.round(p.maxElDeg) + "°" +
          (p.visible ? " · visible" : " · not visible") + "</span><span class='when'>" + esc(relTime(p.aos)) + "</span></li>";
      }).join("");
    }

    /* NEO */
    if ((state.errors.flybysRaw || state.errors.cad || state.errors.cadRaw) && !d.neos) {
      $("neo-name").textContent = "Unavailable";
      $("neo-detail").textContent = "Flyby data could not be loaded from the RealAether NEO tracker. It is listed on the impact page when available.";
      $("neo-list").innerHTML = '<li class="err">No flyby list yet. See the RealAether NEO tracker for close approaches.</li>';
    } else if (d.neos && d.neos.length) {
      var n0 = d.neos[0];
      $("neo-name").textContent = n0.des;
      $("neo-detail").textContent = fmtTime(n0.when) + " · " + n0.ld.toFixed(2) + " lunar distances (" + n0.au.toFixed(4) + " au) · " + relTime(n0.when) + " · from the RealAether NEO tracker";
      $("neo-list").innerHTML = d.neos.slice(0, 8).map(function (n) {
        return "<li><span>" + esc(n.des) + " · " + n.ld.toFixed(2) + " LD</span><span class='when'>" +
          esc(fmtTime(n.when)) + "</span></li>";
      }).join("");
    } else if (d.neos && !d.neos.length) {
      $("neo-name").textContent = "None";
      $("neo-detail").textContent = "No close approaches within 0.05 au in the next 60 days (JPL CAD).";
      $("neo-list").innerHTML = '<li class="muted">None in the next 60 days within 0.05 au.</li>';
    }

    /* Quakes */
    var quakes = d.quakes || [];
    if (state.errors.quakesRaw && !quakes.length) {
      $("quake-list").innerHTML = '<li class="err">USGS feed failed: ' + esc(state.errors.quakesRaw) + "</li>";
    } else if (!quakes.length) {
      $("quake-list").innerHTML = '<li class="muted">No M4.5+ events in the past week.</li>';
    } else {
      $("quake-list").innerHTML = quakes.slice(0, 6).map(function (q) {
        return "<li><span>M" + q.mag.toFixed(1) + " · " + esc(q.place) + "</span><span class='when'>" +
          esc(relTime(q.when)) + "</span></li>";
      }).join("");
    }
  }

  /* ---------- data load ---------- */

  function parseCadDate(cd) {
    if (!cd) return null;
    var months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    var m = String(cd).trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m && months[m[2]] != null) {
      return new Date(Date.UTC(+m[1], months[m[2]], +m[3], +m[4], +m[5], +(m[6] || 0)));
    }
    return parseWhen(cd);
  }

  function parseCad(j) {
    if (!j || !j.fields || !j.data) return [];
    var idx = {};
    j.fields.forEach(function (f, i) { idx[f] = i; });
    var now = Date.now();
    return j.data.map(function (row) {
      var cd = row[idx.cd];
      var when = parseCadDate(cd);
      var au = +row[idx.dist];
      return {
        des: String(row[idx.fullname] || row[idx.des] || "").trim() || row[idx.des],
        when: when,
        au: au,
        ld: au / 0.00256956
      };
    }).filter(function (n) { return n.when && n.when.getTime() >= now - 3600 * 1000; })
      .sort(function (a, b) { return a.when - b.when; });
  }

  function parseFlybys(j) {
    if (!j) return [];
    if (Array.isArray(j.neos)) {
      return j.neos.map(function (n) {
        var when = n.when ? new Date(n.when) : parseCadDate(n.cd || n.cd_tdb);
        return {
          des: String(n.des || n.fullname || "").trim() || n.des,
          when: when,
          au: +n.au,
          ld: n.ld != null ? +n.ld : (n.au != null ? +n.au / 0.00256956 : null)
        };
      }).filter(function (n) { return n.when && !isNaN(n.when) && n.when.getTime() >= Date.now() - 3600 * 1000; })
        .sort(function (a, b) { return a.when - b.when; });
    }
    if (j.fields && j.data) return parseCad(j);
    var now = Date.now();
    return (j.approaches || []).filter(function (a) {
      return String(a.body || "Earth").toLowerCase() === "earth";
    }).map(function (a) {
      var when = a.iso_et ? new Date(a.iso_et) : parseCadDate(a.cd_tdb);
      return {
        des: String(a.fullname || a.des || "").trim() || a.des,
        when: when,
        au: +a.dist_au,
        ld: a.dist_ld != null ? +a.dist_ld : (+a.dist_au / 0.00256956)
      };
    }).filter(function (n) { return n.when && !isNaN(n.when) && n.when.getTime() >= now - 3600 * 1000; })
      .sort(function (a, b) { return a.when - b.when; });
  }

  function loadFlybys() {
    return fetchJson(URLS.flybys, 8000).catch(function () {
      return fetchJson(URLS.impactUpcoming, 20000);
    }).catch(function () {
      return fetchJson(URLS.cad, 10000);
    });
  }

  function parseKpBundle() {
    var rows1 = asRows(state.data.kp1mRaw || []);
    var rows3 = asRows(state.data.kp3hRaw || []);
    var fc = asRows(state.data.kpForecastRaw || []);
    state.data.kp1m = last(rows1);
    state.data.kp1mTime = state.data.kp1m ? parseWhen(state.data.kp1m.time_tag) : null;
    state.data.kp3hSeries = rows3;
    state.data.kp3h = last(rows3);
    state.data.kpForecast = fc;
  }

  async function refresh() {
    if (state.loading) { state.pendingRefresh = true; return; }
    state.loading = true;
    $("refresh-btn").disabled = true;
    try {
      await Promise.all([
        settled("kp1mRaw", fetchJson(URLS.kp1m)),
        settled("kp3hRaw", fetchJson(URLS.kp3h)),
        settled("kpForecastRaw", fetchJson(URLS.kpForecast, 12000)),
        settled("windSpeedRaw", fetchJson(URLS.windSpeed, 10000)),
        settled("windMagRaw", fetchJson(URLS.windMag, 10000)),
        settled("fluxRaw", fetchJson(URLS.flux, 10000)),
        settled("flaresRaw", fetchJson(URLS.flares, 15000)),
        settled("quakesRaw", fetchJson(URLS.quakes, 15000)),
        settled("issNow", fetchJson(URLS.issNow, 10000)),
        settled("flybysRaw", loadFlybys())
      ]);
      parseKpBundle();
      var ws = last(asRows(state.data.windSpeedRaw || []));
      var wm = last(asRows(state.data.windMagRaw || []));
      if (ws) { state.data.windSpeed = num(ws.proton_speed != null ? ws.proton_speed : ws.speed); state.data.windTime = parseWhen(ws.time_tag); }
      if (wm) { state.data.windBt = num(wm.bt); state.data.windBz = num(wm.bz_gsm != null ? wm.bz_gsm : wm.bz); if (!state.data.windTime) state.data.windTime = parseWhen(wm.time_tag); }
      var flx = last(asRows(state.data.fluxRaw || []));
      if (flx) state.data.sfi = num(flx.flux);
      var flares = (state.data.flaresRaw || []).slice().sort(function (a, b) {
        return (parseWhen(a.max_time || a.time_tag) || 0) - (parseWhen(b.max_time || b.time_tag) || 0);
      });
      var lastFlare = last(flares);
      if (lastFlare) {
        state.data.flareLastClass = lastFlare.max_class || lastFlare.end_class || lastFlare.begin_class;
        state.data.flareLastTime = parseWhen(lastFlare.max_time || lastFlare.time_tag);
      }
      if (state.data.flybysRaw) state.data.neos = parseFlybys(state.data.flybysRaw);
      var qj = state.data.quakesRaw;
      if (qj && qj.features) {
        state.data.quakes = qj.features.map(function (f) {
          return { mag: f.properties.mag, place: f.properties.place, when: new Date(f.properties.time), url: f.properties.url };
        }).sort(function (a, b) { return b.when - a.when; });
      }
      state.updatedAt = new Date();
      render();

      /* Heavier / optional second wave */
      await Promise.all([
        settled("xraysRaw", fetchJson(URLS.xrays, 20000)),
        settled("ovation", state.location ? fetchJson(URLS.ovation, 25000) : Promise.resolve(null)),
        (function () {
          return settled("tleText", fetchText(URLS.tle, 12000)).then(function (text) {
            var tle = text && parseTle(text);
            if (tle) { state.data.tle = tle; return tle; }
            return settled("tleFallback", fetchJson(URLS.tleFallback, 12000)).then(function (j) {
              if (j && j.line1 && j.line2) {
                state.data.tle = { name: j.name || "ISS (ZARYA)", line1: j.line1, line2: j.line2 };
                delete state.errors.tle;
              }
            });
          });
        })()
      ]);
      var xr = state.data.xraysRaw || [];
      var longBand = xr.filter(function (r) { return r.energy === "0.1-0.8nm" && !r.electron_contaminaton; });
      if (!longBand.length) longBand = xr.filter(function (r) { return r.energy === "0.1-0.8nm"; });
      var latestX = last(longBand);
      if (latestX) {
        state.data.flareNow = fluxToClass(latestX.flux);
        state.data.flareNowTime = parseWhen(latestX.time_tag);
      }
      if (state.data.tle && state.location) {
        try { state.data.passes = issPasses(state.data.tle, state.location.lat, state.location.lon); }
        catch (e) { state.errors.passes = String(e.message || e); state.data.passes = []; }
      } else if (!state.location) {
        state.data.passes = [];
      }
      state.data.passesPending = false;
      state.updatedAt = new Date();
      render();
      maybeNotify(false);
    } finally {
      state.loading = false;
      $("refresh-btn").disabled = false;
      state.data.passesPending = false;
      if (state.pendingRefresh) {
        state.pendingRefresh = false;
        refresh();
      }
    }
  }

  function maybeNotify(fromSave) {
    var a = state.alerts;
    if (!a.notify || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    var d = state.data;
    var msgs = [];
    var kp = kpValue(d.kp1m) || kpValue(d.kp3h);
    if (kp != null && kp >= a.kp) msgs.push("Kp is " + kp.toFixed(2) + " (threshold " + a.kp + ")");
    var fl = d.flareNow || d.flareLastClass;
    if (fl && flareRank(fl) >= flareRank(a.flare + "1")) msgs.push("Flare level " + fl);
    if (state.location && $("aurora-metric")) {
      var p = parseFloat(String($("aurora-metric").textContent));
      if (isFinite(p) && p >= a.aurora) msgs.push("Aurora chance " + Math.round(p) + "%");
    }
    if (d.quakes && d.quakes[0] && d.quakes[0].mag >= a.quake) {
      msgs.push("M" + d.quakes[0].mag.toFixed(1) + " " + d.quakes[0].place);
    }
    if (a.iss && d.passes && d.passes[0] && d.passes[0].aos.getTime() - Date.now() < 45 * 60 * 1000) {
      msgs.push("ISS pass " + relTime(d.passes[0].aos));
    }
    if (!msgs.length) return;
    var key = msgs.join("|");
    try {
      if (!fromSave && localStorage.getItem(STORAGE_NOTIFIED) === key) return;
      localStorage.setItem(STORAGE_NOTIFIED, key);
    } catch (e) {}
    try { new Notification("Sky Companion", { body: msgs.join(" · "), icon: "icons/icon-192.png" }); }
    catch (e) {}
  }

  /* ---------- location UI ---------- */

  function showLocErr(msg) {
    var el = $("loc-err");
    if (!msg) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function openLoc() { $("loc-modal").hidden = false; showLocErr(""); }
  function closeLoc() { $("loc-modal").hidden = true; }

  function applyLocation(loc) {
    saveLoc(loc);
    closeLoc();
    state.data.passes = null;
    state.data.passesPending = true;
    state.data.ovation = null;
    render();
    refresh();
  }

  async function searchCity(q) {
    var url = URLS.geo + "?name=" + encodeURIComponent(q) + "&count=6&language=en&format=json";
    var j = await fetchJson(url, 10000);
    return (j.results || []).map(function (r) {
      var parts = [r.name, r.admin1];
      if (r.country_code && r.country_code !== "US" && r.country) parts.push(r.country);
      return {
        lat: r.latitude,
        lon: r.longitude,
        tz: r.timezone || null,
        label: parts.filter(Boolean).join(", "),
        source: "geocode"
      };
    });
  }

  function parseCoords(s) {
    var m = String(s).trim().match(/^([+-]?\d+(?:\.\d+)?)\s*[, ]\s*([+-]?\d+(?:\.\d+)?)°?$/);
    if (!m) return null;
    var lat = +m[1], lon = +m[2];
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat: lat, lon: lon, tz: null, label: lat.toFixed(3) + "°, " + lon.toFixed(3) + "°", source: "coords" };
  }

  function bind() {
    document.querySelectorAll(".tabbar button").forEach(function (btn) {
      on(btn, "click", function () {
        var view = btn.getAttribute("data-go");
        document.querySelectorAll(".tabbar button").forEach(function (b) { b.classList.toggle("active", b === btn); });
        document.querySelectorAll(".view").forEach(function (v) { v.classList.toggle("active", v.getAttribute("data-view") === view); });
        window.scrollTo(0, 0);
      });
    });
    on($("loc-chip"), "click", openLoc);
    on($("close-loc"), "click", closeLoc);
    on($("loc-modal"), "click", function (e) { if (e.target.id === "loc-modal") closeLoc(); });
    on($("refresh-btn"), "click", refresh);
    on($("clear-loc"), "click", function () { saveLoc(null); state.data.passes = []; render(); });
    on($("use-geo"), "click", function () {
      showLocErr("");
      if (!navigator.geolocation) { showLocErr("Geolocation is not available in this browser."); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        applyLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          tz: undefined,
          label: pos.coords.latitude.toFixed(3) + "°, " + pos.coords.longitude.toFixed(3) + "°",
          source: "geolocation"
        });
      }, function (err) {
        showLocErr(err && err.message ? err.message : "Location permission denied.");
      }, { enableHighAccuracy: false, timeout: 10000 });
    });
    var cityTimer = null;
    on($("city-q"), "input", function () {
      clearTimeout(cityTimer);
      var q = $("city-q").value.trim();
      $("city-results").innerHTML = "";
      if (q.length < 2) return;
      cityTimer = setTimeout(async function () {
        try {
          var list = await searchCity(q);
          $("city-results").innerHTML = "";
          if (!list.length) {
            $("city-results").innerHTML = '<p class="sub">No matches.</p>';
            return;
          }
          list.forEach(function (item) {
            var b = document.createElement("button");
            b.type = "button";
            b.textContent = item.label;
            b.addEventListener("click", function () { applyLocation(item); });
            $("city-results").appendChild(b);
          });
        } catch (e) {
          showLocErr("City search failed (" + (e.message || e) + "). You can still type coordinates.");
        }
      }, 280);
    });
    on($("use-coords"), "click", function () {
      var loc = parseCoords($("coord-q").value);
      if (!loc) { showLocErr("Enter latitude and longitude like 39.74, -104.99"); return; }
      applyLocation(loc);
    });
    on($("th-kp"), "input", function () { $("th-kp-val").textContent = $("th-kp").value; });
    on($("th-aurora"), "input", function () { $("th-aurora-val").textContent = $("th-aurora").value; });
    on($("th-quake"), "input", function () { $("th-quake-val").textContent = Number($("th-quake").value).toFixed(1); });
    on($("save-alerts"), "click", saveAlerts);
    on($("th-notify"), "change", async function () {
      if ($("th-notify").checked) {
        if (typeof Notification === "undefined") {
          $("alert-status").textContent = "Notifications are not available in this browser.";
          $("th-notify").checked = false;
          return;
        }
        var perm = await Notification.requestPermission();
        if (perm !== "granted") {
          $("alert-status").textContent = "Permission was not granted. You can still use on-screen thresholds.";
          $("th-notify").checked = false;
        }
      }
      saveAlerts();
    });
    on($("test-notify"), "click", async function () {
      if (typeof Notification === "undefined") {
        $("alert-status").textContent = "Notifications are not available here.";
        return;
      }
      var perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (perm !== "granted") {
        $("alert-status").textContent = "Permission was not granted.";
        return;
      }
      new Notification("Sky Companion", { body: "Test alert — thresholds are stored only on this device.", icon: "icons/icon-192.png" });
      $("alert-status").textContent = "Test notification sent.";
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && state.updatedAt && Date.now() - state.updatedAt.getTime() > 5 * 60 * 1000) refresh();
    });
  }

  function registerSw() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/realaether/sky/sw.js", { scope: "/realaether/sky/" }).catch(function () {});
  }

  function boot() {
    state.location = loadLoc();
    fillAlertsForm();
    syncLocChip();
    bind();
    registerSw();
    render();
    refresh();
    setInterval(function () {
      if (!document.hidden) refresh();
    }, 5 * 60 * 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
