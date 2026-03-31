import "leaflet/dist/leaflet.css";
import "./style.css";
import L from "leaflet";

const routePromise = Promise.all([
  fetch("/data/route.geojson").then((response) => response.json()),
  fetch("/data/places.geojson").then((response) => response.json()),
  fetch("/data/route-meta.json").then((response) => response.json())
]);

routePromise
  .then(([routeGeoJson, placesGeoJson, meta]) => {
    const isMobileViewport = window.matchMedia("(max-width: 860px)").matches;
    const state = {
      activeDayId: null
    };

    const placesById = new Map(placesGeoJson.features.map((feature) => [feature.properties.id, feature]));
    const daysById = new Map(meta.days.map((day) => [day.id, day]));

    const root = document.querySelector("#app");
    root.innerHTML = renderLayout(meta);

    const map = L.map("map", {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: isMobileViewport ? 0.25 : 1,
      zoomDelta: isMobileViewport ? 0.25 : 1
    });

    L.control
      .zoom({
        position: "topright"
      })
      .addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const routeLayersByDay = new Map();
    const dayInteractionData = buildDayInteractionData(routeGeoJson, meta);
    const endpointPlaceIds = buildEndpointPlaceIds(meta);
    const mapPlaceFeatures = buildMapPlaceFeatures(placesGeoJson, meta, placesById, endpointPlaceIds);
    const dayProfileHighlights = buildDayProfileHighlights(meta, placesById, dayInteractionData);
    const markers = [];
    let previewMarker = null;
    let activePreview = null;
    let mapHoverFrame = null;
    let pendingMapHover = null;
    let touchRouteScrubbingDayId = null;
    let profileTouchScrubbingDayId = null;
    let profileLongPressTimer = null;
    let profileLongPressStart = null;

    const routeLayer = L.geoJSON(routeGeoJson, {
      style: (feature) => routeStyle(feature, state),
      onEachFeature: (feature, layer) => {
        if (!routeLayersByDay.has(feature.properties.dayId)) {
          routeLayersByDay.set(feature.properties.dayId, []);
        }
        routeLayersByDay.get(feature.properties.dayId).push(layer);
        layer.on("click", () => {
          if (feature.properties.dayId !== state.activeDayId) {
            setActiveDay(feature.properties.dayId);
          }
        });
      }
    }).addTo(map);

    mapPlaceFeatures.forEach((feature) => {
      const marker = buildMarker(feature);
      marker.addTo(map);
      markers.push(marker);
    });

    const allBounds = routeLayer.getBounds();
    const carousel = document.querySelector("[data-carousel]");
    const overviewButton = document.querySelector("[data-overview-button]");
    const compactSummary = document.querySelector("[data-compact-summary]");

    let scrollLock = false;
    let scrollIntentTimer = null;
    let suppressAutoSelectUntil = 0;

    map.on("mousemove", (event) => {
      if (isTouchDevice() || !state.activeDayId) {
        return;
      }
      queueMapHover(state.activeDayId, event.latlng);
    });

    map.on("mouseout", () => {
      if (!isTouchDevice() && activePreview?.source === "map") {
        clearPreview();
      }
    });

    const mapContainer = map.getContainer();

    mapContainer.addEventListener(
      "touchstart",
      (event) => {
        if (!isTouchDevice() || !state.activeDayId || event.touches.length !== 1) {
          return;
        }

        if (touchStartedOnMarker(event)) {
          return;
        }

        const latlng = latLngFromTouch(map, event.touches[0]);
        if (!latlng) {
          return;
        }

        const interaction = dayInteractionData.get(state.activeDayId);
        const routePoint = interaction ? projectLatLngToRouteSample(interaction, latlng, map, 34) : null;
        if (!routePoint) {
          return;
        }

        touchRouteScrubbingDayId = state.activeDayId;
        map.dragging.disable();
        event.preventDefault();
        updatePreviewFromMap(state.activeDayId, latlng, Infinity);
      },
      { passive: false }
    );

    mapContainer.addEventListener(
      "touchmove",
      (event) => {
        if (!touchRouteScrubbingDayId || event.touches.length !== 1) {
          return;
        }

        const latlng = latLngFromTouch(map, event.touches[0]);
        if (!latlng) {
          return;
        }

        event.preventDefault();
        updatePreviewFromMap(touchRouteScrubbingDayId, latlng, Infinity);
      },
      { passive: false }
    );

    const stopTouchRouteScrub = () => {
      if (!touchRouteScrubbingDayId) {
        return;
      }
      touchRouteScrubbingDayId = null;
      map.dragging.enable();
      clearPreview();
    };

    mapContainer.addEventListener("touchend", stopTouchRouteScrub);
    mapContainer.addEventListener("touchcancel", stopTouchRouteScrub);

    function renderCarousel() {
      carousel.innerHTML = [
        renderOverviewCard(meta),
        ...meta.days.map((day) => {
          const accommodation = placesById.get(day.accommodationPointId);
          const highlights = day.highlightPointIds.map((id) => placesById.get(id)).filter(Boolean);
          return renderDayCard(day, accommodation, highlights, state.activeDayId === day.id, dayProfileHighlights.get(day.id) || []);
        })
      ].join("");

      carousel.querySelectorAll("[data-stage-card]").forEach((card) => {
        const day = daysById.get(card.dataset.stageCard);
        card.__profileData = day?.profile || [];
      });

      bindProfileInteractions();
    }

    function syncCarouselState() {
      if (!state.activeDayId) {
        clearPreview();
      }
      carousel.querySelectorAll("[data-stage-card]").forEach((card) => {
        card.classList.toggle("is-active", card.dataset.stageCard === state.activeDayId);
      });
      compactSummary.hidden = Boolean(state.activeDayId);
      overviewButton.hidden = !state.activeDayId;
    }

    function refreshRoutes() {
      routeLayer.eachLayer((layer) => {
        layer.setStyle(routeStyle(layer.feature, state));
      });
    }

    function refreshMarkers() {
      markers.forEach((marker) => {
        const feature = marker.feature;
        const relatedToActive =
          state.activeDayId &&
          (feature.properties.relatedDayId === state.activeDayId ||
            feature.properties.relatedDayIds?.includes(state.activeDayId) ||
            daysById.get(state.activeDayId)?.highlightPointIds.includes(feature.properties.id) ||
            daysById.get(state.activeDayId)?.accommodationPointId === feature.properties.id);

        marker.setIcon(
          L.divIcon({
            className: `map-marker ${markerClass(feature.properties.kind)} ${relatedToActive ? "is-active" : ""}`,
            html: "<span></span>",
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          })
        );
      });
    }

    function clearPreview() {
      if (mapHoverFrame) {
        window.cancelAnimationFrame(mapHoverFrame);
        mapHoverFrame = null;
      }
      if (profileLongPressTimer) {
        window.clearTimeout(profileLongPressTimer);
        profileLongPressTimer = null;
      }
      pendingMapHover = null;
      touchRouteScrubbingDayId = null;
      profileTouchScrubbingDayId = null;
      profileLongPressStart = null;
      if (!map.dragging.enabled()) {
        map.dragging.enable();
      }

      carousel.querySelectorAll("[data-profile-cursor]").forEach((cursor) => {
        cursor.classList.remove("is-visible");
      });

      if (previewMarker && map.hasLayer(previewMarker)) {
        map.removeLayer(previewMarker);
      }
      previewMarker = null;

      activePreview = null;
    }

    function queueMapHover(dayId, latlng) {
      pendingMapHover = { dayId, latlng };
      if (mapHoverFrame) {
        return;
      }

      mapHoverFrame = window.requestAnimationFrame(() => {
        mapHoverFrame = null;
        if (!pendingMapHover) {
          return;
        }
        const next = pendingMapHover;
        pendingMapHover = null;
        updatePreviewFromMap(next.dayId, next.latlng);
      });
    }

    function bindProfileInteractions() {
      carousel.querySelectorAll("[data-profile-chart-day]").forEach((chart) => {
        const dayId = chart.dataset.profileChartDay;

        chart.addEventListener("mousemove", (event) => {
          if (isTouchDevice() || state.activeDayId !== dayId) {
            return;
          }
          updatePreviewFromProfile(dayId, profileDistanceFromEvent(chart, event));
        });

        chart.addEventListener("mouseleave", () => {
          if (!isTouchDevice()) {
            clearPreview();
          }
        });

        chart.addEventListener("click", (event) => {
          if (isTouchDevice()) {
            event.stopPropagation();
            return;
          }
          if (state.activeDayId !== dayId) {
            return;
          }
          updatePreviewFromProfile(dayId, profileDistanceFromEvent(chart, event));
        });

        chart.addEventListener(
          "touchstart",
          (event) => {
            if (!isTouchDevice() || state.activeDayId !== dayId || event.touches.length !== 1) {
              return;
            }

            const touch = event.touches[0];
            profileLongPressStart = {
              dayId,
              chart,
              clientX: touch.clientX,
              clientY: touch.clientY
            };

            if (profileLongPressTimer) {
              window.clearTimeout(profileLongPressTimer);
            }

            profileLongPressTimer = window.setTimeout(() => {
              profileLongPressTimer = null;
              if (!profileLongPressStart || profileLongPressStart.dayId !== dayId || state.activeDayId !== dayId) {
                return;
              }
              profileTouchScrubbingDayId = dayId;
              updatePreviewFromProfile(dayId, profileDistanceFromTouch(chart, profileLongPressStart));
            }, 280);
          },
          { passive: false }
        );

        chart.addEventListener(
          "touchmove",
          (event) => {
            if (event.touches.length !== 1) {
              return;
            }
            const touch = event.touches[0];

            if (profileLongPressStart?.dayId === dayId && profileTouchScrubbingDayId !== dayId) {
              const movedTooFar =
                Math.abs(touch.clientX - profileLongPressStart.clientX) > 10 ||
                Math.abs(touch.clientY - profileLongPressStart.clientY) > 10;

              if (movedTooFar) {
                window.clearTimeout(profileLongPressTimer);
                profileLongPressTimer = null;
                profileLongPressStart = null;
              }
              return;
            }

            if (profileTouchScrubbingDayId !== dayId) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            updatePreviewFromProfile(dayId, profileDistanceFromTouch(chart, touch));
          },
          { passive: false }
        );

        const stopProfileTouchScrub = (event) => {
          if (profileLongPressTimer) {
            window.clearTimeout(profileLongPressTimer);
            profileLongPressTimer = null;
          }

          if (profileLongPressStart?.dayId === dayId) {
            profileLongPressStart = null;
          }

          if (profileTouchScrubbingDayId !== dayId) {
            return;
          }
          profileTouchScrubbingDayId = null;
          event.preventDefault();
          event.stopPropagation();
          clearPreview();
        };

        chart.addEventListener("touchend", stopProfileTouchScrub);
        chart.addEventListener("touchcancel", stopProfileTouchScrub);
      });
    }

    function updatePreviewFromMap(dayId, latlng, maxPixelDistance = 18) {
      if (state.activeDayId !== dayId) {
        clearPreview();
        return;
      }

      const day = daysById.get(dayId);
      const interaction = dayInteractionData.get(dayId);
      if (!day || !interaction?.points?.length || !day.profile?.length) {
        return;
      }

      const routePoint = projectLatLngToRouteSample(interaction, latlng, map, maxPixelDistance);
      if (!routePoint) {
        if (activePreview?.source === "map") {
          clearPreview();
        }
        return;
      }

      const profilePoint = resolveProfileSample(day.profile, routePoint.profileDistanceKm);
      if (!profilePoint) {
        return;
      }

      if (activePreview?.dayId && activePreview.dayId !== dayId) {
        hideProfileCursor(activePreview.dayId);
      }

      activePreview = { dayId, source: "map" };

      showProfileCursor(dayId, profilePoint);
      if (!previewMarker) {
        previewMarker = L.circleMarker(routePoint.latlng, {
          radius: 5,
          color: "#ffffff",
          weight: 2.5,
          fillColor: "#0f766e",
          fillOpacity: 1,
          opacity: 1,
          interactive: false
        }).addTo(map);
      } else {
        previewMarker.setLatLng(routePoint.latlng);
      }
      previewMarker.bringToFront();
    }

    function updatePreviewFromProfile(dayId, distanceKm) {
      if (state.activeDayId !== dayId) {
        clearPreview();
        return;
      }

      const day = daysById.get(dayId);
      const interaction = dayInteractionData.get(dayId);
      if (!day || !interaction?.points?.length || !day.profile?.length) {
        return;
      }

      const routePoint = resolveRouteSample(interaction, distanceKm, map);
      const profilePoint = resolveProfileSample(day.profile, distanceKm);
      if (!routePoint || !profilePoint) {
        return;
      }

      if (activePreview?.dayId && activePreview.dayId !== dayId) {
        hideProfileCursor(activePreview.dayId);
      }

      activePreview = { dayId, source: "profile" };

      showProfileCursor(dayId, profilePoint);
      if (!previewMarker) {
        previewMarker = L.circleMarker(routePoint.latlng, {
          radius: 5,
          color: "#ffffff",
          weight: 2.5,
          fillColor: "#0f766e",
          fillOpacity: 1,
          opacity: 1,
          interactive: false
        }).addTo(map);
      } else {
        previewMarker.setLatLng(routePoint.latlng);
      }
      previewMarker.bringToFront();
    }

    function fitOverview() {
      fitBoundsWithUI(map, allBounds, "overview");
    }

    function fitDay(dayId) {
      const bounds = L.featureGroup(routeLayersByDay.get(dayId) || []).getBounds();
      fitBoundsWithUI(map, bounds, dayId === "day4" ? "day-tight" : "day");
    }

    function scrollToCard(index) {
      const cards = [...carousel.querySelectorAll("[data-card-index]")];
      const card = cards.find((item) => Number(item.dataset.cardIndex) === index);
      if (!card) {
        return;
      }
      scrollLock = true;
      if (index === 0) {
        carousel.scrollTo({
          left: 0,
          behavior: "smooth"
        });
      } else {
        card.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center"
        });
      }
      window.setTimeout(() => {
        scrollLock = false;
      }, 650);
    }

    function setActiveDay(dayId) {
      clearPreview();
      state.activeDayId = dayId;
      syncCarouselState();
      refreshRoutes();
      refreshMarkers();
      const index = meta.days.findIndex((day) => day.id === dayId);
      scrollToCard(index + 1);
      fitDay(dayId);
    }

    function resetOverview() {
      suppressAutoSelectUntil = Date.now() + 1200;
      clearPreview();
      state.activeDayId = null;
      syncCarouselState();
      refreshRoutes();
      refreshMarkers();
      scrollToCard(0);
      fitOverview();
    }

    function detectCenteredCardFromScroll() {
      if (scrollLock || Date.now() < suppressAutoSelectUntil) {
        return;
      }

      if (carousel.scrollLeft < 56) {
        if (state.activeDayId !== null) {
          clearPreview();
          state.activeDayId = null;
          syncCarouselState();
          refreshRoutes();
          refreshMarkers();
        }
        return;
      }

      const cards = [...carousel.querySelectorAll("[data-card-index]")];
      if (!cards.length) {
        return;
      }
      const rect = carousel.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const nearest = cards
        .map((card) => {
          const cardRect = card.getBoundingClientRect();
          const width = cardRect.width;
          return {
            index: Number(card.dataset.cardIndex),
            dayId: card.dataset.stageCard || null,
            distance: Math.abs(cardRect.left + width / 2 - centerX),
            width
          };
        })
        .sort((a, b) => a.distance - b.distance)[0];

      if (!nearest || nearest.distance > nearest.width * 0.28) {
        if (carousel.scrollLeft < 24 && state.activeDayId !== null) {
          clearPreview();
          state.activeDayId = null;
          syncCarouselState();
          refreshRoutes();
          refreshMarkers();
          fitOverview();
        }
        return;
      }

      if (nearest.index === 0) {
        if (state.activeDayId !== null) {
          resetOverview();
        }
        return;
      }

      if (nearest.dayId && nearest.dayId !== state.activeDayId) {
        clearPreview();
        state.activeDayId = nearest.dayId;
        syncCarouselState();
        refreshRoutes();
        refreshMarkers();
        fitDay(nearest.dayId);
      }
    }

    carousel.addEventListener("scroll", () => {
      if (scrollLock) {
        return;
      }
      window.clearTimeout(scrollIntentTimer);
      scrollIntentTimer = window.setTimeout(() => {
        detectCenteredCardFromScroll();
      }, 160);
    });

    carousel.addEventListener("click", (event) => {
      const highlight = event.target.closest("[data-highlight-id]");
      if (highlight) {
        const feature = placesById.get(highlight.dataset.highlightId);
        if (feature) {
          map.setView([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], 13, {
            animate: true
          });
        }
        return;
      }

      const overviewCard = event.target.closest('[data-card-index="0"]');
      if (overviewCard) {
        clearPreview();
        resetOverview();
        return;
      }

      const card = event.target.closest("[data-stage-card]");
      if (card) {
        if (event.target.closest("[data-profile-chart-day]") && card.dataset.stageCard === state.activeDayId) {
          return;
        }
        clearPreview();
        setActiveDay(card.dataset.stageCard);
      }
    });

    overviewButton.addEventListener("click", resetOverview);

    window.addEventListener("resize", () => {
      if (state.activeDayId) {
        fitDay(state.activeDayId);
      } else {
        fitOverview();
      }
    });

    renderCarousel();
    syncCarouselState();
    refreshRoutes();
    refreshMarkers();
    fitOverview();
  })
  .catch((error) => {
    document.querySelector("#app").innerHTML = `
      <main class="error-state">
        <h1>No se pudo cargar el mapa</h1>
        <p>${error.message}</p>
      </main>
    `;
  });

