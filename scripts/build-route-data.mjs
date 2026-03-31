import fs from "node:fs/promises";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { gpx as gpxToGeoJSON } from "@tmcw/togeojson";
import { unzipSync } from "fflate";
import {
  bbox,
  featureCollection,
  lineSlice,
  lineString,
  nearestPointOnLine,
  point
} from "@turf/turf";

const projectRoot = process.cwd();
const dataDir = path.join(projectRoot, "data");
const publicDataDir = path.join(projectRoot, "public", "data");
const publicImagesDir = path.join(projectRoot, "public", "images", "highlights");
const rawDir = path.join(dataDir, "raw");

const userAgent = "CodexRouteBuilder/1.0 (static local build)";

const stageSources = {
  stage01: {
    source: "Visit Pirineus · Etapa 1: Cap de Creus - El Port de la Selva",
    pageUrl:
      "https://www.visitpirineus.com/es/que-fer/rutes/etapa-de-ruta/etapa-1-cap-de-creus-el-port-de-la-selva"
  },
  stage02: {
    source: "Visit Pirineus · Etapa 2: El Port de la Selva - Llançà - Vilamaniscle",
    pageUrl:
      "https://www.visitpirineus.com/en/que-fer/rutes/etapa-de-ruta/etapa-2-el-port-de-la-selva-llanca-vilamaniscle"
  },
  stage03: {
    source: "Visit Pirineus · Etapa 3: Vilamaniscle - Requesens",
    pageUrl:
      "https://www.visitpirineus.com/en/que-fer/rutes/etapa-de-ruta/etapa-3-vilamaniscle-requesens"
  },
  stage04: {
    source: "Visit Pirineus · Etapa 4: Requesens - La Vajol",
    pageUrl:
      "https://www.visitpirineus.com/fr/que-fer/rutes/etapa-de-ruta/etapa-4-requesens-la-vajol"
  },
  stage05: {
    source: "Visit Pirineus · Etapa 5: La Vajol - Albanyà",
    pageUrl:
      "https://www.visitpirineus.com/es/que-fer/rutes/etapa-de-ruta/etapa-5-la-vajol-albanya"
  },
  stage06: {
    source: "Visit Pirineus · Etapa 6: Albanyà - Sant Aniol d'Aguja",
    pageUrl:
      "https://www.visitpirineus.com/ca/que-fer/rutes/etapa-de-ruta/etapa-6-albanya-sant-aniol-daguja"
  },
  stage07: {
    source: "Visit Pirineus · Etapa 7: Sant Aniol d'Aguja - Beget",
    pageUrl:
      "https://www.visitpirineus.com/ca/que-fer/rutes/etapa-de-ruta/etapa-7-sant-aniol-daguja-beget"
  },
  stage08: {
    source: "Visit Pirineus · Etapa 8: Beget - Setcases",
    pageUrl:
      "https://www.visitpirineus.com/ca/que-fer/rutes/etapa-de-ruta/etapa-8-beget-setcases"
  },
  stage09: {
    source: "Visit Pirineus · Etapa 9: Setcases - Santuari de Núria",
    pageUrl:
      "https://www.visitpirineus.com/fr/que-fer/rutes/etapa-de-ruta/etapa-9-setcases-santuari-de-nuria"
  },
  capCreus19: {
    source: "Parc Natural del Cap de Creus · Itinerari 19: Cadaqués - Cap de Creus",
    pageUrl:
      "https://parcsnaturals.gencat.cat/es/xarxa-de-parcs/cap-creus/gaudeix-del-parc/equipaments-i-itineraris/itineraris/",
    gpxUrl:
      "https://parcsnaturals.gencat.cat/web/.content/Xarxa-de-parcs/cap_de_creus/gaudeix-parc/equipaments-i-itineraris/itineraris-terrestres/Tracks/19.PNCC-CADAQUES-CAP-CREUS.gpx.zip"
  }
};

