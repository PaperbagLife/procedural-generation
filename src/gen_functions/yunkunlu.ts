import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";
import NoiseModule from "noisejs";

const Noise = (NoiseModule as any).Noise;

type BiomeType = "SNOW" | "GRASS" | "SEA";
interface BiomeSeed {
  x: number;
  z: number;
  type: BiomeType;
}

export function getBiome(x: number, z: number, seeds: BiomeSeed[]): BiomeType {
  let minDist = Infinity;
  let closest: BiomeType = "GRASS";
  for (const s of seeds) {
    const dist = Math.pow(x - s.x, 2) + Math.pow(z - s.z, 2);
    if (dist < minDist) {
      minDist = dist;
      closest = s.type;
    }
  }
  return closest;
}

export function generateTopLeft(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const { worldSize: size, groundLevel, amp, freq, seed, worldHeight } = p;
  const noise = new Noise(seed);

  const seeds: BiomeSeed[] = [
    { x: size * 0.15, z: size * 0.15, type: "SNOW" },
    { x: size * 0.5, z: size * 0.5, type: "GRASS" },
    { x: size * 0.85, z: size * 0.85, type: "SEA" },
  ];

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const biome = getBiome(x, z, seeds);
      const height = Math.floor(
        noise.perlin2(x * freq, z * freq) * amp + groundLevel,
      );
      let blockType: BlockType;

      for (let y = 0; y < height && y < worldHeight; y++) {
        switch (biome) {
          case "SNOW":
            blockType = BlockType.SNOW;
            break;
          case "GRASS":
            blockType = BlockType.GRASS;
            break;
          case "SEA": {
            blockType = BlockType.WATER;
          }
        }
        blocks.push({ x, y, z, type: blockType });
      }
    }
  }

  return blocks;
}
