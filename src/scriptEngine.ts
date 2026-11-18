import { parse } from '@babel/parser'
import type { SceneObject, PrimitiveKind } from './store'

const primitiveKinds: PrimitiveKind[] = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane']
const num = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown, fallback: string) => typeof v === 'string' ? v : fallback
const vector = (value: unknown, fallback: [number, number, number], label: string): [number, number, number] => {
  let values: unknown[] | null = null
  if (Array.isArray(value)) values = value
  else if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    values = [v.x, v.y, v.z]
  }
  if (!values || values.length !== 3) return [...fallback]
  const result = values.map((v, i) => num(v, fallback[i])) as [number, number, number]
  if (result.some(v => Math.abs(v) > 10000)) throw new Error(`${label}: valores devem ficar entre -10.000 e 10.000.`)
  return result
}
const validColor = (value: unknown, fallback: string) => {
  const color = str(value, fallback)
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Cor inválida. Use hexadecimal, por exemplo #2388ff.')
  return color
}
const clamp01 = (value: unknown, fallback: number, label: string) => {
  const n = num(value, fallback)
  if (n < 0 || n > 1) throw new Error(`${label} deve estar entre 0 e 1.`)
  return n
}

// DZ API v0.2 — DSL segura: sem eval, Function, DOM, rede, imports ou acesso ao navegador.
export function runStudioScript(source: string, existing: SceneObject[] = []): SceneObject[] {
  if (source.length > 200_000) throw new Error('Script excede o limite de 200 KB.')
  const ast = parse(source, { sourceType: 'module' })
  if (ast.program.body.length > 5000) throw new Error('Script excede o limite de 5.000 instruções.')
  const vars = new Map<string, unknown>()
  const staged = existing.map(o => ({ ...o, position: [...o.position] as [number,number,number], rotation: [...o.rotation] as [number,number,number], scale: [...o.scale] as [number,number,number], dimensions: [...o.dimensions] as [number,number,number] }))
  const created = new Set<string>()
  const read = (node: any): any => {
    if (!node) return undefined
    if (node.type === 'StringLiteral' || node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') return node.value
    if (node.type === 'NullLiteral') return null
    if (node.type === 'Identifier') {
      if (vars.has(node.name)) return vars.get(node.name)
      throw new Error(`Identificador não permitido: ${node.name}`)
    }
    if (node.type === 'ObjectExpression') {
      const out: Record<string, unknown> = {}
      for (const p of node.properties) {
        if (p.type !== 'ObjectProperty' || p.computed || p.method || p.shorthand) throw new Error('Propriedade de objeto não suportada.')
        const key = p.key.name ?? p.key.value
        if (['__proto__', 'prototype', 'constructor'].includes(String(key))) throw new Error('Nome de propriedade não permitido.')
        out[String(key)] = read(p.value)
      }
      return out
    }
    if (node.type === 'ArrayExpression') return node.elements.map(read)
    if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) return (node.operator === '-' ? -1 : 1) * num(read(node.argument), 0)
    throw new Error(`Expressão não permitida: ${node.type}`)
  }
  const getObject = (value: unknown): SceneObject => {
    if (!value || typeof value !== 'object' || !('id' in value)) throw new Error('A função espera um objeto criado pela DZ API.')
    const object = value as SceneObject
    if (!created.has(object.id)) throw new Error('O script só pode modificar objetos criados na execução atual.')
    return object
  }
  const call = (node: any): unknown => {
    if (node.type !== 'CallExpression' || node.optional || node.arguments.some((a: any) => a.type === 'SpreadElement')) throw new Error('Chamada de função inválida.')
    const callee = node.callee
    if (callee.type !== 'MemberExpression' || callee.computed || callee.object.type !== 'Identifier' || callee.object.name !== 'DZ' || callee.property.type !== 'Identifier') {
      throw new Error('Apenas chamadas diretas DZ.<função>() são permitidas.')
    }
    const method = callee.property.name
    const args = node.arguments.map(read)
    if (method === 'createCube' || method === 'createBox' || method === 'createSphere' || method === 'createCylinder' || method === 'createCone' || method === 'createTorus' || method === 'createPlane') {
      const requested = method === 'createCube' ? 'box' : method.slice(6).toLowerCase()
      const kind = requested as PrimitiveKind
      if (!primitiveKinds.includes(kind)) throw new Error(`Geometria não suportada: ${method}. Disponíveis: createCube, createBox, createSphere, createCylinder, createCone, createTorus e createPlane.`)
      const p = (args[0] ?? {}) as Record<string, unknown>
      const radius = num(p.radius, 0.5)
      const dimensions: [number, number, number] = [
        num(p.width, radius * 2),
        num(p.height, kind === 'sphere' ? radius * 2 : 1),
        num(p.depth, num(p.width, radius * 2)),
      ]
      if (dimensions.some(n => n <= 0 || n > 10000)) throw new Error('Dimensões devem ser maiores que zero e menores que 10.000.')
      const object: SceneObject = {
        id: crypto.randomUUID(), name: str(p.name, `Objeto ${created.size + 1}`).slice(0, 100), kind,
        position: vector(p.position, [0,0,0], 'Posição'),
        rotation: vector(p.rotation, [0,0,0], 'Rotação'),
        scale: vector(p.scale, [1,1,1], 'Escala'),
        color: validColor(p.color, '#2388ff'), visible: p.visible !== false, dimensions,
        roughness: clamp01(p.roughness, 0.48, 'Rugosidade'),
        metalness: clamp01(p.metalness, 0.18, 'Metallicidade'),
        opacity: clamp01(p.opacity, 1, 'Opacidade'),
        transparent: p.transparent === true || num(p.opacity, 1) < 1,
        wireframe: p.wireframe === true,
      }
      if (object.scale.some(n => n === 0)) throw new Error('A escala não pode conter zero.')
      created.add(object.id)
      return object
    }
    if (method === 'addToScene') {
      const object = getObject(args[0])
      if (staged.length >= 10000) throw new Error('Limite de 10.000 objetos por cena atingido.')
      if (!staged.some(o => o.id === object.id)) staged.push(object)
      return object
    }
    if (method === 'setPosition' || method === 'setRotation' || method === 'setScale') {
      const object = getObject(args[0])
      const key = method === 'setPosition' ? 'position' : method === 'setRotation' ? 'rotation' : 'scale'
      const fallback: [number,number,number] = key === 'scale' ? [1,1,1] : [0,0,0]
      const value = args.length === 2 ? args[1] : args.slice(1)
      const next = vector(value, fallback, key)
      if (key === 'scale' && next.some(n => n === 0)) throw new Error('A escala não pode conter zero.')
      object[key] = next
      return object
    }
    if (method === 'translate' || method === 'rotate' || method === 'scaleBy') {
      const object = getObject(args[0])
      const key = method === 'translate' ? 'position' : method === 'rotate' ? 'rotation' : 'scale'
      const delta = vector(args.length === 2 ? args[1] : args.slice(1), [0,0,0], method)
      const next = object[key].map((v, i) => method === 'scaleBy' ? v * (delta[i] || 1) : v + delta[i]) as [number,number,number]
      if (next.some(n => !Number.isFinite(n) || Math.abs(n) > 10000) || (key === 'scale' && next.some(n => n === 0))) throw new Error('Transformação fora dos limites permitidos.')
      object[key] = next
      return object
    }
    if (method === 'setDimensions') {
      const object = getObject(args[0])
      const next = vector(args.length === 2 ? args[1] : args.slice(1), object.dimensions, 'Dimensões')
      if (next.some(n => n <= 0)) throw new Error('Dimensões devem ser maiores que zero.')
      object.dimensions = next
      return object
    }
    if (method === 'setName') {
      const object = getObject(args[0])
      if (typeof args[1] !== 'string' || !args[1].trim()) throw new Error('O nome do objeto não pode ficar vazio.')
      object.name = args[1].slice(0, 100)
      return object
    }
    if (method === 'setVisible') {
      const object = getObject(args[0])
      if (typeof args[1] !== 'boolean') throw new Error('setVisible espera true ou false.')
      object.visible = args[1]
      return object
    }
    if (method === 'setMaterial') {
      const object = getObject(args[0])
      const options = (args[1] ?? {}) as Record<string, unknown>
      object.color = validColor(options.color, object.color)
      object.roughness = clamp01(options.roughness, object.roughness ?? 0.48, 'Rugosidade')
      object.metalness = clamp01(options.metalness, object.metalness ?? 0.18, 'Metallicidade')
      object.opacity = clamp01(options.opacity, object.opacity ?? 1, 'Opacidade')
      object.transparent = options.transparent === undefined ? object.opacity < 1 : options.transparent === true
      object.wireframe = options.wireframe === undefined ? object.wireframe ?? false : options.wireframe === true
      return object
    }
    if (method === 'removeObject') {
      const object = getObject(args[0])
      const index = staged.findIndex(o => o.id === object.id)
      if (index >= 0) staged.splice(index, 1)
      return null
    }
    throw new Error(`Função DZ não reconhecida: ${method}`)
  }
  for (const statement of ast.program.body) {
    if (statement.type === 'VariableDeclaration') {
      if (statement.kind === 'var') throw new Error('Use const ou let.')
      for (const declaration of statement.declarations) {
        if (declaration.id.type !== 'Identifier' || !declaration.init) throw new Error('Declaração de variável inválida.')
        if (vars.has(declaration.id.name)) throw new Error(`Variável duplicada: ${declaration.id.name}`)
        const init = declaration.init.type === 'CallExpression' ? call(declaration.init) : read(declaration.init)
        vars.set(declaration.id.name, init)
      }
    } else if (statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression') {
      call(statement.expression)
    } else {
      throw new Error(`Comando não permitido: ${statement.type}`)
    }
  }
  return staged
}