const dayDefinitions = [
  {
    id: "day1",
    title: "Núria → Setcases",
    date: "2026-04-20",
    weekday: "Lunes",
    dateLabel: "Lunes 20 abril 2026",
    kmLabel: "20,4 km",
    gainLabel: "+1.333 m",
    durationLabel: "~7 h",
    type: "hiking",
    sourceRefs: ["stage09"],
    highlights: ["vall-nuria", "ulldeter"],
    accommodation: "stay-setcases",
    exactness: "exact",
    notes: "Track exacto sobre GPX oficial de Visit Pirineus, invertido para seguir Núria → Setcases."
  },
  {
    id: "day2",
    title: "Setcases → Beget",
    date: "2026-04-21",
    weekday: "Martes",
    dateLabel: "Martes 21 abril 2026",
    kmLabel: "22,8 km",
    gainLabel: "+1.069 m",
    durationLabel: "6h50",
    type: "hiking",
    sourceRefs: ["stage08"],
    highlights: ["beget"],
    accommodation: "stay-beget",
    exactness: "exact",
    notes: "Track exacto sobre GPX oficial de Visit Pirineus, invertido para seguir Setcases → Beget."
  },
  {
    id: "day3",
    title: "Beget → Albanyà",
    date: "2026-04-22",
    weekday: "Miércoles",
    dateLabel: "Miércoles 22 abril 2026",
    kmLabel: "33,0 km",
    gainLabel: "+2.061 m",
    durationLabel: "~10h20",
    type: "hiking",
    sourceRefs: ["stage07", "stage06"],
    highlights: ["beget", "sant-aniol", "albanya"],
    accommodation: "stay-albanya",
    exactness: "exact",
    notes:
      "Track exacto combinando dos GPX oficiales de Visit Pirineus: Beget → Sant Aniol d'Aguja y Sant Aniol d'Aguja → Albanyà."
  },
  {
    id: "day4",
    title: "Albanyà → Figueres → La Jonquera → Requesens → Vilamaniscle",
    shortTitle: "Bus + trekking",
    date: "2026-04-23",
    weekday: "Jueves",
    dateLabel: "Jueves 23 abril 2026",
    kmLabel: "~40 km a pie",
    gainLabel: "",
    durationLabel: "~10h30",
    type: "mixed",
    sourceRefs: ["stage04", "stage03"],
    highlights: ["albanya", "la-jonquera", "castell-requesens", "sant-quirze-colera"],
    accommodation: "stay-vilamaniscle",
    exactness: "mixed",
    notes:
      "Tramo a pie basado en GPX oficiales de Visit Pirineus. El bus se representa con geometría aproximada sobre carretera obtenida entre paradas reales y se marca explícitamente como aproximado.",
    busLegs: [
      "Albanyà 07:00 → Figueres 07:45",
      "Figueres 08:10 → La Jonquera 08:45"
    ]
  },
  {
    id: "day5",
    title: "Vilamaniscle → Llançà → El Port de la Selva",
    date: "2026-04-24",
    weekday: "Viernes",
    dateLabel: "Viernes 24 abril 2026",
    kmLabel: "21,2 km",
    gainLabel: "+988 m",
    durationLabel: "5h45",
    type: "hiking",
    sourceRefs: ["stage02"],
    highlights: ["llanca", "sant-pere-rodes", "port-selva"],
    accommodation: "stay-port-selva",
    exactness: "exact",
    notes:
      "Track exacto sobre GPX oficial de Visit Pirineus, invertido para seguir Vilamaniscle → Llançà → El Port de la Selva."
  },
  {
    id: "day6",
    title: "El Port de la Selva → Cap de Creus → Cadaqués",
    date: "2026-04-25",
    weekday: "Sábado",
    dateLabel: "Sábado 25 abril 2026",
    kmLabel: "24,6 km",
    gainLabel: "~+717 m",
    durationLabel: "~9h15",
    type: "hiking",
    sourceRefs: ["stage01", "capCreus19"],
    highlights: ["port-selva", "cap-creus", "cadaques"],
    accommodation: "stay-cadaques",
    exactness: "exact",
    notes:
      "Track exacto combinando el GPX oficial de la etapa GR11 Cap de Creus - El Port de la Selva invertido y el itinerario oficial del Parc Natural Cadaqués - Cap de Creus invertido."
  }
];

