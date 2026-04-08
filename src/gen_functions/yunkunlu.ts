import { createNoise2D, createNoise3D } from "simplex-noise";
import {
  BlockType,
  type TerrainParams,
  type GenFunction,
} from "../types/terrain";

// --- Noise Instances ---
const noise2D = createNoise2D();
const noise3D = createNoise3D();

/**
 * Helper: Fractal Brownian Motion
 * Combines multiple noise layers based on the 'octaves' parameter
 */
const getFBMNoise2D = (x: number, z: number, p: TerrainParams): number => {
  let value = 0;
  let amplitude = 1;
  let frequency = p.freq;
  let maxValue = 0;

  for (let i = 0; i < p.octaves; i++) {
    value += noise2D(x * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5; // persistence
    frequency *= 2.0; // lacunarity
  }
  return value / maxValue;
};

export const generateTopLeft: GenFunction = (p, addBlock) => {
  // Function here that generates terrain based on x, y, z coord
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      const noise = getFBMNoise2D(x, z, p);
      const height = Math.floor(p.groundLevel + noise * p.amp);

      for (let y = 0; y < height; y++) {
        const type = y === height - 1 ? 1 : 3; // Grass top, Rock below
        addBlock(x, y, z, type);
      }
    }
  }
};