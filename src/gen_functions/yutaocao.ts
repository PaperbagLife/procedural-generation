import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";

type Noise2D = (x: number, z: number) => number;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

function hash2d01(seed: number, x: number, z: number): number {
  let h = (seed ^ (x * 374761393) ^ (z * 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

function createNoise2D(seed: number): Noise2D {
  return (x: number, z: number) => {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const sx = smoothstep(x - x0);
    const sz = smoothstep(z - z0);

    const n00 = hash2d01(seed, x0, z0);
    const n10 = hash2d01(seed, x1, z0);
    const n01 = hash2d01(seed, x0, z1);
    const n11 = hash2d01(seed, x1, z1);

    const ix0 = lerp(n00, n10, sx);
    const ix1 = lerp(n01, n11, sx);
    return lerp(ix0, ix1, sz) * 2 - 1;
  };
}

function fbm2d(
  noise: Noise2D,
  x: number,
  z: number,
  octaves: number,
): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    total += noise(x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return norm === 0 ? 0 : total / norm;
}

export function generateBottomRight(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const noise = createNoise2D((p.seed + 9001) >>> 0);
  const warpNoise = createNoise2D((p.seed + 1717) >>> 0);
  const mineralNoise = createNoise2D((p.seed + 7331) >>> 0);

  // Animate by drifting the sample window through noise space over time.
  const t =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) *
    0.001;
  const flowX = t * 8.5;
  const flowZ = t * 5.75;

  const freq = Math.max(0.001, p.freq);
  const minTop = 8;
  const maxTop = p.worldHeight - 4;
  const baseAltitude = clamp(
    p.groundLevel + Math.floor(p.amp * 0.45),
    12,
    p.worldHeight - 16,
  );

  const topMap = Array.from({ length: p.worldSize }, () =>
    Array(p.worldSize).fill(-1),
  );
  const bottomMap = Array.from({ length: p.worldSize }, () =>
    Array(p.worldSize).fill(-1),
  );

  // Pass 1: generate floating-island columns.
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      const nx = (x + flowX) * freq;
      const nz = (z + flowZ) * freq;

      const warpX = fbm2d(warpNoise, nx * 0.7 + 13.2, nz * 0.7 - 4.7, 2) * 2.8;
      const warpZ = fbm2d(warpNoise, nx * 0.7 - 7.1, nz * 0.7 + 9.9, 2) * 2.8;

      const massA = fbm2d(noise, nx * 0.34 + warpX, nz * 0.34 + warpZ, p.octaves + 1);
      const massB = fbm2d(noise, nx * 1.4 + 17.1, nz * 1.4 - 28.4, 3);
      const density = massA * 0.8 + massB * 0.2;

      if (density < 0.24) continue;

      const islandLift = Math.pow((density - 0.24) / 0.76, 1.15);
      const topNoise = fbm2d(noise, nx * 0.95 - 33.7, nz * 0.95 + 8.6, 3);
      const thicknessNoise = fbm2d(noise, nx * 1.2 + 44.8, nz * 1.2 - 52.3, 2);

      const top = clamp(
        Math.floor(baseAltitude + islandLift * p.amp * 1.1 + topNoise * p.amp * 0.2),
        minTop,
        maxTop,
      );

      const thickness = clamp(
        Math.floor(4 + islandLift * 8 + (thicknessNoise + 1) * 2.5),
        4,
        15,
      );

      const bottom = clamp(top - thickness, 2, top - 3);
      topMap[x][z] = top;
      bottomMap[x][z] = bottom;
    }
  }

  // Pass 2: fill materials. Uses SAND as a mineral proxy since we cannot add new block types here.
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      const top = topMap[x][z];
      const bottom = bottomMap[x][z];
      if (top < 0 || bottom < 0) continue;

      const nx = (x + flowX) * freq;
      const nz = (z + flowZ) * freq;
      const mineralBias = fbm2d(mineralNoise, nx * 1.7 + 90.1, nz * 1.7 - 61.4, 2);

      for (let y = bottom; y <= top; y++) {
        const depth = top - y;
        let type: BlockType;

        if (depth === 0) {
          type = BlockType.GRASS;
        } else if (depth <= 2) {
          type = BlockType.DIRT;
        } else {
          const oreNoise = fbm2d(mineralNoise, nx * 2.2 + y * 0.19, nz * 2.2 - y * 0.23, 3);
          const oreThreshold = 0.74 - Math.max(0, mineralBias) * 0.1;
          type = oreNoise > oreThreshold ? BlockType.SAND : BlockType.ROCK;
        }

        blocks.push({ x, y, z, type });
      }

      const spikeNoise = fbm2d(noise, nx * 2.3 + 8.8, nz * 2.3 - 15.6, 2);
      if (spikeNoise > 0.7) {
        const len = clamp(Math.floor((spikeNoise - 0.7) * 16), 2, 7);
        for (let i = 1; i <= len; i++) {
          const y = bottom - i;
          if (y < 1) break;

          const crystalNoise = fbm2d(mineralNoise, nx * 2.8 + y * 0.11, nz * 2.8 + y * 0.13, 2);
          blocks.push({
            x,
            y,
            z,
            type: crystalNoise > 0.83 ? BlockType.SAND : BlockType.ROCK,
          });
        }
      }
    }
  }

  return blocks;
}
