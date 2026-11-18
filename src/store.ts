import { create } from 'zustand'

export type PrimitiveKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane'
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
}
type Snapshot = { objects: SceneObject[]; selectedId: string | null }
type Store = Snapshot & {
  script: string
  output: string
  setScript: (script: string) => void
  setOutput: (output: string) => void
  addObjects: (objects: SceneObject[]) => void
  select: (id: string | null) => void
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  removeObject: (id: string) => void
  clear: () => void
}
const starter: SceneObject = {
  id: 'starter-cube', name: 'Cubo inicial', kind: 'box',
  position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
  color: '#2388ff', visible: true, dimensions: [1, 1, 1],
}
export const useStudio = create<Store>((set) => ({
  objects: [starter], selectedId: starter.id,
  script: `// DZ STUDIO 3D — seu primeiro modelo\nconst corpo = DZ.createBox({\n  name: "Corpo principal",\n  width: 2,\n  height: 1,\n  depth: 1,\n  color: "#2388ff"\n});\nDZ.addToScene(corpo);\n\nconst topo = DZ.createBox({\n  name: "Detalhe superior",\n  width: 1,\n  height: 0.35,\n  depth: 0.8,\n  color: "#20d6c7"\n});\nDZ.setPosition(topo, 0, 0.68, 0);\nDZ.addToScene(topo);\n`,
  output: 'Pronto para executar seu script.',
  setScript: (script) => set({ script }),
  setOutput: (output) => set({ output }),
  addObjects: (objects) => set((s) => ({ objects, selectedId: objects[objects.length - 1]?.id ?? null })),
  select: (selectedId) => set({ selectedId }),
  updateObject: (id, patch) => set((s) => ({ objects: s.objects.map((o) => o.id === id ? { ...o, ...patch } : o) })),
  removeObject: (id) => set((s) => {
    const objects = s.objects.filter((o) => o.id !== id)
    return { objects, selectedId: s.selectedId === id ? objects[0]?.id ?? null : s.selectedId }
  }),
  clear: () => set({ objects: [], selectedId: null }),
}))
