import { useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls, TransformControls } from '@react-three/drei'
import { Box, CircleHelp, Code2, Eye, EyeOff, FilePlus2, FolderOpen, Layers3, Maximize2, MousePointer2, Play, Save, Settings2, Trash2, Undo2, Redo2, BoxSelect, ChevronDown, Copy } from 'lucide-react'
import { useStudio, type SceneObject } from './store'
import { runStudioScript } from './scriptEngine'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { saveProject, loadProject } from './projectStorage'
import { exportScene } from './exportManager'

function Model({ object, selected, onSelect, transformMode, onTransformChange }: { object: SceneObject; selected: boolean; onSelect: () => void; transformMode: 'translate' | 'rotate' | 'scale'; onTransformChange: (position: [number,number,number], rotation: [number,number,number], scale: [number,number,number]) => void }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => {
    if (object.kind === 'extrude' && object.shapePoints?.length) { const shape=new THREE.Shape(); shape.moveTo(...object.shapePoints[0]); object.shapePoints.slice(1).forEach(p=>shape.lineTo(...p)); shape.closePath(); return <primitive object={new THREE.ExtrudeGeometry(shape,{depth:object.dimensions[1],bevelEnabled:(object.geometryOptions?.bevelEnabled??1)===1,bevelThickness:object.geometryOptions?.bevelThickness??.04,bevelSize:object.geometryOptions?.bevelSize??.03,bevelSegments:Math.max(1,Math.min(8,object.geometryOptions?.bevelSegments??3)),curveSegments:12})} attach="geometry" /> }
    if (object.kind === 'lathe' && object.lathePoints?.length) return <primitive object={new THREE.LatheGeometry(object.lathePoints.map(p=>new THREE.Vector2(p[0],p[1])),object.geometryOptions?.radialSegments??48)} attach="geometry" />
    if (object.kind === 'roundedBox') {
      const radius = Math.min(object.geometryOptions?.cornerRadius ?? 0.12, ...object.dimensions.map(v => v * 0.45))
      return <primitive object={new RoundedBoxGeometry(...object.dimensions, Math.max(1, Math.min(8, object.geometryOptions?.bevelSegments ?? 4)), Math.max(0.001, radius))} attach="geometry" />
    }
    switch (object.kind) {
      case 'sphere': return <sphereGeometry args={[object.dimensions[0] / 2, object.geometryOptions?.widthSegments ?? 48, object.geometryOptions?.heightSegments ?? 32]} />
      case 'cylinder': return <cylinderGeometry args={[object.geometryOptions?.radiusTop ?? object.dimensions[0] / 2, object.geometryOptions?.radiusBottom ?? object.dimensions[0] / 2, object.dimensions[1], object.geometryOptions?.radialSegments ?? 48]} />
      case 'cone': return <coneGeometry args={[object.dimensions[0] / 2, object.dimensions[1], object.geometryOptions?.radialSegments ?? 48]} />
      case 'torus': return <torusGeometry args={[object.dimensions[0] / 2, object.geometryOptions?.tube ?? Math.max(.06, object.dimensions[0] * .12), 16, object.geometryOptions?.tubularSegments ?? 64]} />
      case 'plane': return <planeGeometry args={[object.dimensions[0], object.dimensions[2], object.geometryOptions?.widthSegments ?? 1, object.geometryOptions?.heightSegments ?? 1]} />
      case 'capsule': return <capsuleGeometry args={[object.dimensions[0] / 2, Math.max(0, object.dimensions[1] - object.dimensions[0]), object.geometryOptions?.radialSegments ?? 16, object.geometryOptions?.heightSegments ?? 8]} />
      case 'torusKnot': return <torusKnotGeometry args={[object.dimensions[0] / 2, object.geometryOptions?.tube ?? 0.12, object.geometryOptions?.tubularSegments ?? 96, object.geometryOptions?.radialSegments ?? 12, object.geometryOptions?.p ?? 2, object.geometryOptions?.q ?? 3]} />
      case 'octahedron': return <octahedronGeometry args={[object.dimensions[0] / 2, object.geometryOptions?.detail ?? 0]} />
      case 'tetrahedron': return <tetrahedronGeometry args={[object.dimensions[0] / 2, object.geometryOptions?.detail ?? 0]} />
      case 'icosahedron': return <icosahedronGeometry args={[object.dimensions[0] / 2, object.geometryOptions?.detail ?? 0]} />
      case 'dodecahedron': return <dodecahedronGeometry args={[object.dimensions[0] / 2, object.geometryOptions?.detail ?? 0]} />
      case 'ring': return <ringGeometry args={[object.geometryOptions?.innerRadius ?? object.dimensions[0] * .25, object.geometryOptions?.outerRadius ?? object.dimensions[0] / 2, object.geometryOptions?.radialSegments ?? 48]} />
      case 'circle': return <circleGeometry args={[object.dimensions[0] / 2, object.geometryOptions?.radialSegments ?? 48]} />
      default: return <boxGeometry args={object.dimensions} />
    }
  }, [object.kind, object.dimensions, object.geometryOptions])
  if (!object.visible) return null
  const mesh = <mesh ref={meshRef} position={object.position} rotation={object.rotation.map(v => THREE.MathUtils.degToRad(v)) as [number, number, number]} scale={object.scale} castShadow receiveShadow onClick={(e) => { e.stopPropagation(); onSelect() }}>
    {geometry}
    <meshStandardMaterial color={selected ? '#46b5ff' : object.color} roughness={object.roughness ?? .48} metalness={object.metalness ?? .18} opacity={object.opacity ?? 1} transparent={object.transparent ?? false} wireframe={object.wireframe ?? false} flatShading={false} />
    {selected && <lineSegments>
      <edgesGeometry args={[new THREE.BoxGeometry(...object.dimensions)]} />
      <lineBasicMaterial color="#8bd5ff" />
    </lineSegments>}
  </mesh>
  if (!selected) return mesh
  return <TransformControls mode={transformMode} translationSnap={0.25} rotationSnap={Math.PI / 12} scaleSnap={0.1} onMouseUp={() => {
    const current = meshRef.current
    if (!current) return
    onTransformChange(
      [current.position.x, current.position.y, current.position.z],
      [THREE.MathUtils.radToDeg(current.rotation.x), THREE.MathUtils.radToDeg(current.rotation.y), THREE.MathUtils.radToDeg(current.rotation.z)],
      [current.scale.x, current.scale.y, current.scale.z]
    )
  }}>{mesh}</TransformControls>
}

