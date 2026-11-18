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
- Viewport 3D interativa com câmera orbital e grade.
- Hierarquia de objetos e seleção.
- Painel de propriedades com transformação e cor.
- Editor Monaco com interpretação restrita da DZ API.
- Geometrias: box, sphere, cylinder, cone, torus e plane.
- Salvar e abrir projeto localmente.
- Exportar a cena como JSON.

## Segurança do editor de scripts
O editor não avalia JavaScript arbitrário. O interpretador usa o parser Babel e aceita somente declarações simples e chamadas permitidas da DZ API. Imports, loops, acesso ao DOM, rede e execução dinâmica não são suportados.

## Próximas entregas
- Histórico undo/redo.
- Exportação GLB, GLTF, OBJ e STL.
- Materiais e texturas.
- Salvamento de projetos em IndexedDB.
- Integração DZ AI através de backend seguro.
