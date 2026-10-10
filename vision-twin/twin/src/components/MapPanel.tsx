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
    <div className="panel fill" style={{ flex: "0 0 190px" }}>
      <h2>Location<span className="right hint">{gps ? `${gps.fix} · ${gps.satellites ?? "?"} sats` : "no fix"}</span></h2>
      <div className="body">
        {gps ? (
          <MapContainer key={anchor} center={[gps.lat, gps.lon]} zoom={17} className="map" zoomControl={false} attributionControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
            <Circle center={[gps.lat, gps.lon]} radius={GEOFENCE_M} pathOptions={{ color: "#3ddc84", weight: 1, fillOpacity: 0.08 }} />
            <CircleMarker center={[gps.lat, gps.lon]} radius={7} pathOptions={{ color: "#062312", weight: 2, fillColor: "#3ddc84", fillOpacity: 1 }} />
            <Follow lat={gps.lat} lon={gps.lon} />
          </MapContainer>
        ) : (
          <div className="feed-placeholder">Waiting for GPS…</div>
        )}
      </div>
    </div>
  );
}
