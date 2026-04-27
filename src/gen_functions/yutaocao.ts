import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";

import NoiseModule from "noisejs";

const Noise = (NoiseModule as any).Noise;

type PerlinNoise = {
  perlin2(x: number, z: number): number;
  perlin3(x: number, y: number, z: number): number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const to01 = (value: number) => clamp(value * 0.5 + 0.5, 0, 1);

function fbm2d(
  noise: PerlinNoise,
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

function fbm3d(
  noise: PerlinNoise,
  x: number,
  y: number,
  z: number,
  octaves: number,
  persistence = 0.5,
): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    total += noise.perlin3(x * frequency, y * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return norm === 0 ? 0 : total / norm;
}

interface Vent {
  x: number;
  z: number;
  baseY: number;
  topY: number;
  radius: number;
  speed: number;
  phase: number;
}

const addBlock = (
  blocks: BlockData[],
  occupied: Set<string>,
  x: number,
  y: number,
  z: number,
  type: BlockType,
) => {
  const key = `${x},${y},${z}`;
  if (occupied.has(key)) return;
  occupied.add(key);
  blocks.push({ x, y, z, type });
};

function createVents(p: TerrainParams, layoutNoise: PerlinNoise): Vent[] {
  const ventSeeds = [0.18, 0.51, 0.79];
  return ventSeeds.map((seed, index) => {
    const xBias = fbm2d(layoutNoise, seed * 8.7 + 13.1, p.seed * 0.0001 + index, 2);
    const zBias = fbm2d(layoutNoise, seed * 7.1 - 3.4, p.seed * 0.0001 - index, 2);
    const heightBias = fbm2d(layoutNoise, seed * 5.2 + 21.8, p.seed * 0.0001 + index * 2, 2);
    const radiusBias = fbm2d(layoutNoise, seed * 4.6 - 12.9, p.seed * 0.0001 + index * 3, 2);
    const speedBias = fbm2d(layoutNoise, seed * 6.2 + 7.7, p.seed * 0.0001 - index * 4, 2);

    const x = clamp(
      Math.round(p.worldSize * (0.16 + seed * 0.64 + xBias * 0.08)),
      0,
      p.worldSize - 1,
    );
    const z = clamp(
      Math.round(p.worldSize * (0.18 + (1 - seed) * 0.58 + zBias * 0.08)),
      0,
      p.worldSize - 1,
    );

    const topY = clamp(
      Math.round(p.worldHeight * (0.58 + index * 0.09 + heightBias * 0.08)),
      10,
      p.worldHeight - 3,
    );
    const baseY = clamp(
      Math.round(topY - (12 + p.amp * 0.3 + index * 4)),
      2,
      topY - 4,
    );

    return {
      x,
      z,
      baseY,
      topY,
      radius: clamp(Math.round(3 + p.amp * 0.08 + radiusBias * 3), 3, 8),
      speed: 0.9 + to01(speedBias) * 1.8,
      phase: index * 13.7 + seed * 17.0,
    };
  });
}

export function generateBottomRight(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const layoutNoise = new Noise((p.seed + 9001) >>> 0) as PerlinNoise;
  const turbulenceNoise = new Noise((p.seed + 1717) >>> 0) as PerlinNoise;
  const coreNoise = new Noise((p.seed + 7331) >>> 0) as PerlinNoise;

  const vents = createVents(p, layoutNoise);
  const occupied = new Set<string>();
  const t = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
  const riseSpeed = 18 + p.amp * 0.9;
  const verticalScale = Math.max(0.06, p.freq * 1.6);
  const horizontalScale = Math.max(0.05, p.freq * 1.1);

  for (const vent of vents) {
    const minX = Math.max(0, vent.x - vent.radius - 2);
    const maxX = Math.min(p.worldSize - 1, vent.x + vent.radius + 2);
    const minZ = Math.max(0, vent.z - vent.radius - 2);
    const maxZ = Math.min(p.worldSize - 1, vent.z + vent.radius + 2);
    const plumeHeight = Math.max(vent.topY - vent.baseY, 1);

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const dx = (x - vent.x) / vent.radius;
        const dz = (z - vent.z) / vent.radius;
        const radial = Math.sqrt(dx * dx + dz * dz);
        if (radial > 1.0) continue;

        const cylinderMask = Math.pow(1 - radial, 1.35);
        const shellBias = radial > 0.72 ? 1 : 0;

        for (let y = vent.baseY; y <= vent.topY; y++) {
          const rise = y - vent.baseY;
          const movingY = y - riseSpeed * t + vent.phase;
          const movingBand = clamp(
            1 - Math.abs((rise - (riseSpeed * t + vent.phase) * 0.2) / plumeHeight),
            0,
            1,
          );
          const turbulence = fbm3d(
            turbulenceNoise,
            (x - vent.x) * horizontalScale,
            movingY * verticalScale,
            (z - vent.z) * horizontalScale,
            4,
            0.55,
          );
          const corePulse = fbm3d(
            coreNoise,
            (x - vent.x) * 0.21 + vent.phase,
            movingY * 0.12,
            (z - vent.z) * 0.21 - vent.phase,
            3,
            0.58,
          );
          const heightFalloff = 1 - rise / plumeHeight;
          const upwardPull = clamp(movingBand * 1.2 + heightFalloff * 0.4, 0, 1.4);
          const density =
            cylinderMask * 0.58 +
            upwardPull * 0.28 +
            to01(turbulence) * 0.34 +
            to01(corePulse) * 0.2;
          const threshold = 0.28 - cylinderMask * 0.12 - upwardPull * 0.08;

          if (density < threshold) continue;

          let type: BlockType = BlockType.SAND;
          if (rise < 2) {
            type = BlockType.DARK_ROCK;
          } else if (shellBias && density < 0.72) {
            type = BlockType.ROCK;
          } else if (density < 0.5) {
            type = BlockType.DARK_ROCK;
          }

          addBlock(blocks, occupied, x, y, z, type);
        }

        const sprayHeight = clamp(Math.floor(vent.radius * 0.9), 2, 8);
        for (let y = vent.topY + 1; y <= vent.topY + sprayHeight; y++) {
          if (y >= p.worldHeight) break;

          const movingY = y - riseSpeed * t + vent.phase;
          const sprayNoise = fbm3d(
            turbulenceNoise,
            (x - vent.x) * horizontalScale * 1.15,
            movingY * verticalScale * 1.2,
            (z - vent.z) * horizontalScale * 1.15,
            3,
            0.55,
          );
          const sprayDensity =
            cylinderMask * 0.34 + to01(sprayNoise) * 0.62 - (y - vent.topY) * 0.09;

          if (sprayDensity > 0.45) {
            addBlock(blocks, occupied, x, y, z, BlockType.SAND);
          }
        }
      }
    }
  }

  return blocks;
}