function Viewport() {
  const objects = useStudio(s => s.objects)
  const selectedId = useStudio(s => s.selectedId)
  const select = useStudio(s => s.select)
  const updateObject = useStudio(s => s.updateObject)
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate')
  return <div className="viewport">
    <div className="viewport-top"><span><span className="live-dot" /> CENA 3D <span className="muted">/ PERSPECTIVA</span></span><span className="viewport-tools">
      <button className={transformMode === 'translate' ? 'active' : ''} onClick={() => setTransformMode('translate')} title="Mover (G)">Mover</button>
      <button className={transformMode === 'rotate' ? 'active' : ''} onClick={() => setTransformMode('rotate')} title="Rotacionar (R)">Girar</button>
      <button className={transformMode === 'scale' ? 'active' : ''} onClick={() => setTransformMode('scale')} title="Escalar (S)">Escala</button>
    </span></div>
    <Canvas camera={{ position: [5, 4, 6], fov: 45 }} onPointerMissed={() => select(null)} shadows>
      <color attach="background" args={['#0b1019']} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#d8eaff', '#172235', 0.7]} />
      <directionalLight position={[5, 8, 5]} intensity={2.3} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <directionalLight position={[-4, 3, -5]} intensity={0.65} color="#5b9acb" />
      <Grid args={[30, 30]} cellSize={1} cellThickness={.55} cellColor="#263548" sectionSize={5} sectionThickness={1} sectionColor="#38516b" fadeDistance={30} infiniteGrid />
      {objects.map(o => <Model key={o.id} object={o} selected={o.id === selectedId} onSelect={() => select(o.id)} transformMode={transformMode} onTransformChange={(position, rotation, scale) => updateObject(o.id, { position, rotation, scale })} />)}
      <OrbitControls makeDefault />
    <div className="axis-widget"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
    <div className="viewport-hint">Arraste para orbitar · Scroll para zoom · Clique em um objeto para selecionar</div>
    <div className="object-count"><Box size={13}/> {objects.length} {objects.length === 1 ? 'objeto' : 'objetos'}</div>
  </div>
}