const pointDefinitions = [
  {
    id: "town-setcases",
    label: "Setcases",
    kind: "town",
    query: "Setcases, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage09", at: "start" }
  },
  {
    id: "town-beget",
    label: "Beget",
    kind: "town",
    query: "Beget, Camprodon, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage08", at: "start" }
  },
  {
    id: "town-albanya",
    label: "Albanyà",
    kind: "town",
    query: "Albanya, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage06", at: "start" }
  },
  {
    id: "town-vilamaniscle",
    label: "Vilamaniscle",
    kind: "town",
    query: "Vilamaniscle, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage03", at: "start" }
  },
  {
    id: "town-port-selva",
    label: "El Port de la Selva",
    kind: "town",
    query: "El Port de la Selva, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage01", at: "end" }
  },
  {
    id: "town-cadaques",
    label: "Cadaqués",
    kind: "town",
    query: "Cadaques, Girona, Catalunya, Spain",
    fromTrack: { ref: "capCreus19", at: "start" }
  },
  {
    id: "vall-nuria",
    label: "Vall de Núria",
    kind: "highlight",
    query: "Santuari de Nuria, Queralbs, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage09", at: "end" }
  },
  {
    id: "ulldeter",
    label: "Ulldeter",
    kind: "highlight",
    query: "Refugi d'Ulldeter, Setcases, Girona, Catalunya, Spain"
  },
  {
    id: "beget",
    label: "Beget",
    kind: "highlight",
    query: "Beget, Camprodon, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage08", at: "start" }
  },
  {
    id: "sant-aniol",
    label: "Sant Aniol d'Aguja",
    kind: "highlight",
    query: "Sant Aniol d'Aguja, Sales de Llierca, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage06", at: "end" }
  },
  {
    id: "albanya",
    label: "Albanyà / Alta Garrotxa",
    kind: "highlight",
    query: "Albanya, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage06", at: "start" }
  },
  {
    id: "la-jonquera",
    label: "La Jonquera",
    kind: "highlight",
    query: "La Jonquera, Girona, Catalunya, Spain"
  },
  {
    id: "castell-requesens",
    label: "Castell de Requesens",
    kind: "highlight",
    query: "Castell de Requesens, La Jonquera, Girona, Catalunya, Spain"
  },
  {
    id: "sant-quirze-colera",
    label: "Sant Quirze de Colera",
    kind: "highlight",
    query: "Monestir de Sant Quirze de Colera, Rabos, Girona, Catalunya, Spain"
  },
  {
    id: "llanca",
    label: "Llançà",
    kind: "highlight",
    query: "Llanca, Girona, Catalunya, Spain"
  },
  {
    id: "sant-pere-rodes",
    label: "Sant Pere de Rodes",
    kind: "highlight",
    query: "Monestir de Sant Pere de Rodes, El Port de la Selva, Girona, Catalunya, Spain"
  },
  {
    id: "port-selva",
    label: "El Port de la Selva",
    kind: "highlight",
    query: "El Port de la Selva, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage01", at: "end" }
  },
  {
    id: "cap-creus",
    label: "Cap de Creus",
    kind: "highlight",
    query: "Far del Cap de Creus, Cadaques, Girona, Catalunya, Spain",
    fromTrack: { ref: "stage01", at: "start" }
  },
  {
    id: "cadaques",
    label: "Cadaqués",
    kind: "highlight",
    query: "Cadaques, Girona, Catalunya, Spain",
    fromTrack: { ref: "capCreus19", at: "start" }
  },
  {
    id: "stay-setcases",
    label: "Apartaments Can Bundanci",
    kind: "accommodation",
    query: "Apartaments Can Bundanci, Setcases, Girona, Catalunya, Spain",
    fallbackQuery: "Setcases, Girona, Catalunya, Spain"
  },
  {
    id: "stay-beget",
    label: "Hostal El Forn",
    kind: "accommodation",
    query: "Hostal El Forn, Beget, Girona, Catalunya, Spain",
    fallbackQuery: "Beget, Camprodon, Girona, Catalunya, Spain"
  },
  {
    id: "stay-albanya",
    label: "TAIGA Bassegoda Park",
    kind: "accommodation",
    query: "TAIGA Bassegoda Park, Albanyà, Girona, Catalunya, Spain",
    fallbackQuery: "Albanya, Girona, Catalunya, Spain"
  },
  {
    id: "stay-vilamaniscle",
    label: "El Penell Estudi Garbí / El Penell Estudi Mestral",
    kind: "accommodation",
    query: "El Penell Estudi Garbi, Vilamaniscle, Girona, Catalunya, Spain",
    fallbackQuery: "Vilamaniscle, Girona, Catalunya, Spain"
  },
  {
    id: "stay-port-selva",
    label: "Habitacions La Font",
    kind: "accommodation",
    query: "Habitacions La Font, El Port de la Selva, Girona, Catalunya, Spain",
    fallbackQuery: "El Port de la Selva, Girona, Catalunya, Spain"
  },
  {
    id: "stay-cadaques",
    label: "Hostal Marina Cadaqués",
    kind: "accommodation",
    query: "Hostal Marina Cadaques, Cadaques, Girona, Catalunya, Spain",
    fallbackQuery: "Cadaques, Girona, Catalunya, Spain",
    optional: true
  },
  {
    id: "bus-albanya",
    label: "Albanyà · parada bus",
    kind: "bus-stop",
    query: "Albanya, Girona, Catalunya, Spain"
  },
  {
    id: "bus-figueres",
    label: "Figueres · estació bus",
    kind: "bus-stop",
    query: "Estacio d'autobusos de Figueres, Figueres, Girona, Catalunya, Spain",
    fallbackQuery: "Figueres, Girona, Catalunya, Spain"
  },
  {
    id: "bus-jonquera",
    label: "La Jonquera · parada bus",
    kind: "bus-stop",
    query: "La Jonquera, Girona, Catalunya, Spain"
  }
];

const dayNarratives = {
  day1:
    "Salida alpina desde el circo de Núria, con ambiente de alta montaña, paso por Ulldeter y una larga bajada final hacia Setcases.",
  day2:
    "Jornada quebrada y muy montañera, enlazando collados y laderas del Ripollès hasta descender al encanto medieval de Beget.",
  day3:
    "Etapa larga y exigente por la Alta Garrotxa: sendero técnico, barrancos y el paso por Sant Aniol d'Aguja antes de cerrar en Albanyà.",
  day4:
    "Día mixto: traslado temprano en bus y luego una travesía muy larga entre La Jonquera, Requesens y Sant Quirze de Colera antes de llegar a Vilamaniscle.",
  day5:
    "Etapa más compacta pero intensa, con subida panorámica hacia Sant Pere de Rodes y un final precioso bajando al mar en El Port de la Selva.",
  day6:
    "Gran final costero: salida junto al Mediterráneo, paso por el faro y los paisajes minerales de Cap de Creus y cierre caminando hacia Cadaqués."
};

