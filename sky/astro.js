/* Local sun / moon / twilight math for Sky Companion. No network. */
(function (global) {
  "use strict";

  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var DAY_MS = 86400000;

  function julianDate(date) {
    return date.getTime() / DAY_MS + 2440587.5;
  }

  function julianCenturies(jd) {
    return (jd - 2451545.0) / 36525;
  }

  function wrap360(x) {
    return ((x % 360) + 360) % 360;
  }

  function sind(x) { return Math.sin(x * DEG); }
  function cosd(x) { return Math.cos(x * DEG); }
  function asind(x) { return Math.asin(x) * RAD; }
  function atan2d(y, x) { return Math.atan2(y, x) * RAD; }

  /* Meeus-style solar coordinates, accurate to a few arcminutes. */
  function sunCoords(date) {
    var jd = julianDate(date);
    var T = julianCenturies(jd);
    var L0 = wrap360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    var M = wrap360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sind(M)
      + (0.019993 - 0.000101 * T) * sind(2 * M)
      + 0.000289 * sind(3 * M);
    var trueLong = L0 + C;
    var omega = 125.04 - 1934.136 * T;
    var lam = trueLong - 0.00569 - 0.00478 * sind(omega);
    var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    var eps = eps0 + 0.00256 * cosd(omega);
    var ra = atan2d(cosd(eps) * sind(lam), cosd(lam));
    var dec = asind(sind(eps) * sind(lam));
    var R = 1.000001018 * (1 - (0.016708634 - 0.000042037 * T) * cosd(M)
      - (0.00013956) * cosd(2 * M));
    return { ra: wrap360(ra), dec: dec, lon: wrap360(lam), eps: eps, jd: jd, T: T, distAu: R };
  }

  function gmstDeg(jd) {
    var T = julianCenturies(jd);
    return wrap360(280.46061837 + 360.98564736629 * (jd - 2451545)
      + 0.000387933 * T * T - T * T * T / 38710000);
  }

  function localSidereal(date, lon) {
    return wrap360(gmstDeg(julianDate(date)) + lon);
  }

  function hourAngle(date, lon, ra) {
    return wrap360(localSidereal(date, lon) - ra);
  }

  /* Geocentric equatorial unit/km vector of the Sun (mean equator of date). */
  function sunEciKm(date) {
    var s = sunCoords(date);
    var AU = 149597870.7;
    var r = s.distAu * AU;
    var ra = s.ra * DEG;
    var dec = s.dec * DEG;
    return {
      x: r * Math.cos(dec) * Math.cos(ra),
      y: r * Math.cos(dec) * Math.sin(ra),
      z: r * Math.sin(dec)
    };
  }

  function equatorialToAltAz(ra, dec, lat, lon, date) {
    var ha = hourAngle(date, lon, ra);
    var x = cosd(ha) * cosd(dec);
    var y = sind(ha) * cosd(dec);
    var z = sind(dec);
    var xhor = x * sind(lat) - z * cosd(lat);
    var yhor = y;
    var zhor = x * cosd(lat) + z * sind(lat);
    var az = wrap360(atan2d(yhor, xhor) + 180);
    var alt = asind(zhor);
    return { alt: alt, az: az };
  }

  function sunAlt(date, lat, lon) {
    var s = sunCoords(date);
    return equatorialToAltAz(s.ra, s.dec, lat, lon, date).alt;
  }

  /* Compact lunar position (Meeus-ish, ~0.3 deg). Good enough for phase and altitude. */
  function moonCoords(date) {
    var jd = julianDate(date);
    var T = julianCenturies(jd);
    var Lp = wrap360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T);
    var D = wrap360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T);
    var M = wrap360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
    var Mp = wrap360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T);
    var F = wrap360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T);
    var lon = Lp
      + 6.289 * sind(Mp)
      + 1.274 * sind(2 * D - Mp)
      + 0.658 * sind(2 * D)
      + 0.214 * sind(2 * Mp)
      + 0.110 * sind(D)
      - 0.186 * sind(M)
      - 0.114 * sind(2 * F);
    var lat = 5.128 * sind(F)
      + 0.280 * sind(Mp + F)
      + 0.278 * sind(Mp - F)
      + 0.173 * sind(2 * D - F);
    var R = 385000.56
      - 20905 * Math.cos(Mp * DEG)
      - 3699 * Math.cos((2 * D - Mp) * DEG)
      - 2956 * Math.cos(2 * D * DEG);
    var sun = sunCoords(date);
    var eps = sun.eps;
    var x = cosd(lon) * cosd(lat);
    var y = sind(lon) * cosd(lat);
    var z = sind(lat);
    var ye = y * cosd(eps) - z * sind(eps);
    var ze = y * sind(eps) + z * cosd(eps);
    var ra = wrap360(atan2d(ye, x));
    var dec = asind(ze);
    return { ra: ra, dec: dec, lon: wrap360(lon), lat: lat, distKm: R, sunLon: sun.lon };
  }

  function moonAlt(date, lat, lon) {
    var m = moonCoords(date);
    return equatorialToAltAz(m.ra, m.dec, lat, lon, date).alt;
  }

  function moonPhase(date) {
    var m = moonCoords(date);
    var elong = Math.abs(((m.lon - m.sunLon + 180) % 360) - 180);
    var phaseAngle = elong; /* elongation ~ phase angle for this use */
    var illum = (1 - Math.cos(elong * DEG)) / 2; /* k = (1 + cos i)/2, i ≈ 180° − elongation */
    /* age from new: when moon lon ~= sun lon */
    var ageDeg = wrap360(m.lon - m.sunLon);
    var synodic = 29.530588853;
    var age = synodic * (ageDeg / 360);
    var name;
    if (ageDeg < 8 || ageDeg >= 352) name = "New Moon";
    else if (ageDeg < 82) name = "Waxing Crescent";
    else if (ageDeg < 98) name = "First Quarter";
    else if (ageDeg < 172) name = "Waxing Gibbous";
    else if (ageDeg < 188) name = "Full Moon";
    else if (ageDeg < 262) name = "Waning Gibbous";
    else if (ageDeg < 278) name = "Last Quarter";
    else name = "Waning Crescent";
    return {
      illumination: illum,
      percent: Math.round(illum * 100),
      ageDays: age,
      elong: elong,
      phaseAngle: phaseAngle,
      name: name,
      waxing: ageDeg < 180
    };
  }

  function findCrossing(lat, lon, start, end, targetAlt, rising) {
    var a = start.getTime();
    var b = end.getTime();
    if (b <= a) return null;
    var altA = sunAlt(new Date(a), lat, lon);
    var altB = sunAlt(new Date(b), lat, lon);
    var want = rising ? (altA < targetAlt && altB >= targetAlt)
                      : (altA > targetAlt && altB <= targetAlt);
    if (!want) return null;
    for (var i = 0; i < 24; i++) {
      var mid = (a + b) / 2;
      var alt = sunAlt(new Date(mid), lat, lon);
      if (rising) {
        if (alt < targetAlt) a = mid; else b = mid;
      } else {
        if (alt > targetAlt) a = mid; else b = mid;
      }
    }
    return new Date((a + b) / 2);
  }

  /* Returns tonight's astronomical-dark window (sun < -18°) near the given date. */
  function darkWindow(date, lat, lon) {
    if (lat == null || lon == null) return null;
    /* Work from the local noon preceding this evening, through the next noon. */
    var start = new Date(date.getTime() - 12 * 3600 * 1000);
    var end = new Date(date.getTime() + 36 * 3600 * 1000);
    var step = 10 * 60 * 1000;
    var samples = [];
    for (var t = start.getTime(); t <= end.getTime(); t += step) {
      samples.push({ t: t, alt: sunAlt(new Date(t), lat, lon) });
    }
    function firstCross(from, to, target, rising) {
      for (var i = 0; i < samples.length - 1; i++) {
        if (samples[i].t < from || samples[i + 1].t > to) continue;
        var hit = findCrossing(lat, lon, new Date(samples[i].t), new Date(samples[i + 1].t), target, rising);
        if (hit) return hit;
      }
      return null;
    }
    var sunset = firstCross(start.getTime(), end.getTime(), -0.833, false);
    var dusk = firstCross(start.getTime(), end.getTime(), -18, false);
    var dawn = dusk ? firstCross(dusk.getTime(), end.getTime(), -18, true) : firstCross(start.getTime(), end.getTime(), -18, true);
    var sunrise = dawn ? firstCross(dawn.getTime(), end.getTime(), -0.833, true)
                       : firstCross(start.getTime(), end.getTime(), -0.833, true);

    var minAlt = Infinity, maxAlt = -Infinity;
    samples.forEach(function (s) {
      if (s.alt < minAlt) minAlt = s.alt;
      if (s.alt > maxAlt) maxAlt = s.alt;
    });

    var polar = null;
    if (minAlt > -18) polar = "no-dark";
    else if (maxAlt < -18) polar = "all-dark";

    return {
      sunset: sunset,
      sunrise: sunrise,
      dusk: dusk,
      dawn: dawn,
      polar: polar,
      minAlt: minAlt,
      maxAlt: maxAlt,
      nowAlt: sunAlt(date, lat, lon)
    };
  }

  function isNight(date, lat, lon, threshold) {
    if (lat == null || lon == null) return null;
    return sunAlt(date, lat, lon) < (threshold == null ? -0.833 : threshold);
  }

  global.Astro = {
    julianDate: julianDate,
    sunCoords: sunCoords,
    sunAlt: sunAlt,
    sunEciKm: sunEciKm,
    moonCoords: moonCoords,
    moonAlt: moonAlt,
    moonPhase: moonPhase,
    darkWindow: darkWindow,
    isNight: isNight
  };
})(window);
