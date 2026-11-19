# RealAether

**Cosmic Ray Randomness Detector (CRRD)**: a light-sealed Raspberry Pi Camera Module 3 on a Raspberry Pi 5 in South Carolina, used as a cosmic-ray / radiation detector and a sensor-noise random number source.

**Live site:** https://geebs369.github.io/realaether/crrd/
**Methods:** https://geebs369.github.io/realaether/crrd/methods.html

## What it does
- Takes continuous 1-second raw dark frames, subtracts a calibrated dark image, masks hot and flickering pixels, and detects particle hits (position, energy, length, track angle).
- Compares hit rates with space weather: NOAA Kp, GOES X-ray, solar wind, and the Oulu neutron monitor.
- Runs a playful "pixelation" test on track angles, with an honest null: the sensor's own pixel grid makes short tracks prefer 0°, 45°, 90° and 135°.
- Harvests random bits from sensor noise (temporal von Neumann debiasing) and tracks a Global-Consciousness-Project-style cumulative deviation. The expected result is chance.

The site is a static snapshot refreshed every 15 minutes; nothing on it connects back to the Pi.

## Data
`crrd/data/`: `latest.json`, `series.json` (hourly, 30 days), `angles.json`, `hits_recent.json`, `events.json`, `crops/` (50 most recent hits), `daily/` (one hits CSV and one per-minute RNG CSV per completed day).

## License
- Code: MIT (see `LICENSE`).
- Data and charts: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit **"RealAether (Geebs369)"**.
- Space weather from NOAA SWPC; neutron monitor data from NMDB (Oulu).
