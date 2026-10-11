import Phaser from "phaser";
import type { Scenario } from "../city/types";
import { CITY_ATLAS_IMAGE, CITY_ATLAS_JSON, type CityAssetKey } from "./assets/manifest";
import { BUILDINGS, ROAD_CENTERS, ROAD_TILES, validateBuildingPlots, type BuildingPlacement } from "./neighborhood";
import { cityEvents, emitBuildingSelected, emitPerformance } from "./cityEvents";
import { MAP_SIZE, TILE_HEIGHT, TILE_MAX, TILE_MIN, TILE_STEP, TILE_WIDTH, WORLD_ORIGIN_X, WORLD_ORIGIN_Y, depthFor, gridToWorld, worldToGrid } from "./isometric";

const TILE_OFFSETS:Array<[number,number]>=[];
for(const ox of [-TILE_STEP,0,TILE_STEP])for(const oy of [-TILE_STEP,0,TILE_STEP])TILE_OFFSETS.push([ox,oy]);

type TrafficRoute = {
  startX:number; startY:number; endX:number; endY:number;
  ux:number; uy:number; length:number; stopProgress:number;
  depthStart:number; depthEnd:number; horizontal:boolean; reverse:boolean; stops:number[];
};

type Vehicle = {
  sprite:Phaser.GameObjects.Image;
  routeIndex:number; progress:number; speed:number; desiredSpeed:number;
  emissionRate:number;
};

type PollutionPuff = {
  sprite:Phaser.GameObjects.Image;
  age:number; lifetime:number; sourceIndex:number;
};

type Earning = {
  sprite:Phaser.GameObjects.Text;
  age:number; lifetime:number;
  x0:number; y0:number; drift:number;
};

const EARNING_STYLE:Phaser.Types.GameObjects.Text.TextStyle={fontFamily:"Segoe UI, sans-serif",fontSize:"24px",fontStyle:"bold",color:"#ffe08a",stroke:"#7a4b00",strokeThickness:4};

const ROAD_ROWS = ROAD_TILES;
const ROAD_COLS = ROAD_TILES;
const seeded=(i:number,salt=1)=>{const value=Math.sin(i*127.1+salt*311.7)*43758.5453;return value-Math.floor(value);};

export class DelhiScene extends Phaser.Scene {
  private scenario:Scenario="polluted";
  private buildings=new Map<string,Phaser.GameObjects.Image>();
  private allApartments:Array<{image:Phaser.GameObjects.Image;placement:BuildingPlacement}>=[];
  private plants=new Map<string,Phaser.GameObjects.Image[]>();
  private vehicles:Vehicle[]=[];
  private routes:TrafficRoute[]=[];
  private trees:Phaser.GameObjects.Image[]=[];
  private streetProps:Phaser.GameObjects.Image[]=[];
  private pollution:PollutionPuff[]=[];
  private exhaust:PollutionPuff[]=[];
  private smog:Phaser.GameObjects.Image[]=[];
  private coins:Earning[]=[];
  private earningSources:Phaser.GameObjects.Image[]=[];
  private selection?:Phaser.GameObjects.Graphics;
  private tileHover?:Phaser.GameObjects.Graphics;
  private metroRuns:Array<{sprite:Phaser.GameObjects.Image;start:{x:number;y:number};end:{x:number;y:number};progress:number;ox:number;oy:number}>=[]; 
  private stackSources:Array<{x:number;y:number}>=[];
  private dragging=false;
  private dragged=false;
  private lastPointerX=0;
  private lastPointerY=0;
  private lastPerf=0;
  private smokeStrength=1;
  private lowFpsSamples=0;
  private highFpsSamples=0;
  private reducedDetail=false;
  private reducedMotion=false;
  private trafficClock=0;
  private signalHorizontalGreen=true;
  private signalAllRed=false;
  private scenarioHandler=(event:Event)=>this.applyScenario((event as CustomEvent<Scenario>).detail);
  private plantsHandler=(event:Event)=>this.syncPlants((event as CustomEvent<Record<string,number>>).detail);
  private selectionHandler=(event:Event)=>this.selectBuilding((event as CustomEvent<string|null>).detail,true);
  private motionHandler=(event:Event)=>{this.reducedMotion=(event as CustomEvent<boolean>).detail;};

