/// <reference lib="webworker" />

import type { Scenario, SimulationSnapshot } from "./types";

let scenario: Scenario = "polluted";
let totalPlants = 60;
let pm25 = 142;
let tickCount = 0;
const trend = [287, 301, 296, 311, 318, 320];

// Deterministic weather noise keeps recordings and demos reproducible.
function noise() {
  tickCount += 1;
  return Math.sin(tickCount * 1.731 + Math.sin(tickCount * .37)) * .5;
}

function pm25ToAqi(value: number) {
  const bands = [
    [0,30,0,50],[30,60,50,100],[60,90,100,200],
    [90,120,200,300],[120,250,300,400],[250,380,400,500],
  ];
  const band = bands.find(([lo,hi]) => value >= lo && value <= hi) ?? bands[bands.length - 1];
  const [lo,hi,aqiLo,aqiHi] = band;
  return Math.round(aqiLo + (Math.min(value,hi) - lo) / (hi - lo) * (aqiHi - aqiLo));
}

function tick() {
  const clean = scenario === "clean";
  const trafficFlowVph = Math.round(clean ? 980 : 1840);
  const trafficEmissions = Math.round(clean ? 215 : 430);
  const factoryEmissions = Math.round(clean ? 185 : 620);
  const windSpeed = Math.round((clean ? 4.1 : 2.6 + noise() * .45) * 10) / 10;
  const dispersionIndex = Math.round(Math.min(92, 24 + windSpeed * 9 + (clean ? 22 : 0)));
  const plantLocalSink = Math.min(5.5, totalPlants * .035);
  const sourceTarget = clean ? 58 : 151;
  const targetPm25 = sourceTarget - plantLocalSink + Math.max(0, 3.6 - windSpeed) * 2.2;
  // One-box urban mass balance approximation: sources raise concentration,
  // ventilation/deposition pull it toward the scenario equilibrium.
  const ventilation = .038 + windSpeed * .009;
  pm25 += (targetPm25 - pm25) * ventilation + noise() * .7;
  pm25 = Math.max(12,pm25);
  const aqi = pm25ToAqi(pm25);
  const removal = totalPlants * (scenario === "polluted" ? 1.92 : 1.24);
  trend.push(aqi);
  if (trend.length > 24) trend.shift();
  const snapshot: SimulationSnapshot = {
    aqi,
    pm25: Math.round(pm25),
    pm10: Math.round(pm25 * (clean ? 1.52 : 1.61)),
    no2: Math.round((clean ? 24 : 43) + trafficFlowVph * .011),
    co2: Math.round((clean ? 455 : 520) + trafficFlowVph * .092),
    trafficEmissions,
    factoryEmissions,
    removedMg: Math.round(removal * 10) / 10,
    airPerDay: Math.round(totalPlants * 0.68 * 10) / 10,
    windSpeed,
    windDirectionDeg: clean ? 74 : 68,
    trafficFlowVph,
    localExposure: Math.round(pm25 + (clean ? 4 : 17)),
    dispersionIndex,
    trend: [...trend],
  };
  self.postMessage(snapshot);
}

self.onmessage = (event: MessageEvent<{ type: string; scenario?: Scenario; totalPlants?: number }>) => {
  if (event.data.type === "scenario" && event.data.scenario) scenario = event.data.scenario;
  if (event.data.type === "plants" && typeof event.data.totalPlants === "number") totalPlants = event.data.totalPlants;
  tick();
};

tick();
setInterval(tick, 1000);

export {};
