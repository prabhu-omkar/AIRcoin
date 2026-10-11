import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { FOCUS_BUILDINGS } from "./data";
import type { CityBuilding, Scenario } from "./types";

type Quality = "high" | "medium" | "low";
type Props = {
  scenario: Scenario;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  plantCounts: Record<string, number>;
};

const seeded = (index: number, salt = 1) => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const BackgroundBuildings = memo(function BackgroundBuildings({ quality }: { quality: Quality }) {
  const count = quality === "low" ? 70 : quality === "medium" ? 105 : 145;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const windowMesh = useRef<THREE.InstancedMesh>(null);
  const buildings = useMemo(() => Array.from({ length: count }, (_, i) => {
    let x = -14 + seeded(i, 1) * 28;
    let z = -12 + seeded(i, 2) * 24;
    if (Math.abs(x) < 1.4) x += x < 0 ? -2.4 : 2.4;
    if (Math.abs(z) < 1.25) z += z < 0 ? -2.2 : 2.2;
    const w = 0.75 + seeded(i, 3) * 1.3;
    const d = 0.7 + seeded(i, 4) * 1.2;
    const h = 1.3 + seeded(i, 5) * 5.7;
    return { x, z, w, d, h, warm: seeded(i, 6) };
  }), [count]);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    buildings.forEach((b, i) => {
      matrix.compose(new THREE.Vector3(b.x, b.h / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
      mesh.current!.setMatrixAt(i, matrix);
      color.setHSL(b.warm > .55 ? .085 : .56, .24, .34 + b.warm * .12);
      mesh.current!.setColorAt(i, color);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [buildings]);

  const windowCount = quality === "low" ? 0 : buildings.length * 3;
  useLayoutEffect(() => {
    if (!windowMesh.current || !windowCount) return;
    const matrix = new THREE.Matrix4();
    let index = 0;
    buildings.forEach((b) => {
      for (let row = 0; row < 3; row++) {
        matrix.compose(
          new THREE.Vector3(b.x, .55 + row * Math.max(.35, (b.h - .7) / 3), b.z + b.d / 2 + .006),
          new THREE.Quaternion(), new THREE.Vector3(b.w * .58, .13, .012)
        );
        windowMesh.current!.setMatrixAt(index++, matrix);
      }
    });
    windowMesh.current.count = index;
    windowMesh.current.instanceMatrix.needsUpdate = true;
  }, [buildings, windowCount]);

  return <group>
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled>
      <boxGeometry />
      <meshStandardMaterial roughness={.92} metalness={.04} />
    </instancedMesh>
    {windowCount > 0 && <instancedMesh ref={windowMesh} args={[undefined, undefined, windowCount]}>
      <boxGeometry />
      <meshBasicMaterial color="#9dd6f3" toneMapped={false} />
    </instancedMesh>}
  </group>;
});

const Trees = memo(function Trees({ quality, scenario }: { quality: Quality; scenario: Scenario }) {
  const count = quality === "low" ? 75 : 145;
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const positions = useMemo(() => Array.from({ length: count }, (_, i) => {
    const roadSide = i % 2 === 0;
    return roadSide
      ? { x: -13 + seeded(i, 11) * 26, z: (i % 4 < 2 ? -1.65 : 1.65) + (seeded(i, 12) - .5) * .22 }
      : { x: (i % 4 < 2 ? -1.8 : 1.8) + (seeded(i, 13) - .5) * .22, z: -11 + seeded(i, 14) * 22 };
  }), [count]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    positions.forEach((p, i) => {
      matrix.compose(new THREE.Vector3(p.x, .24, p.z), new THREE.Quaternion(), new THREE.Vector3(.1, .48, .1));
      trunks.current?.setMatrixAt(i, matrix);
      const scale = .32 + seeded(i, 15) * .18;
      matrix.compose(new THREE.Vector3(p.x, .65, p.z), new THREE.Quaternion(), new THREE.Vector3(scale, scale * 1.15, scale));
      crowns.current?.setMatrixAt(i, matrix);
    });
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
    if (crowns.current) crowns.current.instanceMatrix.needsUpdate = true;
  }, [positions]);
  return <group>
    <instancedMesh ref={trunks} args={[undefined, undefined, count]}><cylinderGeometry args={[1, 1, 1, 5]}/><meshStandardMaterial color="#5a3824" roughness={1}/></instancedMesh>
    <instancedMesh ref={crowns} args={[undefined, undefined, count]}><icosahedronGeometry args={[1, 1]}/><meshStandardMaterial color={scenario === "clean" ? "#2d9d57" : "#52704a"} roughness={.95}/></instancedMesh>
  </group>;
});

function Roads() {
  return <group>
    <mesh position={[0,.011,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[3,25]}/><meshStandardMaterial color="#25292e" roughness={1}/></mesh>
    <mesh position={[0,.012,0]} rotation={[-Math.PI/2,0,Math.PI/2]}><planeGeometry args={[3,30]}/><meshStandardMaterial color="#25292e" roughness={1}/></mesh>
    {[-.55,.55].map((x) => <mesh key={`v${x}`} position={[x,.025,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.045,25]}/><meshBasicMaterial color="#e8d681"/></mesh>)}
    {[-.55,.55].map((z) => <mesh key={`h${z}`} position={[0,.026,z]} rotation={[-Math.PI/2,0,Math.PI/2]}><planeGeometry args={[.045,30]}/><meshBasicMaterial color="#e8d681"/></mesh>)}
    <mesh position={[0,.02,-3.2]}><boxGeometry args={[30,.28,.75]}/><meshStandardMaterial color="#7d858b" roughness={1}/></mesh>
    {Array.from({length:16},(_,i)=><mesh key={i} position={[-14+i*1.85,.34,-3.2]}><boxGeometry args={[.12,.52,.12]}/><meshStandardMaterial color="#4c5358"/></mesh>)}
  </group>;
}

function Traffic({ scenario, quality }: { scenario: Scenario; quality: Quality }) {
  const count = quality === "low" ? 24 : 54;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const speed = scenario === "polluted" ? 1.25 : .75;
    for (let i=0;i<count;i++) {
      const horizontal = i % 2 === 0;
      const lane = (i % 4 < 2 ? -.95 : .95);
      const offset = ((clock.elapsedTime * speed + i * 1.73) % 29) - 14.5;
      dummy.position.set(horizontal ? offset : lane, .19, horizontal ? lane : offset * .78);
      dummy.rotation.y = horizontal ? 0 : Math.PI / 2;
      dummy.scale.set(i % 7 === 0 ? .8 : .48, .28, .29);
      dummy.updateMatrix(); mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined,undefined,count]} frustumCulled={false}>
    <boxGeometry/><meshStandardMaterial color="#e9b949" roughness={.55}/>
  </instancedMesh>;
}

function RooftopPlants({ counts }: { counts: Record<string, number> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const target = useRef(0);
  const visible = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const instances = useMemo(() => FOCUS_BUILDINGS.flatMap((building) => {
    const count = counts[building.id] ?? building.plants;
    return Array.from({ length: count }, (_, i) => ({
      x: building.position[0] - building.size[0] * .38 + (i % 6) * .55,
      y: building.position[1] + building.size[1] / 2 + .16,
      z: building.position[2] - building.size[2] * .32 + Math.floor(i / 6) * .52,
      scale: .16 + seeded(i, building.position[0]) * .08,
    }));
  }), [counts]);
  useFrame((_, delta) => {
    if (!mesh.current || target.current >= .999) return;
    target.current = Math.min(1, target.current + delta * 1.8);
    const matrix = new THREE.Matrix4();
    instances.forEach((plant, i) => {
      const s = plant.scale * target.current;
      matrix.compose(new THREE.Vector3(plant.x, plant.y, plant.z), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.8, s));
      mesh.current!.setMatrixAt(i, matrix);
    });
    mesh.current.count = instances.length;
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  useLayoutEffect(() => { target.current = .15; }, [visible]);
  return <instancedMesh ref={mesh} args={[undefined,undefined,140]}>
    <coneGeometry args={[1,1,5]}/><meshStandardMaterial color="#42d66c" roughness={.8}/>
  </instancedMesh>;
}

function FocusBuilding({ building, selected, onSelect }: { building: CityBuilding; selected: boolean; onSelect: () => void }) {
  const [hovered,setHovered]=useState(false);
  const factory = building.kind === "factory";
  return <group position={building.position}>
    <mesh onClick={(e)=>{e.stopPropagation();onSelect();}} onPointerEnter={()=>{setHovered(true);document.body.style.cursor="pointer";}} onPointerLeave={()=>{setHovered(false);document.body.style.cursor="default";}}>
      <boxGeometry args={building.size}/>
      <meshStandardMaterial color={selected ? building.accent : factory ? "#6f5347" : hovered ? "#d0aa78" : "#a98565"} roughness={.82} metalness={.02}/>
    </mesh>
    <mesh position={[0,building.size[1]/2+.12,0]}><boxGeometry args={[building.size[0]*.92,.18,building.size[2]*.92]}/><meshStandardMaterial color="#b99b77"/></mesh>
    {factory && <group position={[0,building.size[1]/2,0]}>{[-1,0,1].map((x)=><mesh key={x} position={[x,1,0]}><cylinderGeometry args={[.23,.3,2.4,10]}/><meshStandardMaterial color="#a64c3f"/></mesh>)}</group>}
    <Html center position={[0,building.size[1]/2+1,0]} distanceFactor={13} style={{pointerEvents:"none"}}>
      <div className={`city-label ${selected?"selected":""}`}><b>{building.name}</b><span>{building.role}</span></div>
    </Html>
  </group>;
}

function Landmarks() {
  return <group>
    <group position={[2.5,0,-8.2]}>
      <mesh position={[0,.8,0]}><boxGeometry args={[2.2,1.6,.65]}/><meshStandardMaterial color="#d79b53"/></mesh>
      <mesh position={[0,.55,.36]}><boxGeometry args={[.72,1.1,.08]}/><meshStandardMaterial color="#1f2426"/></mesh>
      <Html center position={[0,2,0]} distanceFactor={15}><div className="landmark-label">INDIA GATE</div></Html>
    </group>
    <group position={[-5.5,0,-8.4]}>
      <mesh position={[0,.6,0]}><boxGeometry args={[3.4,1.2,.7]}/><meshStandardMaterial color="#a9533f"/></mesh>
      {[-1.4,-.7,0,.7,1.4].map(x=><mesh key={x} position={[x,1.45,0]}><cylinderGeometry args={[.24,.32,1.7,8]}/><meshStandardMaterial color="#b55c44"/></mesh>)}
      <Html center position={[0,2.7,0]} distanceFactor={15}><div className="landmark-label">RED FORT</div></Html>
    </group>
    <group position={[9.7,0,-8]}>
      {Array.from({length:9},(_,i)=><mesh key={i} position={[Math.sin(i/9*Math.PI*2)*.75,.75,Math.cos(i/9*Math.PI*2)*.75]} rotation={[0,i/9*Math.PI*2,-.48]}><coneGeometry args={[.6,1.8,5]}/><meshStandardMaterial color="#eee2cf"/></mesh>)}
      <Html center position={[0,2.4,0]} distanceFactor={15}><div className="landmark-label">LOTUS TEMPLE</div></Html>
    </group>
  </group>;
}

function CameraController({ selectedId }: { selectedId: string | null }) {
  const { camera } = useThree();
  const controls = useRef<any>(null);
  const selected = FOCUS_BUILDINGS.find((b)=>b.id===selectedId);
  const desiredPosition = useMemo(() => selected
    ? new THREE.Vector3(selected.position[0]+6, selected.position[1]+6.5, selected.position[2]+7)
    : new THREE.Vector3(17,18,21), [selected]);
  const desiredTarget = useMemo(() => selected
    ? new THREE.Vector3(...selected.position)
    : new THREE.Vector3(0,0,0), [selected]);
  useFrame((_,delta)=>{
    const factor=1-Math.exp(-delta*2.4);
    camera.position.lerp(desiredPosition,factor);
    if(controls.current){controls.current.target.lerp(desiredTarget,factor);controls.current.update();}
  });
  return <OrbitControls ref={controls} enableDamping dampingFactor={.08} enablePan={false} minDistance={8} maxDistance={38} minPolarAngle={.45} maxPolarAngle={1.22}/>;
}

function Atmosphere({ scenario }: { scenario: Scenario }) {
  const { scene } = useThree();
  const target = useMemo(()=>new THREE.Color(scenario === "clean" ? "#80c9ed" : "#8d8b86"),[scenario]);
  useFrame((_,delta)=>{
    if(!(scene.background instanceof THREE.Color)) scene.background=new THREE.Color(target);
    scene.background.lerp(target,1-Math.exp(-delta*.45));
    if(scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background);
  });
  return <fog attach="fog" args={[scenario === "clean" ? "#80c9ed" : "#8d8b86", 20, scenario === "clean" ? 50 : 35]}/>;
}

function City({ scenario, selectedId, onSelect, plantCounts, quality }: Props & { quality: Quality }) {
  return <>
    <Atmosphere scenario={scenario}/>
    <hemisphereLight args={[scenario === "clean" ? "#dff6ff" : "#d4c1a5", "#495849", 2.2]}/>
    <directionalLight position={[-8,16,8]} intensity={scenario === "clean" ? 3.2 : 2.1} color="#fff1cf"/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.03,0]}><planeGeometry args={[80,80]}/><meshStandardMaterial color={scenario === "clean" ? "#668a61" : "#737565"} roughness={1}/></mesh>
    <Roads/><BackgroundBuildings quality={quality}/><Trees quality={quality} scenario={scenario}/>
    <Traffic scenario={scenario} quality={quality}/><RooftopPlants counts={plantCounts}/>
    {FOCUS_BUILDINGS.map((building)=><FocusBuilding key={building.id} building={building} selected={building.id===selectedId} onSelect={()=>onSelect(building.id)}/>)}
    <Landmarks/><CameraController selectedId={selectedId}/>
  </>;
}

export function CityScene(props: Props) {
  const [quality,setQuality]=useState<Quality>("high");
  const dpr=quality==="high"?[1,1.6] as [number,number]:quality==="medium"?[.85,1.2] as [number,number]:[.65,1] as [number,number];
  return <div className="city-canvas" data-quality={quality}>
    <Canvas dpr={dpr} camera={{position:[17,18,21],fov:40,near:.1,far:100}} gl={{antialias:quality!=="low",powerPreference:"high-performance"}} onPointerMissed={()=>props.onSelect(null)}>
      <PerformanceMonitor flipflops={3} onDecline={()=>setQuality(q=>q==="high"?"medium":"low")} onIncline={()=>setQuality(q=>q==="low"?"medium":"high")}/>
      <City {...props} quality={quality}/>
    </Canvas>
    <span className="quality-badge">AUTO · {quality.toUpperCase()}</span>
  </div>;
}
