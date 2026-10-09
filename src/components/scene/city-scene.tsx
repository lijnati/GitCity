"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  BoxGeometry,
  Color,
  EdgesGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Vector3,
} from "three";
import type { Block, Building, CityLayout } from "@/lib/city/layout";
import {
  BACKGROUND,
  buildingBase,
  buildingColor,
  createStripeTexture,
  DEFAULT_DIRECTION,
  fitBox,
  fitCity,
  GROUND_COLOR,
  normalize,
  PLINTH_HEIGHT,
  plinthColor,
} from "./scene-utils";

/** The subset of three-stdlib OrbitControls the rig relies on. */
interface OrbitControlsImpl {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  update(): boolean;
}

export interface CameraApi {
  fit(): void;
  reset(): void;
  zoom(factor: number): void;
  focusBuilding(id: number): void;
  focusBlock(path: string): void;
}

export interface CitySceneProps {
  layout: CityLayout;
  /** 1 = active, 0 = faded. null = everything active. */
  active: Uint8Array | null;
  selectedId: number | null;
  showLabels: boolean;
  onHover?: (id: number | null, x: number, y: number) => void;
  onSelect?: (id: number | null) => void;
  cameraRef?: Ref<CameraApi>;
  lowPower?: boolean;
  reducedMotion?: boolean;
  /** Slow idle orbit for the landing preview. */
  autoRotate?: boolean;
  onReady?: () => void;
  onContextLost?: () => void;
  className?: string;
}

const FOV = 32;
const tmpColor = new Color();
const faded = new Color("#ece9e2");

export default function CityScene(props: CitySceneProps) {
  const { layout, lowPower = false, autoRotate = false, className } = props;
  const [interacted, setInteracted] = useState(false);
  const spinning = autoRotate && !interacted && !props.reducedMotion;
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const extent = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxZ - layout.bounds.minZ, 20);

  return (
    <div
      className={className}
      onPointerDown={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY };
        setInteracted(true);
      }}
      onWheel={() => setInteracted(true)}
    >
      <Canvas
        flat
        shadows={lowPower ? false : "percentage"}
        dpr={[1, lowPower ? 1.5 : 1.75]}
        frameloop={spinning ? "always" : "demand"}
        gl={{ antialias: !lowPower, powerPreference: "high-performance", preserveDrawingBuffer: false }}
        camera={{ fov: FOV, near: 0.5, far: extent * 40, position: [extent, extent, extent] }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            props.onContextLost?.();
          });
          gl.domElement.setAttribute("aria-hidden", "true");
          requestAnimationFrame(() => requestAnimationFrame(() => props.onReady?.()));
        }}
        onPointerMissed={(e) => {
          const d = downAt.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
          props.onSelect?.(null);
        }}
      >
        <color attach="background" args={[BACKGROUND]} />
        <fog attach="fog" args={[BACKGROUND, extent * 3, extent * 8]} />
        <Lights layout={layout} shadows={!lowPower} />
        <Ground layout={layout} />
        <Plinths blocks={layout.blocks} />
        <Buildings {...props} />
        <Selection layout={layout} selectedId={props.selectedId} />
        {props.showLabels && <Labels blocks={layout.blocks} />}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          maxPolarAngle={Math.PI * 0.46}
          minDistance={4}
          maxDistance={extent * 12}
          autoRotate={spinning}
          autoRotateSpeed={0.35}
          zoomSpeed={0.9}
          panSpeed={0.9}
          screenSpacePanning={false}
        />
        <CameraRig layout={layout} cameraRef={props.cameraRef} reducedMotion={props.reducedMotion ?? false} />
      </Canvas>
    </div>
  );
}

function Lights({ layout, shadows }: { layout: CityLayout; shadows: boolean }) {
  const { minX, maxX, minZ, maxZ, maxHeight } = layout.bounds;
  const half = Math.max(maxX - minX, maxZ - minZ) / 2 + 4;
  return (
    <>
      <hemisphereLight args={["#ffffff", "#cfc8b8", 1.55]} />
      <directionalLight
        position={[-half * 0.55, half * 1.4 + maxHeight, half * 0.8]}
        intensity={1.9}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-half * 1.3}
        shadow-camera-right={half * 1.3}
        shadow-camera-top={half * 1.3}
        shadow-camera-bottom={-half * 1.3}
        shadow-camera-near={0.5}
        shadow-camera-far={half * 6 + maxHeight * 2}
      />
      <directionalLight position={[half, half * 0.6, -half]} intensity={0.35} />
    </>
  );
}

