import type { CityAssetKey } from "./assets/manifest";

// Every six-tile block is bounded by two-tile-wide roads. Plot footprints
// and traffic use this same map, so visual placement cannot drift from lanes.
export const ROAD_CENTERS = [4.5, 10.5, 16.5];
export const ROAD_TILES = new Set([4,5,10,11,16,17]);
export const isRoad = (col:number,row:number) => ROAD_TILES.has(Math.round(col)) || ROAD_TILES.has(Math.round(row));
export interface BuildingPlacement {
  id:string; frame:CityAssetKey; greenFrame?:CityAssetKey; col:number; row:number; scale:number;
  interactive?:boolean; tint?:number; roofOffset:[number,number];
  footprint:[number,number];
}

export const BUILDINGS:BuildingPlacement[]=[];
// Each six-tile block holds four apartment plots. The industrial bottom-right
// quadrant is the exception: there the four apartments are replaced by one
// large okhla-factory, reusing the existing bottom-right factory model. The
// named focus buildings keep their ids so the twin inspection panel resolves.
const focusIds=["residential","school","office","regulator","company"];
const FACTORY_BLOCKS=new Set(["12,0","18,0","12,6","18,6"]);
let index=0,factoryCount=0;
for(const rowStart of [0,6,12,18]) for(const colStart of [0,6,12,18]) {
  if(FACTORY_BLOCKS.has(`${colStart},${rowStart}`)){
    const isOkhla=colStart===18&&rowStart===0;
    BUILDINGS.push({id:isOkhla?"factory":`factory-${factoryCount++}`,frame:"okhla-factory",
      col:colStart+2.9,row:rowStart+2.9,scale:.68,interactive:isOkhla,roofOffset:[35,-205],footprint:[3.4,3.4]});
    continue;
  }
  // Four occupied plots per block. The front (bottom-most) plot stays put and
  // the other three are pulled toward it, closing the gap left by the smaller
  // building scale.
  const gap=.85;
  for(const dy of [0,1.8]) for(const dx of [0,1.8]) {
    const id=index<focusIds.length?focusIds[index]:`apartment-${index}`;
    BUILDINGS.push({id,frame:`apartment-${index%4}` as CityAssetKey,
      greenFrame:`green-apartment-${index%4}` as CityAssetKey,
      col:colStart+1.15+1.8-(1.8-dx)*gap,row:rowStart+1.15+1.8-(1.8-dy)*gap,scale:.49*.85,
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
