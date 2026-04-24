# Transpirenaica / Cap de Creus Interactive Map

A polished static web map for the final 7-day trek between Núria and Cadaqués via Cap de Creus, built around local GeoJSON tracks, stage-by-stage route exploration, highlights, and accommodation details.

The app is designed to feel useful first and flashy second: fast stage switching, smooth card-to-map transitions, responsive route highlighting, and synced route/profile exploration on both desktop and mobile.

## Highlights

- Real route data stored locally in GeoJSON, with no fragile runtime dependency on external track websites
- Bottom carousel with smooth stage transitions and map recentering
- Elevation profile for each day, plus synced route preview when hovering or scrubbing the selected stage
- Desktop hover interactions and mobile touch interactions tailored to the same route-inspection workflow
- Hiking route rendering, plus highlights and official stage endpoints on the map

## Stack

- Vite + JavaScript vanilla
- Leaflet + OpenStreetMap
- Local data in `data/*.geojson` and `public/data/*.geojson`
- No backend

## How to run it

```bash
npm install
npm run build:data
npm run dev
```

Production build:

```bash
npm run build
```

## Scripts

- `npm run build:data`: downloads public sources, converts ZIP/XML GPX files into local GeoJSON, geocodes places, and generates `route.geojson`, `places.geojson`, and `route-meta.json`.
- `npm run dev`: starts the app in development mode.
- `npm run build`: generates the static bundle in `dist/`.

## Experience notes

- Selecting a stage keeps the rest of the route visible, but clearly de-emphasized for context.
- The carousel is not just presentation: it drives the map state, route highlighting, and the active elevation profile.
- On desktop, hovering the selected route or profile reveals the matching point on the other view.
- On mobile, the same route/profile inspection flow is adapted to touch gestures instead of relying on hover.

## Final Itinerary

Sunday 26 April 2026 is only the approach/logistics day to reach the Queralbs/Núria area.

| Day | Date | Stage | Distance | Elevation | Duration | Accommodation |
| --- | --- | --- | ---: | --- | --- | --- |
| 1 | Monday 27 April | Núria → Setcases | 19.5 km | +1,060 m / -1,750 m | 6h40 | Apartaments Can Bundanci |
| 2 | Tuesday 28 April | Setcases → Sant Aniol | 38.5 km | +1,623 m / -2,450 m | 10h30 | Refugi de Sant Aniol |
| 3 | Wednesday 29 April | Sant Aniol → Maçanet de Cabrenys | 35.8 km | +1,546 m / -1,631 m | 10h | Camping Maçanet de Cabrenys |
| 4 | Thursday 30 April | Maçanet de Cabrenys → La Jonquera | 24.9 km | +542 m / -806 m | 6h | Hotel Jonquera |
| 5 | Friday 1 May | La Jonquera → Vilamaniscle | 41.2 km | +1,331 m / -1,292 m | 10h | Mestral Studio el Penell |
| 6 | Saturday 2 May | Vilamaniscle → Port de la Selva | 21.2 km | +760 m / -910 m | 5h45 | Hotel Carrer Major / Airbnb |
| 7 | Sunday 3 May | Port de la Selva → Cap de Creus → Cadaqués | 22.2 km | +752 m / -788 m | 6h | none / end of route |

Final hiking totals: 7 days, 203.3 km, +7,614 m, -9,627 m.

## Official Stage Endpoints

- Núria
- Setcases
- Sant Aniol
- Maçanet de Cabrenys
- La Jonquera
- Vilamaniscle
- Port de la Selva
- Cap de Creus
- Cadaqués

## Relevant structure

- `scripts/build-route-data.mjs`: import, download, geocoding, and GPX → GeoJSON conversion
- `data/*.geojson`: readable local copy for review
- `public/data/*.geojson`: copy served by the app
- `src/main.js`: map logic, filters, stage cards, and markers
- `src/style.css`: responsive desktop/mobile layout

## Implementation notes

- The importer supports both plain GPX XML and ZIP files containing GPX, because some public park sources publish tracks in that format.
- The app does not make runtime fetches to track websites or geocoding services.
- The only external runtime resource is the OpenStreetMap base layer for the map.