function renderLayout(meta) {
  const totalDistance = meta.days.reduce((sum, day) => sum + day.computedDistanceKm, 0);
  const totalGain = meta.days.reduce((sum, day) => sum + day.computedGainM, 0);
  return `
    <div class="map-shell">
      <div id="map" aria-label="Mapa de la ruta"></div>

      <header class="floating-header">
        <div class="floating-header__eyebrow">GR11 · GR92</div>
        <h1>Núria → Cap de Creus</h1>
        <p data-compact-summary>${meta.summary.days} etapes · ${Math.round(totalDistance)} km · ${formatOverviewGain(totalGain)}</p>
      </header>

      <button class="overview-button" data-overview-button hidden>Tornar a la vista completa</button>

      <section class="route-carousel-wrap">
        <div class="route-carousel" data-carousel></div>
      </section>
    </div>
  `;
}

function renderOverviewCard(meta) {
  const totalDistance = meta.days.reduce((sum, day) => sum + day.computedDistanceKm, 0);
  const totalGain = meta.days.reduce((sum, day) => sum + day.computedGainM, 0);
  const totalLoss = meta.days.reduce((sum, day) => sum + day.computedLossM, 0);
  const overviewProfile = buildOverviewProfile(meta.days);
  return `
    <article class="route-card route-card--overview" data-card-index="0">
      <div class="route-card__eyebrow">Resum general</div>
      <h2>Ruta completa</h2>
      <div class="route-card__meta route-card__meta--overview">
        ${renderMetricPill("distance", formatDistanceKm(totalDistance))}
        ${renderMetricPill("days", `${meta.summary.days} dies`)}
        ${renderMetricPill("up", `+${formatMeters(totalGain)}`)}
        ${renderMetricPill("down", `-${formatMeters(totalLoss)}`)}
      </div>
      <div class="route-card__profile-wrap route-card__profile-wrap--overview">
        ${renderProfile(overviewProfile, { showDistanceLabels: false })}
      </div>
    </article>
  `;
}