const placeWiki = {
  "town-setcases": {
    pageTitle: "Setcases",
    fallbackDescription:
      "Pueblo pirenaico del Ripollès, de arquitectura de montaña y uno de los finales de etapa más agradables del GR."
  },
  "town-vilamaniscle": {
    pageTitle: "Vilamaniscle",
    fallbackDescription:
      "Pequeño núcleo del Alt Empordà, rodeado de viñas, olivos y relieve mediterráneo antes de saltar a la costa."
  },
  "bus-figueres": {
    pageTitle: "Figueres",
    fallbackDescription:
      "Capital del Alt Empordà y gran nodo de transporte del tramo especial en bus antes de volver a caminar."
  },
  "vall-nuria": {
    pageTitle: "Vall_de_Núria",
    fallbackDescription:
      "Valle de alta montaña del Ripollès, rodeado de grandes cimas y uno de los puntos más icónicos del Pirineo oriental."
  },
  ulldeter: {
    pageTitle: "Ulldeter",
    fallbackDescription:
      "Zona de nacimiento del Ter y referencia clásica del excursionismo pirenaico, bajo las cumbres de Bastiments y el Gra de Fajol."
  },
  beget: {
    pageTitle: "Beget",
    fallbackDescription:
      "Pequeño núcleo medieval del Ripollès, muy bien conservado y famoso por su iglesia románica y su entorno de montaña."
  },
  "sant-aniol": {
    pageTitle: "Sant_Aniol_d%27Aguja",
    fallbackDescription:
      "Ermita y enclave emblemático de la Alta Garrotxa, en un entorno remoto de bosques, roca caliza y torrentes."
  },
  albanya: {
    pageTitle: "Albanyà",
    fallbackDescription:
      "Puerta de entrada a la Alta Garrotxa oriental, con paisaje agreste, bosques extensos y sensación clara de aislamiento."
  },
  "la-jonquera": {
    pageTitle: "La_Jonquera",
    fallbackDescription:
      "Municipio fronterizo del Alt Empordà, punto de transición entre el interior y las sierras previas al Mediterráneo."
  },
  "castell-requesens": {
    pageTitle: "Castell_de_Requesens",
    fallbackDescription:
      "Castillo monumental aislado en la sierra de l'Albera, uno de los hitos más reconocibles de la jornada hacia Vilamaniscle."
  },
  "sant-quirze-colera": {
    pageTitle: "Monestir_de_Sant_Quirze_de_Colera",
    fallbackDescription:
      "Monasterio románico en un valle abierto de l'Albera, rodeado de caminos históricos y paisaje mediterráneo de media montaña."
  },
  llanca: {
    pageTitle: "Llançà",
    fallbackDescription:
      "Población costera del Alt Empordà que marca el giro definitivo de la ruta hacia el paisaje marítimo."
  },
  "sant-pere-rodes": {
    pageTitle: "Monestir_de_Sant_Pere_de_Rodes",
    fallbackDescription:
      "Conjunto monumental benedictino sobre la sierra de Rodes, con vistas espectaculares sobre el Cap de Creus y la costa."
  },
  "port-selva": {
    pageTitle: "El_Port_de_la_Selva",
    fallbackDescription:
      "Pueblo marinero del Cap de Creus, encajado entre montaña y mar y punto ideal para arrancar la gran etapa final."
  },
  "cap-creus": {
    pageTitle: "Cap_de_Creus",
    fallbackDescription:
      "Extremo más oriental de la península Ibérica, con geología muy singular, viento, mar abierto y una personalidad brutal."
  },
  cadaques: {
    pageTitle: "Cadaqués",
    fallbackDescription:
      "Villa blanca y marinera del Cap de Creus, final perfecto para cerrar la travesía entre montaña y Mediterráneo."
  }
};

function toTitle(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatUrl(baseUrl, maybeRelativeUrl) {
  return new URL(maybeRelativeUrl, baseUrl).toString();
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJsonToTargets(filename, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await ensureDir(dataDir);
  await ensureDir(publicDataDir);
  await fs.writeFile(path.join(dataDir, filename), content, "utf8");
  await fs.writeFile(path.join(publicDataDir, filename), content, "utf8");
}

async function writeBufferPublic(relativePath, buffer) {
  const outputPath = path.join(projectRoot, "public", relativePath);
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, buffer);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": userAgent,
      accept: "text/html,application/xml,text/xml,application/json;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": userAgent,
      accept: "application/json,text/plain;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": userAgent,
      accept: "*/*"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function extractFirstGpxUrl(pageUrl, html, preferredSnippet = "") {
  const regex = /href="([^"]+\.gpx[^"]*)"/gi;
  const matches = [...html.matchAll(regex)].map((match) => match[1]);
  if (!matches.length) {
    throw new Error(`No GPX link found in ${pageUrl}`);
  }
  const preferred = matches.find((href) =>
    href.toLowerCase().includes(preferredSnippet.toLowerCase())
  );
  return formatUrl(pageUrl, preferred || matches[0]);
}

function longestLineFeature(featureCollectionInput) {
  const lineFeatures = [];
  for (const feature of featureCollectionInput.features) {
    if (!feature.geometry) {
      continue;
    }
    if (feature.geometry.type === "LineString") {
      lineFeatures.push(feature);
      continue;
    }
    if (feature.geometry.type === "MultiLineString") {
      for (const coordinates of feature.geometry.coordinates) {
        lineFeatures.push(
          lineString(coordinates, {
            ...(feature.properties || {})
          })
        );
      }
    }
  }

  if (!lineFeatures.length) {
    throw new Error("No line geometry found in GPX");
  }

  return lineFeatures.sort(
    (a, b) => coordinatesDistance(b.geometry.coordinates) - coordinatesDistance(a.geometry.coordinates)
  )[0];
}

function coordinatesDistance(coordinates) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += haversineMeters(coordinates[index - 1], coordinates[index]);
  }
  return total;
}

