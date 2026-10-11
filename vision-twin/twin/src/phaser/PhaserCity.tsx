import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { Scenario } from "../city/types";
import { DelhiScene } from "./DelhiScene";
import { cityEvents, emitExternalSelection, emitPlants, emitScenario, type CityPerformance } from "./cityEvents";

type Props = {
  scenario: Scenario;
  selectedId: string | null;
  plantCounts: Record<string, number>;
  onSelect: (id: string | null) => void;
  onPerformance: (value: CityPerformance) => void;
};

export function PhaserCity({scenario,selectedId,plantCounts,onSelect,onPerformance}:Props){
  const host=useRef<HTMLDivElement>(null);
  const latest=useRef({scenario,selectedId,plantCounts,onSelect,onPerformance});
  latest.current={scenario,selectedId,plantCounts,onSelect,onPerformance};
  useEffect(()=>{
    if(!host.current) return;
    const game=new Phaser.Game({
      type:Phaser.AUTO,
      parent:host.current,
      backgroundColor:"#303d47",
      scene:[DelhiScene],
      scale:{mode:Phaser.Scale.RESIZE,width:"100%",height:"100%"},
      render:{antialias:true,roundPixels:true,powerPreference:"high-performance"},
      physics:{default:"arcade",arcade:{gravity:{x:0,y:0},debug:false}},
      fps:{target:60,smoothStep:true},
      audio:{noAudio:true},
      disableContextMenu:true,
      banner:false,
    });
    const selected=(event:Event)=>latest.current.onSelect((event as CustomEvent<string|null>).detail);
    const performance=(event:Event)=>latest.current.onPerformance((event as CustomEvent<CityPerformance>).detail);
    if(import.meta.env.DEV)(window as unknown as {__aircoinGame:Phaser.Game}).__aircoinGame=game;
    const ready=()=>{const state=latest.current;emitScenario(state.scenario);emitPlants(state.plantCounts);emitExternalSelection(state.selectedId);};
    cityEvents.addEventListener("building-selected",selected);
    cityEvents.addEventListener("performance",performance);
    cityEvents.addEventListener("scene-ready",ready);
    const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion=()=>cityEvents.dispatchEvent(new CustomEvent("motion",{detail:motion.matches}));
    motion.addEventListener("change",syncMotion);syncMotion();
    return()=>{motion.removeEventListener("change",syncMotion);cityEvents.removeEventListener("building-selected",selected);cityEvents.removeEventListener("performance",performance);cityEvents.removeEventListener("scene-ready",ready);game.destroy(true);};
  },[]);
  useEffect(()=>emitScenario(scenario),[scenario]);
  useEffect(()=>emitPlants(plantCounts),[plantCounts]);
  useEffect(()=>emitExternalSelection(selectedId),[selectedId]);
  return <div ref={host} className="phaser-city" aria-label="Interactive isometric Delhi AIRcoin simulation"/>;
}

export default PhaserCity;