function renderDayCard(day, _accommodation, _highlights, isActive, profileHighlights = []) {
  const title = compactStageTitle(day.title);
  const stageLabel = `Etapa ${day.dayNumber}`;
  return `
    <article class="route-card ${isActive ? "is-active" : ""}" data-card-index="${day.dayNumber}" data-stage-card="${day.id}">
      <div class="route-card__head">
        <div>
          <div class="route-card__eyebrow">${stageLabel} · ${formatCatalanDate(day.date)}</div>
          <h2>${title}</h2>
        </div>
      </div>

      <div class="route-card__meta">
        ${renderMetricPill("distance", formatDistanceKm(day.computedDistanceKm))}
        ${renderMetricPill("time", formatDurationLabel(day.durationLabel))}
        ${renderMetricPill("up", `+${formatMeters(day.computedGainM)}`)}
        ${renderMetricPill("down", `-${formatMeters(day.computedLossM)}`)}
      </div>

      <div class="route-card__profile-wrap">
        ${renderProfile(day.profile, { dayId: day.id, profileHighlights })}
      </div>
    </article>
  `;
}

function renderMetricPill(kind, value) {
  return `
    <span class="metric-pill metric-pill--${kind}">
      <i class="metric-pill__icon" aria-hidden="true">${renderMetricIcon(kind)}</i>
      <strong>${value}</strong>
    </span>
  `;
}