function haversineMeters(a, b) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const radius = 6371000;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function reverseLine(feature) {
  return lineString([...feature.geometry.coordinates].reverse(), {
    ...(feature.properties || {})
  });
}

function combineLines(features, properties) {
  const coordinates = [];
  for (const feature of features) {
    const lineCoordinates = feature.geometry.coordinates;
    if (!coordinates.length) {
      coordinates.push(...lineCoordinates);
      continue;
    }

    const previous = coordinates[coordinates.length - 1];
    const currentStart = lineCoordinates[0];
    if (haversineMeters(previous, currentStart) < 30) {
      coordinates.push(...lineCoordinates.slice(1));
    } else {
      coordinates.push(...lineCoordinates);
    }
  }
  return lineString(coordinates, properties);
}

function computeElevationGain(coordinates) {
  let gain = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previousElevation = coordinates[index - 1][2];
    const currentElevation = coordinates[index][2];
    if (typeof previousElevation !== "number" || typeof currentElevation !== "number") {
      continue;
    }
    if (currentElevation > previousElevation) {
      gain += currentElevation - previousElevation;
    }
  }
  return Math.round(gain);
}

function computeElevationLoss(coordinates) {
  let loss = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previousElevation = coordinates[index - 1][2];
    const currentElevation = coordinates[index][2];
    if (typeof previousElevation !== "number" || typeof currentElevation !== "number") {
      continue;
    }
    if (currentElevation < previousElevation) {
      loss += previousElevation - currentElevation;
    }
  }
  return Math.round(loss);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function formatDistanceKm(coordinates) {
  return round1(coordinatesDistance(coordinates) / 1000);
}

function sampleElevationProfile(coordinates, maxPoints = 64) {
  let accumulated = 0;
  const raw = coordinates.map((coordinate, index) => {
    if (index > 0) {
      accumulated += haversineMeters(coordinates[index - 1], coordinate);
    }
    return {
      distanceKm: round1(accumulated / 1000),
      elevationM: typeof coordinate[2] === "number" ? Math.round(coordinate[2]) : null
    };
  }).filter((item) => item.elevationM !== null);

  if (raw.length <= maxPoints) {
    return raw;
  }

  const sampled = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index / (maxPoints - 1)) * (raw.length - 1));
    sampled.push(raw[sourceIndex]);
  }
  return sampled;
}

async function downloadTrack(ref, preferredSnippet = "") {
  const source = stageSources[ref];
  const filename = `${ref}.gpx`;
  const outputPath = path.join(rawDir, filename);
  let rawBuffer;
  let gpxUrl = source.gpxUrl || "";

  try {
    rawBuffer = await fs.readFile(outputPath);
  } catch {
    const html = source.gpxUrl ? "" : await fetchText(source.pageUrl);
    gpxUrl = source.gpxUrl || extractFirstGpxUrl(source.pageUrl, html, ".gpx");
    rawBuffer = await fetchBuffer(gpxUrl);
    await fs.writeFile(outputPath, rawBuffer);
  }

  const gpxText = bufferToGpxText(rawBuffer);
  const xml = new DOMParser().parseFromString(gpxText, "text/xml");
  const geojson = gpxToGeoJSON(xml);
  const line = longestLineFeature(geojson);
  return {
    ref,
    source: source.source,
    pageUrl: source.pageUrl,
    gpxUrl,
    line
  };
}

function bufferToGpxText(buffer) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const zipEntries = unzipSync(new Uint8Array(buffer));
    const gpxEntry = Object.entries(zipEntries).find(([name]) => name.toLowerCase().endsWith(".gpx"));
    if (!gpxEntry) {
      throw new Error("ZIP source did not contain a GPX file");
    }
    return Buffer.from(gpxEntry[1]).toString("utf8").replace(/^\uFEFF/, "");
  }
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

async function geocode(definition) {
  const exactResult = await geocodeQuery(definition.query).catch(() => null);
  if (exactResult && isConfidentGeocode(definition, exactResult)) {
    return buildPointFeature(definition, exactResult, {
      geocodeStatus: "exact",
      geocodeQuery: definition.query
    });
  }

  const fallbackQuery = definition.fallbackQuery || definition.query;
  const fallbackResult = await geocodeQuery(fallbackQuery);
  return buildPointFeature(definition, fallbackResult, {
    geocodeStatus: definition.fallbackQuery ? "approximate" : "exact",
    geocodeQuery: fallbackQuery,
    approximationReason: definition.fallbackQuery
      ? "alojamiento aproximado en el pueblo"
      : ""
  });
}

function derivePointFromTrack(definition, downloadedTracks) {
  if (!definition.fromTrack) {
    return null;
  }
  const track = downloadedTracks[definition.fromTrack.ref];
  if (!track) {
    return null;
  }
  const coordinates = track.line.geometry.coordinates;
  const coordinate =
    definition.fromTrack.at === "start"
      ? coordinates[0]
      : coordinates[coordinates.length - 1];
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [coordinate[0], coordinate[1]]
    },
    properties: {
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      optional: Boolean(definition.optional),
      displayName: definition.label,
      geocodeStatus: "track-derived",
      geocodeQuery: definition.fromTrack.ref
    }
  };
}

