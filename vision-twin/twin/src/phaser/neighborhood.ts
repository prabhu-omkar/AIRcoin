import type { CityAssetKey } from "./assets/manifest";

// Every six-tile block is bounded by two-tile-wide roads. Plot footprints
// and traffic use this same map, so visual placement cannot drift from lanes.
export const ROAD_CENTERS = [4.5, 10.5, 16.5];
export const ROAD_TILES = new Set([4,5,10,11,16,17]);
export const isRoad = (col:number,row:number) => ROAD_TILES.has(Math.round(col)) || ROAD_TILES.has(Math.round(row));
export interface BuildingPlacement {
  id:string; frame:CityAssetKey; col:number; row:number; scale:number;
  interactive?:boolean; tint?:number; roofOffset:[number,number];
  footprint:[number,number];
}

export const BUILDINGS:BuildingPlacement[]=[];
const focusIds = ["residential","school","office","regulator","company"];
let index=0;
for(const rowStart of [0,6,12,18]) for(const colStart of [0,6,12,18]) {
  if(rowStart===0 && colStart===18){
    BUILDINGS.push({id:"factory",frame:"okhla-factory",col:20.9,row:2.9,scale:.68,interactive:true,roofOffset:[35,-205],footprint:[3.4,3.4]});
    continue;
  }
  // Four occupied plots per block. Two-tile footprint anchors are their
  // front corners, inset from the kerb by 0.35 tiles.
  for(const dy of [0,1.8]) for(const dx of [0,1.8]) {
    const id=index<focusIds.length?focusIds[index]:`apartment-${index}`;
    BUILDINGS.push({id,frame:`apartment-${index%4}` as CityAssetKey,
      col:colStart+1.15+dx,row:rowStart+1.15+dy,scale:.49,
      interactive:index<focusIds.length,roofOffset:[0,-175],footprint:[1.5,1.5]});
    index++;
  }
}
export const INTERACTIVE_IDS=new Set(BUILDINGS.filter(b=>b.interactive).map(b=>b.id));

export function validateBuildingPlots(){
  for(const b of BUILDINGS){
    for(let c=b.col-b.footprint[0]+.5;c<=b.col+.001;c+=.2)
      for(let r=b.row-b.footprint[1]+.5;r<=b.row+.001;r+=.2)
        if(isRoad(c,r))throw new Error(`Building ${b.id} occupies a road at ${c},${r}`);
  }
}