function renderMetricIcon(kind) {
  const icons = {
    days:
      '<svg viewBox="0 0 16 16"><rect x="2.5" y="3.5" width="11" height="10" rx="2"></rect><path d="M5 2.5v2M11 2.5v2M2.5 6.5h11"></path></svg>',
    towns:
      '<svg viewBox="0 0 16 16"><path d="M2.5 13.5h11M4 13.5V8l4-2.5L12 8v5.5M6.5 10.5h3"></path></svg>',
    distance:
      '<svg viewBox="0 0 16 16"><path d="M2.5 11.5 6 8l2 2 5.5-5.5"></path><path d="M11.5 4.5h2v2"></path></svg>',
    up:
      '<svg viewBox="0 0 16 16"><path d="M8 13V4"></path><path d="M4.5 7.5 8 4l3.5 3.5"></path></svg>',
    down:
      '<svg viewBox="0 0 16 16"><path d="M8 3v9"></path><path d="M4.5 8.5 8 12l3.5-3.5"></path></svg>',
    time:
      '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"></circle><path d="M8 5v3l2 1.5"></path></svg>'
  };
  return icons[kind] || icons.distance;
}

function renderProfile(profile, options = {}) {
  const { showDistanceLabels = true, dayId = null, profileHighlights = [] } = options;
  if (!profile?.length) {
    return '<div class="profile-empty">Sense dades d\'elevació</div>';
  }

  const width = 320;
  const edgeMarkerInset = 5;
  const innerTop = 18;
  const plotHeight = 86;
  const baseline = innerTop + plotHeight;
  const height = baseline;
  const totalDistance = Math.max(0.0001, profile.at(-1)?.distanceKm || 0);
  const elevations = profile.map((item) => item.elevationM);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const range = Math.max(1, max - min);
  const coords = profile.map((item) => ({
    x: (item.distanceKm / totalDistance) * width,
    y: innerTop + (plotHeight - ((item.elevationM - min) / range) * plotHeight)
  }));
  const maxIndex = elevations.indexOf(max);
  const minIndex = elevations.indexOf(min);
  const maxMarker = resolveMarkerPosition(coords, maxIndex, edgeMarkerInset, width);
  const minMarker = resolveMarkerPosition(coords, minIndex, edgeMarkerInset, width);
  const maxLabelY = Math.max(14, maxMarker.y - 12);
  const minLabelY = Math.max(24, minMarker.y - 12);
  const points = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const highlightDots = profileHighlights
    .map((item) => {
      const sample = resolveProfileSample(profile, item.distanceKm);
      if (!sample) {
        return "";
      }
      const x = clamp((sample.distanceKm / totalDistance) * width, 0, width);
      const y = innerTop + (plotHeight - ((sample.elevationM - min) / range) * plotHeight);
      return `<circle cx="${x}" cy="${y}" r="3.2" class="profile-chart__highlight-dot"></circle>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height + 10}" class="profile-chart" role="img" aria-label="Perfil topogràfic" ${dayId ? `data-profile-chart-day="${dayId}" data-profile-total-km="${profile.at(-1)?.distanceKm || 0}"` : ""}>
      <polyline points="0,${baseline} ${points} ${width},${baseline}" class="profile-chart__fill"></polyline>
      <polyline points="${points}" class="profile-chart__line"></polyline>
      ${highlightDots}
      <circle cx="${maxMarker.x}" cy="${maxMarker.y}" r="3.5" class="profile-chart__marker profile-chart__marker--max"></circle>
      <circle cx="${minMarker.x}" cy="${minMarker.y}" r="3.5" class="profile-chart__marker profile-chart__marker--min"></circle>
      <text x="${Math.min(width - 8, Math.max(8, maxMarker.x))}" y="${maxLabelY}" text-anchor="${maxMarker.x > width * 0.72 ? "end" : "start"}" class="profile-chart__peak">${formatMeters(max)}</text>
      <text x="${Math.min(width - 8, Math.max(8, minMarker.x))}" y="${minLabelY}" text-anchor="${minMarker.x > width * 0.72 ? "end" : "start"}" class="profile-chart__valley">${formatMeters(min)}</text>
      ${
        dayId
          ? `<g class="profile-chart__cursor" data-profile-cursor="${dayId}">
              <line x1="0" x2="0" y1="${innerTop - 2}" y2="${baseline}" class="profile-chart__cursor-line"></line>
              <circle cx="0" cy="0" r="4" class="profile-chart__cursor-point"></circle>
            </g>`
          : ""
      }
      ${showDistanceLabels ? `<text x="0" y="${height + 8}" class="profile-chart__label"></text>` : ""}
      ${showDistanceLabels ? `<text x="${width - 44}" y="${height + 8}" class="profile-chart__label"></text>` : ""}
    </svg>
  `;
}

function routeStyle(feature, state) {
  const isBus = feature.properties.mode === "bus";
  const isSelected = state.activeDayId && feature.properties.dayId === state.activeDayId;
  const isMuted = state.activeDayId && feature.properties.dayId !== state.activeDayId;

  return {
    color: isBus ? "#7f8790" : "#0f766e",
    weight: isSelected ? 7 : 4.6,
    opacity: isMuted ? 0.56 : 0.92,
    dashArray: isBus ? "10 10" : "",
    lineCap: "round",
    lineJoin: "round"
  };
}

function buildSegmentTooltip(feature) {
  return `${feature.properties.label}<br>${feature.properties.mode === "bus" ? "Bus aproximado" : "Trekking"}`;
}

function buildMarker(feature) {
  const marker = L.marker([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], {
    icon: L.divIcon({
      className: `map-marker ${markerClass(feature.properties.kind)}`,
      html: "<span></span>",
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    })
  });

  marker.feature = feature;
  marker.bindTooltip(`<strong>${feature.properties.label}</strong>`, {
    direction: "top",
    offset: [0, -10]
  });

  marker.bindPopup(buildPlacePopup(feature), {
    autoPanPaddingTopLeft: [24, 88],
    autoPanPaddingBottomRight: [24, 230],
    closeButton: false,
    maxWidth: 280
  });

  return marker;
}

function markerClass(kind) {
  if (kind === "stage-endpoint" || kind === "stage-place") {
    return "is-start-end";
  }
  if (kind === "accommodation") {
    return "is-stay";
  }
  return "is-highlight";
}

function fitBoundsWithUI(map, bounds, mode) {
  if (!bounds?.isValid()) {
    return;
  }
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  const isOverview = mode === "overview";
  const isDayMode = mode === "day" || mode === "day-tight";

  if (mobile && isOverview) {
    const overviewFit = getMobileOverviewFit(map);
    map.fitBounds(bounds, {
      paddingTopLeft: [overviewFit.left, overviewFit.top],
      paddingBottomRight: [overviewFit.rightPad, overviewFit.bottomPad],
      maxZoom: 13
    });

    const maxOverviewZoom = Math.min(13, map.getZoom() + 1.5);
    let bestZoom = map.getZoom();

    for (let nextZoom = bestZoom + 0.25; nextZoom <= maxOverviewZoom + 0.001; nextZoom += 0.25) {
      map.setZoom(nextZoom, { animate: false });
      if (boundsFitsSafeArea(map, bounds, overviewFit)) {
        bestZoom = nextZoom;
      } else {
        break;
      }
    }

    if (map.getZoom() !== bestZoom) {
      map.setZoom(bestZoom, { animate: false });
    }
    return;
  }

  const adjustedBounds =
    isOverview
      ? bounds.pad(0)
      : mode === "day-tight"
        ? bounds.pad(mobile ? -0.05 : 0.08)
      : bounds.pad(mobile ? 0.1 : 0.12);
  map.fitBounds(adjustedBounds, {
    paddingTopLeft: mobile ? (isOverview ? [10, 68] : [14, 76]) : [18, 96],
    paddingBottomRight:
      isDayMode
        ? mobile
          ? [18, 286]
          : [18, 280]
        : mobile
          ? [10, 112]
          : [18, 150],
    maxZoom: mobile ? 13 : 14
  });

  if (!mobile && (isOverview || mode === "day-tight")) {
    map.setZoom(map.getZoom() - 1, { animate: false });
  }
}

function getMobileOverviewFit(map) {
  const mapRect = map.getContainer().getBoundingClientRect();
  const headerRect = document.querySelector(".floating-header")?.getBoundingClientRect();
  const carouselRect = document.querySelector(".route-carousel-wrap")?.getBoundingClientRect();
  const zoomRect = document.querySelector(".leaflet-control-zoom")?.getBoundingClientRect();
  const carouselHeight = carouselRect ? mapRect.bottom - carouselRect.top : 0;
  const overlapAllowance = Math.min(56, Math.round(carouselHeight * 0.28));

  const left = 10;
  const top = Math.max(62, Math.round((headerRect?.bottom || mapRect.top) - mapRect.top + 6));
  const rightPad = Math.max(12, Math.round(mapRect.right - (zoomRect?.left || mapRect.right) + 10));
  const bottomPad = Math.max(
    88,
    Math.round(mapRect.bottom - (carouselRect?.top || mapRect.bottom) + 12 - overlapAllowance)
  );

  return {
    left,
    top,
    rightPad,
    bottomPad,
    right: mapRect.width - rightPad,
    bottom: mapRect.height - bottomPad
  };
}

function boundsFitsSafeArea(map, bounds, safeArea) {
  const northWest = map.latLngToContainerPoint(bounds.getNorthWest());
  const southEast = map.latLngToContainerPoint(bounds.getSouthEast());

  return (
    northWest.x >= safeArea.left &&
    northWest.y >= safeArea.top &&
    southEast.x <= safeArea.right &&
    southEast.y <= safeArea.bottom
  );
}

function formatMeters(value) {
  return (
    new Intl.NumberFormat("ca-ES", {
      useGrouping: "always",
      maximumFractionDigits: 0
    }).format(Math.round(value)) + " m"
  );
}

function formatDistanceKm(value) {
  return `${value.toLocaleString("ca-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} km`;
}

function formatDurationLabel(label) {
  return label.replace(/^~/, "").trim();
}

function buildPlacePopup(feature) {
  const { label, description, photo, photoTitle } = feature.properties;
  const shortDescription =
    description && description.length > 240 ? `${description.slice(0, 237).trimEnd()}...` : description;
  return `
    <article class="place-popup">
      ${photo ? `<img src="${photo}" alt="${escapeHtml(photoTitle || label)}" class="place-popup__image">` : ""}
      <h3>${escapeHtml(label)}</h3>
      ${shortDescription ? `<p>${escapeHtml(shortDescription)}</p>` : ""}
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildEndpointPlaceIds(meta) {
  const endpointIds = new Set();
  const nameToPlaceId = {
    nuria: "vall-nuria",
    setcases: "town-setcases",
    beget: "beget",
    albanya: "albanya",
    vilamaniscle: "town-vilamaniscle",
    "el port de la selva": "port-selva",
    "cap de creus": "cap-creus",
    cadaques: "cadaques"
  };

  for (const day of meta.days) {
    const parts = day.title.split("→").map((part) => normalizePlaceKey(part));
    const endpoints = [parts[0], parts.at(-1)].filter(Boolean);
    endpoints.forEach((name) => {
      const id = nameToPlaceId[name];
      if (id) {
        endpointIds.add(id);
      }
    });
  }

  return endpointIds;
}

function buildMapPlaceFeatures(placesGeoJson, meta, placesById, endpointPlaceIds) {
  const result = [];
  const addedIds = new Set();

  const endpointDayIdsByPlace = new Map();
  for (const day of meta.days) {
    const parts = day.title.split("→").map((part) => normalizePlaceKey(part));
    const endpoints = [parts[0], parts.at(-1)].filter(Boolean);
    endpoints.forEach((name) => {
      const placeId = resolveEndpointPlaceId(name);
      if (!placeId) {
        return;
      }
      if (!endpointDayIdsByPlace.has(placeId)) {
        endpointDayIdsByPlace.set(placeId, new Set());
      }
      endpointDayIdsByPlace.get(placeId).add(day.id);
    });
  }

  endpointPlaceIds.forEach((id) => {
    const source = placesById.get(id);
    if (!source || addedIds.has(id)) {
      return;
    }
    result.push({
      ...source,
      properties: {
        ...source.properties,
        kind: "stage-place",
        relatedDayIds: [...(endpointDayIdsByPlace.get(id) || [])]
      }
    });
    addedIds.add(id);
  });

  const figueres = placesById.get("bus-figueres");
  if (figueres && !addedIds.has("bus-figueres")) {
    result.push({
      ...figueres,
      properties: {
        ...figueres.properties,
        label: "Figueres",
        kind: "highlight",
        relatedDayIds: ["day4"]
      }
    });
    addedIds.add("bus-figueres");
  }

  placesGeoJson.features
    .filter((feature) => feature.properties.kind === "highlight" && !endpointPlaceIds.has(feature.properties.id))
    .forEach((feature) => {
      if (!addedIds.has(feature.properties.id)) {
        result.push(feature);
        addedIds.add(feature.properties.id);
      }
    });

  return result;
}

function buildDayProfileHighlights(meta, placesById, dayInteractionData) {
  const result = new Map();

  for (const day of meta.days) {
    const interaction = dayInteractionData.get(day.id);
    if (!interaction) {
      result.set(day.id, []);
      continue;
    }

    const dots = day.highlightPointIds
      .map((id) => {
        const feature = placesById.get(id);
        if (!feature) {
          return null;
        }
        const projected = projectPlaceToRouteDistance(interaction, L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]));
        if (!projected) {
          return null;
        }
        return {
          id,
          distanceKm: projected.profileDistanceKm
        };
      })
      .filter(Boolean);

    result.set(day.id, dots);
  }

  return result;
}

function resolveEndpointPlaceId(name) {
  const nameToPlaceId = {
    nuria: "vall-nuria",
    setcases: "town-setcases",
    beget: "beget",
    albanya: "albanya",
    vilamaniscle: "town-vilamaniscle",
    "el port de la selva": "port-selva",
    "cap de creus": "cap-creus",
    cadaques: "cadaques"
  };

  return nameToPlaceId[name] || null;
}

function normalizePlaceKey(value) {
  return value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildDayInteractionData(routeGeoJson, meta) {
  const result = new Map();

  for (const day of meta.days) {
    const features = routeGeoJson.features.filter(
      (feature) => feature.properties.dayId === day.id && feature.properties.mode === "hiking"
    );

    if (!features.length) {
      continue;
    }

    const coords = [];
    for (const feature of features) {
      for (const coordinate of feature.geometry.coordinates) {
        const [lng, lat] = coordinate;
        const previous = coords.at(-1);
        if (previous && Math.abs(previous.lng - lng) < 1e-9 && Math.abs(previous.lat - lat) < 1e-9) {
          continue;
        }
        coords.push({ lng, lat });
      }
    }

    if (coords.length < 2) {
      continue;
    }

    const points = coords.map((coord) => L.latLng(coord.lat, coord.lng));
    const cumulativeKm = [0];
    for (let index = 1; index < points.length; index += 1) {
      cumulativeKm.push(cumulativeKm[index - 1] + points[index - 1].distanceTo(points[index]) / 1000);
    }

    result.set(day.id, {
      points,
      cumulativeKm,
      totalKm: cumulativeKm.at(-1),
      profileTotalKm: day.profile.at(-1)?.distanceKm ?? day.computedDistanceKm
    });
  }

  return result;
}

function interpolateLatLng(start, end, t) {
  return L.latLng(start.lat + (end.lat - start.lat) * t, start.lng + (end.lng - start.lng) * t);
}

function projectLatLngToRouteSample(interaction, latlng, map, maxPixelDistance = Infinity) {
  const zoom = map.getZoom();
  const target = map.project(latlng, zoom);
  if (interaction.projectedZoom !== zoom) {
    interaction.projectedZoom = zoom;
    interaction.projected = interaction.points.map((point) => map.project(point, zoom));
  }
  const projected = interaction.projected;
  let best = null;

  for (let index = 0; index < projected.length - 1; index += 1) {
    const start = projected[index];
    const end = projected[index + 1];
    const segment = closestPointOnSegment(target, start, end);
    const segmentKm = interaction.cumulativeKm[index + 1] - interaction.cumulativeKm[index];
    const trackDistanceKm = interaction.cumulativeKm[index] + segmentKm * segment.t;
    const profileDistanceKm =
      interaction.totalKm > 0 ? (trackDistanceKm / interaction.totalKm) * interaction.profileTotalKm : trackDistanceKm;

    if (!best || segment.distanceSq < best.distanceSq) {
      best = {
        distanceSq: segment.distanceSq,
        profileDistanceKm,
        latlng: map.unproject(segment.point, zoom)
      };
    }
  }

  if (!best || Math.sqrt(best.distanceSq) > maxPixelDistance) {
    return null;
  }

  return best;
}

function projectPlaceToRouteDistance(interaction, latlng) {
  const projectedPoints =
    interaction.geoProjected ||
    interaction.points.map((point) => L.CRS.EPSG3857.project(point));
  interaction.geoProjected = projectedPoints;
  const target = L.CRS.EPSG3857.project(latlng);
  let best = null;

  for (let index = 0; index < projectedPoints.length - 1; index += 1) {
    const start = projectedPoints[index];
    const end = projectedPoints[index + 1];
    const segment = closestPointOnSegment(target, start, end);
    const segmentKm = interaction.cumulativeKm[index + 1] - interaction.cumulativeKm[index];
    const trackDistanceKm = interaction.cumulativeKm[index] + segmentKm * segment.t;
    const profileDistanceKm =
      interaction.totalKm > 0 ? (trackDistanceKm / interaction.totalKm) * interaction.profileTotalKm : trackDistanceKm;

    if (!best || segment.distanceSq < best.distanceSq) {
      best = {
        distanceSq: segment.distanceSq,
        profileDistanceKm
      };
    }
  }

  return best;
}

function profileDistanceFromEvent(chart, event) {
  const rect = chart.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const totalDistance = Number(chart.dataset.profileTotalKm || 0);
  return ratio * totalDistance;
}

function profileDistanceFromTouch(chart, touch) {
  const rect = chart.getBoundingClientRect();
  const ratio = clamp((touch.clientX - rect.left) / rect.width, 0, 1);
  const totalDistance = Number(chart.dataset.profileTotalKm || 0);
  return ratio * totalDistance;
}

function closestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return {
      t: 0,
      point: start,
      distanceSq: squaredDistance(point, start)
    };
  }

  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
  const t = clamp(rawT, 0, 1);
  const projectedPoint = L.point(start.x + dx * t, start.y + dy * t);
  return {
    t,
    point: projectedPoint,
    distanceSq: squaredDistance(point, projectedPoint)
  };
}

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function resolveRouteSample(interaction, profileDistanceKm, map) {
  const targetTrackKm =
    interaction.profileTotalKm > 0 ? (profileDistanceKm / interaction.profileTotalKm) * interaction.totalKm : profileDistanceKm;

  if (targetTrackKm <= 0) {
    return { latlng: interaction.points[0] };
  }

  for (let index = 0; index < interaction.cumulativeKm.length - 1; index += 1) {
    const startKm = interaction.cumulativeKm[index];
    const endKm = interaction.cumulativeKm[index + 1];
    if (targetTrackKm <= endKm) {
      const span = Math.max(0.0001, endKm - startKm);
      const t = clamp((targetTrackKm - startKm) / span, 0, 1);
      const start = interaction.points[index];
      const end = interaction.points[index + 1];
      const zoom = map.getZoom();
      const startPoint = map.project(start, zoom);
      const endPoint = map.project(end, zoom);
      const layerPoint = L.point(
        startPoint.x + (endPoint.x - startPoint.x) * t,
        startPoint.y + (endPoint.y - startPoint.y) * t
      );
      return {
        latlng: map.unproject(layerPoint, zoom)
      };
    }
  }

  return {
    latlng: interaction.points.at(-1)
  };
}

function resolveProfileSample(profile, distanceKm) {
  if (!profile.length) {
    return null;
  }

  if (distanceKm <= profile[0].distanceKm) {
    return profilePointFromDistance(profile[0], profile[0], 0);
  }

  for (let index = 0; index < profile.length - 1; index += 1) {
    const start = profile[index];
    const end = profile[index + 1];
    if (distanceKm <= end.distanceKm) {
      const span = Math.max(0.0001, end.distanceKm - start.distanceKm);
      const t = clamp((distanceKm - start.distanceKm) / span, 0, 1);
      return profilePointFromDistance(start, end, t);
    }
  }

  return profilePointFromDistance(profile.at(-1), profile.at(-1), 0);
}

function profilePointFromDistance(start, end, t) {
  const elevation = start.elevationM + (end.elevationM - start.elevationM) * t;
  const distanceKm = start.distanceKm + (end.distanceKm - start.distanceKm) * t;
  return {
    distanceKm,
    elevationM: elevation
  };
}

function showProfileCursor(dayId, point) {
  const cursor = document.querySelector(`[data-profile-cursor="${dayId}"]`);
  const dayCard = document.querySelector(`[data-stage-card="${dayId}"]`);
  if (!cursor || !dayCard) {
    return;
  }

  const profile = dayCard.__profileData;
  if (!profile?.length) {
    return;
  }

  const width = 320;
  const innerTop = 18;
  const plotHeight = 86;
  const baseline = innerTop + plotHeight;
  const min = Math.min(...profile.map((item) => item.elevationM));
  const max = Math.max(...profile.map((item) => item.elevationM));
  const range = Math.max(1, max - min);
  const totalDistance = profile.at(-1)?.distanceKm || 1;
  const x = clamp((point.distanceKm / totalDistance) * width, 0, width);
  const y = innerTop + (plotHeight - ((point.elevationM - min) / range) * plotHeight);
  const line = cursor.querySelector(".profile-chart__cursor-line");
  const dot = cursor.querySelector(".profile-chart__cursor-point");

  line.setAttribute("x1", x);
  line.setAttribute("x2", x);
  dot.setAttribute("cx", x);
  dot.setAttribute("cy", y);
  cursor.classList.add("is-visible");
}

function hideProfileCursor(dayId) {
  const cursor = document.querySelector(`[data-profile-cursor="${dayId}"]`);
  if (cursor) {
    cursor.classList.remove("is-visible");
  }
}

function resolveMarkerPosition(coords, index, edgeInset, width) {
  const point = coords[index];
  if (!point) {
    return { x: edgeInset, y: 0 };
  }

  if (point.x < edgeInset && coords[index + 1]) {
    return interpolateAtX(point, coords[index + 1], edgeInset);
  }

  if (point.x > width - edgeInset && coords[index - 1]) {
    return interpolateAtX(coords[index - 1], point, width - edgeInset);
  }

  return point;
}

function interpolateAtX(a, b, targetX) {
  if (Math.abs(b.x - a.x) < 0.001) {
    return { x: targetX, y: a.y };
  }

  const ratio = (targetX - a.x) / (b.x - a.x);
  return {
    x: targetX,
    y: a.y + (b.y - a.y) * ratio
  };
}

function latLngFromTouch(map, touch) {
  const rect = map.getContainer().getBoundingClientRect();
  const containerPoint = L.point(touch.clientX - rect.left, touch.clientY - rect.top);
  return map.containerPointToLatLng(containerPoint);
}

function touchStartedOnMarker(event) {
  if (!(event.target instanceof Element)) {
    return false;
  }

  return Boolean(event.target.closest(".leaflet-marker-icon, .map-marker"));
}

function isTouchDevice() {
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

function formatOverviewGain(value) {
  return `+${new Intl.NumberFormat("ca-ES").format(Math.round(value / 1000) * 1000)} m`;
}

function buildOverviewProfile(days) {
  let cumulativeDistance = 0;
  const result = [];

  for (const day of days) {
    for (let index = 0; index < day.profile.length; index += 1) {
      const point = day.profile[index];
      if (!result.length) {
        result.push({
          distanceKm: 0,
          elevationM: point.elevationM
        });
        continue;
      }

      if (index === 0) {
        continue;
      }

      result.push({
        distanceKm: Number((cumulativeDistance + point.distanceKm).toFixed(1)),
        elevationM: point.elevationM
      });
    }
    cumulativeDistance += day.computedDistanceKm;
  }

  return result;
}

function compactStageTitle(title) {
  const parts = title.split("→").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return title;
  }
  return `${parts[0]} → ${parts.at(-1)}`;
}

function formatCatalanDate(dateIso) {
  return new Intl.DateTimeFormat("ca-ES", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(`${dateIso}T12:00:00`));
}
