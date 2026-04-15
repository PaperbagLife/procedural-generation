export const BlockType = {
  NULL: 0,
  GRASS: 1,
  SNOW: 2,
  ROCK: 3,
  WATER: 4,
  DIRT: 5,
  WOOD: 6,
  LEAVES: 7,
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

export interface TerrainParams {
  freq: number;
  amp: number;
  octaves: number;
  worldSize: number;
  worldHeight: number;
  groundLevel: number;
  seed: number;
}

export interface BlockData {
  x: number;
  y: number;
  z: number;
  type: BlockType;
}

export type GenFunction = (params: TerrainParams) => BlockData[];

export const BLOCK_COLORS: Record<number, number> = {
  [BlockType.GRASS]: 0x559944,
  [BlockType.SNOW]: 0xffffff,
  [BlockType.ROCK]: 0x888888,
  [BlockType.WATER]: 0x3366ff,
  [BlockType.DIRT]: 0x6b4f2a,
  [BlockType.WOOD]: 0x5c3a21,
  [BlockType.LEAVES]: 0x2e6f2f,
};