function App() {
  const objects = useStudio(s => s.objects)
  const selectedId = useStudio(s => s.selectedId)
  const selected = objects.find(o => o.id === selectedId)
  const script = useStudio(s => s.script)
  const setScript = useStudio(s => s.setScript)
  const output = useStudio(s => s.output)
  const setOutput = useStudio(s => s.setOutput)
  const replaceScene = useStudio(s => s.replaceScene)
  const select = useStudio(s => s.select)
  const updateObject = useStudio(s => s.updateObject)
  const removeObject = useStudio(s => s.removeObject)
  const clear = useStudio(s => s.clear)
  const duplicateObject = useStudio(s => s.duplicateObject)
  const undo = useStudio(s => s.undo)
  const redo = useStudio(s => s.redo)
  const canUndo = useStudio(s => s.past.length > 0)
  const canRedo = useStudio(s => s.future.length > 0)
  const [activeTab, setActiveTab] = useState<'script' | 'console'>('script')
  const [showRight, setShowRight] = useState(() => !window.matchMedia('(max-width: 760px)').matches)
  const [showLeft, setShowLeft] = useState(() => !window.matchMedia('(max-width: 760px)').matches)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null)

  const selectAllScript = () => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const model = editor.getModel()
    if (model) editor.setSelection(model.getFullModelRange())
  }
  const clearScript = () => {
    if (!script.trim()) return
    if (!window.confirm('Apagar todo o script atual?')) return
    setScript('')
    setOutput('Editor limpo. Cole ou escreva um novo script.')
    editorRef.current?.focus()
  }
  const pasteScript = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error('A colagem automática não está disponível neste navegador.')
      const clipboardText = await navigator.clipboard.readText()
      if (!clipboardText) {
        setOutput('A área de transferência está vazia.')
        setActiveTab('console')
        return
      }
      const editor = editorRef.current
      const selection = editor?.getSelection()
      if (editor && selection) {
        editor.executeEdits('dz-paste', [{ range: selection, text: clipboardText, forceMoveMarkers: true }])
        editor.focus()
      } else {
        setScript(clipboardText)
      }
      setOutput('Script colado da área de transferência.')
    } catch (error) {
      setOutput(error instanceof Error ? error.message + ' Use o menu Colar do próprio teclado.' : 'Não foi possível acessar a área de transferência.')
      setActiveTab('console')
    }
  }

  const run = () => {
    try {
      const result = runStudioScript(script, [])
      replaceScene(result)
      setOutput(`✓ Script executado. Cena reconstruída com ${result.length} objetos.`)
      setActiveTab('console')
    } catch (error) {
      setOutput(`Erro: ${error instanceof Error ? error.message : 'Falha ao executar script'}`)
      setActiveTab('console')
    }
  }
  const save = async () => {
    try {
      setBusy(true)
      await saveProject({ name: 'Meu projeto', objects, script, version: 1, updatedAt: new Date().toISOString() })
      setSaved(true)
      setOutput('Projeto salvo no armazenamento local do navegador (IndexedDB).')
    } catch (error) {
      setOutput('Falha ao salvar: ' + (error instanceof Error ? error.message : 'erro desconhecido'))
    } finally { setBusy(false); setActiveTab('console'); window.setTimeout(() => setSaved(false), 1800) }
  }
  const open = async () => {
    try {
      setBusy(true)
      const project = await loadProject('Meu projeto')
      if (!project) { setOutput('Nenhum projeto salvo neste navegador.'); return }
      useStudio.getState().replaceScene(project.objects ?? [])
      setScript(project.script ?? '')
      setOutput('Projeto local carregado do IndexedDB.')
    } catch (error) {
      setOutput('Não foi possível abrir o projeto: ' + (error instanceof Error ? error.message : 'erro desconhecido'))
    } finally { setBusy(false); setActiveTab('console') }
  }
  const handleExport = async (format: 'glb' | 'gltf' | 'obj' | 'stl') => {
    try {
      setBusy(true)
      await exportScene(objects, format)
      setOutput('Exportação ' + format.toUpperCase() + ' concluída.')
    } catch (error) {
      setOutput('Falha na exportação: ' + (error instanceof Error ? error.message : 'erro desconhecido'))
    } finally { setBusy(false); setActiveTab('console') }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Box size={20}/></div><div><strong>DZ STUDIO <span>3D</span></strong><small> SCRIPT-DRIVEN CREATION</small></div></div>
      <div className="top-divider"/>
      <div className="project-name"><span className="project-status"/><span>Projeto sem título</span><ChevronDown size={13}/></div>
      <div className="top-actions">
        <button className="tool-button" onClick={() => { clear(); setOutput('Nova cena criada.'); }} title="Nova cena"><FilePlus2 size={16}/><span>Novo</span></button>
        <button className="tool-button" onClick={open} disabled={busy} title="Abrir projeto local"><FolderOpen size={16}/><span>Abrir</span></button>
        <button className="tool-button" onClick={save} disabled={busy} title="Salvar projeto"><Save size={16}/><span>{saved ? 'Salvo!' : 'Salvar'}</span></button>
        <span className="top-separator"/>
        <button className="tool-button icon-only" onClick={undo} disabled={!canUndo} title="Desfazer"><Undo2 size={16}/></button>
        <button className="tool-button icon-only" onClick={redo} disabled={!canRedo} title="Refazer"><Redo2 size={16}/></button>
        <button className="primary-button" onClick={run}><Play size={15} fill="currentColor"/> Executar script</button>
        <select className="export-select" defaultValue="" disabled={busy || objects.length === 0} onChange={e => { if (e.target.value) void handleExport(e.target.value as "glb" | "gltf" | "obj" | "stl"); e.target.value = "" }} aria-label="Exportar modelo"><option value="" disabled>Exportar…</option><option value="glb">Exportar GLB</option><option value="gltf">Exportar GLTF</option><option value="obj">Exportar OBJ</option><option value="stl">Exportar STL</option></select>
        <button className="tool-button icon-only" title="Configurações"><Settings2 size={17}/></button>
      </div>
    </header>
    <section className="workspace">
      {showLeft && <aside className="side-panel hierarchy">
        <div className="panel-heading"><span><Layers3 size={15}/> HIERARQUIA</span><button onClick={() => setShowLeft(false)} title="Recolher painel">×</button></div>
        <div className="scene-label"><ChevronDown size={13}/> CENA PRINCIPAL <span>{objects.length}</span></div>
        <div className="object-list">
          {objects.map(o => <div key={o.id} className={`object-row ${selectedId === o.id ? 'selected' : ''}`} onClick={() => select(o.id)}>
            <BoxSelect size={15}/><span>{o.name}</span><button onClick={e => { e.stopPropagation(); updateObject(o.id, { visible: !o.visible }) }} title={o.visible ? 'Ocultar' : 'Mostrar'}>{o.visible ? <Eye size={13}/> : <EyeOff size={13}/>}</button><button onClick={e => { e.stopPropagation(); duplicateObject(o.id) }} title="Duplicar"><Copy size={13}/></button><button onClick={e => { e.stopPropagation(); removeObject(o.id) }} title="Excluir"><Trash2 size={13}/></button>
          </div>)}
          {objects.length === 0 && <div className="empty-state">Sua cena está vazia.<br/>Crie um objeto pelo editor de scripts.</div>}
        </div>
        <div className="panel-foot">DZ SCENE MANAGER <span>v0.1</span></div>
      </aside>}
      {!showLeft && <button className="reopen-panel left-reopen" onClick={() => setShowLeft(true)}><Layers3 size={16}/></button>}
      <section className="center-stage">
        <Viewport/>
        <div className="editor-panel">
          <div className="editor-header">
            <div className="editor-tabs"><button className={activeTab === 'script' ? 'active' : ''} onClick={() => setActiveTab('script')}><Code2 size={15}/> SCRIPT EDITOR</button><button className={activeTab === 'console' ? 'active' : ''} onClick={() => setActiveTab('console')}>CONSOLE</button></div>
            <div className="editor-actions"><span className="language-tag">JAVASCRIPT · DZ API</span><button className="editor-tool" onClick={selectAllScript} title="Selecionar todo o script">Tudo</button><button className="editor-tool" onClick={() => void pasteScript()} title="Colar da área de transferência">Colar</button><button className="editor-tool clear-tool" onClick={clearScript} title="Apagar todo o script"><Trash2 size={13}/></button><button className="run-small" onClick={run}><Play size={13} fill="currentColor"/> Executar</button></div>
          </div>
          {activeTab === 'script' ? <div className="monaco-host"><Editor height="100%" language="javascript" theme="vs-dark" value={script} onMount={editor => { editorRef.current = editor }} onChange={v => setScript(v ?? '')} options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, padding: { top: 12, bottom: 12 }, wordWrap: 'on', roundedSelection: true, scrollBeyondLastColumn: 2, fixedOverflowWidgets: true, suggestOnTriggerCharacters: true }} /></div> : <div className="console-output"><span className={output.startsWith('Erro:') ? 'error-text' : 'success-text'}>●</span> {output}<button onClick={() => setActiveTab('script')}>Voltar ao editor</button></div>}
        </div>
      </section>
      {showRight && <aside className="side-panel properties">
        <div className="panel-heading"><span><Settings2 size={15}/> PROPRIEDADES</span><button onClick={() => setShowRight(false)} title="Recolher painel">×</button></div>
        {selected ? <div className="properties-content">
          <div className="selected-object"><div className="object-icon"><Box size={18}/></div><div><strong>{selected.name}</strong><small>{selected.kind.toUpperCase()} · MESH</small></div></div>
          <label className="field-label">NOME DO OBJETO</label><input className="text-input" value={selected.name} onChange={e => updateObject(selected.id, { name: e.target.value })}/>
          <div className="property-section"><h4>TRANSFORMAÇÃO</h4>{(['position','rotation','scale'] as const).map((key) => <div className="vector-row" key={key}><label>{key === 'position' ? 'Posição' : key === 'rotation' ? 'Rotação' : 'Escala'}</label><div>{([0,1,2] as const).map((axis) => <label className="axis-input" key={axis}><span className={['x','y','z'][axis]}>{['X','Y','Z'][axis]}</span><input type="number" step={key === 'rotation' ? 5 : .1} value={selected[key][axis]} onChange={e => { const next = [...selected[key]] as [number,number,number]; next[axis] = Number(e.target.value); updateObject(selected.id, { [key]: next }) }}/></label>)}</div></div>)}</div>
          <div className="property-section"><h4>APARÊNCIA</h4><label className="field-label">COR BASE</label><div className="color-control"><input type="color" value={selected.color} onChange={e => updateObject(selected.id, { color: e.target.value })}/><input className="text-input" value={selected.color} onChange={e => updateObject(selected.id, { color: e.target.value })}/></div></div>
          <div className="property-section"><h4>GEOMETRIA</h4><div className="geometry-meta"><span>Tipo</span><strong>{selected.kind}</strong></div><div className="geometry-meta"><span>Dimensões</span><strong>{selected.dimensions.map(n => n.toFixed(2)).join(' × ')}</strong></div></div>
        </div> : <div className="empty-properties"><MousePointer2 size={22}/><strong>Nenhum objeto selecionado</strong><span>Selecione um objeto na cena ou na hierarquia para editar suas propriedades.</span></div>}
        <div className="panel-foot">OBJECT INSPECTOR <span>● LIVE</span></div>
      </aside>}
      {!showRight && <button className="reopen-panel right-reopen" onClick={() => setShowRight(true)}><Settings2 size={16}/></button>}
    </section>
    <footer className="statusbar"><span><span className="live-dot"/> SISTEMA PRONTO</span><span>WEBGL · THREE.JS</span><span>UNIDADES: METROS</span><span className="status-right"><CircleHelp size={13}/> DZ STUDIO 3D <b>0.1.0 ALPHA</b></span></footer>
  </main>
}

export default App
