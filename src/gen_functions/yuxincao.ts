import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";
import NoiseModule from "noisejs";

const Noise = (NoiseModule as any).Noise;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** get the latitude */
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


const BIOME_LUT: string[][] = [
  ["Tundra", "Taiga", "Snow"],
  ["Steppe", "Forest", "TemperateForest"],
  ["Desert", "Grassland", "TropicalForest"],
];

type BiomeName =
  | "Ocean"
  | "SnowMountain"
  | "RockyMountain"
  | (typeof BIOME_LUT)[number][number];

function lutIndex(v: number): number {
  return Math.min(2, Math.floor(v * 3 - 1e-9));
}

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
    case "Steppe":
      return BlockType.SAND;
    case "Snow":
    case "Tundra":
    case "Taiga":
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
  if (biome === "Desert" || biome === "Steppe") {
    return y > top * 0.3 ? BlockType.SAND : BlockType.ROCK;
  }
  return BlockType.ROCK;
}

export function generateBottomLeft(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const noise = new Noise(p.seed + 4242);

  const seaLevel = 0.4;
  const mountainLevel = 0.75;
  const alpha = 0.5;
  const beta = 0.5;

  const frequencyH = Math.max(0.002, p.freq);
  const frequencyM = frequencyH * 0.45;
  const offsetM = 133.7;

  const minY = 1;
  const maxY = Math.max(minY + 2, p.worldHeight - 2);
  const rangeY = maxY - minY;
  const seaSurfaceY = minY + Math.floor(seaLevel * rangeY);

  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      const nx = x * frequencyH;
      const nz = z * frequencyH;
      const hNorm = to01(fbm2d(noise, nx, nz, p.octaves));

      const mx = x * frequencyM + offsetM;
      const mz = z * frequencyM + offsetM;
      const mNorm = to01(fbm2d(noise, mx, mz, p.octaves));

      const latitude = z / Math.max(1, p.worldSize);
      const t = clamp(1 - (alpha * latitude + beta * hNorm), 0, 1);

      const biome = classifyBiome(hNorm, mNorm, t, seaLevel, mountainLevel);

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

      if (biome === "Ocean") {
        for (let y = terrainTop + 1; y <= seaSurfaceY; y++) {
          if (y >= p.worldHeight) break;
          blocks.push({ x, y, z, type: BlockType.WATER });
        }
      }

      if (
        (biome === "Forest" ||
          biome === "TemperateForest" ||
          biome === "TropicalForest") &&
        terrainTop < maxY - 4 &&
        terrainTop > seaSurfaceY
      ) {
        const treeRoll = to01(fbm2d(noise, nx * 3.1 + 9, nz * 3.1 - 7, 2));
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
