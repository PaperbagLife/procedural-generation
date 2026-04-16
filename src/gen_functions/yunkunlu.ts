import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";
import NoiseModule from "noisejs";

const Noise = (NoiseModule as any).Noise;

const seaLevel = 60; // TODO: make tweakable in App.vue
const seabedLevel = 30;

// Set of `x,z` strings
function getFloodedBlocks(
  heightMap: Map<string, number>,
  size: number,
  seeds: BiomeSeed[],
): Set<string> {
  const flooded = new Set<string>();
  const queue: [number, number][] = [];
  const dxdz = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  // Start the flood from every SEA biome coordinate
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      if (getBiome(x, z, seeds) === "SEA") {
        const key = `${x},${z}`;
        flooded.add(key);
        queue.push([x, z]);
      }
    }
  }

  // BFS to find connected low-lands
  let head = 0;
  while (head < queue.length) {
    const [x, z] = queue[head++];

    for (const [dx, dz] of dxdz) {
      const nx = x + dx;
      const nz = z + dz;
      const nKey = `${nx},${nz}`;

      if (nx >= 0 && nx < size && nz >= 0 && nz < size && !flooded.has(nKey)) {
        const h = heightMap.get(nKey) ?? 1000;
        if (h < seaLevel) {
          flooded.add(nKey);
          queue.push([nx, nz]);
        }
      }
    }
  }
  return flooded;
}

function getBlockType(
  biome: BiomeType,
  isFlooded: boolean,
  y: number,
  height: number,
): BlockType {
  // If Y is at or above the ground height, it must be water
  // (This only triggers if the column is marked as flooded)
  if (isFlooded && y >= height) return BlockType.WATER;

  // Otherwise, determine the ground type
  const isSurface = y === height - 1;
  const isSubSurface = y >= height - 4;

  switch (biome) {
    case "SEA":
      return isSubSurface ? BlockType.SAND : BlockType.ROCK;
    case "SNOW":
      return isSurface
        ? BlockType.SNOW
        : isSubSurface
          ? BlockType.DIRT
          : BlockType.ROCK;
    case "GRASS":
      return isSurface
        ? BlockType.GRASS
        : isSubSurface
          ? BlockType.DIRT
          : BlockType.ROCK;
    default:
      return BlockType.ROCK;
  }
}

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

  const heightMap = new Map<string, number>();

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const biome = getBiome(x, z, seeds);
      if (biome === "SEA") {
        const height = Math.floor(
          noise.perlin2(x * freq, z * freq) * amp + seabedLevel,
        );
        heightMap.set(`${x},${z}`, height);
        continue;
      }
      const height = Math.floor(
        noise.perlin2(x * freq, z * freq) * amp + groundLevel,
      );
      heightMap.set(`${x},${z}`, height);
    }
  }
  // find out which blocks will be overflowed by water with a simple bfs starting at the boundary
  const flooded = getFloodedBlocks(heightMap, size, seeds);

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const key = `${x},${z}`;
      const height = heightMap.get(key)!;
      const biome = getBiome(x, z, seeds);
      const isFlooded = flooded.has(key);

      const maxH = isFlooded ? Math.max(height, seaLevel) : height;
      // Two cases, flooded or not
      for (let y = 0; y < maxH; y++) {
        // Changed from y <= maxH to y < maxH
        if (y >= worldHeight) break;

        const type = getBlockType(biome, isFlooded, y, height);
        blocks.push({ x, y, z, type });
      }
    }
  }

  return blocks;
}
