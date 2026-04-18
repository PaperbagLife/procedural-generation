import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";
import NoiseModule from "noisejs";

const Noise = (NoiseModule as any).Noise;

const seaLevel = 65; // TODO: make tweakable in App.vue
const seabedLevel = 45;

function getTerrainSets(
  heightMap: Map<string, number>,
  size: number,
  seeds: BiomeSeed[],
) {
  const flooded = new Set<string>();
  const beach = new Set<string>();
  const queue: [number, number][] = [];
  const dxdz = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  // Initial Flood Sources
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      if (getBiome(x, z, seeds) === "SEA") {
        const key = `${x},${z}`;
        flooded.add(key);
        queue.push([x, z]);
      }
    }
  }

  // BFS for Flooding
  let head = 0;
  while (head < queue.length) {
    const [x, z] = queue[head++];
    for (const [dx, dz] of dxdz) {
      const nx = x + dx,
        nz = z + dz;
      const nKey = `${nx},${nz}`;
      if (nx >= 0 && nx < size && nz >= 0 && nz < size && !flooded.has(nKey)) {
        if ((heightMap.get(nKey) ?? 1000) < seaLevel) {
          flooded.add(nKey);
          queue.push([nx, nz]);
        }
      }
    }
  }

  // Beach Detection
  // Look for any dry tile adjacent to "overflow" water (water not in SEA biome)
  for (const key of flooded) {
    const [fx, fz] = key.split(",").map(Number);
    if (getBiome(fx, fz, seeds) !== "SEA") {
      for (const [dx, dz] of dxdz) {
        const nx = fx + dx,
          nz = fz + dz;
        const nKey = `${nx},${nz}`;
        // If the neighbor is dry land (not flooded), it's a beach
        if (
          nx >= 0 &&
          nx < size &&
          nz >= 0 &&
          nz < size &&
          !flooded.has(nKey)
        ) {
          beach.add(nKey);
        }
      }
    }
  }

  return { flooded, beach };
}

function getBlockType(
  biome: BiomeType,
  isFlooded: boolean,
  isBeach: boolean,
  y: number,
  height: number,
): BlockType {
  // Flooded with Water
  if (isFlooded && y >= height) return BlockType.WATER;

  const isSurface = y === height - 1;
  const isSubSurface = y >= height - 4;

  // If it's a beach, the surface layers become sand
  if (isBeach && isSubSurface) {
    return BlockType.SAND;
  }

  // Normal Biome blocks
  switch (biome) {
    case "SEA":
    case "GRASS":
      if (isSurface) return isFlooded ? BlockType.SAND : BlockType.GRASS;
      return isSubSurface ? BlockType.DIRT : BlockType.ROCK;
    case "SNOW":
      if (isSurface) return isFlooded ? BlockType.SAND : BlockType.SNOW;
      return isSubSurface ? BlockType.DIRT : BlockType.ROCK;
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

function getFractalNoise(
  x: number,
  z: number,
  noise: any,
  p: TerrainParams,
): number {
  const { freq, amp, octaves = 4 } = p;
  const persistence = 0.5; // Detail weight
  const lacunarity = 2.0; // Frequency multiplier

  let total = 0;
  let currentFreq = freq;
  let currentAmp = 1;
  let weightSum = 0;

  for (let i = 0; i < octaves; i++) {
    total += noise.perlin2(x * currentFreq, z * currentFreq) * currentAmp;
    weightSum += currentAmp;

    currentAmp *= persistence;
    currentFreq *= lacunarity;
  }

  // Normalize and scale
  return (total / weightSum) * amp;
}

export function generateTopLeft(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const { worldSize: size, groundLevel, seed, worldHeight } = p;
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
      const noiseVal = getFractalNoise(x, z, noise, p);

      // Applying the offset based on biome
      const baseLevel = biome === "SEA" ? seabedLevel : groundLevel;
      const height = Math.floor(noiseVal + baseLevel);
      heightMap.set(`${x},${z}`, height);
    }
  }

  // find out which blocks will be overflowed by water with a simple bfs starting at the boundary
  const { flooded, beach } = getTerrainSets(heightMap, size, seeds);

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const key = `${x},${z}`;
      const height = heightMap.get(key)!;
      const biome = getBiome(x, z, seeds);
      const isFlooded = flooded.has(key);
      const isBeach = beach.has(key);
      const maxH = isFlooded ? Math.max(height, seaLevel) : height;

      for (let y = 0; y < maxH; y++) {
        if (y >= worldHeight) break;
        const type = getBlockType(biome, isFlooded, isBeach, y, height);
        blocks.push({ x, y, z, type });
      }
    }
  }

  return blocks;
}
