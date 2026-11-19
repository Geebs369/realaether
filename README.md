# RealAether

Two home-built dashboards, served as a static GitHub Pages site:

- **AetherWeather** (front page): a cosmic + Earth weather dashboard for the Upstate of South Carolina. Live geomagnetic Kp and forecast, solar wind, solar flares and space-weather alerts (NOAA SWPC), aurora outlook, ISS position, meteor shower calendar, earthquakes (USGS) and elevated volcanoes (USGS). Data is fetched live by your browser from those public APIs.
  **https://geebs369.github.io/realaether/**
- **Cosmic Ray Randomness Detector (CRRD)**, described below.

## CRRD

**Cosmic Ray Randomness Detector (CRRD)**: a light-sealed Raspberry Pi Camera Module 3 on a Raspberry Pi 5 in South Carolina, used as a cosmic-ray / radiation detector and a sensor-noise random number source.

**Live site:** https://geebs369.github.io/realaether/crrd/
**Methods:** https://geebs369.github.io/realaether/crrd/methods.html

## What it does
- Takes continuous 1-second raw dark frames, subtracts a calibrated dark image, masks hot and flickering pixels, and detects particle hits (position, energy, length, track angle).
- Compares hit rates with space weather: NOAA Kp, GOES X-ray, solar wind, and the Oulu neutron monitor.
- Runs a playful "pixelation" test on track angles, with an honest null: the sensor's own pixel grid makes short tracks prefer 0°, 45°, 90° and 135°.
- Harvests random bits from sensor noise (temporal von Neumann debiasing) and tracks a Global-Consciousness-Project-style cumulative deviation. The expected result is chance.

The CRRD page is a static snapshot refreshed every 15 minutes; nothing on the site connects back to the Pi.

## Data
`crrd/data/`: `latest.json`, `series.json` (hourly, 30 days), `angles.json`, `hits_recent.json`, `events.json`, `crops/` (50 most recent hits), `daily/` (one hits CSV and one per-minute RNG CSV per completed day).

## License
- Code: MIT (see `LICENSE`). Background and avatar art on AetherWeather are in-game Star Citizen® screenshots by 3Th3R3AL1 (credited on the page).
- Data and charts: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit **"RealAether (Geebs369)"**.
- Space weather from NOAA SWPC; neutron monitor data from NMDB (Oulu).
