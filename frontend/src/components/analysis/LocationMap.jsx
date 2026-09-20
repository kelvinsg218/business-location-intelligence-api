import { Component, useEffect, useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MapContainer, TileLayer, Marker, Popup, Circle, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Building2, Store } from 'lucide-react';
import { humanizeType } from '../../utils/formatters.js';
import styles from './LocationMap.module.css';

function hasValidCoords(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

// Leaflet manipulates the DOM directly and can throw outside React's normal
// render path (e.g. from useEffect). Without a boundary here, an error in
// the map would unmount the entire dashboard instead of just the map card.
class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('LocationMap failed to render:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.mapCard}>
          <div className={styles.mapFallback}>
            <MapPin size={24} aria-hidden="true" />
            <p>Não foi possível carregar o mapa para esta análise.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Leaflet's default marker PNGs break under bundlers (relative asset paths).
// Custom SVG div-icons sidestep that entirely and let markers match the
// product's own icon set and brand color instead of the generic blue pin.
function buildDivIcon(Icon, { size, background, color }) {
  const html = renderToStaticMarkup(
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background,
        border: '2px solid rgba(10, 10, 13, 0.85)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.45)',
      }}
    >
      <Icon color={color} size={Math.round(size * 0.55)} strokeWidth={2.5} />
    </span>,
  );

  return L.divIcon({
    html,
    className: styles.divIcon,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function FitBounds({ center, radiusKm }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !hasValidCoords(center) || !Number.isFinite(radiusKm) || radiusKm <= 0) return;
    // L.circle(...).getBounds() requires the circle to be attached to a map
    // (it reads this._map internally) — a detached circle throws. toBounds()
    // computes the same box from the center point alone, radius in meters.
    const bounds = L.latLng(center.lat, center.lng).toBounds(radiusKm * 1000 * 2);
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, center.lat, center.lng, radiusKm]);

  return null;
}

function LocationMap({
  center, radiusKm, places, resolvedAddress,
}) {
  const centerIcon = useMemo(() => buildDivIcon(Building2, {
    size: 34, background: '#8b5cf6', color: '#ffffff',
  }), []);
  const placeIcon = useMemo(() => buildDivIcon(Store, {
    size: 26, background: '#1c1c22', color: '#e4e4e9',
  }), []);

  const validPlaces = (places || []).filter((place) => hasValidCoords(place?.location));

  if (!hasValidCoords(center)) {
    return (
      <div className={styles.mapCard}>
        <div className={styles.mapFallback}>
          <MapPin size={24} aria-hidden="true" />
          <p>Coordenadas indisponíveis para exibir o mapa desta análise.</p>
        </div>
      </div>
    );
  }

  return (
    <MapErrorBoundary>
      <div className={styles.mapCard}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          scrollWheelZoom={false}
          className={styles.map}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds center={center} radiusKm={radiusKm} />

          <Circle
            center={[center.lat, center.lng]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: '#8b5cf6', weight: 1.5, fillColor: '#8b5cf6', fillOpacity: 0.08,
            }}
          />

          <Marker position={[center.lat, center.lng]} icon={centerIcon}>
            <Popup>
              <strong>Centro da análise</strong>
              <br />
              {resolvedAddress}
            </Popup>
          </Marker>

          {validPlaces.map((place) => (
            <Marker key={place.placeId} position={[place.location.lat, place.location.lng]} icon={placeIcon}>
              <Popup>
                <strong>{place.name}</strong>
                <br />
                {humanizeType(place.primaryType)}
                <br />
                {place.address}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </MapErrorBoundary>
  );
}

export default LocationMap;
