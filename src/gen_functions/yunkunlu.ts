import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";

export function generateTopLeft(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];

  for (let x = 0; x < p.worldSize; x++) {
    for (let y = 0; y < p.worldHeight; y++) {
      for (let z = 0; z < p.worldSize; z++) {
        // example code that generates all grass lol
        blocks.push({
          x: x,
          y: y,
          z: z,
          type: BlockType.GRASS,
        });
      }
    }
  }

  return blocks;
}
