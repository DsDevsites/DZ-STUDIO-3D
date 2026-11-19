import { parse } from '@babel/parser'
import type { SceneObject, PrimitiveKind } from './store'

const primitiveKinds: PrimitiveKind[] = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'capsule', 'torusKnot', 'octahedron', 'tetrahedron', 'icosahedron', 'dodecahedron', 'ring', 'circle', 'roundedBox', 'extrude', 'lathe']
const num = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown, fallback: string) => typeof v === 'string' ? v : fallback
const vector = (value: unknown, fallback: [number, number, number], label: string): [number, number, number] => {
  let values: unknown[] | null = null
  if (Array.isArray(value)) values = value
  else if (value && typeof value === 'object') { const v = value as Record<string, unknown>; values = [v.x, v.y, v.z] }
  if (!values || values.length !== 3) return [...fallback]
  const result = values.map((v, i) => num(v, fallback[i])) as [number, number, number]
  if (result.some(v => Math.abs(v) > 10000)) throw new Error(label + ': valores devem ficar entre -10.000 e 10.000.')
  return result
}
const validColor = (value: unknown, fallback: string) => {
  const color = str(value, fallback)
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Cor inválida. Use hexadecimal, por exemplo #2388ff.')
  return color
}
const clamp01 = (value: unknown, fallback: number, label: string) => {
  const n = num(value, fallback)
  if (n < 0 || n > 1) throw new Error(label + ' deve estar entre 0 e 1.')
  return n
}
const safeMath: Record<string, (...args: number[]) => number> = {
  abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
  min: Math.min, max: Math.max, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  sqrt: Math.sqrt, pow: Math.pow,
}
const truthy = (v: unknown) => Boolean(v)

