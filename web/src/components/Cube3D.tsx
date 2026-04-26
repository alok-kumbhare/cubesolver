import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Faces, Face } from '../cube/model';
import type { Direction } from '../cube/moves';
import { FACE_COLORS } from '../cube/theme';

// ── Sticker ↔ cubie mapping ──────────────────────────────────────────
// Each visible sticker (face, index 0..8) maps to a cubie position
// (x,y,z each in {-1,0,1}) and the axis its colored quad sits on.
// Coords: +X = R(right), +Y = U(up), +Z = F(front).
type Vec3 = [number, number, number];

function stickerCubie(face: Face, index: number): { pos: Vec3; normal: Vec3 } {
  const row = Math.floor(index / 3);
  const col = index % 3;
  switch (face) {
    case 'U':
      // viewing from +Y; row 0 = back (z=-1), row 2 = front (+1); col 0 left (x=-1)
      return { pos: [col - 1, 1, row - 1], normal: [0, 1, 0] };
    case 'D':
      // viewing from -Y; row 0 = front (z=+1), col 0 = left (x=-1)
      return { pos: [col - 1, -1, 1 - row], normal: [0, -1, 0] };
    case 'F':
      return { pos: [col - 1, 1 - row, 1], normal: [0, 0, 1] };
    case 'B':
      // viewing from -Z with U up; col 0 (viewer left) = +X
      return { pos: [1 - col, 1 - row, -1], normal: [0, 0, -1] };
    case 'R':
      // viewing from +X with U up; col 0 (viewer left) = +Z (front)
      return { pos: [1, 1 - row, 1 - col], normal: [1, 0, 0] };
    case 'L':
      // viewing from -X with U up; col 0 (viewer left) = -Z (back)
      return { pos: [-1, 1 - row, col - 1], normal: [-1, 0, 0] };
  }
}

// All 26 outer cubie positions (skip the center).
function cubiePositions(): Vec3[] {
  const out: Vec3[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++)
        if (!(x === 0 && y === 0 && z === 0)) out.push([x, y, z]);
  return out;
}

const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

// Build: for each cubie position, list its visible (face, normal) stickers.
function cubieStickers(faces: Faces) {
  // Map from "x,y,z" to array of {color, normal}
  const map = new Map<string, Array<{ color: Face; normal: Vec3 }>>();
  for (const f of FACES) {
    for (let i = 0; i < 9; i++) {
      const { pos, normal } = stickerCubie(f, i);
      const key = pos.join(',');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ color: faces[f][i], normal });
    }
  }
  return map;
}

// Determine which cubies belong to a given face layer.
function faceLayer(face: Face): { axis: 0 | 1 | 2; value: -1 | 1 } {
  switch (face) {
    case 'U': return { axis: 1, value: 1 };
    case 'D': return { axis: 1, value: -1 };
    case 'R': return { axis: 0, value: 1 };
    case 'L': return { axis: 0, value: -1 };
    case 'F': return { axis: 2, value: 1 };
    case 'B': return { axis: 2, value: -1 };
  }
}

// Geometric rotation (radians) for a CW move on a given face, when applied
// using a positive-angle rotation about the face's outward axis.
// The right-hand rule means rotating about +Y rotates "F→L" but the
// standard cube notation U is CW when viewed from above (F→R), so signs:
function rotationAngle(face: Face, direction: Direction): number {
  const half = Math.PI / 2;
  // Per-face sign so that "cw" looks correct from outside the face.
  const sign: Record<Face, number> = {
    U: -1, // looking from +Y, CW = -angle around +Y
    D: 1,  // looking from -Y, CW = +angle around +Y (i.e. -angle around -Y)
    R: -1, // looking from +X
    L: 1,
    F: -1, // looking from +Z
    B: 1,
  };
  const k = direction === 'cw' ? 1 : direction === 'ccw' ? -1 : 2;
  // 180 has no sign concern (full half-turn)
  const angle = direction === '180' ? Math.PI : half * k * sign[face];
  return angle;
}

// ── React components ────────────────────────────────────────────────
const CUBIE_SIZE = 0.94;
const STICKER_SIZE = 0.86;
const STICKER_OFFSET = CUBIE_SIZE / 2 + 0.001;

interface CubieProps {
  position: Vec3;
  stickers: Array<{ color: Face; normal: Vec3 }>;
  // When set, draws a small dark direction-arrow on each visible sticker,
  // pointing the way that sticker travels under the rotation. Only used
  // for cubies that are part of the rotating layer.
  rotation?: { axis: Vec3; signedAngle: number };
}

