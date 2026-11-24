# Sky Companion (preview)

A free, installable phone web app (PWA) for amateur astronomers and ham/GMRS operators. This is a box-only preview: it has not been published, and it does not touch StudioPC or the Pis.

Open `index.html` over `http://localhost` (needed for the service worker, geolocation, and notifications). There is no build step and no framework.

## Features

- Home dashboard: Kp now + 3-hour, aurora chance at the user’s latitude, solar wind, flare level, HF day/night estimate, moon phase and tonight’s dark window, next ISS pass, next NEO flyby, recent M4.5+ quakes
- Sky, Radio, and Alerts tabs
- Location from browser geolocation, a city search, or typed latitude/longitude — never hardcoded
- Alert thresholds in `localStorage`; notifications optional
- Add to iPhone Home Screen (Share → Add to Home Screen)

## Data sources

All fetches are client-side from public APIs. If a source lacks CORS, the card degrades with an explanation instead of using a backend.

| Data | Source |
| --- | --- |
| Kp 1-minute and 3-hour, Kp forecast | NOAA SWPC |
| Solar wind speed / Bt / Bz | NOAA SWPC compact summaries (not the multi-MB 1-minute plasma file) |
| 10.7 cm flux (SFI) | NOAA SWPC |
| GOES X-ray flux and flares | NOAA SWPC |
| Aurora | NOAA SWPC OVATION, with a Kp+latitude fallback |
| ISS passes | Celestrak TLE + vendorized satellite.js; position fallback from Where The ISS At |
| NEO close approaches | NASA/JPL CAD API (future only). **This API does not send CORS headers**, so the card will not load in a browser until a static snapshot or the RealAether impact page is used. |
| Earthquakes | USGS M4.5+ week feed |
| City search | Open-Meteo geocoding |
| Moon phase and astronomical twilight | Computed on-device in `astro.js` |

HF band ratings are a labeled **estimate** from SFI and Kp, not ionosonde or VOACAP data.

## Publish later (not done)

Typical path: copy this folder to the existing GitHub Pages site as `/sky/` and deploy through the AI Pi publisher, then link it from AetherWeather. Or give it its own repo with GitHub Pages. HTTPS is required for the PWA, geolocation, and notifications. Optional follow-up: publish a tiny periodic JPL CAD snapshot (static JSON) so the flyby card works without a backend.
