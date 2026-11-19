import { create } from 'zustand'

export type PrimitiveKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane' | 'capsule' | 'torusKnot' | 'octahedron' | 'tetrahedron' | 'icosahedron' | 'dodecahedron' | 'ring' | 'circle' | 'roundedBox' | 'extrude' | 'lathe' | 'tube' | 'customMesh'
export type SceneObject = {
  id: string
  name: string
  kind: PrimitiveKind
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  visible: boolean
  dimensions: [number, number, number]
  roughness?: number
  metalness?: number
  opacity?: number
  transparent?: boolean
  wireframe?: boolean
  geometryOptions?: Record<string, number>
  shapePoints?: [number, number][]
  lathePoints?: [number, number][]
  pathPoints?: [number, number, number][]
  meshVertices?: [number, number, number][]
  meshIndices?: number[]
}
type Snapshot = { objects: SceneObject[]; selectedId: string | null }
type Store = Snapshot & {
  script: string
  output: string
  past: Snapshot[]
  future: Snapshot[]
  setScript: (script: string) => void
  setOutput: (output: string) => void
  replaceScene: (objects: SceneObject[], selectedId?: string | null) => void
  addObjects: (objects: SceneObject[]) => void
  select: (id: string | null) => void
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  removeObject: (id: string) => void
  duplicateObject: (id: string) => void
  clear: () => void
  undo: () => void
  redo: () => void
}
const starter: SceneObject = {
  id: 'starter-cube', name: 'Cubo inicial', kind: 'box',
  position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
  color: '#2388ff', visible: true, dimensions: [1, 1, 1],
}
const clone = (s: Snapshot): Snapshot => ({
  objects: s.objects.map(o => ({ ...o, position: [...o.position] as [number,number,number], rotation: [...o.rotation] as [number,number,number], scale: [...o.scale] as [number,number,number], dimensions: [...o.dimensions] as [number,number,number], shapePoints: o.shapePoints?.map(p => [...p] as [number,number]), lathePoints: o.lathePoints?.map(p => [...p] as [number,number]), pathPoints: o.pathPoints?.map(p => [...p] as [number,number,number]), meshVertices: o.meshVertices?.map(p => [...p] as [number,number,number]), meshIndices: o.meshIndices ? [...o.meshIndices] : undefined })),
  selectedId: s.selectedId,
})
const remember = (state: Store): Pick<Store, 'past' | 'future'> => ({
  past: [...state.past, clone({ objects: state.objects, selectedId: state.selectedId })].slice(-80),
  future: [],
})
export const useStudio = create<Store>((set, get) => ({
  objects: [starter], selectedId: starter.id, past: [], future: [],
  script: `// DZ STUDIO 3D — seu primeiro modelo
const corpo = DZ.createBox({
  name: "Corpo principal",
  width: 2,
  height: 1,
  depth: 1,
  color: "#2388ff"
});
DZ.addToScene(corpo);

const topo = DZ.createBox({
  name: "Detalhe superior",
  width: 1,
  height: 0.35,
  depth: 0.8,
  color: "#20d6c7"
});
DZ.setPosition(topo, 0, 0.68, 0);
DZ.addToScene(topo);
`,
  output: 'Pronto para executar seu script.',
  setScript: (script) => set({ script }),
  setOutput: (output) => set({ output }),
  replaceScene: (objects, selectedId = objects.at(-1)?.id ?? null) => set(s => ({ ...remember(s), objects, selectedId })),
  addObjects: (objects) => set(s => ({ ...remember(s), objects, selectedId: objects.at(-1)?.id ?? null })),
  select: (selectedId) => set({ selectedId }),
  updateObject: (id, patch) => set(s => ({ ...remember(s), objects: s.objects.map(o => o.id === id ? { ...o, ...patch } : o) })),
  removeObject: (id) => set(s => {
    const objects = s.objects.filter(o => o.id !== id)
    return { ...remember(s), objects, selectedId: s.selectedId === id ? objects[0]?.id ?? null : s.selectedId }
  }),
  duplicateObject: (id) => {
    const s = get()
    const source = s.objects.find(o => o.id === id)
    if (!source) return
    const copy = { ...source, id: crypto.randomUUID(), name: source.name + ' cópia', position: [source.position[0] + 0.5, source.position[1], source.position[2] + 0.5] as [number,number,number] }
    set({ ...remember(s), objects: [...s.objects, copy], selectedId: copy.id })
  },
  clear: () => set(s => ({ ...remember(s), objects: [], selectedId: null })),
  undo: () => set(s => {
    if (!s.past.length) return {}
    const previous = s.past[s.past.length - 1]
    return { ...clone(previous), past: s.past.slice(0, -1), future: [clone({ objects: s.objects, selectedId: s.selectedId }), ...s.future] }
  }),
  redo: () => set(s => {
    if (!s.future.length) return {}
    const next = s.future[0]
    return { ...clone(next), past: [...s.past, clone({ objects: s.objects, selectedId: s.selectedId })].slice(-80), future: s.future.slice(1) }
  }),
}))