// Flat triangular arrow shape used for the per-sticker direction hints.
// Tip points along local +Y, base along local -Y.
const STICKER_ARROW_SHAPE = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0.20);
  s.lineTo(-0.16, -0.10);
  s.lineTo(0.16, -0.10);
  s.closePath();
  return s;
})();

function Cubie({ position, stickers, rotation }: CubieProps) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE]} />
        <meshStandardMaterial color="#0b0b14" />
      </mesh>
      {stickers.map((s, i) => {
        const [nx, ny, nz] = s.normal;
        // Position the sticker plane just outside the cubie face.
        const pos: Vec3 = [
          nx * STICKER_OFFSET,
          ny * STICKER_OFFSET,
          nz * STICKER_OFFSET,
        ];
        // Orient a unit plane (normal +Z) to face +normal.
        const rot: Vec3 = (() => {
          if (nx === 1) return [0, Math.PI / 2, 0];
          if (nx === -1) return [0, -Math.PI / 2, 0];
          if (ny === 1) return [-Math.PI / 2, 0, 0];
          if (ny === -1) return [Math.PI / 2, 0, 0];
          if (nz === 1) return [0, 0, 0];
          if (nz === -1) return [0, Math.PI, 0];
          return [0, 0, 0];
        })();
        return (
          <mesh key={i} position={pos} rotation={rot}>
            <planeGeometry args={[STICKER_SIZE, STICKER_SIZE]} />
            <meshBasicMaterial color={FACE_COLORS[s.color]} />
          </mesh>
        );
      })}
      {rotation && stickers.map((s, i) => {
        // Skip stickers on the rotating face itself — their swirling
        // tangent arrows look chaotic. The big curved corner arrow
        // communicates the face's spin instead.
        const dot =
          rotation.axis[0] * s.normal[0] +
          rotation.axis[1] * s.normal[1] +
          rotation.axis[2] * s.normal[2];
        if (Math.abs(dot) > 0.5) return null;
        return (
          <StickerDirectionArrow
            key={`arr-${i}`}
            cubiePos={position}
            stickerNormal={s.normal}
            axis={rotation.axis}
            signedAngle={rotation.signedAngle}
          />
        );
      })}
    </group>
  );
}

