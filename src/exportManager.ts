import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import type { SceneObject } from './store'

function makeScene(objects: SceneObject[]) {
  const scene = new THREE.Scene()
  for (const item of objects) {
    if (!item.visible) continue
    let geometry: THREE.BufferGeometry
    const [w,h,d] = item.dimensions
    switch (item.kind) {
      case 'sphere': geometry = new THREE.SphereGeometry(w / 2, item.geometryOptions?.widthSegments ?? 48, item.geometryOptions?.heightSegments ?? 32); break
      case 'cylinder': geometry = new THREE.CylinderGeometry(item.geometryOptions?.radiusTop ?? w / 2, item.geometryOptions?.radiusBottom ?? w / 2, h, item.geometryOptions?.radialSegments ?? 48); break
      case 'cone': geometry = new THREE.ConeGeometry(w / 2, h, item.geometryOptions?.radialSegments ?? 48); break
      case 'torus': geometry = new THREE.TorusGeometry(w / 2, item.geometryOptions?.tube ?? Math.max(.04, w * .1), 16, item.geometryOptions?.tubularSegments ?? 64); break
      case 'plane': geometry = new THREE.PlaneGeometry(w, d, item.geometryOptions?.widthSegments ?? 1, item.geometryOptions?.heightSegments ?? 1); break
      case 'capsule': geometry = new THREE.CapsuleGeometry(w / 2, Math.max(0, h - w), item.geometryOptions?.radialSegments ?? 16, item.geometryOptions?.heightSegments ?? 8); break
      case 'torusKnot': geometry = new THREE.TorusKnotGeometry(w / 2, item.geometryOptions?.tube ?? .12, item.geometryOptions?.tubularSegments ?? 96, item.geometryOptions?.radialSegments ?? 12, item.geometryOptions?.p ?? 2, item.geometryOptions?.q ?? 3); break
      case 'octahedron': geometry = new THREE.OctahedronGeometry(w / 2, item.geometryOptions?.detail ?? 0); break
      case 'tetrahedron': geometry = new THREE.TetrahedronGeometry(w / 2, item.geometryOptions?.detail ?? 0); break
      case 'icosahedron': geometry = new THREE.IcosahedronGeometry(w / 2, item.geometryOptions?.detail ?? 0); break
      case 'dodecahedron': geometry = new THREE.DodecahedronGeometry(w / 2, item.geometryOptions?.detail ?? 0); break
      case 'ring': geometry = new THREE.RingGeometry(item.geometryOptions?.innerRadius ?? w * .25, item.geometryOptions?.outerRadius ?? w / 2, item.geometryOptions?.radialSegments ?? 48); break
      case 'circle': geometry = new THREE.CircleGeometry(w / 2, item.geometryOptions?.radialSegments ?? 48); break
      default: geometry = new THREE.BoxGeometry(w, h, d)
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: item.color, roughness: item.roughness ?? .5, metalness: item.metalness ?? .15, opacity: item.opacity ?? 1, transparent: item.transparent ?? false, wireframe: item.wireframe ?? false }))
    mesh.name = item.name
    mesh.position.set(...item.position)
    mesh.rotation.set(...item.rotation.map(THREE.MathUtils.degToRad) as [number,number,number])
    mesh.scale.set(...item.scale)
    scene.add(mesh)
  }
  return scene
}
function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function exportScene(objects: SceneObject[], format: 'glb' | 'gltf' | 'obj' | 'stl') {
  const scene = makeScene(objects)
  if (format === 'obj') {
    download(new OBJExporter().parse(scene), 'dz-studio-model.obj', 'text/plain')
    return
  }
  if (format === 'stl') {
    download(new STLExporter().parse(scene, { binary: true }), 'dz-studio-model.stl', 'application/octet-stream')
    return
  }
  const exporter = new GLTFExporter()
  const result = await new Promise<ArrayBuffer | object>((resolve, reject) => {
    exporter.parse(scene, resolve, reject, { binary: format === 'glb', onlyVisible: true })
  })
  if (format === 'glb') download(result as ArrayBuffer, 'dz-studio-model.glb', 'model/gltf-binary')
  else download(JSON.stringify(result, null, 2), 'dz-studio-model.gltf', 'model/gltf+json')
}