function isConfidentGeocode(definition, result) {
  const haystack = `${result.display_name || ""} ${result.name || ""}`.toLowerCase();
  const label = definition.label.toLowerCase();
  if (definition.kind !== "accommodation") {
    return true;
  }
  const firstWord = label.split(" ")[0];
  return haystack.includes(firstWord) || haystack.includes(label);
}

async function geocodeQuery(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const results = await fetchJson(url.toString());
  if (!Array.isArray(results) || !results.length) {
    throw new Error(`No geocode result for ${query}`);
  }
  return results[0];
}

function buildPointFeature(definition, result, extraProperties = {}) {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [Number(result.lon), Number(result.lat)]
    },
    properties: {
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      optional: Boolean(definition.optional),
      displayName: result.display_name || definition.label,
      ...extraProperties
    }
  };
}

function getPointById(points, id) {
  const feature = points.find((item) => item.properties.id === id);
  if (!feature) {
    throw new Error(`Point ${id} not found`);
  }
  return feature;
}

async function routeRoadApproximation(startFeature, endFeature) {
  const [startLon, startLat] = startFeature.geometry.coordinates;
  const [endLon, endLat] = endFeature.geometry.coordinates;
  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}`
  );
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");

  const response = await fetchJson(url.toString());
  const route = response.routes?.[0];
  if (!route) {
    throw new Error("No OSRM route returned");
  }
  return lineString(route.geometry.coordinates);
}

function fitPointToLine(lineFeature, pointFeature) {
  const snapped = nearestPointOnLine(lineFeature, pointFeature, { units: "kilometers" });
  return point(snapped.geometry.coordinates);
}

function dayFeature({
  id,
  dayId,
  dayNumber,
  mode,
  label,
  feature,
  source,
  sourceUrl,
  exactness,
  approximationNote = ""
}) {
  const distanceKm = formatDistanceKm(feature.geometry.coordinates);
  const elevationGain = computeElevationGain(feature.geometry.coordinates);
  const elevationLoss = computeElevationLoss(feature.geometry.coordinates);
  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      id,
      dayId,
      dayNumber,
      label,
      mode,
      source,
      sourceUrl,
      exactness,
      approximationNote,
      distanceKm,
      elevationGain,
      elevationLoss
    }
  };
}

function buildRouteMeta(routeFeatures, places) {
  const hikingKmTotal = 162;
  const day4Hiking = routeFeatures
    .filter((feature) => feature.properties.dayId === "day4" && feature.properties.mode === "hiking")
    .reduce((sum, feature) => sum + feature.properties.elevationGain, 0);
  const totalGain =
    1333 + 1069 + 2061 + day4Hiking + 988 + 717;

  const towns = ["Setcases", "Beget", "Albanyà", "Vilamaniscle", "El Port de la Selva", "Cadaqués"];
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      days: 6,
      hikingKmTotal,
      hikingKmTotalLabel: "162,0 km",
      elevationGainTotal: totalGain,
      elevationGainTotalLabel: `~${new Intl.NumberFormat("es-ES").format(totalGain)} m`,
      nightCount: 6,
      towns,
      special: "Jueves 23 abril 2026: traslado en bus Albanyà → Figueres → La Jonquera"
    },
    days: dayDefinitions.map((day, index) => {
      const features = routeFeatures.filter((feature) => feature.properties.dayId === day.id);
      const hikingFeatures = features.filter((feature) => feature.properties.mode === "hiking");
      const hikingCoordinates = hikingFeatures.flatMap((feature, featureIndex) => {
        const coords = feature.geometry.coordinates;
        if (featureIndex === 0) {
          return coords;
        }
        const previous = hikingFeatures[featureIndex - 1].geometry.coordinates.at(-1);
        return haversineMeters(previous, coords[0]) < 30 ? coords.slice(1) : coords;
      });
      return {
        ...day,
        dayNumber: index + 1,
        computedDistanceKm: round1(
          hikingFeatures.reduce((sum, feature) => sum + feature.properties.distanceKm, 0)
        ),
        computedGainM: hikingFeatures.reduce((sum, feature) => sum + feature.properties.elevationGain, 0),
        computedLossM: hikingFeatures.reduce((sum, feature) => sum + feature.properties.elevationLoss, 0),
        profile: sampleElevationProfile(hikingCoordinates),
        narrative: dayNarratives[day.id] || "",
        segmentIds: features.map((feature) => feature.properties.id),
        accommodationPointId: day.accommodation,
        highlightPointIds: day.highlights
      };
    }),
    placesIndex: Object.fromEntries(
      places.map((feature) => [feature.properties.id, feature.properties])
    )
  };
}

async function enrichHighlights(points) {
  await ensureDir(publicImagesDir);
  return Promise.all(
    points.map(async (feature) => {
      if (!["highlight", "town", "bus-stop"].includes(feature.properties.kind)) {
        return feature;
      }
      const config = placeWiki[feature.properties.id];
      const summary = await fetchWikipediaSummary(config?.pageTitle);
      let imagePath = null;
      const imageSource = summary?.thumbnail?.source || summary?.originalimage?.source;
      if (imageSource) {
        imagePath = await downloadHighlightImage(feature.properties.id, imageSource).catch(
          () => null
        );
      }
      imagePath ||= await findExistingHighlightImage(feature.properties.id);

      feature.properties.description =
        summary?.extract || config?.fallbackDescription || feature.properties.label;
      feature.properties.photo = imagePath;
      feature.properties.photoCredit = summary?.content_urls?.desktop?.page || "";
      feature.properties.photoTitle = summary?.title || feature.properties.label;
      return feature;
    })
  );
}

async function fetchWikipediaSummary(pageTitle) {
  if (!pageTitle) {
    return null;
  }
  const variants = [
    `https://ca.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`,
    `https://es.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`
  ];
  let fallback = null;

  for (const url of variants) {
    try {
      const summary = await fetchJson(url);
      if (!fallback) {
        fallback = summary;
      }
      if (summary?.thumbnail?.source || summary?.originalimage?.source) {
        return summary;
      }
    } catch {
      continue;
    }
  }
  return fallback;
}

