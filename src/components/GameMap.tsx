import { useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default icon issue with Leaflet + bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const guessIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'guess-marker',
});

const correctIcon = new L.DivIcon({
  className: 'correct-marker-icon',
  html: `<div style="
    background: #22c55e;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Israel bounds
const ISRAEL_CENTER: [number, number] = [31.5, 35.0];
const ISRAEL_BOUNDS: L.LatLngBoundsExpression = [
  [29.3, 34.0],
  [33.5, 36.0],
];

interface GameMapProps {
  onMapClick?: (lat: number, lng: number) => void;
  guessPosition?: [number, number] | null;
  correctPosition?: [number, number] | null;
  interactive: boolean;
}

function ClickHandler({
  onClick,
}: {
  onClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitBounds({
  guess,
  correct,
}: {
  guess: [number, number] | null;
  correct: [number, number] | null;
}) {
  const map = useMap();

  if (guess && correct) {
    const bounds = L.latLngBounds([guess, correct]);
    setTimeout(() => {
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 12 });
    }, 100);
  }

  return null;
}

export default function GameMap({
  onMapClick,
  guessPosition,
  correctPosition,
  interactive,
}: GameMapProps) {
  const handleClick = useCallback(
    (lat: number, lng: number) => {
      if (interactive && onMapClick) {
        onMapClick(lat, lng);
      }
    },
    [interactive, onMapClick]
  );

  return (
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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {interactive && <ClickHandler onClick={handleClick} />}

      {guessPosition && (
        <Marker position={guessPosition} icon={guessIcon} />
      )}

      {correctPosition && (
        <Marker position={correctPosition} icon={correctIcon} />
      )}

      {guessPosition && correctPosition && (
        <>
          <Polyline
            positions={[guessPosition, correctPosition]}
            color="#ef4444"
            weight={3}
            dashArray="8, 8"
            opacity={0.8}
          />
          <FitBounds guess={guessPosition} correct={correctPosition} />
        </>
      )}
    </MapContainer>
  );
}
