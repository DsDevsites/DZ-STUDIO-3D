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
      case 'sphere': geometry = new THREE.SphereGeometry(w / 2, 32, 24); break
      case 'cylinder': geometry = new THREE.CylinderGeometry(w / 2, w / 2, h, 32); break
      case 'cone': geometry = new THREE.ConeGeometry(w / 2, h, 32); break
      case 'torus': geometry = new THREE.TorusGeometry(w / 2, Math.max(.04, w * .1), 16, 48); break
      case 'plane': geometry = new THREE.PlaneGeometry(w, d); break
      default: geometry = new THREE.BoxGeometry(w, h, d)
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: item.color, roughness: .5, metalness: .15 }))
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