async function downloadHighlightImage(id, imageUrl) {
  const extension = path.extname(new URL(imageUrl).pathname) || ".jpg";
  const relativePath = path.join("images", "highlights", `${id}${extension}`);
  const buffer = await fetchBuffer(imageUrl);
  await writeBufferPublic(relativePath, buffer);
  return `/${relativePath.replaceAll(path.sep, "/")}`;
}

async function findExistingHighlightImage(id) {
  for (const extension of [".jpg", ".jpeg", ".png", ".webp"]) {
    try {
      await fs.access(path.join(publicImagesDir, `${id}${extension}`));
      return `/images/highlights/${id}${extension}`;
    } catch {
      continue;
    }
  }
  return null;
}

function buildStageEndpoints(metaDays, routeFeatures) {
  const features = [];
  for (const day of metaDays) {
    const daySegments = routeFeatures
      .filter((feature) => feature.properties.dayId === day.id)
      .sort((a, b) => a.properties.id.localeCompare(b.properties.id));
    if (!daySegments.length) {
      continue;
    }
    const startSegment = daySegments[0];
    const endSegment = daySegments[daySegments.length - 1];
    const startCoordinate = startSegment.geometry.coordinates[0];
    const endCoordinate = endSegment.geometry.coordinates[endSegment.geometry.coordinates.length - 1];
    const [startLabel, endLabel] = day.title.split(" → ").length >= 2
      ? [day.title.split(" → ")[0], day.title.split(" → ").slice(-1)[0]]
      : ["Inicio", "Final"];

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [startCoordinate[0], startCoordinate[1]]
      },
      properties: {
        id: `${day.id}-start`,
        label: `Inicio · ${startLabel}`,
        kind: "stage-endpoint",
        relatedDayId: day.id,
        endpointRole: "start"
      }
    });
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [endCoordinate[0], endCoordinate[1]]
      },
      properties: {
        id: `${day.id}-end`,
        label: `Final · ${endLabel}`,
        kind: "stage-endpoint",
        relatedDayId: day.id,
        endpointRole: "end"
      }
    });
  }
  return features;
}

