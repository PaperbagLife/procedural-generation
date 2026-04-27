import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";

import NoiseModule from "noisejs";

const Noise = (NoiseModule as any).Noise;

type PerlinNoise = {
  perlin2(x: number, z: number): number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const to01 = (value: number) => clamp(value * 0.5 + 0.5, 0, 1);

// Polynomial Smooth Minimum for blending overlapping volcanoes naturally
const smin = (a: number, b: number, k: number): number => {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
};

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

interface Vent {
  centerX: number;
  centerZ: number;
  baseY: number;
  topY: number;
  radius: number;
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
  const freqFactor = clamp(p.freq * 12, 0.25, 2.25);
  const spacing = clamp(
    Math.round(p.worldSize / (8 + freqFactor * 5)),
    4,
    Math.max(4, Math.round(p.worldSize / 4)),
  );
  const halfSpacing = spacing * 0.5;
  const vents: Vent[] = [];
  const ventBaseY = clamp(Math.round(p.groundLevel - p.amp * 0.35), 0, p.worldHeight - 4);

  for (let gx = 0; gx <= p.worldSize; gx += spacing) {
    for (let gz = 0; gz <= p.worldSize; gz += spacing) {
      const layoutScale = Math.max(0.05, p.freq * 0.9);
      const jitterX = fbm2d(layoutNoise, gx * 0.19 + 12.3, gz * 0.17 - 4.8, Math.max(1, p.octaves));
      const jitterZ = fbm2d(layoutNoise, gx * 0.13 - 7.2, gz * 0.21 + 9.4, Math.max(1, p.octaves));
      const heightBias = fbm2d(
        layoutNoise,
        gx * 0.11 + 21.8 * layoutScale,
        gz * 0.09 + 5.1 * layoutScale,
        Math.max(1, p.octaves),
      );
      const radiusBias = fbm2d(
        layoutNoise,
        gx * 0.07 - 18.4 * layoutScale,
        gz * 0.15 + 16.2 * layoutScale,
        Math.max(1, p.octaves),
      );

      vents.push({
        centerX: clamp(Math.round(gx + jitterX * halfSpacing * 0.5), 0, p.worldSize - 1),
        centerZ: clamp(Math.round(gz + jitterZ * halfSpacing * 0.5), 0, p.worldSize - 1),
        baseY: ventBaseY,
        topY: clamp(
          Math.round(p.groundLevel + p.amp * (0.4 + to01(heightBias) * 0.9)),
          8,
          p.worldHeight - 1,
        ),
        radius: clamp(
          Math.round(spacing * (0.55 + to01(radiusBias) * 0.35 + p.amp * 0.004)),
          4,
          spacing + Math.max(3, Math.round(p.amp * 0.08)),
        ),
        phase: (gx + gz) * 0.17 + p.seed * 0.001,
      });
    }
  }

  return vents;
}

export function generateBottomRight(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const layoutNoise = new Noise((p.seed + 9001) >>> 0) as PerlinNoise;

  const vents = createVents(p, layoutNoise);
  const occupied = new Set<string>();
  const t = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
  const ampFactor = clamp(p.amp / 50, 0.1, 1);
  const freqFactor = clamp(p.freq * 10, 0.2, 2.0);
  const octaveFactor = clamp(p.octaves / 6, 0.2, 1);
  const eruptionSpeed = 0.8 + ampFactor * 2.2;

  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      // 1. Domain Warping for asymmetric bases
      const warpScale = p.freq * 2.0;
      const warpX = fbm2d(layoutNoise, x * warpScale, z * warpScale, 2) * 8;
      const warpZ = fbm2d(layoutNoise, z * warpScale, x * warpScale, 2) * 8;

      const distList = vents
        .map((vent) => {
          const dx = (x + warpX) - vent.centerX;
          const dz = (z + warpZ) - vent.centerZ;
          return {
            vent,
            distance: Math.sqrt(dx * dx + dz * dz),
            dx, // Keep for angle calculation
            dz
          };
        })
        .sort((a, b) => a.distance - b.distance);

      const nearest = distList[0];
      const nearestVent = nearest.vent;
      const secondDistance = distList[1]?.distance ?? nearest.distance + nearestVent.radius;
      
      // 3. Smooth Minimum Blending for natural valleys between vents
      const blendedDistance = smin(nearest.distance, secondDistance, nearestVent.radius * 0.3);

      const localNoise = fbm2d(
        layoutNoise,
        x * p.freq * 1.8 * freqFactor + nearestVent.phase,
        z * p.freq * 1.8 * freqFactor - nearestVent.phase,
        Math.max(1, p.octaves),
        0.42 + octaveFactor * 0.18,
      );

      const ridgeBlend = clamp(1 - blendedDistance / Math.max(1, nearestVent.radius), 0, 1);
      const basinBlend = clamp(1 - blendedDistance / Math.max(1, secondDistance), 0, 1);

      // 2. Erosion Channels (Ribs)
      const angle = Math.atan2(nearest.dz, nearest.dx);
      // Create 8 main ridges, modulated by noise to look organic
      const ribs = Math.sin(angle * 8 + localNoise * 5) * 0.15; 
      // Apply ribs stronger near the top of the volcano
      const erosionFactor = 1.0 + (ribs * ridgeBlend);

      const coneHeight = clamp(
        Math.round(
          nearestVent.baseY +
            (nearestVent.topY - nearestVent.baseY) *
              (0.35 + (ridgeBlend * erosionFactor) * 0.45 + to01(localNoise) * 0.18),
        ),
        nearestVent.baseY + 1,
        nearestVent.topY,
      );
      
      const craterDepth = clamp(
        Math.round(nearestVent.baseY + (nearestVent.topY - nearestVent.baseY) * (0.18 + ridgeBlend * 0.22)),
        1,
        coneHeight - 1,
      );
      const surfaceBump = Math.round((to01(localNoise) - 0.5) * p.amp * 0.15);
      const surfaceHeight = clamp(coneHeight + surfaceBump, craterDepth + 1, p.worldHeight - 1);
      const eruptionPhase = t * eruptionSpeed + nearestVent.phase + x * p.freq * 7 + z * p.freq * 7;
      const movingPulse = Math.sin(eruptionPhase);
      const magmaCoreHeight = clamp(
        Math.round(
          craterDepth +
            (surfaceHeight - craterDepth) *
              (0.25 + ampFactor * 0.25 + to01(localNoise) * 0.15 + movingPulse * 0.08),
        ),
        craterDepth + 1,
        surfaceHeight,
      );

      // Pre-calculate layer noise for stratification
      const layerNoise = fbm2d(layoutNoise, x * 0.02, z * 0.02, 2);

      for (let y = 0; y <= surfaceHeight; y++) {
        let type: BlockType = y < craterDepth ? BlockType.DARK_ROCK : BlockType.ROCK;

        if (y >= craterDepth && y <= magmaCoreHeight) {
          const coreFade = clamp(1 - (y - craterDepth) / Math.max(1, magmaCoreHeight - craterDepth + 1), 0, 1);
          const magmaNoise = fbm2d(
            layoutNoise,
            x * p.freq * 3.4 + y * 0.08,
            z * p.freq * 3.4 - y * 0.08,
            Math.max(1, p.octaves),
            0.52,
          );
          if (coreFade + to01(magmaNoise) * 0.25 + basinBlend * 0.12 > 0.42 - ampFactor * 0.05) {
            type = BlockType.MAGMA;
          }
        } else if (y >= surfaceHeight - 1) {
          type = ridgeBlend > 0.55 ? BlockType.MAGMA : BlockType.ROCK;
        }

        if (y > craterDepth && type === BlockType.ROCK) {
          const ventRimNoise = fbm2d(
            layoutNoise,
            (x - nearestVent.centerX) * p.freq * 4.2 + y * 0.05,
            (z - nearestVent.centerZ) * p.freq * 4.2 - y * 0.05,
            Math.max(1, p.octaves),
            0.5,
          );
          
          // 4. Stratified Material Layers
          const isAshLayer = (y + Math.floor(layerNoise * 8)) % 5 === 0;

          if (ridgeBlend > 0.3 + to01(ventRimNoise) * 0.2 || isAshLayer) {
            type = BlockType.DARK_ROCK;
          }
        }

        addBlock(blocks, occupied, x, y, z, type);
      }

      // Plume logic remains exactly as you had it
      const ventInnerRadius = Math.max(1, Math.round(nearestVent.radius * 0.45));
      const surfaceWave = Math.sin(eruptionPhase * 1.4 + ridgeBlend * Math.PI);
      const activeEruption = clamp(0.45 + movingPulse * 0.3 + to01(localNoise) * 0.15 + ampFactor * 0.1, 0, 1);
      const plumeHeight = clamp(
        Math.round((nearestVent.topY - craterDepth) * (0.15 + ampFactor * 0.35 + activeEruption * 0.35)),
        1,
        Math.max(2, nearestVent.radius * 2),
      );

      for (let y = surfaceHeight + 1; y <= surfaceHeight + plumeHeight; y++) {
        if (y >= p.worldHeight) break;

        const rise = y - surfaceHeight;
        const heightRatio = rise / Math.max(1, plumeHeight);
        const heightFalloff = 1 - heightRatio;
        
        // 1. Mushroom Cloud Expansion
        // Spreads slowly at the base, but balloons outward at the top
        const mushroomSpread = Math.pow(heightRatio, 3) * nearestVent.radius * 2.5;
        const spread = ventInnerRadius + Math.round(rise * (0.05 + ampFactor * 0.05) + mushroomSpread);
        
        const plumeCenterOffsetX = Math.round(surfaceWave * rise * 0.25);
        const plumeCenterOffsetZ = Math.round(Math.cos(eruptionPhase * 0.9) * rise * 0.18);
        
        const plumeNoise = fbm2d(
          layoutNoise,
          (x - nearestVent.centerX - plumeCenterOffsetX) * p.freq * 4.8 + y * 0.11,
          (z - nearestVent.centerZ - plumeCenterOffsetZ) * p.freq * 4.8 - y * 0.11,
          Math.max(1, p.octaves),
          0.52,
        );

        const dx = x - nearestVent.centerX - plumeCenterOffsetX;
        const dz = z - nearestVent.centerZ - plumeCenterOffsetZ;
        const plumeDistance = Math.sqrt(dx * dx + dz * dz);
        
        // 2. Smoothstep Falloff for softer edges
        const normalizedDist = clamp(plumeDistance / Math.max(1, spread), 0, 1);
        // Smoothstep formula: 3x^2 - 2x^3 (flipped so center is 1, edge is 0)
        const smoothFalloff = 1 - (normalizedDist * normalizedDist * (3 - 2 * normalizedDist));

        // Increase noise influence slightly toward the edges to scatter loose "ash" blocks
        const edgeNoiseWeight = 0.2 + (normalizedDist * 0.25);
        
        const eruptionScore = (smoothFalloff * 0.6) + (heightFalloff * 0.2) + (to01(plumeNoise) * edgeNoiseWeight);

        // Slightly lower threshold to allow more scattered particles
        if (eruptionScore > 0.40 - ampFactor * 0.1) {
          
          // 3. Material Transition
          // Magma only survives in the dense core, or near the extremely hot base
          const isCore = eruptionScore > 0.65;
          const isBase = heightRatio < 0.25; 
          
          const blockType = (isCore || isBase) ? BlockType.MAGMA : BlockType.DARK_ROCK;
          
          addBlock(blocks, occupied, x, y, z, blockType);
        }
      }
    }
  }

  return blocks;
}