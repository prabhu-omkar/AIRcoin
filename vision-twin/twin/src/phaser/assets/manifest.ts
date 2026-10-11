export type CityAssetKey = "apartment-0"|"apartment-1"|"apartment-2"|"apartment-3"|"okhla-factory"|"metro-real"|"auto-se"|"hatchback"|"delhi-bus"|"auto-nw"|"car-nw"|"bus-nw"|"neem"|"vendor-cart"|"chai-stall";
// Apartments and train: user-supplied artwork, transparent extraction via
// built-in ImageGen. Rear traffic: generated specifically for AIRcoin.
export const CITY_ASSETS = [
  ...[0,1,2,3].map(i=>({key:`apartment-${i}`,source:"art/source/empty-apartments.png",footprint:[1.5,1.5],anchor:[.5,1],provenance:"User Delhi-Style Apartment Isometric Asset Sheet; transparent extraction"})),
  {key:"metro-real",source:"art/source/metro-real.png",anchor:[.5,.61],provenance:"User Delhi Metro Train in Isometric View; transparent extraction"},
  {key:"okhla-factory",source:"art/source/okhla-factory-v2.png",footprint:[3.4,3.4],anchor:[.5,1],provenance:"AIRcoin generated art"},
  ...["auto-nw","car-nw","bus-nw"].map(key=>({key,source:"art/source/traffic-rear.png",anchor:[.5,.76],provenance:"AIRcoin generated northwest rear views; reflected for northeast"})),
  ...["auto-se","hatchback","delhi-bus"].map(key=>({key,source:"art/source/traffic-sheet-delhi-v2.png",anchor:[.5,.76],provenance:"AIRcoin generated southeast front views; reflected for southwest"})),
];
export const CITY_ATLAS_IMAGE="/assets/city/delhi-atlas.webp";
export const CITY_ATLAS_JSON="/assets/city/delhi-atlas.json";
