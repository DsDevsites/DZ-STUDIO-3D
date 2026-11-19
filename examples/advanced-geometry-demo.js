// DZ STUDIO 3D — Advanced Geometry Engine demo
// Demonstra arredondamento, extrusão, revolução, tubo e malha personalizada.
// Cole o arquivo inteiro no Script Editor e clique em Executar.

const base = DZ.createRoundedBox({
  name: "01 | Base arredondada",
  width: 3.8,
  height: 0.42,
  depth: 2.4,
  cornerRadius: 0.16,
  bevelSegments: 5,
  color: "#26384d",
  metalness: 0.72,
  roughness: 0.3,
  position: [0, 0.25, 0]
});
DZ.addToScene(base);

const perfil = DZ.createShape({
  name: "02 | Painel extrudado",
  points: [
    [-1.35, -0.38],
    [1.15, -0.38],
    [1.42, -0.12],
    [1.22, 0.34],
    [-1.1, 0.34],
    [-1.42, 0.08]
  ],
  height: 0.16,
  bevelEnabled: true,
  bevelThickness: 0.035,
  bevelSize: 0.025,
  bevelSegments: 4,
  color: "#168fbc",
  metalness: 0.58,
  roughness: 0.28,
  position: [0, 0.58, 0]
});
DZ.addToScene(perfil);

const revolvido = DZ.createLathe({
  name: "03 | Peça torneada",
  points: [
    [0.18, -0.65],
    [0.28, -0.58],
    [0.32, -0.38],
    [0.24, -0.2],
    [0.2, 0.15],
    [0.34, 0.42],
    [0.3, 0.58],
    [0.16, 0.66]
  ],
  radialSegments: 64,
  color: "#9baec1",
  metalness: 0.88,
  roughness: 0.2,
  position: [-1.15, 1.05, 0]
});
DZ.addToScene(revolvido);

const tubo = DZ.createTube({
  name: "04 | Tubo curvo",
  points: [
    [-1.25, 1.15, 0.75],
    [-0.85, 1.55, 0.75],
    [-0.25, 1.62, 0.75],
    [0.35, 1.35, 0.75],
    [0.95, 1.42, 0.75],
    [1.35, 1.78, 0.75]
  ],
  tube: 0.075,
  tubularSegments: 72,
  radialSegments: 14,
  color: "#20d6c7",
  metalness: 0.48,
  roughness: 0.22
});
DZ.addToScene(tubo);

const malha = DZ.createCustomMesh({
  name: "05 | Prisma triangular personalizado",
  vertices: [
    [-0.55, 0, -0.42],
    [0.55, 0, -0.42],
    [0.55, 0, 0.42],
    [-0.55, 0, 0.42],
    [-0.35, 0.72, -0.28],
    [0.35, 0.72, -0.28],
    [0.35, 0.72, 0.28],
    [-0.35, 0.72, 0.28]
  ],
  indices: [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7
  ],
  color: "#52677d",
  metalness: 0.62,
  roughness: 0.34,
  position: [1.1, 0.52, -0.15]
});
DZ.addToScene(malha);
