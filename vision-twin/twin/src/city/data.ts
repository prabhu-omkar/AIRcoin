import type { CityBuilding } from "./types";

export const FOCUS_BUILDINGS: CityBuilding[] = [
  { id: "residential", name: "Lajpat Residency", role: "Residential plant miner", kind: "residential", position: [-7.5, 1.9, 4.8], size: [4.1, 3.8, 3.6], plants: 12, airPerDay: 8, accent: "#7ee787" },
  { id: "school", name: "Delhi Green School", role: "School plant miner", kind: "school", position: [-2.5, 1.5, 6.2], size: [4.2, 3, 3.5], plants: 20, airPerDay: 15, accent: "#8df59f" },
  { id: "office", name: "Nehru Place Office", role: "Office plant miner", kind: "office", position: [3, 2.5, 5.1], size: [4.2, 5, 3.8], plants: 18, airPerDay: 12, accent: "#69e18c" },
  { id: "regulator", name: "Pollution Control Board", role: "Regulator", kind: "regulator", position: [8, 2.15, 3.6], size: [4.3, 4.3, 3.8], plants: 6, airPerDay: 3, accent: "#67b7ff" },
  { id: "company", name: "Yamuna Industries", role: "Company · buys and burns AIR", kind: "company", position: [8.2, 2.7, -4.4], size: [4.5, 5.4, 4], plants: 4, airPerDay: 2, accent: "#be8cff" },
  { id: "factory", name: "Okhla Industrial Area", role: "Emission source", kind: "factory", position: [-8.2, 1.8, -5], size: [5, 3.6, 4], plants: 0, airPerDay: 0, accent: "#ff7c62" },
];

