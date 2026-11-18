import { parse } from '@babel/parser'
import type { SceneObject, PrimitiveKind } from './store'

const primitiveKinds: PrimitiveKind[] = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane']
const num = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown, fallback: string) => typeof v === 'string' ? v : fallback
const tuple = (v: unknown, fallback: [number, number, number]) =>
  Array.isArray(v) && v.length === 3 ? v.map((n, i) => num(n, fallback[i])) as [number, number, number] : fallback

// DSL restrita: não usa eval/Function e não permite DOM, rede, imports, loops ou APIs do browser.
export function runStudioScript(source: string, existing: SceneObject[]): SceneObject[] {
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
        out[String(key)] = read(p.value)
      }
      return out
    }
    if (node.type === 'ArrayExpression') return node.elements.map(read)
    if (node.type === 'UnaryExpression' && node.operator === '-') return -num(read(node.argument), 0)
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
    if (method.startsWith('create')) {
      const kind = method.slice(6).toLowerCase() as PrimitiveKind
      if (!primitiveKinds.includes(kind)) throw new Error(`Geometria não suportada: ${method}`)
      const p = (args[0] ?? {}) as Record<string, unknown>
      const dimensions: [number, number, number] = [
        num(p.width, num(p.radius, 1) * 2),
        num(p.height, kind === 'sphere' ? num(p.radius, 1) * 2 : 1),
        num(p.depth, num(p.width, num(p.radius, 1) * 2)),
      ]
      if (dimensions.some(n => n <= 0 || n > 10000)) throw new Error('Dimensões devem ser maiores que zero e menores que 10.000.')
      const color = str(p.color, '#2388ff')
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Cor inválida. Use hexadecimal, por exemplo #2388ff.')
      const object: SceneObject = {
        id: crypto.randomUUID(), name: str(p.name, `Objeto ${created.size + 1}`).slice(0, 100), kind,
        position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], color, visible: true, dimensions,
      }
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
      const next = tuple(args.slice(1), fallback)
      if (next.some(n => Math.abs(n) > 10000) || (key === 'scale' && next.some(n => n === 0))) throw new Error('Transformação fora dos limites permitidos.')
      object[key] = next
      return object
    }
    if (method === 'setMaterial') {
      const object = getObject(args[0])
      const options = (args[1] ?? {}) as Record<string, unknown>
      const color = str(options.color, object.color)
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Cor inválida.')
      object.color = color
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