async function main() {
  await ensureDir(rawDir);

  const downloadedTracks = {};
  for (const ref of Object.keys(stageSources)) {
    downloadedTracks[ref] = await downloadTrack(ref, ref === "capCreus19" ? "cadaques" : "");
  }

  const points = [];
  for (const definition of pointDefinitions) {
    points.push(derivePointFromTrack(definition, downloadedTracks) || (await geocode(definition)));
  }
  const enrichedPoints = await enrichHighlights(points);

  const stage01Reverse = reverseLine(downloadedTracks.stage01.line);
  const stage02Reverse = reverseLine(downloadedTracks.stage02.line);
  const stage03Reverse = reverseLine(downloadedTracks.stage03.line);
  const stage06Reverse = reverseLine(downloadedTracks.stage06.line);
  const stage07Reverse = reverseLine(downloadedTracks.stage07.line);
  const stage08Reverse = reverseLine(downloadedTracks.stage08.line);
  const stage09Reverse = reverseLine(downloadedTracks.stage09.line);
  const capCreus19Reverse = reverseLine(downloadedTracks.capCreus19.line);

  const laJonqueraPoint = getPointById(enrichedPoints, "la-jonquera");
  const stage4StartPoint = point(downloadedTracks.stage04.line.geometry.coordinates[0]);
  const jonqueraOnStage4 = fitPointToLine(downloadedTracks.stage04.line, laJonqueraPoint);
  const requesensToJonquera = lineSlice(
    stage4StartPoint,
    jonqueraOnStage4,
    downloadedTracks.stage04.line
  );
  const laJonqueraToRequesens = reverseLine(requesensToJonquera);

  const day3Combined = combineLines([stage07Reverse, stage06Reverse], {});
  const day4HikingCombined = combineLines([laJonqueraToRequesens, stage03Reverse], {});
  const day6Combined = combineLines([stage01Reverse, capCreus19Reverse], {});

  const busAlbanya = getPointById(enrichedPoints, "bus-albanya");
  const busFigueres = getPointById(enrichedPoints, "bus-figueres");
  const busJonquera = getPointById(enrichedPoints, "bus-jonquera");
  const busLeg1 = await routeRoadApproximation(busAlbanya, busFigueres);
  const busLeg2 = await routeRoadApproximation(busFigueres, busJonquera);

  const routeFeatures = [
    dayFeature({
      id: "day1-hiking",
      dayId: "day1",
      dayNumber: 1,
      mode: "hiking",
      label: "Día 1 · Núria → Setcases",
      feature: stage09Reverse,
      source: downloadedTracks.stage09.source,
      sourceUrl: downloadedTracks.stage09.gpxUrl,
      exactness: "exact"
    }),
    dayFeature({
      id: "day2-hiking",
      dayId: "day2",
      dayNumber: 2,
      mode: "hiking",
      label: "Día 2 · Setcases → Beget",
      feature: stage08Reverse,
      source: downloadedTracks.stage08.source,
      sourceUrl: downloadedTracks.stage08.gpxUrl,
      exactness: "exact"
    }),
    dayFeature({
      id: "day3-hiking-part-1",
      dayId: "day3",
      dayNumber: 3,
      mode: "hiking",
      label: "Día 3 · Beget → Sant Aniol d'Aguja",
      feature: stage07Reverse,
      source: downloadedTracks.stage07.source,
      sourceUrl: downloadedTracks.stage07.gpxUrl,
      exactness: "exact"
    }),
    dayFeature({
      id: "day3-hiking-part-2",
      dayId: "day3",
      dayNumber: 3,
      mode: "hiking",
      label: "Día 3 · Sant Aniol d'Aguja → Albanyà",
      feature: stage06Reverse,
      source: downloadedTracks.stage06.source,
      sourceUrl: downloadedTracks.stage06.gpxUrl,
      exactness: "exact"
    }),
    dayFeature({
      id: "day4-bus-leg-1",
      dayId: "day4",
      dayNumber: 4,
      mode: "bus",
      label: "Día 4 · Bus Albanyà → Figueres",
      feature: busLeg1,
      source: "Nominatim + OSRM sobre OpenStreetMap",
      sourceUrl: "https://router.project-osrm.org/",
      exactness: "approximate",
      approximationNote:
        "Geometría aproximada sobre carretera entre puntos reales para visualizar el traslado en bus."
    }),
    dayFeature({
      id: "day4-bus-leg-2",
      dayId: "day4",
      dayNumber: 4,
      mode: "bus",
      label: "Día 4 · Bus Figueres → La Jonquera",
      feature: busLeg2,
      source: "Nominatim + OSRM sobre OpenStreetMap",
      sourceUrl: "https://router.project-osrm.org/",
      exactness: "approximate",
      approximationNote:
        "Geometría aproximada sobre carretera entre puntos reales para visualizar el traslado en bus."
    }),
    dayFeature({
      id: "day4-hiking",
      dayId: "day4",
      dayNumber: 4,
      mode: "hiking",
      label: "Día 4 · La Jonquera → Requesens → Vilamaniscle",
      feature: day4HikingCombined,
      source: `${downloadedTracks.stage04.source} + ${downloadedTracks.stage03.source}`,
      sourceUrl: downloadedTracks.stage04.gpxUrl,
      exactness: "exact",
      approximationNote:
        "Recorte exacto del tramo de la etapa 4 hasta La Jonquera, más la etapa 3 invertida."
    }),
    dayFeature({
      id: "day5-hiking",
      dayId: "day5",
      dayNumber: 5,
      mode: "hiking",
      label: "Día 5 · Vilamaniscle → Llançà → El Port de la Selva",
      feature: stage02Reverse,
      source: downloadedTracks.stage02.source,
      sourceUrl: downloadedTracks.stage02.gpxUrl,
      exactness: "exact"
    }),
    dayFeature({
      id: "day6-hiking-part-1",
      dayId: "day6",
      dayNumber: 6,
      mode: "hiking",
      label: "Día 6 · El Port de la Selva → Cap de Creus",
      feature: stage01Reverse,
      source: downloadedTracks.stage01.source,
      sourceUrl: downloadedTracks.stage01.gpxUrl,
      exactness: "exact"
    }),
    dayFeature({
      id: "day6-hiking-part-2",
      dayId: "day6",
      dayNumber: 6,
      mode: "hiking",
      label: "Día 6 · Cap de Creus → Cadaqués",
      feature: capCreus19Reverse,
      source: downloadedTracks.capCreus19.source,
      sourceUrl: downloadedTracks.capCreus19.gpxUrl,
      exactness: "exact"
    })
  ];

  const routeCollection = featureCollection(routeFeatures);
  const meta = buildRouteMeta(routeFeatures, enrichedPoints);
  const stageEndpoints = buildStageEndpoints(meta.days, routeFeatures);
  const placesCollection = featureCollection([...enrichedPoints, ...stageEndpoints]);
  meta.bbox = bbox(routeCollection);
  meta.dayTrackDistances = {
    day3: formatDistanceKm(day3Combined.geometry.coordinates),
    day4: formatDistanceKm(day4HikingCombined.geometry.coordinates),
    day6: formatDistanceKm(day6Combined.geometry.coordinates)
  };

  await writeJsonToTargets("route.geojson", routeCollection);
  await writeJsonToTargets("places.geojson", placesCollection);
  await writeJsonToTargets("route-meta.json", meta);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
