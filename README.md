# GR11 / Cap de Creus Interactive Map

A polished static web map for a real 6-day trek between Vall de Núria and Cadaqués, built around real local GeoJSON tracks, stage-by-stage route exploration, highlights, and the special Thursday bus transfer.

The app is designed to feel useful first and flashy second: fast stage switching, smooth card-to-map transitions, responsive route highlighting, and synced route/profile exploration on both desktop and mobile.

## Highlights

- Real route data stored locally in GeoJSON, with no fragile runtime dependency on external track websites
- Bottom carousel with smooth stage transitions and map recentering
- Elevation profile for each day, plus synced route preview when hovering or scrubbing the selected stage
- Desktop hover interactions and mobile touch interactions tailored to the same route-inspection workflow
- Distinct rendering for hiking and bus segments, plus highlights and stage endpoints on the map

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

## Track sources

### Day 1
- Visit Pirineus, stage 9: Setcases - Santuari de Núria
- Page: https://www.visitpirineus.com/fr/que-fer/rutes/etapa-de-ruta/etapa-9-setcases-santuari-de-nuria
- App usage: reversed to represent Núria → Setcases

### Day 2
- Visit Pirineus, stage 8: Beget - Setcases
- Page: https://www.visitpirineus.com/ca/que-fer/rutes/etapa-de-ruta/etapa-8-beget-setcases
- App usage: reversed to represent Setcases → Beget

### Day 3
- Visit Pirineus, stage 7: Sant Aniol d'Aguja - Beget
- Page: https://www.visitpirineus.com/ca/que-fer/rutes/etapa-de-ruta/etapa-7-sant-aniol-daguja-beget
- Visit Pirineus, stage 6: Albanyà - Sant Aniol d'Aguja
- Page: https://www.visitpirineus.com/ca/que-fer/rutes/etapa-de-ruta/etapa-6-albanya-sant-aniol-daguja
- App usage: both reversed and combined for Beget → Sant Aniol d'Aguja → Albanyà

### Day 4
- Visit Pirineus, stage 4: Requesens - La Vajol
- Page: https://www.visitpirineus.com/fr/que-fer/rutes/etapa-de-ruta/etapa-4-requesens-la-vajol
- Visit Pirineus, stage 3: Vilamaniscle - Requesens
- Page: https://www.visitpirineus.com/en/que-fer/rutes/etapa-de-ruta/etapa-3-vilamaniscle-requesens
- App usage:
  - hiking: clipped from the official stage 4 track up to La Jonquera, reversed to Requesens, plus stage 3 reversed to Vilamaniscle
  - bus: approximate road geometry between Albanyà, Figueres, and La Jonquera based on real waypoints geocoded with Nominatim and routed with OSRM

### Day 5
- Visit Pirineus, stage 2: El Port de la Selva - Llançà - Vilamaniscle
- Page: https://www.visitpirineus.com/en/que-fer/rutes/etapa-de-ruta/etapa-2-el-port-de-la-selva-llanca-vilamaniscle
- App usage: reversed to represent Vilamaniscle → Llançà → El Port de la Selva

### Day 6
- Visit Pirineus, stage 1: Cap de Creus - El Port de la Selva
- Page: https://www.visitpirineus.com/es/que-fer/rutes/etapa-de-ruta/etapa-1-cap-de-creus-el-port-de-la-selva
- Parc Natural del Cap de Creus, itinerary 19: Cadaqués - Cap de Creus
- Itineraries index page: https://parcsnaturals.gencat.cat/es/xarxa-de-parcs/cap-creus/gaudeix-del-parc/equipaments-i-itineraris/itineraris/
- Track used by the importer: https://parcsnaturals.gencat.cat/web/.content/Xarxa-de-parcs/cap_de_creus/gaudeix-parc/equipaments-i-itineraris/itineraris-terrestres/Tracks/19.PNCC-CADAQUES-CAP-CREUS.gpx.zip
- App usage: both tracks reversed and combined for El Port de la Selva → Cap de Creus → Cadaqués

## Segment accuracy

- Day 1: exact
- Day 2: exact
- Day 3: exact
- Day 4 hiking: exact on official tracks, with the official stage track clipped at La Jonquera so the hiking day starts where your trek begins
- Day 4 bus: approximate, since there is no public GPX for the service; represented over roads using real stops
- Day 5: exact
- Day 6: exact

## Accommodation and geocoding

Geocoded with confidence:

- Hostal El Forn, Beget
- Hostal Marina Cadaqués

Marked as approximate within the town:

- Apartaments Can Bundanci, Setcases
- TAIGA Bassegoda Park, Albanyà
- El Penell Estudi Garbí / El Penell Estudi Mestral, Vilamaniscle
- Habitacions La Font, El Port de la Selva

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
