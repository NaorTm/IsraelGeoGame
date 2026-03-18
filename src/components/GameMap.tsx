import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { mapStyles } from '../data/mapStyles';
import type {
  MapStyleId,
  MapViewport,
  Settlement,
  SettlementBoundaryCollection,
} from '../types';
import {
  getSettlementFeature,
  hasLoadedBoundariesForSettlements,
  loadBoundaryCollectionsForSettlements,
} from '../utils/settlementBoundaries';

// Israel default viewport
const ISRAEL_CENTER: [number, number] = [31.5, 35.0];

interface GameMapProps {
  settlements: Settlement[];
  mapStyle: MapStyleId;
  onMapStyleChange: (mapStyle: MapStyleId) => void;
  mapViewport: MapViewport;
  onMapViewportChange: (mapViewport: MapViewport) => void;
  correctSettlementIds?: string[];
  wrongGuessIds?: string[];
  focusSettlementId?: string;
  onSettlementSelect?: (settlementId: string) => void;
  interactive: boolean;
}

const DEFAULT_STYLE: L.PathOptions = {
  color: '#2563eb',
  weight: 1.1,
  fillColor: '#60a5fa',
  fillOpacity: 0.12,
};

const WRONG_FIRST_STYLE: L.PathOptions = {
  color: '#ca8a04',
  weight: 2,
  fillColor: '#facc15',
  fillOpacity: 0.42,
};

const WRONG_SECOND_STYLE: L.PathOptions = {
  color: '#ea580c',
  weight: 2,
  fillColor: '#fb923c',
  fillOpacity: 0.38,
};

const WRONG_THIRD_STYLE: L.PathOptions = {
  color: '#dc2626',
  weight: 2,
  fillColor: '#f87171',
  fillOpacity: 0.42,
};

const TARGET_STYLE: L.PathOptions = {
  color: '#15803d',
  weight: 2.4,
  fillColor: '#4ade80',
  fillOpacity: 0.46,
};

const APPROXIMATE_STYLE: L.PathOptions = {
  dashArray: '6 4',
};

function getLayerStyle(
  settlementId: string,
  approximate: boolean,
  correctSettlementIds: Set<string>,
  wrongGuessLevels: Map<string, number>
): L.PathOptions {
  const baseStyle =
    correctSettlementIds.has(settlementId)
      ? TARGET_STYLE
      : (wrongGuessLevels.get(settlementId) ?? 0) >= 3
        ? WRONG_THIRD_STYLE
        : (wrongGuessLevels.get(settlementId) ?? 0) === 2
          ? WRONG_SECOND_STYLE
          : (wrongGuessLevels.get(settlementId) ?? 0) === 1
            ? WRONG_FIRST_STYLE
        : DEFAULT_STYLE;

  return approximate ? { ...baseStyle, ...APPROXIMATE_STYLE } : baseStyle;
}

function MapViewportTracker({
  onViewportChange,
}: {
  onViewportChange: (mapViewport: MapViewport) => void;
}) {
  useMapEvents({
    moveend(event) {
      const center = event.target.getCenter();
      onViewportChange({ center: [center.lat, center.lng], zoom: event.target.getZoom() });
    },
    zoomend(event) {
      const center = event.target.getCenter();
      onViewportChange({ center: [center.lat, center.lng], zoom: event.target.getZoom() });
    },
  });

  return null;
}

function MapFocusController({
  focusSettlementId,
  settlements,
}: {
  focusSettlementId?: string;
  settlements: Settlement[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!focusSettlementId) {
      return;
    }

    const focusedSettlement = settlements.find(
      (settlement) => settlement.id === focusSettlementId
    );

    if (!focusedSettlement) {
      return;
    }

    map.flyTo(
      [focusedSettlement.lat, focusedSettlement.lng],
      Math.max(map.getZoom(), 10),
      {
        animate: true,
        duration: 0.6,
      }
    );
  }, [focusSettlementId, map, settlements]);

  return null;
}

