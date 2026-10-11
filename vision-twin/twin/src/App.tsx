import { lazy, Suspense, useMemo, useState } from "react";
import { Building2, CarFront, Check, ChevronRight, Coins, Factory, Gauge, Leaf, Radio, ShieldCheck, Sparkles, Trees, Wifi, Wind, X, Zap } from "lucide-react";
import { FOCUS_BUILDINGS } from "./city/data";
import { useCitySimulation } from "./city/useCitySimulation";
import type { Scenario } from "./city/types";
import { useLiveData } from "./useLiveData";
import type { CityPerformance } from "./phaser/cityEvents";

const PhaserCity=lazy(()=>import("./phaser/PhaserCity"));
const MinerScene=lazy(()=>import("./MinerScene").then((module)=>({default:module.MinerScene})));

const formatAir = (raw?: string) => raw ? (Number(BigInt(raw)) / 1e18).toFixed(2) : "0.00";
const aqiLabel = (aqi: number) => aqi > 300 ? "Severe" : aqi > 200 ? "Very poor" : aqi > 100 ? "Poor" : aqi > 50 ? "Moderate" : "Good";

function MiniGraph({ values }: { values: number[] }) {
  const min = Math.min(...values), max = Math.max(...values);
  const points = values.map((value, index) => `${index / Math.max(1, values.length - 1) * 100},${38 - (value - min) / Math.max(1, max - min) * 32}`).join(" ");
  return <svg className="mini-graph" viewBox="0 0 100 42" preserveAspectRatio="none" aria-label="AQI trend">
    <defs><linearGradient id="aqi-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".36"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
    <polygon points={`0,42 ${points} 100,42`} fill="url(#aqi-fill)"/><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function App() {
  const [scenario,setScenario]=useState<Scenario>("polluted");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [showMiner,setShowMiner]=useState(false);
  const [notice,setNotice]=useState<string|null>(null);
  const [performance,setPerformance]=useState<CityPerformance>({fps:60,objects:0,drawMode:"WEBGL"});
  const [plantCounts,setPlantCounts]=useState<Record<string,number>>(()=>Object.fromEntries(FOCUS_BUILDINGS.map((b)=>[b.id,0])));
  const totalPlants=Object.values(plantCounts).reduce((sum,count)=>sum+count,0);
  const city=useCitySimulation(scenario,totalPlants);
  const {telemetry,epoch,balance,connected}=useLiveData();
  const selected=useMemo(()=>FOCUS_BUILDINGS.find((b)=>b.id===selectedId)??null,[selectedId]);
  const isEmitter=selected?.kind==="factory";

  const installPlants=()=>{
    if(!selected || isEmitter) return;
    const current=plantCounts[selected.id]??0;
    if(current>=20){setNotice(`${selected.name} already has a full 20-plant miner.`);return;}
    const next=Math.min(20,current+4);
    setPlantCounts(counts=>({...counts,[selected.id]:next}));
    setNotice(`${next-current} verified plants installed at ${selected.name}.`);
    window.setTimeout(()=>setNotice(null),3200);
  };

  return <div className={`city-app scenario-${scenario}`}>
    <header className="topbar">
      <div className="city-brand"><span className="brand-mark"><Leaf size={18}/></span><div><b>AIRCOIN</b><small>DELHI DIGITAL TWIN</small></div></div>
      <div className="scenario-switch" role="group" aria-label="Pollution scenario">
        <button className={scenario==="polluted"?"active polluted":""} onClick={()=>setScenario("polluted")}><Factory size={14}/> Polluted Delhi</button>
        <button className={scenario==="clean"?"active clean":""} onClick={()=>setScenario("clean")}><Trees size={14}/> AIRcoin Delhi</button>
      </div>
      <div className="top-status"><span className={connected?"connected":"fallback"}><i/><Radio size={13}/>{connected?"LIVE NETWORK":"CITY SIMULATION"}</span><span><Wifi size={14}/> MINER-001</span><strong>{formatAir(balance.air)} <em>AIR</em></strong></div>
    </header>

    <main className="city-stage">
      <Suspense fallback={<div className="scene-loading"><Leaf/><span>PAINTING DELHI…</span></div>}><PhaserCity scenario={scenario} selectedId={selectedId} onSelect={setSelectedId} plantCounts={plantCounts} onPerformance={setPerformance}/></Suspense>
      <div className="scene-vignette"/>

      <section className="aqi-panel glass-panel">
        <div className="aqi-primary"><span>DELHI AQI · SIMULATED</span><strong>{city.aqi}</strong><b>{aqiLabel(city.aqi)}</b></div>
        <div className="aqi-readings">
          <span>PM2.5 <b>{city.pm25}</b><small>µg/m³</small></span><span>PM10 <b>{city.pm10}</b><small>µg/m³</small></span>
          <span>NO₂ <b>{city.no2}</b><small>µg/m³</small></span><span>CO₂ <b>{city.co2}</b><small>ppm</small></span>
        </div>
        <MiniGraph values={city.trend}/>
      </section>

      <section className="city-title">
        <span><i/> LIVE CITY MODEL · NEW DELHI</span>
        <h1>Grow the city.<br/>Clear the air.</h1>
        <p>Explore rooftops, deploy verified plant miners, and compare local exposure under changing traffic and wind.</p>
      </section>

      <div className="interaction-hint"><span className="mouse-icon"/> DRAG TO PAN · SCROLL TO ZOOM · SELECT A BUILDING</div>

      <section className="city-kpis glass-panel">
        <div><span><Leaf size={15}/> ACTIVE PLANTS</span><strong>{totalPlants}</strong><small>across {FOCUS_BUILDINGS.filter(b=>(plantCounts[b.id]??0)>0).length} rooftops</small></div>
        <div><span><Sparkles size={15}/> REMOVED TODAY</span><strong>{city.removedMg.toFixed(1)} <em>mg</em></strong><small>PM2.5-equivalent</small></div>
        <div><span><Coins size={15}/> CITY REWARD</span><strong>{city.airPerDay.toFixed(1)} <em>AIR/day</em></strong><small>estimated live rate</small></div>
        <div><span><Factory size={15}/> EMISSIONS</span><strong>{city.factoryEmissions + city.trafficEmissions}</strong><small>traffic + industry units</small></div>
      </section>

      {selected && <aside className="building-inspector glass-panel">
        <button className="close" aria-label="Close building inspector" onClick={()=>setSelectedId(null)}><X size={17}/></button>
        <div className="inspector-eyebrow"><Building2 size={14}/>{selected.role}</div>
        <h2>{selected.name}</h2>
        <p className="location">NEW DELHI · BUILDING {selected.id.toUpperCase()}</p>
        {isEmitter ? <>
          <div className="emission-hero"><Factory/><div><strong>{city.factoryEmissions}</strong><span>EMISSION UNITS</span></div></div>
          <div className="compliance-row"><span>Yearly AIR obligation</span><b>14,800 AIR</b></div>
          <div className="compliance-row"><span>Compliance status</span><b className="warning">62% covered</b></div>
          <button className="primary-action purple"><Coins size={16}/> View buy & burn plan <ChevronRight size={16}/></button>
        </> : <>
          <div className="plant-hero"><Leaf/><div><strong>{plantCounts[selected.id]??0}<small>/20</small></strong><span>VERIFIED PLANTS</span></div><div><strong>+{((plantCounts[selected.id]??0)*.68).toFixed(1)}</strong><span>AIR / DAY</span></div></div>
          <div className="health-row"><span><i className="healthy"/> Camera verification</span><b>1.0 Hz</b></div>
          <div className="health-row"><span><i className="healthy"/> Plant health</span><b>{selected.kind==="company"?"89%":"96%"}</b></div>
          <div className="health-row"><span><i className="healthy"/> Latest proof</span><b>{epoch.attestation.status}</b></div>
          <button className="primary-action" onClick={installPlants}><Leaf size={16}/>{(plantCounts[selected.id]??0)>=20?"Miner at capacity":"Install 4 plants"}<ChevronRight size={16}/></button>
          <button className="secondary-action" onClick={()=>setShowMiner(true)}><Gauge size={16}/> Inspect Omkar's miner model</button>
        </>}
      </aside>}

      <div className="scenario-note">
        {scenario==="polluted"?<><Factory size={14}/><span><b>BEFORE:</b> Heavy traffic and industry push AQI upward.</span></>:<><Leaf size={14}/><span><b>AFTER:</b> Distributed plant miners reduce exposure and generate AIR.</span></>}
      </div>
      <div className="physics-readout glass-panel" aria-label="Simulation conditions">
        <span><Wind size={12}/><b>{city.windSpeed.toFixed(1)} m/s</b> ENE</span>
        <span><CarFront size={12}/><b>{city.trafficFlowVph}</b> veh/h</span>
        <span><i/><b>{city.dispersionIndex}%</b> dispersion</span>
        <span><b>{city.localExposure}</b> roadside PM2.5</span>
      </div>
      {notice&&<div className="toast"><Check size={15}/>{notice}</div>}
    </main>

    <footer className="city-footer"><span><ShieldCheck size={14}/> VERIFIED PROOF OF USEFUL WORK</span><span>SIMULATED BOX MODEL · NOT REGULATORY DATA</span><span><Zap size={14}/> {performance.drawMode} · {performance.fps} FPS · {performance.objects} OBJECTS · ATLAS BATCHED</span></footer>

    {showMiner&&<div className="miner-modal" role="dialog" aria-modal="true" aria-label="Plant miner inspection">
      <div className="miner-modal-card">
        <button className="modal-close" onClick={()=>setShowMiner(false)}><X/></button>
        <div className="miner-model"><Suspense fallback={<div className="scene-loading"><Leaf/><span>LOADING MINER…</span></div>}><MinerScene/></Suspense></div>
        <div className="miner-copy"><span className="inspector-eyebrow"><Radio size={14}/> LIVE MINER INSPECTION</span><h2>{selected?.name}</h2><p>Omkar's building-level digital twin receives the selected miner's C2 telemetry and proof state.</p>
          <div className="miner-stats"><span><small>HEALTHY</small><b>{telemetry.plants.filter(p=>p.status==="present").length}/20</b></span><span><small>AQI</small><b>{Math.round(telemetry.aqi??0)}</b></span><span><small>EPOCH AIR</small><b>{epoch.total_air.toFixed(4)}</b></span><span><small>FLAGS</small><b>{telemetry.flags.length}</b></span></div>
          <div className="proof-line"><Check size={15}/><span>Latest attestation</span><b>{epoch.attestation.status}</b></div>
          <code>{epoch.attestation.tx_hash??"Waiting for signed epoch proof"}</code>
        </div>
      </div>
    </div>}
  </div>;
}

export default App;
