import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import { useTwin } from "../store";

const GEOFENCE_M = 50;

function Follow({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([lat, lon], { animate: true });
  }, [map, lat, lon]);
  return null;
}

/** GPS pin with the 50 m anti-cheat geofence. Tiles need internet; the pin works without. */
export function MapPanel() {
  const gps = useTwin((s) => s.telemetry?.gps);
  const anchor = useTwin((s) => s.telemetry?.miner_id); // re-centre once per miner
  return (
    <section className="panel fill map-panel" style={{ flex: "0 0 180px" }}>
      <h2>Location</h2>
      <div className="body">
        {gps ? (
          <MapContainer key={anchor} center={[gps.lat, gps.lon]} zoom={17} className="map" zoomControl={false} attributionControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
            <Circle center={[gps.lat, gps.lon]} radius={GEOFENCE_M} pathOptions={{ color: "#a6d17e", weight: 1, dashArray: "3 3", fillOpacity: 0.06 }} />
            <CircleMarker center={[gps.lat, gps.lon]} radius={7} pathOptions={{ color: "#11140f", weight: 2, fillColor: "#a6d17e", fillOpacity: 1 }} />
            <Follow lat={gps.lat} lon={gps.lon} />
          </MapContainer>
        ) : (
          <div className="feed-placeholder">Waiting for GPS…</div>
        )}
      </div>
    </section>
  );
}
