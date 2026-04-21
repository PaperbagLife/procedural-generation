import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";
import NoiseModule from "noisejs";

const Noise = (NoiseModule as any).Noise;

// WATER LEVELS
const seaLevel = 60; // TODO: make tweakable in App.vue
const seabedLevel = 40;
const beachHeightMax = 63;

// CAVES
const caveThreshold = 0.1;
const caveFreq = 0.08;
const caveSafetyBuffer = 5;

type BiomeType = "SNOW" | "GRASS" | "SEA";

interface BiomeSeed {
  x: number;
  z: number;
  type: BiomeType;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function getOctaveNoise(
  noise: any,
  x: number,
  z: number,
  octaves: number,
  freq: number,
  amp: number,
): number {
  let total = 0;
  let persistence = 0.5;
  let lacunarity = 2.0;
  let currentFreq = freq;
  let currentAmp = amp;

  for (let i = 0; i < octaves; i++) {
    total += noise.perlin2(x * currentFreq, z * currentFreq) * currentAmp;
    currentFreq *= lacunarity;
    currentAmp *= persistence;
  }
  return total;
}

function getLandInfluence(x: number, z: number, seeds: BiomeSeed[]) {
  let distSea = Infinity;
  let distLand = Infinity;
  let closestLandType: BiomeType = "GRASS";

  for (const s of seeds) {
    const dist = Math.hypot(x - s.x, z - s.z);
    if (s.type === "SEA") {
      distSea = Math.min(distSea, dist);
    } else {
      if (dist < distLand) {
        distLand = dist;
        closestLandType = s.type;
      }
    }
  }

  const blendDistance = 25;
  const diff = distSea - distLand;
  let landFactor = (diff + blendDistance) / (blendDistance * 2);

  return {
    landFactor: Math.max(0, Math.min(1, landFactor)),
    closestLandType,
  };
}

// BFS flood
function getFloodedBlocks(
  heightMap: Map<string, number>,
  size: number,
  seeds: BiomeSeed[],
): Set<string> {
  const flooded = new Set<string>();
  const queue: [number, number][] = [];

  // start from SEA biome
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const { landFactor } = getLandInfluence(x, z, seeds);
      if (landFactor < 0.3) {
        const key = `${x},${z}`;
        flooded.add(key);
        queue.push([x, z]);
      }
    }
  }

  let head = 0;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (head < queue.length) {
    const [x, z] = queue[head++];
    for (const [dx, dz] of dirs) {
      const nx = x + dx;
      const nz = z + dz;
      const key = `${nx},${nz}`;

      if (nx >= 0 && nx < size && nz >= 0 && nz < size && !flooded.has(key)) {
        if ((heightMap.get(key) ?? 999) < seaLevel) {
          flooded.add(key);
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
  isShore: boolean,
  y: number,
  height: number,
  landFactor: number,
): BlockType {
  if (isFlooded && y >= height) return BlockType.WATER;

  const isSurface = y === height - 1;
  const isSubSurface = y >= height - 4;

  // underwater
  if (isFlooded) {
    return isSubSurface ? BlockType.SAND : BlockType.ROCK;
  }

  // coast
  const isCoastal = landFactor < 0.65;

  if (isCoastal || isShore) {
    if (height <= beachHeightMax) {
      return isSubSurface ? BlockType.SAND : BlockType.ROCK;
    } else {
      return BlockType.ROCK;
    }
  }

  // inland
  switch (biome) {
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

export function generateTopLeft(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const {
    worldSize: size,
    groundLevel,
    amp,
    freq,
    seed,
    worldHeight,
    octaves,
  } = p;

  const noise = new Noise(seed);

  const seeds: BiomeSeed[] = [
    { x: size * 0.1, z: size * 0.1, type: "SNOW" },
    { x: size * 0.5, z: size * 0.5, type: "GRASS" },
    { x: size * 0.9, z: size * 0.9, type: "SEA" },
  ];

  const heightMap = new Map<string, number>();
  const infoMap = new Map<string, { factor: number; biome: BiomeType }>();

  // HEIGHT PASS
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const { landFactor, closestLandType } = getLandInfluence(x, z, seeds);

      const base = lerp(seabedLevel, groundLevel, landFactor);
      const noiseVal = getOctaveNoise(noise, x, z, octaves, freq, amp);
      const height = Math.floor(base + noiseVal);

      const key = `${x},${z}`;
      heightMap.set(key, height);
      infoMap.set(key, { factor: landFactor, biome: closestLandType });
    }
  }

  const flooded = getFloodedBlocks(heightMap, size, seeds);

  // shoreline
  const shore = new Set<string>();
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const key = `${x},${z}`;
      if (flooded.has(key)) continue;

      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (flooded.has(`${x + dx},${z + dz}`)) {
          shore.add(key);
          break;
        }
      }
    }
  }

  // voxel pass
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const key = `${x},${z}`;
      const height = heightMap.get(key)!;
      const { factor, biome } = infoMap.get(key)!;

      const isFlooded = flooded.has(key);
      const isShore = shore.has(key);

      const maxH = isFlooded ? Math.max(height, seaLevel) : height;

      for (let y = 0; y < maxH; y++) {
        if (y >= worldHeight) break;

        let type = getBlockType(biome, isFlooded, isShore, y, height, factor);

        // caves
        if (y < height - caveSafetyBuffer && type !== BlockType.WATER) {
          const n = noise.simplex3(x * caveFreq, y * caveFreq, z * caveFreq);
          if (n > caveThreshold) continue;
        }

        blocks.push({ x, y, z, type });
      }
    }
  }

  return blocks;
}
