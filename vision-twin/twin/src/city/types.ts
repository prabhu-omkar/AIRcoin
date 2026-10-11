export type Scenario = "polluted" | "clean";
export type BuildingKind = "residential" | "school" | "office" | "regulator" | "company" | "factory";

export interface CityBuilding {
  id: string;
  name: string;
  role: string;
  kind: BuildingKind;
  position: [number, number, number];
  size: [number, number, number];
  plants: number;
  airPerDay: number;
  accent: string;
}

export interface SimulationSnapshot {
  aqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  co2: number;
  trafficEmissions: number;
  factoryEmissions: number;
  removedMg: number;
  airPerDay: number;
  windSpeed: number;
  windDirectionDeg: number;
  trafficFlowVph: number;
  localExposure: number;
  dispersionIndex: number;
  trend: number[];
}
