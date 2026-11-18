import { useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { Box, CircleHelp, Code2, Eye, EyeOff, FilePlus2, FolderOpen, Layers3, Maximize2, MousePointer2, Play, Save, Settings2, Trash2, Undo2, Redo2, BoxSelect, ChevronDown, Copy } from 'lucide-react'
import { useStudio, type SceneObject } from './store'
import { runStudioScript } from './scriptEngine'
import * as THREE from 'three'
import { saveProject, loadProject } from './projectStorage'
import { exportScene } from './exportManager'

function Model({ object, selected, onSelect }: { object: SceneObject; selected: boolean; onSelect: () => void }) {
  const geometry = useMemo(() => {
    switch (object.kind) {
      case 'sphere': return <sphereGeometry args={[object.dimensions[0] / 2, 32, 24]} />
      case 'cylinder': return <cylinderGeometry args={[object.dimensions[0] / 2, object.dimensions[0] / 2, object.dimensions[1], 32]} />
      case 'cone': return <coneGeometry args={[object.dimensions[0] / 2, object.dimensions[1], 32]} />
      case 'torus': return <torusGeometry args={[object.dimensions[0] / 2, Math.max(.06, object.dimensions[0] * .12), 16, 48]} />
      case 'plane': return <planeGeometry args={[object.dimensions[0], object.dimensions[2]]} />
      default: return <boxGeometry args={object.dimensions} />
    }
  }, [object.kind, object.dimensions])
  if (!object.visible) return null
  return <mesh position={object.position} rotation={object.rotation.map(v => THREE.MathUtils.degToRad(v)) as [number, number, number]} scale={object.scale} onClick={(e) => { e.stopPropagation(); onSelect() }}>
    {geometry}
    <meshStandardMaterial color={selected ? '#46b5ff' : object.color} roughness={.48} metalness={.18} />
    {selected && <lineSegments>
      <edgesGeometry args={[new THREE.BoxGeometry(...object.dimensions)]} />
      <lineBasicMaterial color="#8bd5ff" />
    </lineSegments>}
  </mesh>
}

function Viewport() {
  const objects = useStudio(s => s.objects)
  const selectedId = useStudio(s => s.selectedId)
  const select = useStudio(s => s.select)
  return <div className="viewport">
    <div className="viewport-top"><span><span className="live-dot" /> CENA 3D <span className="muted">/ PERSPECTIVA</span></span><span className="viewport-tools"><span><MousePointer2 size={14}/> Selecionar</span><span><Maximize2 size={14}/> Enquadrar</span></span></div>
    <Canvas camera={{ position: [5, 4, 6], fov: 45 }} onPointerMissed={() => select(null)} shadows>
      <color attach="background" args={['#0b1019']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[5, 8, 5]} intensity={2.1} castShadow />
      <Grid args={[30, 30]} cellSize={1} cellThickness={.55} cellColor="#263548" sectionSize={5} sectionThickness={1} sectionColor="#38516b" fadeDistance={30} infiniteGrid />
      {objects.map(o => <Model key={o.id} object={o} selected={o.id === selectedId} onSelect={() => select(o.id)} />)}
      <OrbitControls makeDefault />
    </Canvas>
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
  const [showRight, setShowRight] = useState(true)
  const [showLeft, setShowLeft] = useState(true)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

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
            <div className="editor-actions"><span className="language-tag">JAVASCRIPT · DZ API</span><button className="run-small" onClick={run}><Play size={13} fill="currentColor"/> Executar</button></div>
          </div>
          {activeTab === 'script' ? <Editor height="100%" language="javascript" theme="vs-dark" value={script} onChange={v => setScript(v ?? '')} options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, padding: { top: 12 }, wordWrap: 'on' }} /> : <div className="console-output"><span className={output.startsWith('Erro:') ? 'error-text' : 'success-text'}>●</span> {output}<button onClick={() => setActiveTab('script')}>Voltar ao editor</button></div>}
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
