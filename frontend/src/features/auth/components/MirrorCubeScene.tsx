import { memo, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

type Axis = 'x' | 'y' | 'z'
type GridIndex = 0 | 1 | 2
type Grid = { x: GridIndex; y: GridIndex; z: GridIndex }

const GAP = 0.045

// Per-axis layer thicknesses vary (unlike a standard cube's uniform 1/1/1
// split) so the piece grid reads as an asymmetric-block Mirror Cube rather
// than a colored Rubik's cube, while each axis still sums to the same
// overall bounding size so the cube silhouette stays square.
const AXIS_SIZES: Record<Axis, [number, number, number]> = {
  x: [0.6, 1.0, 0.6],
  y: [0.9, 0.5, 0.8],
  z: [0.7, 0.8, 0.7],
}

function centersFor([a, b, c]: [number, number, number]): [number, number, number] {
  const start = -(a + b + c) / 2
  return [start + a / 2, start + a + b / 2, start + a + b + c / 2]
}

const CENTERS: Record<Axis, [number, number, number]> = {
  x: centersFor(AXIS_SIZES.x),
  y: centersFor(AXIS_SIZES.y),
  z: centersFor(AXIS_SIZES.z),
}

interface Cubie {
  id: number
  grid: Grid
  color: string
}

function buildCubies(): Cubie[] {
  const dark = new THREE.Color('#0e0f11')
  const silver = new THREE.Color('#dfe2e4')
  const cubies: Cubie[] = []
  let id = 0
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 3; z++) {
        const t = (x + y + z) / 6
        const color = `#${dark.clone().lerp(silver, t).getHexString()}`
        cubies.push({ id: id++, grid: { x: x as GridIndex, y: y as GridIndex, z: z as GridIndex }, color })
      }
    }
  }
  return cubies
}

// Rotates a piece's logical grid coordinate 90° around `axis` in direction
// `dir`, matching the visual turn applied to its mesh via the pivot group.
function rotateGrid(grid: Grid, axis: Axis, dir: 1 | -1): Grid {
  const rx = grid.x - 1
  const ry = grid.y - 1
  const rz = grid.z - 1
  let nx = rx
  let ny = ry
  let nz = rz
  if (axis === 'x') {
    if (dir === 1) {
      ny = -rz
      nz = ry
    } else {
      ny = rz
      nz = -ry
    }
  } else if (axis === 'y') {
    if (dir === 1) {
      nx = rz
      nz = -rx
    } else {
      nx = -rz
      nz = rx
    }
  } else {
    if (dir === 1) {
      nx = -ry
      ny = rx
    } else {
      nx = ry
      ny = -rx
    }
  }
  return { x: (nx + 1) as GridIndex, y: (ny + 1) as GridIndex, z: (nz + 1) as GridIndex }
}

interface MoveState {
  active: boolean
  axis: Axis
  dir: 1 | -1
  elapsed: number
  duration: number
  ids: number[]
}

function MirrorCube() {
  const orbitRef = useRef<THREE.Group>(null!)
  const groupRef = useRef<THREE.Group>(null!)
  const pivotRef = useRef<THREE.Group>(null!)
  const meshRefs = useRef(new Map<number, THREE.Object3D>())
  const cubies = useMemo(buildCubies, [])
  const gridState = useRef(new Map<number, Grid>(cubies.map((c) => [c.id, c.grid])))
  const move = useRef<MoveState>({ active: false, axis: 'x', dir: 1, elapsed: 0, duration: 0.55, ids: [] })
  const pauseRef = useRef(0.4)

  function startMove() {
    const axes: Axis[] = ['x', 'y', 'z']
    const axis = axes[Math.floor(Math.random() * axes.length)]!
    const layer = Math.floor(Math.random() * 3) as GridIndex
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const ids = cubies.filter((c) => gridState.current.get(c.id)![axis] === layer).map((c) => c.id)

    const pivot = pivotRef.current
    pivot.rotation.set(0, 0, 0)
    for (const id of ids) {
      const obj = meshRefs.current.get(id)
      if (obj) pivot.attach(obj)
    }
    move.current = { active: true, axis, dir, elapsed: 0, duration: 0.5 + Math.random() * 0.25, ids }
  }

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    if (orbitRef.current) orbitRef.current.rotation.y += delta * 0.18

    const m = move.current
    if (!m.active) {
      pauseRef.current -= delta
      if (pauseRef.current <= 0) {
        pauseRef.current = 0.15 + Math.random() * 0.3
        startMove()
      }
      return
    }

    m.elapsed += delta
    const t = Math.min(m.elapsed / m.duration, 1)
    const eased = 1 - (1 - t) ** 3
    const angle = eased * (Math.PI / 2) * m.dir
    const pivot = pivotRef.current
    if (m.axis === 'x') pivot.rotation.x = angle
    else if (m.axis === 'y') pivot.rotation.y = angle
    else pivot.rotation.z = angle

    if (t >= 1) {
      const group = groupRef.current
      for (const id of m.ids) {
        const obj = meshRefs.current.get(id)
        if (obj) group.attach(obj)
        gridState.current.set(id, rotateGrid(gridState.current.get(id)!, m.axis, m.dir))
      }
      pivot.rotation.set(0, 0, 0)
      move.current = { ...m, active: false }
    }
  })

  return (
    <group ref={orbitRef} rotation={[0.36, 0.62, 0]} scale={0.86}>
      <group ref={groupRef}>
        {cubies.map((c) => (
          <RoundedBox
            key={c.id}
            ref={(obj) => {
              if (obj) meshRefs.current.set(c.id, obj)
            }}
            position={[CENTERS.x[c.grid.x], CENTERS.y[c.grid.y], CENTERS.z[c.grid.z]]}
            args={[AXIS_SIZES.x[c.grid.x] - GAP, AXIS_SIZES.y[c.grid.y] - GAP, AXIS_SIZES.z[c.grid.z] - GAP]}
            radius={0.035}
            smoothness={2}
          >
            <meshStandardMaterial color={c.color} metalness={0.95} roughness={0.22} envMapIntensity={1.2} />
          </RoundedBox>
        ))}
      </group>
      <group ref={pivotRef} />
    </group>
  )
}

function MirrorCubeSceneImpl() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 6.2], fov: 34 }}
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.5} />
      <directionalLight position={[-4, -2, 3]} intensity={0.55} color="#aac4ff" />
      <pointLight position={[0, 3, -3]} intensity={0.5} color="#ffffff" />
      <MirrorCube />
    </Canvas>
  )
}

// Memoized with no props so an unrelated re-render of LoginPage (form errors,
// submit state, etc.) never remounts/re-syncs the scene and snaps the cube
// back to its initial layout mid-turn.
export default memo(MirrorCubeSceneImpl)