  constructor(){super("DelhiScene");}

  preload(){this.load.atlas("delhi-city",CITY_ATLAS_IMAGE,CITY_ATLAS_JSON);}

  create(){
    validateBuildingPlots();
    this.createProceduralTextures();
    this.drawGroundLayer();
    this.createStreetLife();
    this.createTrees();
    this.createBuildings();
    this.createEarnings();
    this.createTraffic();
    this.createMetro();
    this.createPollution();
    this.createSmog();
    this.createDistrictLabels();
    this.tileHover=this.add.graphics().setDepth(-1000000);
    this.configureCamera();
    this.configureInput();
    this.reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cityEvents.addEventListener("scenario",this.scenarioHandler);
    cityEvents.addEventListener("plants",this.plantsHandler);
    cityEvents.addEventListener("selection",this.selectionHandler);
    cityEvents.addEventListener("motion",this.motionHandler);
    cityEvents.dispatchEvent(new CustomEvent("scene-ready"));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      cityEvents.removeEventListener("scenario",this.scenarioHandler);
      cityEvents.removeEventListener("plants",this.plantsHandler);
      cityEvents.removeEventListener("selection",this.selectionHandler);
      cityEvents.removeEventListener("motion",this.motionHandler);
    });
  }

  private diamond(g:Phaser.GameObjects.Graphics,x:number,y:number,color:number,stroke=0x536b68){
    g.fillStyle(color,1);g.lineStyle(1,stroke,.58);g.beginPath();
    g.moveTo(x,y-TILE_HEIGHT/2);g.lineTo(x+TILE_WIDTH/2,y);g.lineTo(x,y+TILE_HEIGHT/2);g.lineTo(x-TILE_WIDTH/2,y);g.closePath();g.fillPath();g.strokePath();
  }

  private drawGroundLayer(){
    const g=this.add.graphics().setDepth(-2000000);
    for(const [ox,oy] of TILE_OFFSETS){
      for(let row=0;row<MAP_SIZE;row++) for(let col=0;col<MAP_SIZE;col++){
        const p=gridToWorld(col+ox,row+oy);const road=ROAD_ROWS.has(row)||ROAD_COLS.has(col);
        this.diamond(g,p.x,p.y,road?0x303d47:0xada697,road?0x46535d:0x9e9789);
        if(road&&!((ROAD_ROWS.has(row)&&ROAD_COLS.has(col)))){
          g.lineStyle(3,0xe3cc72,.72);
          if(ROAD_ROWS.has(row)&&col%2===0)g.lineBetween(p.x-11,p.y-5,p.x+11,p.y+5);
          if(ROAD_COLS.has(col)&&row%2===0)g.lineBetween(p.x+11,p.y-5,p.x-11,p.y+5);
        }
      }
      for(const c of ROAD_CENTERS)for(const r of ROAD_CENTERS){
        const junction=gridToWorld(c+ox,r+oy);g.lineStyle(5,0xf2eee0,.72);
        for(let i=-3;i<=3;i++){
          g.lineBetween(junction.x-90+i*8,junction.y-51+i*4,junction.x-62+i*8,junction.y-37+i*4);
          g.lineBetween(junction.x+90+i*8,junction.y-51-i*4,junction.x+62+i*8,junction.y-37-i*4);
        }
      }
      const a=gridToWorld(-1+ox,-.8+oy),b=gridToWorld(22+ox,-.8+oy);
      g.lineStyle(19,0x5e6d77,1);g.lineBetween(a.x,a.y-50,b.x,b.y-50);
      g.lineStyle(3,0xdbe4e5,.92);g.lineBetween(a.x,a.y-56,b.x,b.y-56);g.lineBetween(a.x,a.y-44,b.x,b.y-44);
      for(let i=0;i<11;i++){const t=i/10,x=Phaser.Math.Linear(a.x,b.x,t),y=Phaser.Math.Linear(a.y,b.y,t);g.lineStyle(5,0x53616a,1);g.lineBetween(x,y-44,x,y+25);}
    }
  }

  private createProceduralTextures(){
    const g=this.make.graphics({x:0,y:0});
    if(!this.textures.exists("plant-pot")){
      g.fillStyle(0xb65d34);g.fillTriangle(5,9,21,9,18,24);g.fillTriangle(5,9,18,24,8,24);g.fillStyle(0x3a9a55);g.fillTriangle(13,12,2,3,9,16);g.fillTriangle(13,12,13,0,17,16);g.fillTriangle(14,13,25,4,18,17);g.generateTexture("plant-pot",27,26);
      g.clear();g.fillStyle(0xffffff,.72);g.fillCircle(24,25,19);g.fillStyle(0xffffff,.42);g.fillCircle(41,16,13);g.fillCircle(13,13,10);g.generateTexture("smoke",58,49);
      g.clear();g.fillStyle(0x56616a,.5);g.fillCircle(8,8,7);g.fillStyle(0x7b8388,.32);g.fillCircle(15,6,5);g.generateTexture("exhaust",22,17);
    }
    g.destroy();
  }

  private createStreetLife(){
    const items:Array<[CityAssetKey,number,number,number]>=[
      ["vendor-cart",3.2,2.9,.16],["chai-stall",9.2,8.9,.16],
      ["vendor-cart",15.2,14.9,.16],["chai-stall",21.2,20.9,.16],
    ];
    for(const [ox,oy] of TILE_OFFSETS)for(const [frame,col,row,scale] of items){const p=gridToWorld(col+ox,row+oy);const prop=this.add.image(p.x,p.y,"delhi-city",frame).setOrigin(.5,.94).setScale(scale).setDepth(depthFor(col+ox,row+oy,52));this.streetProps.push(prop);}
  }

  private createTrees(){
    for(const [ox,oy] of TILE_OFFSETS)for(let i=0;i<32;i++){
      const col=(i%4)*6+3.25,row=Math.floor(i/8)*6+(i%2?3.1:1.3);
      if(col>18&&row<4)continue;
      const p=gridToWorld(col+ox,row+oy);const tree=this.add.image(p.x,p.y,"delhi-city","neem").setOrigin(.5,.94).setScale(.17+seeded(i,8)*.04).setDepth(depthFor(col+ox,row+oy,42));
      if(this.scenario==="polluted")tree.setTint(0xc0c9ad);this.trees.push(tree);
    }
  }

  private createBuildings(){
    this.allApartments=[];
    for(const [ox,oy] of TILE_OFFSETS){
      const isCenter=ox===0&&oy===0;
      for(const placement of BUILDINGS){
        const col=placement.col+ox,row=placement.row+oy;
        const p=gridToWorld(col,row);
        const image=this.add.image(p.x,p.y,"delhi-city",placement.frame).setOrigin(.5,1).setScale(placement.scale).setDepth(depthFor(col,row,30)).setAngle(placement.frame==="okhla-factory"?-5:2.5);
        if(placement.tint)image.setTint(placement.tint);
        // Track ALL apartment images (all tiles) for scenario-wide texture swap
        if(placement.greenFrame)this.allApartments.push({image,placement});
        if(!isCenter)continue;
        image.setData("id",placement.id);this.buildings.set(placement.id,image);
        if(placement.interactive){
          image.setInteractive({pixelPerfect:true,alphaTolerance:6,useHandCursor:true});
          image.on("pointerover",()=>{if(image.getData("selected")!==true)image.setTint(0xe6ffe8);});
          image.on("pointerout",()=>{if(image.getData("selected")!==true){image.clearTint();if(placement.tint)image.setTint(placement.tint);}});
          image.on("pointerup",()=>{if(!this.dragged){this.selectBuilding(placement.id,false);emitBuildingSelected(placement.id);}});
        }
      }
    }
  }

  private makeRoute(startCol:number,startRow:number,endCol:number,endRow:number,horizontal:boolean,ox=0,oy=0):TrafficRoute{
    const start=gridToWorld(startCol+ox,startRow+oy),end=gridToWorld(endCol+ox,endRow+oy);const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
    const stopProgress=horizontal?(9.15-startCol)/(endCol-startCol):(9.15-startRow)/(endRow-startRow);
    const reverse=horizontal?endCol<startCol:endRow<startRow;
    const origin=horizontal?startCol:startRow, span=horizontal?endCol-startCol:endRow-startRow;
    const stops=ROAD_CENTERS.map(center=>(center+(reverse?1.5:-1.5)-origin)/span).sort((a,b)=>a-b);
    return {startX:start.x,startY:start.y,endX:end.x,endY:end.y,ux:dx/length,uy:dy/length,length,stopProgress,depthStart:depthFor(startCol+ox,startRow+oy,68),depthEnd:depthFor(endCol+ox,endRow+oy,68),horizontal,reverse,stops};
  }

  private createTraffic(){
    this.routes=[];
    let globalIndex=0;
    for(const [ox,oy] of TILE_OFFSETS){
      const isCenter=ox===0&&oy===0;
      const routes=ROAD_CENTERS.flatMap(center=>[
        this.makeRoute(-.4,center-.48,21.4,center-.48,true,ox,oy),
        this.makeRoute(21.4,center+.48,-.4,center+.48,true,ox,oy),
        this.makeRoute(center+.48,-.4,center+.48,21.4,false,ox,oy),
        this.makeRoute(center-.48,21.4,center-.48,-.4,false,ox,oy),
      ]);
      const count=isCenter?5:3;
      for(const route of routes){
        const routeIndex=this.routes.push(route)-1;
        for(let i=0;i<count;i++,globalIndex++){
          const isBus=globalIndex%11===0,isAuto=!isBus&&globalIndex%3!==0;
          const frame:CityAssetKey=route.reverse?(isBus?"bus-nw":isAuto?"auto-nw":"car-nw"):(isBus?"delhi-bus":isAuto?"auto-se":"hatchback");
          const progress=(i/count+seeded(globalIndex,22)*.035)%1;
          const sprite=this.add.image(Phaser.Math.Linear(route.startX,route.endX,progress),Phaser.Math.Linear(route.startY,route.endY,progress),"delhi-city",frame).setOrigin(.5,.76);
          sprite.setDisplaySize(isBus?84.5:isAuto?45.5:58.5,(isBus?84.5:isAuto?45.5:58.5)*sprite.height/sprite.width).setFlipX(!route.horizontal).setAngle(route.endY<route.startY?5:-5);
          const desiredSpeed=isBus?54:66+seeded(globalIndex,30)*24;
          this.vehicles.push({sprite,routeIndex,progress,speed:desiredSpeed*.7,desiredSpeed,emissionRate:isBus?2.8:isAuto?.65:1.2});
        }
      }
    }
  }

  private createEarnings(){
    this.earningSources=[...this.buildings.values()];
    for(let i=0;i<54;i++){
      const sprite=this.add.text(0,0,"₹",EARNING_STYLE).setOrigin(.5,.5).setDepth(8900+i);
      const coin:Earning={sprite,age:seeded(i,91)*1600,lifetime:1400+seeded(i,92)*700,x0:0,y0:0,drift:0};
      this.coins.push(coin);this.placeCoin(coin);
      const phase=coin.age/coin.lifetime;
      sprite.setPosition(coin.x0+coin.drift*phase,coin.y0-phase*78).setAlpha(phase<.12?phase/.12:Math.min(1,(1-phase)/.4)).setScale(.65+phase*.55);
    }
  }

  private placeCoin(coin:Earning){
    if(!this.earningSources.length)return;
    const src=this.earningSources[Math.floor(Math.random()*this.earningSources.length)];
    coin.x0=src.x+(Math.random()*2-1)*src.displayWidth*.34;
    coin.y0=src.y-src.displayHeight*.86;
    coin.drift=(Math.random()*2-1)*26;
  }

  private updateEarnings(delta:number){
    if(!this.coins.length||!this.earningSources.length)return;
    const motion=this.reducedMotion?.4:1;
    for(const coin of this.coins){
      coin.age+=delta*motion;
      if(coin.age>=coin.lifetime){coin.age=0;coin.lifetime=1400+Math.random()*700;this.placeCoin(coin);}
      const phase=coin.age/coin.lifetime;
      coin.sprite.setPosition(coin.x0+coin.drift*phase,coin.y0-phase*78);
      coin.sprite.setAlpha(phase<.12?phase/.12:Math.min(1,(1-phase)/.4));
      coin.sprite.setScale(.65+phase*.55);
    }
  }

  private createMetro(){
    const frame=this.textures.getFrame("delhi-city","metro-real");
    for(const [ox,oy] of TILE_OFFSETS){
      const start=gridToWorld(-1+ox,-.8+oy),end=gridToWorld(22+ox,-.8+oy);
      const sprite=this.add.image(start.x,start.y-50,"delhi-city","metro-real").setOrigin(.5,.61).setDisplaySize(390,390*frame.height/frame.width).setAngle(-3).setDepth(150);
      this.metroRuns.push({sprite,start,end,progress:.22,ox,oy});
    }
  }

  private createPollution(){
    const factories=BUILDINGS.filter((b)=>b.frame==="okhla-factory");
    this.stackSources=factories.flatMap((f)=>TILE_OFFSETS.flatMap(([ox,oy])=>{const p=gridToWorld(f.col+ox,f.row+oy);return [{x:p.x-25,y:p.y-220},{x:p.x+26,y:p.y-235},{x:p.x+67,y:p.y-207}];}));
    const stacks=this.stackSources.length,perStack=10;
    for(let i=0;i<stacks*perStack;i++){const source=this.stackSources[i%stacks],sprite=this.add.image(source.x,source.y,"smoke").setDepth(7000+i).setBlendMode(Phaser.BlendModes.NORMAL);this.pollution.push({sprite,age:seeded(i,12)*5200,lifetime:5200+seeded(i,13)*3200,sourceIndex:i%stacks});}
    for(let i=0;i<18;i++){const sprite=this.add.image(0,0,"exhaust").setDepth(4500+i).setBlendMode(Phaser.BlendModes.MULTIPLY);this.exhaust.push({sprite,age:seeded(i,42)*1800,lifetime:900+seeded(i,43)*1000,sourceIndex:i%this.vehicles.length});}
  }

  private createSmog(){
    if(!this.textures.exists("smog")){const g=this.make.graphics({x:0,y:0});for(let i=18;i>0;i--){g.fillStyle(0xffffff,.06);g.fillCircle(90,90,i*5);}g.generateTexture("smog",180,180);g.destroy();}
    const b=this.cityBounds();
    for(let i=0;i<180;i++){
      const x=b.x+seeded(i,71)*b.width,y=b.y+seeded(i,72)*b.height;
      const sprite=this.add.image(x,y,"smog").setDepth(8700+i).setBlendMode(Phaser.BlendModes.NORMAL).setScale(3.5+seeded(i,73)*5).setTint(0xb1a291).setAlpha(.3+seeded(i,75)*.3);
      this.smog.push(sprite);
    }
  }

  private updateSmog(delta:number,time:number){
    if(this.scenario!=="polluted"||!this.smog.length)return;
    const b=this.cityBounds(),motion=this.reducedMotion?.25:1,wind=(16+Math.sin(time*.00035)*10)*motion*delta/1000;
    for(let i=0;i<this.smog.length;i++){const s=this.smog[i];s.x+=wind*(.6+seeded(i,74)*.9);s.y+=Math.sin(time*.0004+i)*motion*delta*.012;if(s.x>b.x+b.width+260)s.x=b.x-260;}
  }

  private createDistrictLabels(){
    const style:Phaser.Types.GameObjects.Text.TextStyle={fontFamily:"JetBrains Mono, monospace",fontSize:"11px",fontStyle:"bold",color:"#f7fbff",backgroundColor:"#09243bdd",padding:{x:7,y:4},stroke:"#09243b",strokeThickness:1};
    const labels:Array<[string,number,number,number]>=[["OKHLA INDUSTRIAL",20.9,2.9,-300],["LAJPAT RESIDENTIAL",2,18,-220]];
    for(const [ox,oy] of TILE_OFFSETS)labels.forEach(([label,col,row,dy])=>{const p=gridToWorld(col+ox,row+oy);this.add.text(p.x,p.y+dy,label,style).setOrigin(.5).setDepth(9200);});
  }

  private cityBounds(){
    const x=WORLD_ORIGIN_X+(TILE_MIN-TILE_MAX)*TILE_WIDTH/2;
    const y=WORLD_ORIGIN_Y+(TILE_MIN+TILE_MIN)*TILE_HEIGHT/2;
    const width=(TILE_MAX-TILE_MIN)*TILE_WIDTH,height=(TILE_MAX-TILE_MIN)*TILE_HEIGHT;
    return {x,y,width,height};
  }

  private configureCamera(){const cam=this.cameras.main;const b=this.cityBounds();cam.setBounds(b.x,b.y,b.width,b.height).setZoom(.7).centerOn(WORLD_ORIGIN_X,WORLD_ORIGIN_Y+(TILE_MIN+TILE_MAX)*TILE_HEIGHT/2);cam.roundPixels=true;}

  private minZoom(){const cam=this.cameras.main,b=this.cityBounds();return Math.max(cam.width/b.width,cam.height/b.height)*1.72;}

  // Keep the viewport from leaving the outermost ring of tiles: the camera
  // bounds are the outer tiles' edge and Phaser clamps scrolling to them, so
  // the only empty background is the dark, road-coloured corner outside the city.
  private clampCameraToCity(){const cam=this.cameras.main;const min=this.minZoom();if(cam.zoom<min)cam.setZoom(min);}

  private configureInput(){
    this.input.on("pointerdown",(pointer:Phaser.Input.Pointer)=>{if(pointer.leftButtonDown()){this.dragging=true;this.dragged=false;this.lastPointerX=pointer.x;this.lastPointerY=pointer.y;}});
    this.input.on("pointermove",(pointer:Phaser.Input.Pointer)=>{
      if(this.dragging&&pointer.isDown){const dx=pointer.x-this.lastPointerX,dy=pointer.y-this.lastPointerY;if(Math.abs(dx)+Math.abs(dy)>2)this.dragged=true;const cam=this.cameras.main;cam.scrollX-=dx/cam.zoom;cam.scrollY-=dy/cam.zoom;this.lastPointerX=pointer.x;this.lastPointerY=pointer.y;this.tileHover?.setVisible(false);return;}
      const world=this.cameras.main.getWorldPoint(pointer.x,pointer.y);const tile=worldToGrid(world.x,world.y);this.tileHover?.clear();
      if(tile.col>=TILE_MIN&&tile.col<=TILE_MAX&&tile.row>=TILE_MIN&&tile.row<=TILE_MAX&&((tile.col%TILE_STEP)+TILE_STEP)%TILE_STEP<MAP_SIZE&&((tile.row%TILE_STEP)+TILE_STEP)%TILE_STEP<MAP_SIZE){const p=gridToWorld(tile.col,tile.row);this.tileHover?.setVisible(true).lineStyle(2,0x9af06d,.7).beginPath().moveTo(p.x,p.y-TILE_HEIGHT/2).lineTo(p.x+TILE_WIDTH/2,p.y).lineTo(p.x,p.y+TILE_HEIGHT/2).lineTo(p.x-TILE_WIDTH/2,p.y).closePath().strokePath();}else this.tileHover?.setVisible(false);
    });
    this.input.on("pointerup",()=>{this.dragging=false;});
    this.input.on("wheel",(pointer:Phaser.Input.Pointer,_objects:unknown,_dx:number,dy:number)=>{const cam=this.cameras.main;const before=cam.getWorldPoint(pointer.x,pointer.y);cam.setZoom(Phaser.Math.Clamp(cam.zoom-dy*.0012,this.minZoom(),1.28));const after=cam.getWorldPoint(pointer.x,pointer.y);cam.scrollX+=before.x-after.x;cam.scrollY+=before.y-after.y;});
  }

  private applyScenario(scenario:Scenario){
    if(!scenario||scenario===this.scenario)return;this.scenario=scenario;this.smokeStrength=scenario==="polluted"?1:.2;
    this.cameras.main.setBackgroundColor(0x303d47);this.trees.forEach((tree)=>scenario==="polluted"?tree.setTint(0xc0c9ad):tree.clearTint());this.smog.forEach((s)=>s.setVisible(scenario==="polluted"));
    // Swap ALL apartment images across every tiled copy of the city
    const isClean=scenario==="clean";
    for(const {image,placement} of this.allApartments){
      image.setTexture("delhi-city",isClean&&placement.greenFrame?placement.greenFrame:placement.frame);
      if(isClean)image.clearTint();
      else if(placement.tint)image.setTint(placement.tint);
    }
  }

  private selectBuilding(id:string|null,focus:boolean){
    this.buildings.forEach((image,key)=>{image.setData("selected",key===id);if(key!==id){image.clearTint();const placement=BUILDINGS.find((b)=>b.id===key);if(placement?.tint)image.setTint(placement.tint);}});
    this.selection?.destroy();this.selection=undefined;if(!id)return;const placement=BUILDINGS.find((b)=>b.id===id),image=this.buildings.get(id);if(!placement||!image)return;
    image.setTint(0xcfffd7);const p=gridToWorld(placement.col,placement.row);const ring=this.add.graphics().setDepth(depthFor(placement.col,placement.row,2));ring.lineStyle(4,0x9af06d,.95);ring.beginPath().moveTo(p.x,p.y-47).lineTo(p.x+94,p.y).lineTo(p.x,p.y+47).lineTo(p.x-94,p.y).closePath().strokePath();this.selection=ring;
    if(focus){this.cameras.main.pan(p.x,p.y-100,650,"Sine.easeInOut");this.cameras.main.zoomTo(.92,650,"Sine.easeInOut");}
  }

  private syncPlants(counts:Record<string,number>){
    if(!counts)return;for(const placement of BUILDINGS){const count=counts[placement.id];if(typeof count!=="number")continue;const target=Math.ceil(count/4),existing=this.plants.get(placement.id)??[],image=this.buildings.get(placement.id);if(!image)continue;
      while(existing.length<target){const index=existing.length,pot=this.add.image(image.x+placement.roofOffset[0]+(index%4)*18-30,image.y+placement.roofOffset[1]+Math.floor(index/4)*13,"plant-pot").setDepth(image.depth+2).setScale(0);existing.push(pot);this.tweens.add({targets:pot,scale:.72,duration:520,ease:"Back.easeOut",delay:index*35});}
      while(existing.length>target)existing.pop()?.destroy();this.plants.set(placement.id,existing);
    }
    const earning=[...this.plants.entries()].filter(([,list])=>list.length>0).map(([id])=>this.buildings.get(id)).filter((image):image is Phaser.GameObjects.Image=>!!image);
    if(earning.length)this.earningSources=earning;
  }

  private updateSignals(time:number){const phase=(time/1000)%24;this.signalHorizontalGreen=phase<10;this.signalAllRed=(phase>=10&&phase<12)||phase>=22;}

  private updateTraffic(delta:number){
    const dt=Math.min(delta,50)/1000*(this.reducedMotion?.15:1);
    for(let i=0;i<this.vehicles.length;i++){
      const vehicle=this.vehicles[i],route=this.routes[vehicle.routeIndex];let desired=vehicle.desiredSpeed*(this.scenario==="clean"?.84:1);let nearest=1;
      for(let j=0;j<this.vehicles.length;j++)if(i!==j&&this.vehicles[j].routeIndex===vehicle.routeIndex){const gap=(this.vehicles[j].progress-vehicle.progress+1)%1;if(gap>0&&gap<nearest)nearest=gap;}
      let available=Math.max(0,nearest*route.length-78);
      const red=this.signalAllRed||(route.horizontal?!this.signalHorizontalGreen:this.signalHorizontalGreen);
      if(red)for(const stop of route.stops){const distance=(stop-vehicle.progress)*route.length;if(distance>=-.001)available=Math.min(available,Math.max(0,distance));}
      // Braking distance v²/(2a), acceleration limit and hard headway constraint.
      desired=Math.min(desired,Math.sqrt(2*72*available));
      vehicle.speed+=Phaser.Math.Clamp(desired-vehicle.speed,-100*dt,35*dt);
      const distance=Math.min(vehicle.speed*dt,available);
      if(distance<vehicle.speed*dt)vehicle.speed=0;
      vehicle.progress=(vehicle.progress+distance/route.length)%1;
      // One authoritative longitudinal coordinate: no second physics integrator,
      // lateral velocity, reverse motion or accumulated drift can leave the lane.
      vehicle.sprite.setPosition(Phaser.Math.Linear(route.startX,route.endX,vehicle.progress),Phaser.Math.Linear(route.startY,route.endY,vehicle.progress));
      vehicle.sprite.setAlpha(Math.min(1,vehicle.progress*70,(1-vehicle.progress)*70));
      vehicle.sprite.setDepth(Phaser.Math.Linear(route.depthStart,route.depthEnd,vehicle.progress));
    }
  }

  private updatePollution(delta:number,time:number){
    const motion=this.reducedMotion?.18:1,windX=(this.scenario==="clean"?32:18)*motion,buoyancy=(this.scenario==="clean"?34:25)*motion;
    for(let i=0;i<this.pollution.length;i++){const puff=this.pollution[i];puff.age+=delta*motion;if(puff.age>=puff.lifetime){puff.age=0;puff.lifetime=5200+seeded(i+Math.floor(time/1000),13)*3200;const source=this.stackSources[puff.sourceIndex];puff.sprite.setPosition(source.x,source.y);}const phase=puff.age/puff.lifetime;const grey=Math.round(240-phase*104),tr=grey,tg=Math.round(grey*.955),tb=Math.round(grey*.9);puff.sprite.x+=windX*delta/1000;puff.sprite.y-=buoyancy*delta/1000;puff.sprite.x+=Math.sin(time*.002+i)*delta*.008;puff.sprite.setAlpha(Math.sin(phase*Math.PI)*.95*this.smokeStrength).setScale(.62+phase*1.95).setTint((tr<<16)|(tg<<8)|tb);}
    for(let i=0;i<this.exhaust.length;i++){const puff=this.exhaust[i];puff.age+=delta*motion;const vehicle=this.vehicles[puff.sourceIndex%this.vehicles.length];if(puff.age>=puff.lifetime){puff.age=0;puff.sprite.setPosition(vehicle.sprite.x-10,vehicle.sprite.y+5);}const phase=puff.age/puff.lifetime;puff.sprite.x-=8*delta/1000;puff.sprite.y-=13*delta/1000;puff.sprite.setAlpha((1-phase)*(this.scenario==="polluted"?.28:.08)).setScale(.25+phase*.55);}
  }

  private setReducedDetail(reduced:boolean){if(this.reducedDetail===reduced)return;this.reducedDetail=reduced;this.trees.forEach((tree,index)=>tree.setVisible(!reduced||index%2===0));this.pollution.forEach((puff,index)=>puff.sprite.setVisible(!reduced||index%2===0));this.exhaust.forEach((puff,index)=>puff.sprite.setVisible(!reduced||index%3===0));this.streetProps.forEach((prop,index)=>prop.setVisible(!reduced||index%2===0));this.smog.forEach((sprite,index)=>sprite.setVisible(this.scenario==="polluted"&&(!reduced||index%2===0)));this.coins.forEach((coin,index)=>coin.sprite.setVisible(!reduced||index%2===0));}

  update(time:number,delta:number){
    this.clampCameraToCity();
    this.trafficClock+=Math.min(delta,50)*(this.reducedMotion?.15:1);
    this.updateSignals(this.trafficClock);this.updateTraffic(delta);this.updatePollution(delta,time);this.updateSmog(delta,time);this.updateEarnings(delta);
    for(const metro of this.metroRuns){metro.progress=(metro.progress+Math.min(delta,50)*.0003*(this.reducedMotion?.14:1))%1;const t=metro.progress;metro.sprite.x=Phaser.Math.Linear(metro.start.x,metro.end.x,t);metro.sprite.y=Phaser.Math.Linear(metro.start.y,metro.end.y,t)-50;metro.sprite.setDepth(depthFor(-1+metro.ox+t*23,-.8+metro.oy,50));}
    if(time-this.lastPerf>1000){this.lastPerf=time;const fps=Math.round(this.game.loop.actualFps);this.lowFpsSamples=fps<48?this.lowFpsSamples+1:0;this.highFpsSamples=fps>57?this.highFpsSamples+1:0;if(this.lowFpsSamples>=3)this.setReducedDetail(true);else if(this.highFpsSamples>=6)this.setReducedDetail(false);emitPerformance({fps,objects:this.children.list.length,drawMode:this.game.renderer.type===Phaser.WEBGL?"WEBGL":"CANVAS"});}
  }
}
