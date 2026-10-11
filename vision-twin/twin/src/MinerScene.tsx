import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls, RoundedBox, useGLTF } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import type { Group } from "three";

const modelUrl = import.meta.env.VITE_MINER_MODEL_URL as string | undefined;

function ImportedRig({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={model} scale={1.5} position={[0,-1,0]}/>;
}

function Rig() {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * .08; });
  return <group ref={ref} rotation={[.05, -.55, 0]}>
    <RoundedBox args={[4.6,.25,3.4]} radius={.08} position={[0,-.85,0]}><meshStandardMaterial color="#17181b" metalness={.7} roughness={.25}/></RoundedBox>
    {Array.from({length:20}, (_,i) => { const x=(i%5-2)*.82, z=(Math.floor(i/5)-1.5)*.72; return <group key={i} position={[x,-.55,z]}>
      <mesh><cylinderGeometry args={[.27,.21,.38,20]}/><meshStandardMaterial color="#2f3438"/></mesh>
      <mesh position={[0,.34,0]}><sphereGeometry args={[.27,14,10]}/><meshStandardMaterial color={i===7?"#555":i===12?"#ef4444":"#3ddc84"} emissive={i===12?"#5b0808":"#082b18"}/></mesh>
    </group>})}
    <mesh position={[0,1.6,-1.5]}><boxGeometry args={[1.15,.65,.45]}/><meshStandardMaterial color="#22252a" metalness={.5}/></mesh>
    <mesh position={[0,1.6,-1.25]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.16,.16,.18,24]}/><meshStandardMaterial color="#0b0d0f"/></mesh>
    <mesh position={[-1.45,.45,-1.48]}><boxGeometry args={[.9,.6,.18]}/><meshStandardMaterial color="#111827" emissive="#06264a"/></mesh>
    <mesh position={[0,.25,-1.55]}><boxGeometry args={[.12,2.5,.12]}/><meshStandardMaterial color="#4b5563" metalness={.8}/></mesh>
  </group>;
}
export function MinerScene(){ return <Canvas camera={{position:[5,4.2,6],fov:38}} dpr={[.8,1.4]} gl={{powerPreference:"high-performance"}}><ambientLight intensity={.8}/><directionalLight position={[5,7,5]} intensity={2}/><Suspense fallback={null}>{modelUrl?<ImportedRig url={modelUrl}/>:<Rig/>}</Suspense><OrbitControls enablePan={false} minDistance={5} maxDistance={12}/><Environment preset="city"/></Canvas> }