function Ground({ layout }: { layout: CityLayout }) {
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const size = Math.max(maxX - minX, maxZ - minZ) * 8 + 200;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
    </mesh>
  );
}

/** Directory blocks: stacked low plinths, one instanced mesh. */
function Plinths({ blocks }: { blocks: Block[] }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    g.translate(0.5, 0.5, 0.5);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    blocks.forEach((b, i) => {
      m.makeScale(b.w, PLINTH_HEIGHT, b.d);
      m.setPosition(b.x, (b.depth - 1) * PLINTH_HEIGHT, b.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tmpColor.set(plinthColor(b.depth)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks]);

  if (blocks.length === 0) return null;
  return (
    <instancedMesh key={blocks.length} ref={ref} args={[geometry, undefined, blocks.length]} receiveShadow raycast={() => null}>
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
}

interface MeshGroup {
  ids: number[];
}

function Buildings({ layout, active, onHover, onSelect, reducedMotion }: CitySceneProps) {
  const { buildings } = layout;
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const solidRef = useRef<InstancedMesh>(null);
  const stripedRef = useRef<InstancedMesh>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const groups = useMemo(() => {
    const solid: MeshGroup = { ids: [] };
    const striped: MeshGroup = { ids: [] };
    for (const b of buildings) (b.unknown ? striped : solid).ids.push(b.id);
    return { solid, striped };
  }, [buildings]);

  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  const stripe = useMemo(() => createStripeTexture(), []);
  const materials = useMemo(
    () => ({
      solid: new MeshStandardMaterial({ roughness: 0.78, metalness: 0 }),
      striped: new MeshStandardMaterial({ roughness: 0.9, metalness: 0, map: stripe ?? undefined }),
    }),
    [stripe],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      stripe?.dispose();
      materials.solid.dispose();
      materials.striped.dispose();
    },
    [geometry, stripe, materials],
  );

  // Rise-in animation progress (0 → 1); skipped for reduced motion.
  const rise = useRef(reducedMotion ? 1 : 0);
  const centre = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = layout.bounds;
    return { r: Math.hypot(maxX - minX, maxZ - minZ) / 2 || 1 };
  }, [layout]);

  const writeMatrices = (progress: number) => {
    const o = new Object3D();
    for (const [mesh, group] of [
      [solidRef.current, groups.solid],
      [stripedRef.current, groups.striped],
    ] as const) {
      if (!mesh) continue;
      group.ids.forEach((id, i) => {
        const b = buildings[id]!;
        const delay = (Math.hypot(b.x, b.z) / centre.r) * 0.45;
        const t = progress >= 1 ? 1 : easeOut(clamp01((progress - delay) / 0.55));
        o.position.set(b.x, buildingBase(b), b.z);
        o.scale.set(b.w, Math.max(0.001, b.h * t), b.w);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (progress >= 1) {
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
      }
    }
  };

  useEffect(() => {
    writeMatrices(rise.current);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, buildings]);

  useFrame((_, delta) => {
    if (rise.current >= 1) return;
    rise.current = Math.min(1, rise.current + delta / 1.4);
    writeMatrices(rise.current);
    invalidate();
  });

  // Colours: language colour, faded when filtered out, lifted when hovered.
  useEffect(() => {
    for (const [mesh, group] of [
      [solidRef.current, groups.solid],
      [stripedRef.current, groups.striped],
    ] as const) {
      if (!mesh) continue;
      group.ids.forEach((id, i) => {
        const b = buildings[id]!;
        buildingColor(b, tmpColor);
        if (active && !active[id]) tmpColor.lerp(faded, 0.86);
        else if (id === hovered) tmpColor.offsetHSL(0, 0.04, 0.1);
        mesh.setColorAt(i, tmpColor);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  }, [groups, buildings, active, hovered, invalidate]);

  useEffect(() => {
    gl.domElement.style.cursor = hovered === null ? "" : "pointer";
  }, [hovered, gl]);

  const handlers = (group: MeshGroup) => ({
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.pointerType === "touch") return;
      const id = e.instanceId === undefined ? null : (group.ids[e.instanceId] ?? null);
      setHovered(id);
      onHover?.(id, e.nativeEvent.clientX, e.nativeEvent.clientY);
    },
    onPointerOut: () => {
      setHovered(null);
      onHover?.(null, 0, 0);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta > 6) return;
      const id = e.instanceId === undefined ? null : (group.ids[e.instanceId] ?? null);
      if (id !== null) onSelect?.(id);
    },
  });

  return (
    <>
      {groups.solid.ids.length > 0 && (
        <instancedMesh
          key={`s${groups.solid.ids.length}-${buildings.length}`}
          ref={solidRef}
          args={[geometry, materials.solid, groups.solid.ids.length]}
          castShadow
          receiveShadow
          {...handlers(groups.solid)}
        />
      )}
      {groups.striped.ids.length > 0 && (
        <instancedMesh
          key={`u${groups.striped.ids.length}-${buildings.length}`}
          ref={stripedRef}
          args={[geometry, materials.striped, groups.striped.ids.length]}
          castShadow
          receiveShadow
          {...handlers(groups.striped)}
        />
      )}
    </>
  );
}

function Selection({ layout, selectedId }: { layout: CityLayout; selectedId: number | null }) {
  const edges = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const e = new EdgesGeometry(box);
    box.dispose();
    return e;
  }, []);
  useEffect(() => () => edges.dispose(), [edges]);
  const b = selectedId === null ? undefined : layout.buildings[selectedId];
  if (!b) return null;
  const base = buildingBase(b);
  const pad = 0.12;
  return (
    <group>
      <lineSegments geometry={edges} position={[b.x, base, b.z]} scale={[b.w + pad, b.h + pad, b.w + pad]} raycast={() => null}>
        <lineBasicMaterial color="#151515" />
      </lineSegments>
      <mesh position={[b.x, base + 0.02, b.z]} rotation-x={-Math.PI / 2} raycast={() => null}>
        <planeGeometry args={[b.w + 0.9, b.w + 0.9]} />
        <meshBasicMaterial color="#d6401f" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Neighbourhood labels. A label is shown only when its block is large enough on
 * screen to carry it, which gives distance-aware level of detail for free.
 */
function Labels({ blocks }: { blocks: Block[] }) {
  const candidates = useMemo(
    () =>
      [...blocks]
        .filter((b) => b.depth <= 3)
        .sort((a, b) => a.depth - b.depth || b.fileCount - a.fileCount || (a.path < b.path ? -1 : 1))
        .slice(0, 70),
    [blocks],
  );
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);

  const placed = useMemo<{ x0: number; y0: number; x1: number; y1: number }[]>(() => [], []);
  useFrame(() => {
    const pxPerUnitAt1 = size.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    placed.length = 0;
    // Candidates are in priority order; greedily keep labels whose screen boxes don't collide.
    candidates.forEach((b, i) => {
      const el = refs.current[i];
      if (!el) return;
      v.set(b.x + b.w / 2, b.depth * PLINTH_HEIGHT, b.z + b.d);
      const dist = camera.position.distanceTo(v);
      const projected = (b.w * pxPerUnitAt1) / Math.max(dist, 0.001);
      const width = b.name.length * 7 + 14;
      let show = projected > width + 12 && projected < size.width * 1.6;
      if (show) {
        v.project(camera);
        const sx = ((v.x + 1) / 2) * size.width;
        const sy = ((1 - v.y) / 2) * size.height - 10;
        const box = { x0: sx - width / 2 - 4, y0: sy - 10, x1: sx + width / 2 + 4, y1: sy + 10 };
        if (v.z > 1 || placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) show = false;
        else placed.push(box);
      }
      el.style.opacity = show ? String(Math.min(1, (projected - width - 12) / 40)) : "0";
    });
  });

  return (
    <>
      {candidates.map((b, i) => (
        <Html
          key={b.path}
          position={[b.x + b.w / 2, b.depth * PLINTH_HEIGHT + 0.05, b.z + b.d]}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="translate-y-[-10px] whitespace-nowrap font-mono text-[11px] leading-none tracking-tight text-ink opacity-0 transition-opacity duration-200"
          >
            <span className={b.depth === 1 ? "border border-ink/80 bg-paper px-1 py-0.5 font-semibold" : "border border-line-strong bg-paper/90 px-1 py-0.5 text-ink-2"}>
              {b.name}/
            </span>
          </div>
        </Html>
      ))}
    </>
  );
}

function CameraRig({ layout, cameraRef, reducedMotion }: { layout: CityLayout; cameraRef?: Ref<CameraApi>; reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const anim = useRef<{ fromP: Vector3; toP: Vector3; fromT: Vector3; toT: Vector3; t: number } | null>(null);

  const goTo = (position: [number, number, number], target: [number, number, number]) => {
    if (!controls) return;
    const toP = new Vector3(...position);
    const toT = new Vector3(...target);
    if (reducedMotion) {
      camera.position.copy(toP);
      controls.target.copy(toT);
      controls.update();
      invalidate();
      return;
    }
    anim.current = { fromP: camera.position.clone(), toP, fromT: controls.target.clone(), toT, t: 0 };
    invalidate();
  };

  const currentDirection = (): [number, number, number] => {
    if (!controls) return DEFAULT_DIRECTION;
    const d = camera.position.clone().sub(controls.target);
    return normalize([d.x, d.y, d.z]);
  };

  // Frame the city on load, and re-frame on resize until the user moves the camera.
  const scene = useThree((s) => s.scene);
  const framed = useRef<{ layout: CityLayout; w: number; h: number } | null>(null);
  const userMoved = useRef(false);
  useEffect(() => {
    const c = controls as unknown as { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void } | null;
    const onStart = () => {
      userMoved.current = true;
    };
    c?.addEventListener?.("start", onStart);
    return () => c?.removeEventListener?.("start", onStart);
  }, [controls]);
  useEffect(() => {
    if (!controls || size.width < 2 || size.height < 2) return;
    const prev = framed.current;
    if (prev && prev.layout === layout && (userMoved.current || (prev.w === size.width && prev.h === size.height))) return;
    if (!prev || prev.layout !== layout) userMoved.current = false;
    framed.current = { layout, w: size.width, h: size.height };
    const fit = fitCity(layout, camera.fov, size.width / size.height, viewDirection(size.width / size.height));
    camera.position.set(...fit.position);
    controls.target.set(...fit.target);
    camera.far = fit.distance * 8;
    camera.updateProjectionMatrix();
    if (scene.fog && "near" in scene.fog) {
      scene.fog.near = fit.distance * 1.4;
      scene.fog.far = fit.distance * 5;
    }
    controls.update();
    invalidate();
  }, [layout, controls, camera, size, invalidate, scene]);

  useImperativeHandle(
    cameraRef,
    () => ({
      fit() {
        const fit = fitCity(layout, camera.fov, size.width / Math.max(1, size.height), currentDirection());
        goTo(fit.position, fit.target);
      },
      reset() {
        const aspect = size.width / Math.max(1, size.height);
        const fit = fitCity(layout, camera.fov, aspect, viewDirection(aspect));
        goTo(fit.position, fit.target);
      },
      zoom(factor: number) {
        if (!controls) return;
        const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor);
        const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length()));
        offset.setLength(len);
        const p = controls.target.clone().add(offset);
        goTo([p.x, p.y, p.z], [controls.target.x, controls.target.y, controls.target.z]);
      },
      focusBuilding(id: number) {
        const b = layout.buildings[id];
        if (!b) return;
        const base = buildingBase(b);
        const target: [number, number, number] = [b.x, base + b.h * 0.45, b.z];
        const dist = Math.max(14, b.h * 2.4 + b.w * 4);
        const dir = currentDirection();
        const lifted = normalize([dir[0], Math.max(dir[1], 0.45), dir[2]]);
        goTo([target[0] + lifted[0] * dist, target[1] + lifted[1] * dist, target[2] + lifted[2] * dist], target);
      },
      focusBlock(path: string) {
        const b = layout.blocks.find((x) => x.path === path);
        if (!b) return;
        const top = b.depth * PLINTH_HEIGHT;
        const tallest = layout.buildings.reduce((m, x) => (x.x >= b.x && x.x <= b.x + b.w && x.z >= b.z && x.z <= b.z + b.d ? Math.max(m, x.h) : m), 1);
        const target: [number, number, number] = [b.x + b.w / 2, top + tallest * 0.2, b.z + b.d / 2];
        const fit = fitBox([b.x, 0, b.z], [b.x + b.w, top + tallest, b.z + b.d], target, camera.fov, size.width / Math.max(1, size.height), currentDirection(), 1.1);
        goTo(fit.position, fit.target);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, camera, controls, size, reducedMotion],
  );

  useFrame((_, delta) => {
    // Keep depth precision proportional to viewing distance (avoids z-fighting on plinths).
    if (controls) {
      const dist = camera.position.distanceTo(controls.target);
      const near = Math.max(0.05, dist / 250);
      if (Math.abs(camera.near - near) / near > 0.05) {
        camera.near = near;
        camera.far = Math.max(dist * 12, 200);
        camera.updateProjectionMatrix();
      }
    }
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + delta / 0.85);
    const k = easeInOut(a.t);
    camera.position.lerpVectors(a.fromP, a.toP, k);
    controls.target.lerpVectors(a.fromT, a.toT, k);
    controls.update();
    if (a.t >= 1) anim.current = null;
    invalidate();
  });

  return null;
}

/** Portrait screens get a steeper, more plan-like view so the city fills the height. */
function viewDirection(aspect: number): [number, number, number] {
  return aspect < 0.8 ? normalize([0.5, 1.35, 0.72]) : DEFAULT_DIRECTION;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export type { Building };
