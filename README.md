# GR11 / Cap de Creus Interactive Map

Mapa web estático para visualizar una ruta real de 6 días entre Vall de Núria y Cadaqués, con tracks locales en GeoJSON, puntos destacados, alojamientos y el tramo especial en bus del jueves.

## Stack

- Vite + JavaScript vanilla
- Leaflet + OpenStreetMap
- Datos locales en `data/*.geojson` y `public/data/*.geojson`
- Sin backend

## Cómo levantarlo

```bash
npm install
npm run build:data
npm run dev
```

Build de producción:

```bash
npm run build
```

## Scripts

- `npm run build:data`: descarga las fuentes públicas, convierte GPX ZIP/XML a GeoJSON local, geocodifica puntos y genera `route.geojson`, `places.geojson` y `route-meta.json`.
- `npm run dev`: arranca la app en desarrollo.
- `npm run build`: genera el bundle estático en `dist/`.

## Fuentes de tracks

### Día 1
- Visit Pirineus, etapa 9: Setcases - Santuari de Núria
- Página: https://www.visitpirineus.com/fr/que-fer/rutes/etapa-de-ruta/etapa-9-setcases-santuari-de-nuria
- Uso en la app: invertido para representar Núria → Setcases

### Día 2
- Visit Pirineus, etapa 8: Beget - Setcases
- Página: https://www.visitpirineus.com/ca/que-fer/rutes/etapa-de-ruta/etapa-8-beget-setcases
- Uso en la app: invertido para representar Setcases → Beget

### Día 3
- Visit Pirineus, etapa 7: Sant Aniol d'Aguja - Beget
- Página: https://www.visitpirineus.com/ca/que-fer/rutes/etapa-de-ruta/etapa-7-sant-aniol-daguja-beget
- Visit Pirineus, etapa 6: Albanyà - Sant Aniol d'Aguja
- Página: https://www.visitpirineus.com/ca/que-fer/rutes/etapa-de-ruta/etapa-6-albanya-sant-aniol-daguja
- Uso en la app: ambas invertidas y combinadas para Beget → Sant Aniol d'Aguja → Albanyà

### Día 4
- Visit Pirineus, etapa 4: Requesens - La Vajol
- Página: https://www.visitpirineus.com/fr/que-fer/rutes/etapa-de-ruta/etapa-4-requesens-la-vajol
- Visit Pirineus, etapa 3: Vilamaniscle - Requesens
- Página: https://www.visitpirineus.com/en/que-fer/rutes/etapa-de-ruta/etapa-3-vilamaniscle-requesens
- Uso en la app:
  - hiking: recorte del track oficial de la etapa 4 hasta La Jonquera, invertido hasta Requesens, más la etapa 3 invertida hasta Vilamaniscle
  - bus: geometría aproximada sobre carretera entre Albanyà, Figueres y La Jonquera a partir de waypoints reales geocodificados con Nominatim y trazado vial de OSRM

### Día 5
- Visit Pirineus, etapa 2: El Port de la Selva - Llançà - Vilamaniscle
- Página: https://www.visitpirineus.com/en/que-fer/rutes/etapa-de-ruta/etapa-2-el-port-de-la-selva-llanca-vilamaniscle
- Uso en la app: invertido para representar Vilamaniscle → Llançà → El Port de la Selva

### Día 6
- Visit Pirineus, etapa 1: Cap de Creus - El Port de la Selva
- Página: https://www.visitpirineus.com/es/que-fer/rutes/etapa-de-ruta/etapa-1-cap-de-creus-el-port-de-la-selva
- Parc Natural del Cap de Creus, itinerari 19: Cadaqués - Cap de Creus
- Página índice de itinerarios: https://parcsnaturals.gencat.cat/es/xarxa-de-parcs/cap-creus/gaudeix-del-parc/equipaments-i-itineraris/itineraris/
- Track usado por el importador: https://parcsnaturals.gencat.cat/web/.content/Xarxa-de-parcs/cap_de_creus/gaudeix-parc/equipaments-i-itineraris/itineraris-terrestres/Tracks/19.PNCC-CADAQUES-CAP-CREUS.gpx.zip
- Uso en la app: ambos tracks invertidos y combinados para El Port de la Selva → Cap de Creus → Cadaqués

## Exactitud de los tramos

- Día 1: exacto
- Día 2: exacto
- Día 3: exacto
- Día 4 hiking: exacto sobre tracks oficiales, con recorte del track oficial de etapa en La Jonquera para arrancar el día donde empieza tu trekking
- Día 4 bus: aproximado, sin GPX público del servicio; se representa sobre carretera con paradas reales
- Día 5: exacto
- Día 6: exacto

## Alojamiento y geocodificación

Geocodificados con confianza:

- Hostal El Forn, Beget
- Hostal Marina Cadaqués

Marcados como aproximados en el pueblo:

- Apartaments Can Bundanci, Setcases
- TAIGA Bassegoda Park, Albanyà
- El Penell Estudi Garbí / El Penell Estudi Mestral, Vilamaniscle
- Habitacions La Font, El Port de la Selva

## Estructura relevante

- `scripts/build-route-data.mjs`: importación, descarga, geocoding y conversión GPX → GeoJSON
- `data/*.geojson`: copia local legible para revisión
- `public/data/*.geojson`: copia servida por la app
- `src/main.js`: lógica del mapa, filtros, fichas y marcadores
- `src/style.css`: layout responsive desktop/mobile

## Notas de implementación

- El importador soporta GPX XML plano y también ZIP con GPX dentro, porque algunas fuentes públicas del parc natural publican así los tracks.
- La app no hace fetches runtime a webs de tracks ni a servicios de geocoding.
- El único recurso externo en runtime es la capa base de OpenStreetMap para el mapa.
