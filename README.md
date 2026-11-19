# DZ STUDIO 3D

Plataforma de modelagem 3D no navegador, com foco em criação por scripts através da DZ API.

## Stack
- React + TypeScript + Vite
- Three.js + React Three Fiber
- Monaco Editor
- Zustand
- Babel Parser para interpretar uma DSL JavaScript restrita

## Desenvolvimento
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Estado atual — Alpha 0.1

### Editor e cena
- Viewport 3D com câmera orbital, grade, seleção e gizmos de mover/girar/escalar.
- Hierarquia de objetos, propriedades, materiais básicos e transformações.
- Editor Monaco com colar da área de transferência, limpar script e console.
- Histórico undo/redo, salvar e abrir projetos em IndexedDB.
- Exportação GLB, GLTF, OBJ e STL.

### Geometrias disponíveis na DZ API
- Primitivas: box/cube, sphere, cylinder, cone, torus e plane.
- Sólidos adicionais: capsule, torusKnot, octahedron, tetrahedron, icosahedron, dodecahedron, ring e circle.
- RoundedBox com raio de canto e segmentos configuráveis.
- Extrude/Shape com perfil 2D e bevel.
- Lathe com perfil 2D e resolução radial.
- Tube com caminho 3D, raio e resolução.
- CustomMesh com vértices e índices triangulados validados.

### Exemplos
Os scripts de demonstração ficam em `examples/`. Abra um arquivo, copie o conteúdo e cole no Script Editor.

## Segurança do editor de scripts
O editor não avalia JavaScript arbitrário. O interpretador usa Babel Parser e executa uma DSL restrita. Imports, DOM, rede, eval e Function não são permitidos. Os scripts têm limites de tamanho, instruções, ciclos, pontos e índices de malha.

## Limitações conhecidas da Alpha
- Operações booleanas Union/Subtract/Intersect ainda não estão implementadas.
- Edição topológica direta de vértices/arestas/faces, inset e bevel de arestas ainda não estão implementados.
- CustomMesh recebe uma malha triangulada pronta; não é ainda um editor de malha interativo.
- Não há ainda sistema completo de modificadores não destrutivos, texturas PBR/normal maps ou geração paramétrica de superfícies.
- A validação do build confirma compilação; os modelos ainda precisam de testes visuais e de exportação em navegadores e ferramentas externas.

## Próximas etapas
1. Operações booleanas robustas com validação da malha resultante.
2. Ferramentas de perfil e edição de malha.
3. Modificadores não destrutivos, subdivisão e suavização.
4. Materiais PBR e texturas.
5. Testes automatizados de geometria, parser e exportação.
