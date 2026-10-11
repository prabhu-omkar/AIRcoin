import { lazy, Suspense, useState } from "react";
import { Factory, Leaf, Trees } from "lucide-react";
import { useCitySimulation } from "./city/useCitySimulation";
import type { Scenario } from "./city/types";

const PhaserCity = lazy(() => import("./phaser/PhaserCity"));
const NOOP = () => {};
const EMPTY_PLANTS: Record<string, number> = {};

const aqiLabel = (aqi: number) =>
  aqi > 300
    ? "Severe"
    : aqi > 200
    ? "Very poor"
    : aqi > 100
    ? "Poor"
    : aqi > 50
    ? "Moderate"
    : "Good";

function MiniGraph({ values }: { values: number[] }) {
  const min = Math.min(...values),
    max = Math.max(...values);
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(1, values.length - 1)) * 100},${
          38 - ((value - min) / Math.max(1, max - min)) * 32
        }`
    )
    .join(" ");
  return (
    <svg
      className="mini-graph"
      viewBox="0 0 100 42"
      preserveAspectRatio="none"
      aria-label="AQI trend"
    >
      <defs>
        <linearGradient id="aqi-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="currentColor" stopOpacity=".36" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,42 ${points} 100,42`} fill="url(#aqi-fill)" />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function App() {
  const [scenario, setScenario] = useState<Scenario>("polluted");
  const city = useCitySimulation(scenario, 0);

  return (
    <div className={`city-app scenario-${scenario}`}>
      <main className="city-stage">
        {/* Sim City (Interactive Phaser Isometric Simulation) */}
        <Suspense
          fallback={
            <div className="scene-loading">
              <Leaf />
              <span>PAINTING DELHI…</span>
            </div>
          }
        >
          <PhaserCity
            scenario={scenario}
            selectedId={null}
            onSelect={NOOP}
            plantCounts={EMPTY_PLANTS}
            onPerformance={NOOP}
          />
        </Suspense>
        <div className="scene-vignette" />

        {/* AQI KPI Panel */}
        <section className="aqi-panel glass-panel">
          <div className="aqi-primary">
            <span>DELHI AQI · SIMULATED</span>
            <strong>{city.aqi}</strong>
            <b>{aqiLabel(city.aqi)}</b>
          </div>
          <div className="aqi-readings">
            <span>
              PM2.5 <b>{city.pm25}</b>
              <small>µg/m³</small>
            </span>
            <span>
              PM10 <b>{city.pm10}</b>
              <small>µg/m³</small>
            </span>
            <span>
              NO₂ <b>{city.no2}</b>
              <small>µg/m³</small>
            </span>
            <span>
              CO₂ <b>{city.co2}</b>
              <small>ppm</small>
            </span>
          </div>
          <MiniGraph values={city.trend} />
        </section>

        {/* Pollution Scenario Toggle */}
        <div
          className="scenario-switch floating-switch"
          role="group"
          aria-label="Pollution scenario"
        >
          <button
            className={scenario === "polluted" ? "active polluted" : ""}
            onClick={() => setScenario("polluted")}
          >
            <Factory size={15} /> Polluted Delhi
          </button>
          <button
            className={scenario === "clean" ? "active clean" : ""}
            onClick={() => setScenario("clean")}
          >
            <Trees size={15} /> AIRcoin Delhi
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