// Renders a small dark triangle on a single sticker, pointing in the
// direction that sticker will physically travel during the rotation.
// Sits just above the colored sticker so it's always visible.
function StickerDirectionArrow({
  cubiePos, stickerNormal, axis, signedAngle,
}: {
  cubiePos: Vec3;
  stickerNormal: Vec3;
  axis: Vec3;
  signedAngle: number;
}) {
  const data = useMemo(() => {
    const axisV = new THREE.Vector3(axis[0], axis[1], axis[2]);
    const posV = new THREE.Vector3(cubiePos[0], cubiePos[1], cubiePos[2]);
    const normV = new THREE.Vector3(stickerNormal[0], stickerNormal[1], stickerNormal[2]);

    // Velocity at this cubie under positive-angle rotation about axis.
    let tangent = new THREE.Vector3().crossVectors(axisV, posV);
    if (signedAngle < 0) tangent.negate();
    // Project onto sticker plane.
    tangent.sub(normV.clone().multiplyScalar(tangent.dot(normV)));
    if (tangent.length() < 0.05) return null;
    tangent.normalize();

    // Build orientation: local +Y → tangent, local +Z → normal.
    const binormal = new THREE.Vector3().crossVectors(tangent, normV).normalize();
    const m = new THREE.Matrix4().makeBasis(binormal, tangent, normV);
    const quat = new THREE.Quaternion().setFromRotationMatrix(m);

    // Position: just above the sticker plane (outside the cube).
    const ARROW_LIFT = 0.012;
    const pos: Vec3 = [
      stickerNormal[0] * (STICKER_OFFSET + ARROW_LIFT),
      stickerNormal[1] * (STICKER_OFFSET + ARROW_LIFT),
      stickerNormal[2] * (STICKER_OFFSET + ARROW_LIFT),
    ];
    return { pos, quat };
  }, [
    cubiePos[0], cubiePos[1], cubiePos[2],
    stickerNormal[0], stickerNormal[1], stickerNormal[2],
    axis[0], axis[1], axis[2],
    signedAngle,
  ]);

  if (!data) return null;
  return (
    <mesh position={data.pos} quaternion={data.quat}>
      <shapeGeometry args={[STICKER_ARROW_SHAPE]} />
      <meshBasicMaterial color="#11111b" toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

interface CubeSceneProps {
  faces: Faces;
  // When rotating is set, the named face's layer is animated each frame
  // (or held at full rotation when looping reaches the hold phase).
  rotating: {
    face: Face;
    direction: Direction;
    durationMs: number;
    loop: boolean;
    holdMs: number;
    onComplete?: () => void;
    // A nonce that changes whenever the caller wants to restart the
    // animation (e.g. moving to a different step).
    key: string | number;
  } | null;
}

function CubeScene({ faces, rotating }: CubeSceneProps) {
  const stickerMap = useMemo(() => cubieStickers(faces), [faces]);
  const positions = useMemo(() => cubiePositions(), []);

  if (rotating) {
    const { axis, value } = faceLayer(rotating.face);
    const inLayer = positions.filter((p) => p[axis] === value);
    const others = positions.filter((p) => p[axis] !== value);
    const axisVec: Vec3 = [0, 0, 0];
    axisVec[axis] = 1;
    const fullAngle = rotationAngle(rotating.face, rotating.direction);
    // 180° moves animate as two distinct quarter-turns with a pause,
    // so the kid sees "1... 2" instead of one big spin.
    const splits = rotating.direction === '180' ? 2 : 1;
    return (
      <>
        {others.map((p) => (
          <Cubie key={p.join(',')} position={p} stickers={stickerMap.get(p.join(','))!} />
        ))}
        <AnimatedLayer
          key={rotating.key}
          axis={axisVec}
          fullAngle={fullAngle}
          durationMs={rotating.durationMs}
          loop={rotating.loop}
          splits={splits}
          onComplete={rotating.onComplete}
        >
          {inLayer.map((p) => (
            <Cubie
              key={p.join(',')}
              position={p}
              stickers={stickerMap.get(p.join(','))!}
              rotation={{ axis: axisVec, signedAngle: fullAngle }}
            />
          ))}
        </AnimatedLayer>
        <SpinArrow face={rotating.face} axis={axisVec} fullAngle={fullAngle} />
      </>
    );
  }

  return (
    <>
      {positions.map((p) => (
        <Cubie key={p.join(',')} position={p} stickers={stickerMap.get(p.join(','))!} />
      ))}
    </>
  );
}

// Shared timing constants for the looping demo cycle.
const HOLD_START_MS = 1500;
const HOLD_END_MS = 1500;
function rewindMsFor(durationMs: number) {
  return Math.max(250, durationMs * 0.45);
}

// Compute the layer's progress (0..1) at `elapsed` ms into the cycle.
// `splits` (default 1) divides the rotation into N equal quarter-turns
// with a hold pause between them — used so a 180° move clearly reads
// as two distinct quarter-turns.
const SPLIT_HOLD_MS = 600;
function moveProgress(
  elapsed: number, durationMs: number, loop: boolean, splits = 1,
): number {
  const easeOut = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const segmented = (e: number) => {
    // durationMs is the length of ONE quarter-turn segment.
    let cursor = 0;
    for (let i = 0; i < splits; i++) {
      if (e < cursor + durationMs) {
        const t = (e - cursor) / durationMs;
        return (i + easeOut(t)) / splits;
      }
      cursor += durationMs;
      if (i < splits - 1) {
        if (e < cursor + SPLIT_HOLD_MS) return (i + 1) / splits;
        cursor += SPLIT_HOLD_MS;
      }
    }
    return 1;
  };

  if (!loop) return segmented(elapsed);

  const segTotal = durationMs * splits + SPLIT_HOLD_MS * (splits - 1);
  const rewind = rewindMsFor(durationMs);
  const cycle = HOLD_START_MS + segTotal + HOLD_END_MS + rewind;
  const phase = elapsed % cycle;
  if (phase < HOLD_START_MS) return 0;
  if (phase < HOLD_START_MS + segTotal) return segmented(phase - HOLD_START_MS);
  if (phase < HOLD_START_MS + segTotal + HOLD_END_MS) return 1;
  const t = (phase - HOLD_START_MS - segTotal - HOLD_END_MS) / rewind;
  return 1 - t;
}

interface AnimatedLayerProps {
  axis: Vec3;
  fullAngle: number;
  durationMs: number;
  loop: boolean;
  splits?: number;
  onComplete?: () => void;
  children: React.ReactNode;
}

// Drives the rotation of a face layer. Quaternion is mutated imperatively
// each frame — react-three-fiber won't re-render us at 60fps. For
// `splits > 1` the rotation is broken into N equal quarter-turns with
// a brief hold between, so a 180° move reads as two clear ticks.
function AnimatedLayer({
  axis, fullAngle, durationMs, loop, splits = 1, onComplete, children,
}: AnimatedLayerProps) {
  const ref = useRef<THREE.Group>(null);
  const startRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const axisVec = useMemo(
    () => new THREE.Vector3(axis[0], axis[1], axis[2]).normalize(),
    [axis[0], axis[1], axis[2]] // eslint-disable-line
  );

  useFrame(() => {
    if (!ref.current) return;
    if (startRef.current === null) startRef.current = performance.now();
    const elapsed = performance.now() - startRef.current;
    const progress = moveProgress(elapsed, durationMs, loop, splits);
    if (!loop && progress >= 1 && !completedRef.current) {
      completedRef.current = true;
      if (onComplete) setTimeout(onComplete, 0);
    }
    ref.current.quaternion.setFromAxisAngle(axisVec, fullAngle * progress);
  });

  return <group ref={ref}>{children}</group>;
}

// ── Big curved spin arrow ────────────────────────────────────────────
// Rendered as a 2D SVG anchored (via drei <Html>) just outside the
// center of the rotating face. The SVG always faces the camera and
// draws on top of the WebGL canvas, so it's guaranteed visible
// regardless of camera angle, depth, or face color.
const SPIN_ARROW_OUT: Record<Face, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

function SpinArrow({
  face, axis, fullAngle,
}: {
  face: Face;
  axis: Vec3;
  fullAngle: number;
}) {
  const out = SPIN_ARROW_OUT[face];
  const dotAxisOut = axis[0] * out[0] + axis[1] * out[1] + axis[2] * out[2];
  const cw = fullAngle * Math.sign(dotAxisOut || 1) < 0;

  const LIFT = 0.05;
  const anchor: [number, number, number] = [
    out[0] * (1.5 + LIFT),
    out[1] * (1.5 + LIFT),
    out[2] * (1.5 + LIFT),
  ];

  const quat = useMemo(() => {
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(out[0], out[1], out[2]),
    );
  }, [out[0], out[1], out[2]]);

  // Hide the arrow when the face points away from the camera. drei's
  // <Html transform> doesn't honour group.visible, so we toggle React
  // state and conditionally render. State only changes on facing flip,
  // not every frame.
  const groupRef = useRef<THREE.Group>(null);
  const [showing, setShowing] = useState(true);
  const outVec = useMemo(
    () => new THREE.Vector3(out[0], out[1], out[2]),
    [out[0], out[1], out[2]]
  );
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const worldPos = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!groupRef.current) return;
    groupRef.current.getWorldPosition(worldPos);
    tmp.copy(camera.position).sub(worldPos).normalize();
    const v = tmp.dot(outVec) > 0.05;
    if (v !== showing) setShowing(v);
  });

  return (
    <group ref={groupRef} position={anchor} quaternion={quat}>
      {showing && (
        <Html
          transform
          sprite={false}
          center
          distanceFactor={3}
          zIndexRange={[100, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <CurvedArrowSVG cw={cw} />
        </Html>
      )}
    </group>
  );
}

// 270° curved arrow with a chunky arrowhead. SVG coords are Y-down,
// so positive angle = clockwise *on screen*. With the gap at the top,
// a CW arrow runs upper-right → bottom → upper-left, and CCW the
// other way.
function CurvedArrowSVG({ cw }: { cw: boolean }) {
  const SIZE = 200;
  const cx = SIZE / 2, cy = SIZE / 2;
  const r = 60;
  // Symmetric 90° gap at the top: from -3π/4 (upper-left) to -π/4 (upper-right).
  const startAngle = cw ? -Math.PI / 4 : -Math.PI * 3 / 4;
  // CW means we sweep in the +angle direction (clockwise on screen).
  const endAngle = startAngle + (cw ? 1 : -1) * (Math.PI * 1.5);
  const sx = cx + r * Math.cos(startAngle);
  const sy = cy + r * Math.sin(startAngle);
  const ex = cx + r * Math.cos(endAngle);
  const ey = cy + r * Math.sin(endAngle);
  const largeArc = 1; // 270° > 180°
  // SVG sweep flag: 1 = positive-angle direction = clockwise on screen.
  const sweep = cw ? 1 : 0;
  const arcPath = `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} ${sweep} ${ex} ${ey}`;

  // Arrowhead aimed along the tangent at the arc's leading end. The
  // tangent direction depends on sweep: d/dθ of (cos θ, sin θ) is
  // (-sin θ, cos θ); negate for CCW sweep.
  const dirSign = cw ? 1 : -1;
  const tipDx = -Math.sin(endAngle) * dirSign;
  const tipDy = Math.cos(endAngle) * dirSign;
  const px = -tipDy, py = tipDx;
  const head = 26;
  const tipX = ex + tipDx * head * 0.7;
  const tipY = ey + tipDy * head * 0.7;
  const baseAX = ex - tipDx * head * 0.3 + px * head * 0.65;
  const baseAY = ey - tipDy * head * 0.3 + py * head * 0.65;
  const baseBX = ex - tipDx * head * 0.3 - px * head * 0.65;
  const baseBY = ey - tipDy * head * 0.3 - py * head * 0.65;
  const headPath = `M ${tipX} ${tipY} L ${baseAX} ${baseAY} L ${baseBX} ${baseBY} Z`;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ display: 'block' }}
    >
      <path d={arcPath} fill="none" stroke="#11111b" strokeWidth={26} strokeLinecap="round" />
      <path d={headPath} fill="#11111b" stroke="#11111b" strokeWidth={12} strokeLinejoin="round" />
      <path d={arcPath} fill="none" stroke="#f5c2e7" strokeWidth={14} strokeLinecap="round" />
      <path d={headPath} fill="#f5c2e7" stroke="#f5c2e7" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

