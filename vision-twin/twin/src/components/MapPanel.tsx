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
  const outside = useTwin((s) => s.telemetry?.flags.some((f) => f.code === "gps_out_of_geofence"));
  return (
    <div className="map-wrap">
      {gps ? (
        <>
          <MapContainer key={anchor} center={[gps.lat, gps.lon]} zoom={17} className="map" zoomControl={false} attributionControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
            <Circle center={[gps.lat, gps.lon]} radius={GEOFENCE_M} pathOptions={{ color: outside ? "#c2412d" : "#3a7d2c", weight: 1.5, dashArray: "4 4", fillOpacity: 0.08 }} />
            <CircleMarker center={[gps.lat, gps.lon]} radius={7} pathOptions={{ color: "#17323a", weight: 2.5, fillColor: outside ? "#c2412d" : "#7bd389", fillOpacity: 1 }} />
            <Follow lat={gps.lat} lon={gps.lon} />
          </MapContainer>
          <div className="map-caption">
            <span>{gps.lat.toFixed(5)}, {gps.lon.toFixed(5)}</span>
            <span className={outside ? "is-bad" : "is-good"}>{outside ? "Outside the 50 m geofence" : "Inside the 50 m geofence"}</span>
          </div>
        </>
      ) : (
        <div className="feed-placeholder">Waiting for a GPS fix</div>
      )}
    </div>
  );
}
