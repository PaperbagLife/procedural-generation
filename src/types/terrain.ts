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
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

export type SeaParams = {
  seaLevel: number;
  seabedLevel: number;
};

export type CaveParams = {
  caveThreshold: number; // -1 to 1 range, lower = less caves, higher = more caves
  caveFreq: number; // Frequency of the noise used for caves
  caveSafetyBuffer: number; // how many blocks under the surface starts to become caves
  tunnelOffset: number; // Large offset to decorrelate from cavern noise
  tunnelWidth: number; // Closer to 0 = thinner tunnels
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
};
