import { useEffect, useRef, useState } from "react";
import type { Scenario, SimulationSnapshot } from "./types";

const initial: SimulationSnapshot = {
  aqi: 320, pm25: 142, pm10: 210, no2: 62, co2: 690,
  trafficEmissions: 410, factoryEmissions: 580, removedMg: 115.2,
  airPerDay: 40.8, windSpeed: 2.8, windDirectionDeg: 68,
  trafficFlowVph: 1840, localExposure: 158, dispersionIndex: 38,
  trend: [287, 301, 296, 311, 318, 320],
};

export function useCitySimulation(scenario: Scenario, totalPlants: number) {
  const [snapshot, setSnapshot] = useState(initial);
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    const instance = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
    instance.onmessage = (event: MessageEvent<SimulationSnapshot>) => setSnapshot(event.data);
    worker.current = instance;
    return () => instance.terminate();
  }, []);

  useEffect(() => {
    worker.current?.postMessage({ type: "scenario", scenario });
  }, [scenario]);

  useEffect(() => {
    worker.current?.postMessage({ type: "plants", totalPlants });
  }, [totalPlants]);

  return snapshot;
}
