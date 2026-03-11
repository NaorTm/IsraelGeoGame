import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { mapStyles } from '../data/mapStyles';
import type { MapStyleId, Settlement, SettlementBoundaryCollection } from '../types';
import {
  getSettlementFeature,
  hasLoadedBoundariesForSettlements,
  loadBoundaryCollectionsForSettlements,
} from '../utils/settlementBoundaries';

// Israel bounds
const ISRAEL_CENTER: [number, number] = [31.5, 35.0];
const ISRAEL_BOUNDS: L.LatLngBoundsExpression = [
  [29.3, 34.0],
  [33.5, 36.0],
];

interface GameMapProps {
  settlements: Settlement[];
  mapStyle: MapStyleId;
  onMapStyleChange: (mapStyle: MapStyleId) => void;
  revealedSettlementId?: string | null;
  wrongGuessIds?: string[];
  onSettlementSelect?: (settlementId: string) => void;
  interactive: boolean;
}

const DEFAULT_STYLE: L.PathOptions = {
  color: '#2563eb',
  weight: 1.1,
  fillColor: '#60a5fa',
  fillOpacity: 0.12,
};

const WRONG_STYLE: L.PathOptions = {
  color: '#dc2626',
  weight: 2,
  fillColor: '#f87171',
  fillOpacity: 0.38,
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
  revealedSettlementId?: string | null,
  wrongGuessIds: Set<string> = new Set()
): L.PathOptions {
  const baseStyle =
    settlementId === revealedSettlementId
      ? TARGET_STYLE
      : wrongGuessIds.has(settlementId)
        ? WRONG_STYLE
        : DEFAULT_STYLE;

  return approximate ? { ...baseStyle, ...APPROXIMATE_STYLE } : baseStyle;
}

export default function GameMap({
  settlements,
  mapStyle,
  onMapStyleChange,
  revealedSettlementId,
  wrongGuessIds,
  onSettlementSelect,
  interactive,
}: GameMapProps) {
  const [boundaryCollection, setBoundaryCollection] =
    useState<SettlementBoundaryCollection>({});
  const [isLoadingBoundaries, setIsLoadingBoundaries] = useState(() =>
    !hasLoadedBoundariesForSettlements(settlements)
  );

  const wrongGuessSet = useMemo(
    () => new Set(wrongGuessIds ?? []),
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

  const settlementNameById = useMemo(
    () =>
      new Map(
        settlements.map((settlement) => [
          settlement.id,
          `${settlement.name_he} (${settlement.name_en})`,
        ])
      ),
    [settlements]
  );

  useEffect(() => {
    let isDisposed = false;

    setIsLoadingBoundaries(!hasLoadedBoundariesForSettlements(settlements));

    void loadBoundaryCollectionsForSettlements(settlements).then((loadedBoundaries) => {
      if (isDisposed) {
        return;
      }

      setBoundaryCollection((previous) => ({
        ...previous,
        ...loadedBoundaries,
      }));
      setIsLoadingBoundaries(false);
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

  return (
    <div className="game-map-shell">
      <MapContainer
        center={ISRAEL_CENTER}
        zoom={7}
        minZoom={6}
        maxZoom={16}
        maxBounds={ISRAEL_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ height: '100%', width: '100%', borderRadius: '12px' }}
        className="game-map"
      >
        <TileLayer
          key={`${selectedMapStyle.id}:${selectedMapStyle.tileUrl}`}
          {...tileLayerProps}
        />

        <GeoJSON
          key={featureCollectionKey}
          data={featureCollection}
          style={(feature) =>
            getLayerStyle(
              feature?.properties?.settlementId ?? '',
              feature?.properties?.approximate === true,
              revealedSettlementId,
              wrongGuessSet
            )
          }
          onEachFeature={(feature, layer) => {
            const settlementId = feature.properties?.settlementId;
            const approximate = feature.properties?.approximate === true;
            const settlementName = settlementId
              ? settlementNameById.get(settlementId)
              : undefined;

            if (settlementName) {
              layer.bindTooltip(settlementName, {
                sticky: true,
                direction: 'top',
                className: 'settlement-tooltip',
                opacity: 0.96,
              });
            }

            layer.on('mouseover', () => {
              if (!interactive || !settlementId || !(layer instanceof L.Path)) {
                return;
              }

              layer.setStyle({
                ...getLayerStyle(
                  settlementId,
                  approximate,
                  revealedSettlementId,
                  wrongGuessSet
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
                  revealedSettlementId,
                  wrongGuessSet
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
        <div className="map-legend-title">מקרא</div>
        <div className="map-legend-item">
          <span className="map-legend-swatch available" />
          <span>יישוב לבחירה</span>
        </div>
        {wrongGuessSet.size > 0 && (
          <div className="map-legend-item">
            <span className="map-legend-swatch wrong" />
            <span>ניחוש שגוי</span>
          </div>
        )}
        {revealedSettlementId && (
          <div className="map-legend-item">
            <span className="map-legend-swatch correct" />
            <span>התשובה הנכונה</span>
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
