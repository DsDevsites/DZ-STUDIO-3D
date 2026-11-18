import { parse } from '@babel/parser'
import type { SceneObject, PrimitiveKind } from './store'

type Descriptor = Omit<SceneObject, 'id' | 'visible'> & { visible?: boolean }
const num = (v: unknown, fallback: number) => typeof v === 'number' ? v : fallback
const str = (v: unknown, fallback: string) => typeof v === 'string' ? v : fallback

// Interpretador intencionalmente restrito: aceita declarações, objetos e chamadas DZ API.
// Não executa JavaScript arbitrário, eval, imports, loops ou acesso ao navegador.
export function runStudioScript(source: string, existing: SceneObject[]): SceneObject[] {
  const ast = parse(source, { sourceType: 'module' })
  const vars = new Map<string, unknown>()
  const created: SceneObject[] = []
  const staged = [...existing]
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
        if (p.type !== 'ObjectProperty' || p.computed || p.method) throw new Error('Propriedade de objeto não suportada.')
        const key = p.key.name ?? p.key.value
        out[String(key)] = read(p.value)
      }
      return out
    }
    if (node.type === 'ArrayExpression') return node.elements.map(read)
    if (node.type === 'UnaryExpression' && node.operator === '-') return -num(read(node.argument), 0)
    throw new Error(`Expressão não permitida: ${node.type}`)
  }
  const call = (node: any) => {
    if (node.type !== 'CallExpression' || node.optional) throw new Error('Somente chamadas diretas da DZ API são permitidas.')
    const callee = node.callee
    if (callee.type !== 'MemberExpression' || callee.computed || callee.object.type !== 'Identifier' || callee.object.name !== 'DZ') {
      throw new Error('Apenas chamadas DZ.<função>() são permitidas.')
    }
    const method = callee.property.name
    const args = node.arguments.map(read)
    if (method.startsWith('create')) {
      const kind = method.slice(6).toLowerCase() as PrimitiveKind
      if (!['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'].includes(kind)) throw new Error(`Geometria não suportada: ${method}`)
      const p = (args[0] ?? {}) as Record<string, unknown>
      const width = num(p.width, num(p.radius, 1) * 2)
      const height = num(p.height, kind === 'sphere' ? width : 1)
      const depth = num(p.depth, width)
      return {
        id: crypto.randomUUID(), name: str(p.name, `Objeto ${created.length + 1}`), kind,
        position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        color: str(p.color, '#2388ff'), visible: true, dimensions: [width, height, depth],
      } satisfies SceneObject
    }
    if (method === 'addToScene') {
      const obj = args[0] as SceneObject
      if (!obj || !obj.id) throw new Error('DZ.addToScene espera um objeto criado pela DZ API.')
      if (!staged.some((o) => o.id === obj.id)) { staged.push(obj); created.push(obj) }
      return obj
    }
    if (method === 'setPosition') {
      const obj = args[0] as SceneObject
      if (!obj?.id) throw new Error('Objeto inválido em DZ.setPosition.')
      obj.position = [num(args[1], 0), num(args[2], 0), num(args[3], 0)]
      return obj
    }
    if (method === 'setScale') {
      const obj = args[0] as SceneObject
      if (!obj?.id) throw new Error('Objeto inválido em DZ.setScale.')
      obj.scale = [num(args[1], 1), num(args[2], 1), num(args[3], 1)]
      return obj
    }
    if (method === 'setRotation') {
      const obj = args[0] as SceneObject
      if (!obj?.id) throw new Error('Objeto inválido em DZ.setRotation.')
      obj.rotation = [num(args[1], 0), num(args[2], 0), num(args[3], 0)]
      return obj
    }
    if (method === 'removeObject') {
      const id = typeof args[0] === 'string' ? args[0] : (args[0] as SceneObject)?.id
      const index = staged.findIndex((o) => o.id === id)
      if (index >= 0) staged.splice(index, 1)
      return null
    }
    throw new Error(`Função DZ não reconhecida: ${method}`)
  }
  for (const statement of ast.program.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        if (declaration.id.type !== 'Identifier' || !declaration.init) throw new Error('Declaração de variável inválida.')
        if (vars.has(declaration.id.name)) throw new Error(`Variável duplicada: ${declaration.id.name}`)
        const init = declaration.init.type === 'CallExpression' ? call(declaration.init) : read(declaration.init)
        vars.set(declaration.id.name, init)
      }
    } else if (statement.type === 'ExpressionStatement') {
      if (statement.expression.type !== 'CallExpression') throw new Error('Somente chamadas da DZ API são permitidas.')
      call(statement.expression)
    } else {
      throw new Error(`Comando não permitido: ${statement.type}`)
    }
  }
  return staged
}
