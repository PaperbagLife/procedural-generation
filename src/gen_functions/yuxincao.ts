import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";
import NoiseModule from "noisejs";

const Noise = (NoiseModule as any).Noise;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** get the 2D fractional Brownian motion */
function fbm2d(
  noise: InstanceType<typeof Noise>,
  x: number,
  z: number,
  octaves: number,
  persistence = 0.5,
): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise.perlin2(x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return norm === 0 ? 0 : total / norm;
}

function to01(n: number): number {
  return clamp((n + 1) * 0.5, 0, 1);
}

/** biome lookup table */
const BIOME_LUT: string[][] = [
  ["Tundra", "Taiga", "Snow"],
  ["Steppe", "Forest", "TemperateForest"],
  ["Desert", "Grassland", "TropicalForest"],
];

/** biome name */
type BiomeName =
  | "Ocean"
  | "SnowMountain"
  | "RockyMountain"
  | (typeof BIOME_LUT)[number][number];

function lutIndex(v: number): number {
  return Math.min(2, Math.floor(v * 3 - 1e-9));
}

// Input: height, moisture, temperature
// Output: biome name
function classifyBiome(
  h: number,
  m: number,
  t: number,
  seaLevel: number,
  mountainLevel: number,
): BiomeName {
  if (h < seaLevel) return "Ocean";
  if (h > mountainLevel && t < 0.3) return "SnowMountain";
  if (h > mountainLevel && t >= 0.3) return "RockyMountain";
  return BIOME_LUT[lutIndex(t)][lutIndex(m)];
}

function surfaceBlock(biome: BiomeName): BlockType {
  switch (biome) {
    case "Ocean":
      return BlockType.SAND;
    case "Desert":
      return BlockType.SAND;
    case "Steppe":
      return BlockType.STEPPE_SURFACE;
    case "Tundra":
      return BlockType.TUNDRA_SURFACE;
    case "Taiga":
      return BlockType.TAIGA_SURFACE;
    case "Forest":
      return BlockType.FOREST_SURFACE;
    case "TemperateForest":
      return BlockType.TEMPERATE_FOREST_SURFACE;
    case "Grassland":
      return BlockType.GRASSLAND_SURFACE;
    case "TropicalForest":
      return BlockType.TROPICAL_FOREST_SURFACE;
    case "Snow":
    case "SnowMountain":
      return BlockType.SNOW;
    case "RockyMountain":
      return BlockType.ROCK;
    default:
      return BlockType.GRASS;
  }
}

function subsurfaceBlock(biome: BiomeName, y: number, top: number): BlockType {
  if (y >= top - 2) return BlockType.DIRT;
  if (biome === "Desert") {
    return y > top * 0.3 ? BlockType.SAND : BlockType.ROCK;
  }
  if (biome === "Steppe") {
    return y > top * 0.3 ? BlockType.STEPPE_SURFACE : BlockType.ROCK;
  }
  return BlockType.ROCK;
}

export function generateBottomLeft(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const noise = new Noise(p.seed + 4242);
  
  // basic parameters
  const seaLevel = 0.4;
  const mountainLevel = 0.75;
  const alpha = 0.5;
  const beta = 0.5;

  const frequencyH = Math.max(0.002, p.freq); // height frequency
  const frequencyM = frequencyH * 0.45; // moisture frequency
  const offsetM = 133.7; // moisture offset

  // 地形高度换算
  const minY = 1;
  const maxY = Math.max(minY + 2, p.worldHeight - 2);
  const rangeY = maxY - minY;
  const seaSurfaceY = minY + Math.floor(seaLevel * rangeY); // calculate the y value of the sea surface

  // Two loops iterating x and z coordinates.(ground generation)
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      // 1. Calculate the height and moisture noise values
      const nx = x * frequencyH;
      const nz = z * frequencyH;
      const hNorm = to01(fbm2d(noise, nx, nz, p.octaves));  // y

      const mx = x * frequencyM + offsetM;
      const mz = z * frequencyM + offsetM;
      const mNorm = to01(fbm2d(noise, mx, mz, p.octaves));

      // 2. Calculate the temperature and latitude
      const latitude = z / Math.max(1, p.worldSize);
      const t = clamp(1 - (alpha * latitude + beta * hNorm), 0, 1);
      
      // 3. Classify the biome
      const biome = classifyBiome(hNorm, mNorm, t, seaLevel, mountainLevel);

      // 4. Calculate the terrain top(the highest block of the terrain)
      let terrainTop: number;
      if (biome === "Ocean") {
        const seabed = Math.max(
          minY,
          Math.floor(minY + (hNorm / seaLevel) * Math.max(1, seaSurfaceY - minY - 1)),
        );
        terrainTop = Math.min(seabed, seaSurfaceY - 1);
      } else {
        terrainTop = Math.floor(minY + hNorm * rangeY);
      }

      terrainTop = clamp(terrainTop, minY, maxY);

      // 5. Stack blocks up to the terrain top
      const topBlock = surfaceBlock(biome);
      for (let y = 0; y <= terrainTop; y++) {
        if (y >= p.worldHeight) break;
        let type: BlockType;
        if (y === terrainTop) {
          type = topBlock;
        } else {
          type = subsurfaceBlock(biome, y, terrainTop);
        }
        blocks.push({ x, y, z, type });
      }

      // 6. Fill the space above the seabed and below sea level with WATER blocks if the biome is ocean
      if (biome === "Ocean") {
        for (let y = terrainTop + 1; y <= seaSurfaceY; y++) {
          if (y >= p.worldHeight) break;
          blocks.push({ x, y, z, type: BlockType.WATER });
        }
      }

      // 7. Generate trees if the biome is forest(y must be above sea level and below the top of the map)
      if (
        (biome === "Forest" ||
          biome === "TemperateForest" ||
          biome === "TropicalForest") &&
        terrainTop < maxY - 4 &&
        terrainTop > seaSurfaceY
      ) {
        // Only generate trees if the noise value is greater than 0.72
        const treeRoll = to01(fbm2d(noise, nx * 3.1 + 10, nz * 3.1 - 5, 2));
        if (treeRoll > 0.72) {
          const hTrunk = biome === "TropicalForest" ? 5 : 4;
          for (let t = 1; t <= hTrunk; t++) {
            const y = terrainTop + t;
            if (y < p.worldHeight) {
              blocks.push({ x, y, z, type: BlockType.WOOD });
            }
          }
          const leafBase = terrainTop + hTrunk - 1;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              for (let dy = 0; dy <= 2; dy++) {
                if (Math.abs(dx) + Math.abs(dz) > (dy === 2 ? 0 : 1)) continue;
                const lx = x + dx;
                const lz = z + dz;
                const ly = leafBase + dy;
                if (
                  lx < 0 ||
                  lx >= p.worldSize ||
                  lz < 0 ||
                  lz >= p.worldSize ||
                  ly >= p.worldHeight
                ) {
                  continue;
                }
                blocks.push({ x: lx, y: ly, z: lz, type: BlockType.LEAVES });
              }
            }
          }
        }
      }
    }
  }

  return blocks;
}