// DZ API v0.3 — DSL segura com repetição limitada, matemática e condições.
// JavaScript arbitrário, DOM, rede, imports, eval e Function continuam bloqueados.
export function runStudioScript(source: string, existing: SceneObject[] = []): SceneObject[] {
  if (source.length > 200_000) throw new Error('Script excede o limite de 200 KB.')
  const ast = parse(source, { sourceType: 'module' })
  if (ast.program.body.length > 5000) throw new Error('Script excede o limite de 5.000 instruções.')
  const scopes: Map<string, unknown>[] = [new Map()]
  const findScope = (name: string) => [...scopes].reverse().find(scope => scope.has(name))
  const getVariable = (name: string) => { const scope = findScope(name); if (!scope) throw new Error('Identificador não permitido: ' + name); return scope.get(name) }
  const staged = existing.map(o => ({ ...o, position: [...o.position] as [number,number,number], rotation: [...o.rotation] as [number,number,number], scale: [...o.scale] as [number,number,number], dimensions: [...o.dimensions] as [number,number,number] }))
  const created = new Set<string>()
  let iterations = 0
  let executedStatements = 0

  const read = (node: any): any => {
    if (!node) return undefined
    switch (node.type) {
      case 'StringLiteral': case 'NumericLiteral': case 'BooleanLiteral': return node.value
      case 'NullLiteral': return null
      case 'Identifier':
        return getVariable(node.name)
      case 'ObjectExpression': {
        const out: Record<string, unknown> = {}
        for (const p of node.properties) {
          if (p.type !== 'ObjectProperty' || p.computed || p.method || p.shorthand) throw new Error('Propriedade de objeto não suportada.')
          const key = p.key.name ?? p.key.value
          if (['__proto__', 'prototype', 'constructor'].includes(String(key))) throw new Error('Nome de propriedade não permitido.')
          out[String(key)] = read(p.value)
        }
        return out
      }
      case 'ArrayExpression': return node.elements.map(read)
      case 'UnaryExpression': {
        const value = read(node.argument)
        if (node.operator === '-') return -num(value, 0)
        if (node.operator === '+') return num(value, 0)
        if (node.operator === '!') return !truthy(value)
        throw new Error('Operador unário não permitido.')
      }
      case 'BinaryExpression': {
        const a = read(node.left), b = read(node.right)
        switch (node.operator) {
          case '+': return typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : num(a, 0) + num(b, 0)
          case '-': return num(a, 0) - num(b, 0)
          case '*': return num(a, 0) * num(b, 0)
          case '/': if (num(b, 0) === 0) throw new Error('Divisão por zero.'); return num(a, 0) / num(b, 0)
          case '%': if (num(b, 0) === 0) throw new Error('Divisão por zero.'); return num(a, 0) % num(b, 0)
          case '**': return num(a, 0) ** num(b, 0)
          case '===': return a === b
          case '!==': return a !== b
          case '==': return a == b
          case '!=': return a != b
          case '<': return a < b
          case '<=': return a <= b
          case '>': return a > b
          case '>=': return a >= b
          default: throw new Error('Operador não permitido: ' + node.operator)
        }
      }
      case 'LogicalExpression': {
        const left = read(node.left)
        if (node.operator === '&&') return truthy(left) ? read(node.right) : left
        if (node.operator === '||') return truthy(left) ? left : read(node.right)
        if (node.operator === '??') return left ?? read(node.right)
        throw new Error('Operador lógico não permitido.')
      }
      case 'ConditionalExpression': return truthy(read(node.test)) ? read(node.consequent) : read(node.alternate)
      case 'TemplateLiteral': {
        let result = ''
        node.quasis.forEach((q: any, i: number) => { result += q.value.cooked ?? q.value.raw; if (node.expressions[i]) result += String(read(node.expressions[i])) })
        return result
      }
      case 'MemberExpression': {
        if (node.computed) {
          const target = read(node.object), key = read(node.property)
          if (Array.isArray(target) && Number.isInteger(key) && key >= 0 && key < target.length) return target[key]
          throw new Error('Acesso a propriedade não permitido.')
        }
        if (node.object.type === 'Identifier' && node.object.name === 'Math' && node.property.type === 'Identifier' && node.property.name === 'PI') return Math.PI
        throw new Error('Acesso a propriedades não permitido, exceto Math.PI e índices de arrays.')
      }
      case 'CallExpression': {
        const callee = node.callee
        if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier' && callee.object.name === 'Math' && callee.property.type === 'Identifier') {
          const fn = safeMath[callee.property.name]
          if (!fn) throw new Error('Função Math não permitida: ' + callee.property.name)
          const result = fn(...node.arguments.map((a: any) => num(read(a), 0)))
          if (!Number.isFinite(result)) throw new Error('A operação matemática produziu um valor inválido.')
          return result
        }
        return call(node)
      }
      default: throw new Error('Expressão não permitida: ' + node.type)
    }
  }

  const checkedPoints = (value: unknown, min: number, max: number, label: string): [number,number][] => { if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(label + ` exige de ${min} a ${max} pontos 2D.`); return value.map((p,i) => { if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 1000 || Math.abs(p[1]) > 1000) throw new Error(label + ` possui ponto inválido ${i+1}.`); return [p[0],p[1]] }) }
  const getObject = (value: unknown): SceneObject => {
    if (!value || typeof value !== 'object' || !('id' in value)) throw new Error('A função espera um objeto criado pela DZ API.')
    const object = value as SceneObject
    if (!created.has(object.id)) throw new Error('O script só pode modificar objetos criados na execução atual.')
    return object
  }

  const call = (node: any): unknown => {
    if (node.type !== 'CallExpression' || node.optional || node.arguments.some((a: any) => a.type === 'SpreadElement')) throw new Error('Chamada de função inválida.')
    const callee = node.callee
    if (callee.type !== 'MemberExpression' || callee.computed || callee.object.type !== 'Identifier' || callee.object.name !== 'DZ' || callee.property.type !== 'Identifier') throw new Error('Apenas chamadas diretas DZ.<função>() são permitidas.')
    const method = callee.property.name
    const args = node.arguments.map(read)
    if (['createCube','createBox','createSphere','createCylinder','createCone','createTorus','createPlane','createCapsule','createTorusKnot','createOctahedron','createTetrahedron','createIcosahedron','createDodecahedron','createRing','createCircle','createRoundedBox','createExtrude','createLathe'].includes(method)) {
      const kindByMethod: Record<string, PrimitiveKind> = { createCube: 'box', createBox: 'box', createSphere: 'sphere', createCylinder: 'cylinder', createCone: 'cone', createTorus: 'torus', createPlane: 'plane', createCapsule: 'capsule', createTorusKnot: 'torusKnot', createOctahedron: 'octahedron', createTetrahedron: 'tetrahedron', createIcosahedron: 'icosahedron', createDodecahedron: 'dodecahedron', createRing: 'ring', createCircle: 'circle', createRoundedBox: 'roundedBox', createExtrude: 'extrude', createLathe: 'lathe' }
      const kind = kindByMethod[method]
      if (!primitiveKinds.includes(kind)) throw new Error('Geometria não suportada: ' + method)
      const p = (args[0] ?? {}) as Record<string, unknown>
      const radius = num(p.radius, 0.5)
      const dimensions: [number,number,number] = [num(p.width, radius * 2), num(p.height, ['sphere','octahedron','tetrahedron','icosahedron','dodecahedron','ring','circle'].includes(kind) ? radius * 2 : 1), num(p.depth, num(p.width, radius * 2))]
      if (dimensions.some(n => n <= 0 || n > 10000)) throw new Error('Dimensões devem ser maiores que zero e menores que 10.000.')
      const geometryOptions = {
        cornerRadius: num(p.cornerRadius, 0.12), bevelSegments: Math.round(num(p.bevelSegments, 4)),
        radiusTop: num(p.radiusTop, radius), radiusBottom: num(p.radiusBottom, radius),
        radialSegments: Math.round(num(p.radialSegments, 32)),
        tubularSegments: Math.round(num(p.tubularSegments, 48)),
        tube: num(p.tube, Math.max(0.02, radius * 0.12)),
        innerRadius: num(p.innerRadius, radius * 0.55), outerRadius: num(p.outerRadius, radius),
        detail: Math.round(num(p.detail, 0)), p: Math.round(num(p.p, 2)), q: Math.round(num(p.q, 3)),
        widthSegments: Math.round(num(p.widthSegments, 32)),
        heightSegments: Math.round(num(p.heightSegments, 24)), bevelThickness: num(p.bevelThickness, 0.04), bevelSize: num(p.bevelSize, 0.03), bevelEnabled: p.bevelEnabled === false ? 0 : 1,
      }
      for (const entry of Object.entries(geometryOptions)) {
        if (!Number.isFinite(entry[1]) || (['detail','p','q'].includes(entry[0]) ? entry[1] < 0 || entry[1] > 8 : entry[0] === 'cornerRadius' ? entry[1] < 0 || entry[1] > 1000 : entry[1] <= 0 || entry[1] > 256)) throw new Error(entry[0] + ' está fora do limite permitido.')
      }
      const object: SceneObject = {
        id: crypto.randomUUID(), name: str(p.name, 'Objeto ' + (created.size + 1)).slice(0,100), kind,
        position: vector(p.position,[0,0,0],'Posição'), rotation: vector(p.rotation,[0,0,0],'Rotação'), scale: vector(p.scale,[1,1,1],'Escala'),
        color: validColor(p.color,'#2388ff'), visible: p.visible !== false, dimensions,
        geometryOptions, shapePoints: kind === 'extrude' ? checkedPoints(p.points,3,128,'createExtrude') : undefined, lathePoints: kind === 'lathe' ? checkedPoints(p.points,2,128,'createLathe') : undefined,
        roughness: clamp01(p.roughness,0.48,'Rugosidade'), metalness: clamp01(p.metalness,0.18,'Metallicidade'),
        opacity: clamp01(p.opacity,1,'Opacidade'), transparent: p.transparent === true || num(p.opacity,1) < 1,
        wireframe: p.wireframe === true,
      }
      if (object.scale.some(n => n === 0)) throw new Error('A escala não pode conter zero.')
      created.add(object.id)
      return object
    }
    if (method === 'mirror' || method === 'array') { const source=getObject(args[0]); const copies: SceneObject[]=[]; if(method==='mirror'){ const axis=String(args[1]??'x'); if(!['x','y','z'].includes(axis)) throw new Error('mirror: eixo deve ser x, y ou z.'); const i=['x','y','z'].indexOf(axis); const copy:SceneObject={...source,id:crypto.randomUUID(),name:source.name+' | Espelhado',position:[...source.position],rotation:[...source.rotation],scale:[...source.scale],dimensions:[...source.dimensions],shapePoints:source.shapePoints?.map(p=>[...p] as [number,number]),lathePoints:source.lathePoints?.map(p=>[...p] as [number,number])}; copy.position[i]*=-1; copy.scale[i]*=-1; copies.push(copy) } else { const count=Math.floor(num(args[1],2)); const offset=vector(args[2],[1,0,0],'array offset'); if(count<1||count>100||staged.length+count>10000) throw new Error('array: quantidade deve ficar entre 1 e 100.'); for(let i=1;i<=count;i++) copies.push({...source,id:crypto.randomUUID(),name:source.name+' | Cópia '+i,position:source.position.map((v,j)=>v+offset[j]*i) as [number,number,number],rotation:[...source.rotation],scale:[...source.scale],dimensions:[...source.dimensions],shapePoints:source.shapePoints?.map(p=>[...p] as [number,number]),lathePoints:source.lathePoints?.map(p=>[...p] as [number,number])}) } copies.forEach(c=>created.add(c.id)); staged.push(...copies); return copies }
    if (method === 'addToScene') {
      const object = getObject(args[0])
      if (staged.length >= 10000) throw new Error('Limite de 10.000 objetos por cena atingido.')
      if (!staged.some(o => o.id === object.id)) staged.push(object)
      return object
    }
    if (['setPosition','setRotation','setScale'].includes(method)) {
      const object = getObject(args[0])
      const key = method === 'setPosition' ? 'position' : method === 'setRotation' ? 'rotation' : 'scale'
      const fallback: [number,number,number] = key === 'scale' ? [1,1,1] : [0,0,0]
      const value = args.length === 2 ? args[1] : args.slice(1)
      const next = vector(value,fallback,key)
      if (key === 'scale' && next.some(n => n === 0)) throw new Error('A escala não pode conter zero.')
      object[key] = next
      return object
    }
    if (['translate','rotate','scaleBy'].includes(method)) {
      const object = getObject(args[0])
      const key = method === 'translate' ? 'position' : method === 'rotate' ? 'rotation' : 'scale'
      const delta = vector(args.length === 2 ? args[1] : args.slice(1),[0,0,0],method)
      const next = object[key].map((v,i) => method === 'scaleBy' ? v * (delta[i] || 1) : v + delta[i]) as [number,number,number]
      if (next.some(n => !Number.isFinite(n) || Math.abs(n) > 10000) || (key === 'scale' && next.some(n => n === 0))) throw new Error('Transformação fora dos limites permitidos.')
      object[key] = next
      return object
    }
    if (method === 'setDimensions') {
      const object = getObject(args[0])
      const next = vector(args.length === 2 ? args[1] : args.slice(1),object.dimensions,'Dimensões')
      if (next.some(n => n <= 0)) throw new Error('Dimensões devem ser maiores que zero.')
      object.dimensions = next
      return object
    }
    if (method === 'setName') {
      const object = getObject(args[0])
      if (typeof args[1] !== 'string' || !args[1].trim()) throw new Error('O nome do objeto não pode ficar vazio.')
      object.name = args[1].slice(0,100); return object
    }
    if (method === 'setVisible') {
      const object = getObject(args[0])
      if (typeof args[1] !== 'boolean') throw new Error('setVisible espera true ou false.')
      object.visible = args[1]; return object
    }
    if (method === 'setMaterial') {
      const object = getObject(args[0]), options = (args[1] ?? {}) as Record<string,unknown>
      object.color = validColor(options.color,object.color)
      object.roughness = clamp01(options.roughness,object.roughness ?? .48,'Rugosidade')
      object.metalness = clamp01(options.metalness,object.metalness ?? .18,'Metallicidade')
      object.opacity = clamp01(options.opacity,object.opacity ?? 1,'Opacidade')
      object.transparent = options.transparent === undefined ? object.opacity < 1 : options.transparent === true
      object.wireframe = options.wireframe === undefined ? object.wireframe ?? false : options.wireframe === true
      return object
    }
    if (method === 'removeObject') {
      const object = getObject(args[0]), index = staged.findIndex(o => o.id === object.id)
      if (index >= 0) staged.splice(index,1)
      return null
    }
    throw new Error('Função DZ não reconhecida: ' + method)
  }

  const update = (node: any) => {
    if (node.type === 'UpdateExpression' && node.argument.type === 'Identifier') {
      const name = node.argument.name
      const scope = findScope(name)
      if (!scope) throw new Error('Variável não declarada: ' + name)
      const old = num(scope.get(name),0), next = old + (node.operator === '++' ? 1 : node.operator === '--' ? -1 : 0)
      if (!['++','--'].includes(node.operator)) throw new Error('Atualização não permitida.')
      scope.set(name,next); return node.prefix ? next : old
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') {
      const name = node.left.name
      const scope = findScope(name)
      if (!scope) throw new Error('Variável não declarada: ' + name)
      const old = scope.get(name), right = read(node.right)
      let next: any
      if (node.operator === '=') next = right
      else if (node.operator === '+=') next = typeof old === 'string' ? String(old) + String(right) : num(old,0) + num(right,0)
      else if (node.operator === '-=') next = num(old,0) - num(right,0)
      else if (node.operator === '*=') next = num(old,0) * num(right,0)
      else if (node.operator === '/=') { if (num(right,0) === 0) throw new Error('Divisão por zero.'); next = num(old,0) / num(right,0) }
      else throw new Error('Atribuição não permitida.')
      scope.set(name,next); return next
    }
    throw new Error('Atualização de variável inválida.')
  }

  const execute = (statement: any): void => {
    executedStatements++
    if (executedStatements > 50000) throw new Error('Limite de 50.000 instruções executadas atingido.')
    switch (statement.type) {
      case 'VariableDeclaration':
        if (statement.kind === 'var') throw new Error('Use const ou let.')
        for (const declaration of statement.declarations) {
          if (declaration.id.type !== 'Identifier' || !declaration.init) throw new Error('Declaração de variável inválida.')
          const currentScope = scopes[scopes.length - 1]
          if (currentScope.has(declaration.id.name)) throw new Error('Variável duplicada no mesmo bloco: ' + declaration.id.name)
          currentScope.set(declaration.id.name, read(declaration.init))
        }
        return
      case 'ExpressionStatement':
        if (statement.expression.type === 'CallExpression') call(statement.expression)
        else if (['UpdateExpression','AssignmentExpression'].includes(statement.expression.type)) update(statement.expression)
        else read(statement.expression)
        return
      case 'BlockStatement': {
        scopes.push(new Map())
        try { for (const child of statement.body) execute(child) }
        finally { scopes.pop() }
        return
      }
      case 'IfStatement':
        execute(truthy(read(statement.test)) ? statement.consequent : statement.alternate ?? { type: 'EmptyStatement' })
        return
      case 'ForStatement': {
        scopes.push(new Map())
        try {
        if (statement.init) {
          if (statement.init.type === 'VariableDeclaration') execute(statement.init)
          else if (statement.init.type === 'AssignmentExpression') update(statement.init)
          else throw new Error('Inicialização de for não permitida.')
        }
        let local = 0
        while (!statement.test || truthy(read(statement.test))) {
          local++; iterations++
          if (local > 1000 || iterations > 10000) throw new Error('Limite de repetição excedido: máximo de 1.000 ciclos por loop e 10.000 no total.')
          execute(statement.body)
          if (statement.update) update(statement.update)
        }
        } finally { scopes.pop() }
        return
      }
      case 'EmptyStatement': return
      default: throw new Error('Comando não permitido: ' + statement.type)
    }
  }
  for (const statement of ast.program.body) execute(statement)
  return staged
}
