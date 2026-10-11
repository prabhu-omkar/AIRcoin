// Read-only view of the shared species catalogue.
import catalogue from "../../../contracts-schema/data/species-catalogue.json";

export interface SpeciesInfo {
  id: string;
  number: number;
  common_name: string;
  scientific_name: string;
  placement: string;
  main_targets: string;
  toxic: boolean;
}

const byId = new Map<string, SpeciesInfo>(catalogue.species.map((s) => [s.id, s as SpeciesInfo]));

export function speciesInfo(id: string): SpeciesInfo | undefined {
  return byId.get(id);
}

export function speciesName(id: string): string {
  return byId.get(id)?.common_name ?? (id === "unknown" ? "Unknown" : id);
}

export const pollutantWeights: Record<string, number> = Object.fromEntries(
  Object.entries(catalogue.pollutants).map(([k, v]) => [k, v.weight]),
);
