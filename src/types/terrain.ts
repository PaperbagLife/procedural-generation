export const BlockType = {
  NULL: 0,
  GRASS: 1,
  SNOW: 2,
  ROCK: 3,
  WATER: 4,
  DIRT: 5,
  WOOD: 6,
  LEAVES: 7,
  SAND: 8,
  DARK_ROCK: 9,
  MAGMA: 10,
  SCULK: 11,
  MYCELIUM: 12,
  NETHERRACK: 13,

  // --- yuxincao BottomLeft：LUT 生物群系专用地表（接在既有类型后）---
  TUNDRA_SURFACE: 14,
  TAIGA_SURFACE: 15,
  STEPPE_SURFACE: 16,
  FOREST_SURFACE: 17,
  TEMPERATE_FOREST_SURFACE: 18,
  GRASSLAND_SURFACE: 19,
  TROPICAL_FOREST_SURFACE: 20,
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

export type SeaParams = {
  seaLevel: number;
  seabedLevel: number;
};

export type CaveParams = {
  caveThreshold: number;
  caveFreq: number;
  caveSafetyBuffer: number;
  tunnelOffset: number;
  tunnelWidth: number;
};

export interface TerrainParams {
  freq: number;
  amp: number;
  octaves: number;
  worldSize: number;
  worldHeight: number;
  groundLevel: number;
  seaParms: SeaParams;
  caveParams: CaveParams;
  seed: number;
}

export interface BlockData {
  x: number;
  y: number;
  z: number;
  type: BlockType;
}

export interface BlockMaterial {
  color: number;
  transparent?: boolean;
  opacity?: number;
}

export type GenFunction = (params: TerrainParams) => BlockData[];

// New type for camera synchronization
export interface CameraTransform {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export const BLOCK_COLORS: Record<number, BlockMaterial> = {
  [BlockType.GRASS]: { color: 0x559944 },
  [BlockType.SNOW]: { color: 0xffffff },
  [BlockType.ROCK]: { color: 0x888888 },
  [BlockType.WATER]: { color: 0x3366ff, transparent: true, opacity: 0.5 },
  [BlockType.DIRT]: { color: 0x6b4f2a },
  [BlockType.WOOD]: { color: 0x5c3a21 },
  [BlockType.LEAVES]: { color: 0x2e6f2f },
  [BlockType.SAND]: { color: 0xe2d6a3 },
  [BlockType.DARK_ROCK]: { color: 0x555555 },
  [BlockType.MAGMA]: { color: 0xff4d00 },
  [BlockType.SCULK]: { color: 0x0f4c5c },
  [BlockType.MYCELIUM]: { color: 0x8e4f9f },
  [BlockType.NETHERRACK]: { color: 0x7a1e1e },

  [BlockType.TUNDRA_SURFACE]: { color: 0xc8d6cc },
  [BlockType.TAIGA_SURFACE]: { color: 0x3a4d3c },
  [BlockType.STEPPE_SURFACE]: { color: 0xc4a574 },
  [BlockType.FOREST_SURFACE]: { color: 0x2f6b38 },
  [BlockType.TEMPERATE_FOREST_SURFACE]: { color: 0x4a8c52 },
  [BlockType.GRASSLAND_SURFACE]: { color: 0x5cb85c },
  [BlockType.TROPICAL_FOREST_SURFACE]: { color: 0x3d9a5b },
};