// ── Animation driver ────────────────────────────────────────────────
interface Cube3DProps {
  faces: Faces;
  // When set, drives an animation from preFaces → postFaces over durationMs.
  // If `loop` is true, the animation plays the move forward, holds briefly
  // at the end, snaps back to start, and repeats — used by the step viewer
  // to demo the next move continuously until the user presses Next.
  animation?: {
    preFaces: Faces;
    face: Face;
    direction: Direction;
    durationMs: number;
    loop?: boolean;
    holdMs?: number;
    onComplete?: () => void;
    // When this changes, the demo animation restarts from the beginning
    // (used to wire a "Replay" button without changing any other state).
    replayKey?: string | number;
  } | null;
  size?: number;
}

export function Cube3D({ faces, animation, size = 360 }: Cube3DProps) {
  const animKey = animation
    ? `${animation.face}-${animation.direction}-${stateKey(animation.preFaces)}-${animation.replayKey ?? ''}`
    : 'idle';
  return (
    <div style={{ width: size, height: size, position: 'relative' }} className="cube3d">
      <Canvas camera={{ position: [4.5, 4.5, 5.5], fov: 35 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 5]} intensity={0.7} />
        {animation ? (
          <CubeScene
            faces={animation.preFaces}
            rotating={{
              face: animation.face,
              direction: animation.direction,
              durationMs: animation.durationMs,
              loop: !!animation.loop,
              holdMs: animation.holdMs ?? 450,
              onComplete: animation.onComplete,
              key: animKey,
            }}
          />
        ) : (
          <CubeScene faces={faces} rotating={null} />
        )}
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
      {animation && <MoveArrowOverlay face={animation.face} direction={animation.direction} />}
    </div>
  );
}

// Cheap stable identity for a Faces snapshot: concat sticker letters.
function stateKey(f: Faces): string {
  return (['U', 'R', 'F', 'D', 'L', 'B'] as Face[]).map((k) => f[k].join('')).join('');
}

// ── 2D arrow overlay ─────────────────────────────────────────────────
// A simple, kid-friendly visual: a colored chip showing which face turns,
// plus a big curved arrow showing the direction. Sits in the top-left
// corner of the 3D canvas so it doesn't fight the cube for space.
function MoveArrowOverlay({ face, direction }: { face: Face; direction: Direction }) {
  const ARROW: Record<Direction, string> = {
    cw: '↻',
    ccw: '↺',
    '180': '⟳⟳',
  };
  return (
    <div className="cube3d__arrow" aria-hidden>
      <span
        className="cube3d__arrow-chip"
        style={{ backgroundColor: FACE_COLORS[face] }}
        title={`Face ${face}`}
      />
      <span className="cube3d__arrow-symbol">{ARROW[direction]}</span>
    </div>
  );
}

