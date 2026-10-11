import type { Scenario } from "../city/types";

export type CityPerformance = { fps: number; objects: number; drawMode: "WEBGL" | "CANVAS" };

export const cityEvents = new EventTarget();

export function emitScenario(scenario: Scenario) {
  cityEvents.dispatchEvent(new CustomEvent("scenario", { detail: scenario }));
}

export function emitPlants(counts: Record<string, number>) {
  cityEvents.dispatchEvent(new CustomEvent("plants", { detail: counts }));
}

export function emitExternalSelection(id: string | null) {
  cityEvents.dispatchEvent(new CustomEvent("selection", { detail: id }));
}

export function emitBuildingSelected(id: string | null) {
  cityEvents.dispatchEvent(new CustomEvent("building-selected", { detail: id }));
}

export function emitPerformance(performance: CityPerformance) {
  cityEvents.dispatchEvent(new CustomEvent("performance", { detail: performance }));
}

