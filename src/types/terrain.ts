export const BlockType = {
  NULL: 0,
  GRASS: 1,
  SNOW: 2,
  ROCK: 3,
  WATER: 4,
} as const;

export type BlockType = typeof BlockType[keyof typeof BlockType];

export interface TerrainParams {
  freq: number;
  amp: number;
  octaves: number;
  worldSize: number;
  worldHeight: number;
  groundLevel: number;
}

/**
 * x, y, z: Coordinate in the 3D grid
 * type: The BlockType enum value
 */
export type AddBlockCallback = (x: number, y: number, z: number, type: BlockType) => void;

/**
 * The signature for any terrain generation algorithm
 */
export type GenFunction = (params: TerrainParams, addBlock: AddBlockCallback) => void;

export const BLOCK_COLORS: Record<number, number> = {
  [BlockType.GRASS]: 0x559944,
  [BlockType.SNOW]: 0xffffff,
  [BlockType.ROCK]: 0x888888,
  [BlockType.WATER]: 0x3366ff
};