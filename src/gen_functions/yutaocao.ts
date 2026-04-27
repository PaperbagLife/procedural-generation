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

// Ensure WATER and SNOW exist in your BlockType enum!
const RETREAT_LAYER_CHOICES: Record<"grass" | "dirt" | "rock", BlockType[]> = {
  grass: [
    BlockType.GRASS,
    BlockType.SNOW,
    BlockType.SAND,
    BlockType.MYCELIUM,
    BlockType.SCULK,
    BlockType.WATER,
    BlockType.MAGMA,
  ],
  dirt: [
    BlockType.DIRT,
    BlockType.SAND,
    BlockType.DARK_ROCK,
    BlockType.ROCK,
    BlockType.MYCELIUM,
    BlockType.SCULK,
    BlockType.NETHERRACK,
    BlockType.MAGMA,
  ],
  rock: [
    BlockType.ROCK,
    BlockType.DARK_ROCK,
    BlockType.SAND,
    BlockType.SNOW,
    BlockType.SCULK,
    BlockType.NETHERRACK,
    BlockType.MAGMA,
  ],
};

function chooseLayerReplacement(
  kind: "grass" | "dirt" | "rock",
  noise: PerlinNoise,
  salt: number,
): BlockType {
  const roll = to01(fbm3d(noise, salt * 0.13, salt * 0.27, salt * 0.41, 3, 0.55));
  const choices = RETREAT_LAYER_CHOICES[kind];
  return choices[Math.min(choices.length - 1, Math.floor(roll * choices.length))];
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

export function generateBottomRight(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const terrainNoise = new Noise((p.seed) >>> 0) as PerlinNoise;
  const infectionNoise = new Noise((p.seed + 1337) >>> 0) as PerlinNoise;
  const retreatNoise = new Noise((p.seed + 7331) >>> 0) as PerlinNoise;
  const occupied = new Set<string>();
  
  const t = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
  const cycleSpeed = 0.5;

  // 1. Shift time so the cycle increments exactly when the wave is at its smallest (invisible)
  const shiftedTime = t * cycleSpeed + Math.PI / 2;
  const currentCycle = Math.floor(shiftedTime / (Math.PI * 2));
  const previousCycle = currentCycle - 1;

  // 2. Helper to get the map for a specific cycle. 
  // If cycle is < 0, it returns the standard uninfected terrain.
  const getMapForCycle = (cycle: number) => {
    if (cycle < 0) return { grass: BlockType.GRASS, dirt: BlockType.DIRT, rock: BlockType.ROCK };
    return {
      grass: chooseLayerReplacement("grass", retreatNoise, p.seed + 11 + cycle * 100),
      dirt: chooseLayerReplacement("dirt", retreatNoise, p.seed + 23 + cycle * 100),
      rock: chooseLayerReplacement("rock", retreatNoise, p.seed + 37 + cycle * 100),
    };
  };

  const oldMutationMap = getMapForCycle(previousCycle);
  const newMutationMap = getMapForCycle(currentCycle);

  // 3. Determine if the wave is currently expanding or shrinking
  // Math.cos determines the derivative (direction) of our Math.sin wave
  const isExpanding = Math.cos(t * cycleSpeed) > 0;

  const centerX = Math.floor(p.worldSize / 2);
  const centerZ = Math.floor(p.worldSize / 2);
  
  const centerHeightOffset = fbm2d(terrainNoise, centerX * p.freq, centerZ * p.freq, Math.max(1, p.octaves));
  const centerY = clamp(Math.round(p.groundLevel + centerHeightOffset * p.amp), 1, p.worldHeight - 1);

  const wave = Math.sin(t * cycleSpeed); 

  const maxDist = Math.sqrt(
    Math.pow(p.worldSize, 2) + Math.pow(p.worldHeight, 2)
  );

  const minRadius = -maxDist * 0.3;
  const maxRadius = maxDist * 1.2;
  const currentRadius = minRadius + (wave + 1) * 0.5 * (maxRadius - minRadius);

  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      
      const heightOffset = fbm2d(terrainNoise, x * p.freq, z * p.freq, Math.max(1, p.octaves));
      const surfaceY = clamp(Math.round(p.groundLevel + heightOffset * p.amp), 1, p.worldHeight - 1);

      for (let y = 0; y <= surfaceY; y++) {
        
        const dx = x - centerX;
        const dy = y - centerY;
        const dz = z - centerZ;
        const pureDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const noiseScale = p.freq * 2.5;
        const organicOffset = fbm3d(
          infectionNoise, 
          x * noiseScale, 
          y * noiseScale, 
          z * noiseScale, 
          3
        ) * (p.worldSize * 0.25); 

        const boilingEdge = fbm3d(
          infectionNoise, 
          x * noiseScale * 2, 
          y * noiseScale * 2 - t * 0.8, 
          z * noiseScale * 2, 
          1
        ) * 3.0;

        const effectiveDist = pureDistance + organicOffset + boilingEdge;
        const isInfected = effectiveDist < currentRadius;

        // 4. Base layer lookup
        const depthFromSurface = surfaceY - y;
        let baseKind: "grass" | "dirt" | "rock" = "rock";
        if (depthFromSurface === 0) baseKind = "grass";
        else if (depthFromSurface <= 3) baseKind = "dirt";

        // 5. Apply Block Types
        let type: BlockType;

        if (isInfected) {
          type = BlockType.NETHERRACK;
        } else {
          // Sleight of hand: If expanding, show the old terrain. If shrinking, reveal the new terrain.
          const activeMap = isExpanding ? oldMutationMap : newMutationMap;
          type = activeMap[baseKind];
        }

        addBlock(blocks, occupied, x, y, z, type);
      }
    }
  }

  return blocks;
}