export default function GameMap({
  settlements,
  mapStyle,
  onMapStyleChange,
  mapViewport,
  onMapViewportChange,
  correctSettlementIds,
  wrongGuessIds,
  focusSettlementId,
  onSettlementSelect,
  interactive,
}: GameMapProps) {
  const [boundaryCollection, setBoundaryCollection] =
    useState<SettlementBoundaryCollection>({});
  const isLoadingBoundaries = !hasLoadedBoundariesForSettlements(settlements);

  const correctSettlementSet = useMemo(
    () => new Set(correctSettlementIds ?? []),
    [correctSettlementIds]
  );
  const wrongGuessLevels = useMemo(
    () =>
      new Map((wrongGuessIds ?? []).map((settlementId, index) => [settlementId, Math.min(index + 1, 3)])),
    [wrongGuessIds]
  );
  const selectedMapStyle = useMemo(
    () => mapStyles.find((style) => style.id === mapStyle) ?? mapStyles[0],
    [mapStyle]
  );
  const tileLayerProps = useMemo(() => {
    const props: {
      attribution: string;
      url: string;
      subdomains?: string;
      maxZoom?: number;
    } = {
      attribution: selectedMapStyle.attribution,
      url: selectedMapStyle.tileUrl,
    };

    if (selectedMapStyle.subdomains) {
      props.subdomains = selectedMapStyle.subdomains;
    }

    if (selectedMapStyle.maxZoom !== undefined) {
      props.maxZoom = selectedMapStyle.maxZoom;
    }

    return props;
  }, [selectedMapStyle]);

  useEffect(() => {
    let isDisposed = false;

    void loadBoundaryCollectionsForSettlements(settlements).then((loadedBoundaries) => {
      if (isDisposed) {
        return;
      }

      setBoundaryCollection((previous) => ({
        ...previous,
        ...loadedBoundaries,
      }));
    });

    return () => {
      isDisposed = true;
    };
  }, [settlements]);

  const featureCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: settlements
        .map((settlement) => getSettlementFeature(settlement, boundaryCollection))
        .filter((feature): feature is NonNullable<typeof feature> => feature !== null),
    }) as FeatureCollection,
    [boundaryCollection, settlements]
  );

  const hasApproximateFeatures = useMemo(
    () =>
      featureCollection.features.some(
        (feature) => feature.properties?.approximate === true
      ),
    [featureCollection]
  );

  const featureCollectionKey = useMemo(
    () =>
      featureCollection.features
        .map((feature) => feature.properties?.settlementId ?? '')
        .sort()
        .join('|'),
    [featureCollection]
  );
  const featureStyleKey = useMemo(() => {
    const correctKey = [...correctSettlementSet].sort().join('|');
    const wrongKey = (wrongGuessIds ?? []).join('|');

    return `${correctKey}::${wrongKey}`;
  }, [correctSettlementSet, wrongGuessIds]);

  return (
    <div className="game-map-shell">
      <MapContainer
        center={mapViewport.center ?? ISRAEL_CENTER}
        zoom={mapViewport.zoom ?? 7}
        minZoom={6}
        maxZoom={16}
        style={{ height: '100%', width: '100%', borderRadius: '12px' }}
        className="game-map"
      >
        <MapViewportTracker onViewportChange={onMapViewportChange} />
        <MapFocusController
          focusSettlementId={focusSettlementId}
          settlements={settlements}
        />
        <TileLayer
          key={`${selectedMapStyle.id}:${selectedMapStyle.tileUrl}`}
          {...tileLayerProps}
        />

        <GeoJSON
          key={`${featureCollectionKey}::${featureStyleKey}`}
          data={featureCollection}
          style={(feature) =>
            getLayerStyle(
              feature?.properties?.settlementId ?? '',
              feature?.properties?.approximate === true,
              correctSettlementSet,
              wrongGuessLevels
            )
          }
          onEachFeature={(feature, layer) => {
            const settlementId = feature.properties?.settlementId;
            const approximate = feature.properties?.approximate === true;

            layer.on('mouseover', () => {
              if (!interactive || !settlementId || !(layer instanceof L.Path)) {
                return;
              }

              layer.setStyle({
                ...getLayerStyle(
                  settlementId,
                  approximate,
                  correctSettlementSet,
                  wrongGuessLevels
                ),
                weight: 2.4,
                fillOpacity: 0.24,
              });
            });

            layer.on('mouseout', () => {
              if (!settlementId || !(layer instanceof L.Path)) {
                return;
              }

              layer.setStyle(
                getLayerStyle(
                  settlementId,
                  approximate,
                  correctSettlementSet,
                  wrongGuessLevels
                )
              );
            });

            layer.on('click', () => {
              if (interactive && settlementId && onSettlementSelect) {
                onSettlementSelect(settlementId);
              }
            });
          }}
        />
      </MapContainer>

      <div className="map-style-panel">
        <label className="map-style-label" htmlFor="map-style-select">
          סגנון מפה
        </label>
        <select
          id="map-style-select"
          className="map-style-select"
          value={mapStyle}
          onChange={(event) => onMapStyleChange(event.target.value as MapStyleId)}
        >
          {mapStyles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.name_he}
            </option>
          ))}
        </select>
      </div>

      <div className="map-legend">
        <div className="map-legend-item map-legend-item-mobile-hidden">
          <span className="map-legend-swatch available" />
          <span>יישוב לבחירה</span>
        </div>
        {(wrongGuessIds?.length ?? 0) >= 1 && (
          <div className="map-legend-item map-legend-item-mobile-hidden">
            <span className="map-legend-swatch wrong-first" />
            <span>פספוס ראשון</span>
          </div>
        )}
        {(wrongGuessIds?.length ?? 0) >= 2 && (
          <div className="map-legend-item map-legend-item-mobile-hidden">
            <span className="map-legend-swatch wrong-second" />
            <span>פספוס שני</span>
          </div>
        )}
        {(wrongGuessIds?.length ?? 0) >= 3 && (
          <div className="map-legend-item map-legend-item-mobile-hidden">
            <span className="map-legend-swatch wrong-third" />
            <span>פספוס שלישי ומעלה</span>
          </div>
        )}
        {correctSettlementSet.size > 0 && (
          <div className="map-legend-item map-legend-item-mobile-hidden">
            <span className="map-legend-swatch correct" />
            <span>יישוב שנפתר נכון</span>
          </div>
        )}
        {hasApproximateFeatures && (
          <div className="map-legend-item">
            <span className="map-legend-swatch approximate" />
            <span>אזור מקורב</span>
          </div>
        )}
      </div>

      {isLoadingBoundaries && (
        <div className="map-loading-badge">טוען גבולות מדויקים...</div>
      )}
    </div>
  );
}
