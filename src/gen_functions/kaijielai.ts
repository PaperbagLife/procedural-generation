import {
  BlockType,
  type TerrainParams,
  type BlockData,
} from "../types/terrain";
import NoiseModule from "noisejs";

const Noise = (NoiseModule as any).Noise;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type Biome = "snow" | "grass" | "forest";

export function generateTopRight(p: TerrainParams): BlockData[] {
  const blocks: BlockData[] = [];
  const noiseGen = new Noise(p.seed + 1337);
  const fbmPerlin3D = (x: number, y: number, z: number, octaves: number) => {
    let total = 0, amplitude = 1, frequency = 1, normalization = 0;
    for (let i = 0; i < octaves; i++) {
      total += noiseGen.perlin3(x * frequency, y * frequency, z * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return normalization === 0 ? 0 : total / normalization;
  };

  const baseHeight = Math.max(1, p.groundLevel - 15);
  const terrainScale = Math.max(0.001, p.freq * 6);
  const heightVariation = Math.max(4, p.amp * 2);
  const snowLine = baseHeight + Math.floor(heightVariation * 0.28);
  const rockLine = baseHeight + Math.floor(heightVariation * 0.08);
  const maxSurface = p.worldHeight - 1;
  const minSurface = 1;
  const targetRiverRatio = 0.06;

  const targetForestRatio = 0.22;

  const heightMap = Array.from({ length: p.worldSize }, () =>
    Array(p.worldSize).fill(minSurface),
  );
  const temperatureMap = Array.from({ length: p.worldSize }, () =>
    Array(p.worldSize).fill(0),
  );
  const moistureMap = Array.from({ length: p.worldSize }, () =>
    Array(p.worldSize).fill(0),
  );
  const biomeMap = Array.from({ length: p.worldSize }, () =>
    Array<Biome>(p.worldSize).fill("grass"),
  );
  const riverMap = Array.from({ length: p.worldSize }, () =>
    Array(p.worldSize).fill(false),
  );
  const riverStrengthMap = Array.from({ length: p.worldSize }, () =>
    Array(p.worldSize).fill(0),
  );
  const riverCenter = Array(p.worldSize).fill(p.worldSize / 2);
  const riverWidth = Array(p.worldSize).fill(3);
  const treeMask = Array.from({ length: p.worldSize }, () =>
    Array(p.worldSize).fill(false),
  );

  let minTemp = Number.POSITIVE_INFINITY;
  let maxTemp = Number.NEGATIVE_INFINITY;
  let minMoisture = Number.POSITIVE_INFINITY;
  let maxMoisture = Number.NEGATIVE_INFINITY;

  // pre-calculate river
  for (let x = 0; x < p.worldSize; x++) {
    const nx = x * terrainScale;
    const drift = Math.sin(x * 0.11) * (p.worldSize * 0.12);
    const centerNoise =
      fbmPerlin3D(nx * 0.08 + 12.3, 35.7, 4.6, 2) * (p.worldSize * 0.09);
    riverCenter[x] = clamp(p.worldSize * 0.5 + drift + centerNoise, 3, p.worldSize - 4);
    riverWidth[x] = 2.0 + (fbmPerlin3D(nx * 0.1 - 9.1, 17.8, 3.4, 2) + 1) * 0.9;
  }

  // Biome-first: generate height, temperature, moisture, then classify biome.
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      const nx = x * terrainScale;
      const nz = z * terrainScale;

      const continental = fbmPerlin3D(nx * 0.32, 13.4, nz * 0.32, p.octaves);
      const ridged = 1 - Math.abs(fbmPerlin3D(nx * 1.1, 29.1, nz * 1.1, 4));
      const detail = fbmPerlin3D(nx * 0.88, 53.2, nz * 0.88, 3);
      const valley = fbmPerlin3D(nx * 0.18 + 6.1, 84.2, nz * 0.18 - 7.3, 2);
      const mountainCore = Math.max(
        0,
        fbmPerlin3D(nx * 0.11 + 41.7, 16.8, nz * 0.11 - 23.4, 3),
      );
      const mountainShape = Math.pow(mountainCore, 1.8);
      const mountainMask = Math.pow(
        Math.max(0, fbmPerlin3D(nx * 0.07 - 9.4, 61.2, nz * 0.07 + 18.5, 2)),
        2.2,
      );

      const surfaceHeight = clamp(
        Math.round(
          baseHeight - 15 +
            continental * heightVariation * 0.15 +
            ridged * mountainMask * heightVariation * 1.8 +
            detail * heightVariation * 0.08 +
            valley * heightVariation * 0.05 +
            mountainShape * heightVariation * 3.0 +
            mountainMask * heightVariation * 4.5,
        ),
        minSurface,
        maxSurface,
      );

      heightMap[x][z] = surfaceHeight;

      const normalizedHeight = (surfaceHeight - baseHeight) / Math.max(1, heightVariation);
      const temperature =
        fbmPerlin3D(nx * 0.14 + 17.9, 73.3, nz * 0.14 - 9.6, 3) -
        normalizedHeight * 0.48 -
        mountainMask * 0.22;
      const moisture = fbmPerlin3D(nx * 0.16 - 7.4, 41.5, nz * 0.16 + 21.8, 3);

      temperatureMap[x][z] = temperature;
      moistureMap[x][z] = moisture;

      if (temperature < minTemp) minTemp = temperature;
      if (temperature > maxTemp) maxTemp = temperature;
      if (moisture < minMoisture) minMoisture = moisture;
      if (moisture > maxMoisture) maxMoisture = moisture;
    }
  }

  const riverStrengthList: number[] = [];
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      const riverDist = Math.abs(z - riverCenter[x]);
      const riverEdge = riverWidth[x];
      if (riverDist > riverEdge) continue;
      const strength = clamp(1 - riverDist / Math.max(0.001, riverEdge), 0, 1);
      riverStrengthMap[x][z] = strength;
      riverStrengthList.push(strength);
    }
  }

  const targetRiverCells = Math.max(
    1,
    Math.floor(p.worldSize * p.worldSize * targetRiverRatio),
  );
  let riverThreshold = 0;
  if (riverStrengthList.length > 0) {
    const sorted = [...riverStrengthList].sort((a, b) => b - a);
    const idx = Math.min(targetRiverCells - 1, sorted.length - 1);
    riverThreshold = sorted[idx];
  }

  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      riverMap[x][z] = riverStrengthMap[x][z] >= riverThreshold && riverStrengthMap[x][z] > 0;
    }
  }

  const tempRange = Math.max(0.0001, maxTemp - minTemp);
  const moistureRange = Math.max(0.0001, maxMoisture - minMoisture);

  // Assign snow biome by height — consistent with block placement logic
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      if (heightMap[x][z] >= snowLine - 12) {
        biomeMap[x][z] = "snow";
      }
    }
  }

  const nonRiverCells: Array<{ x: number; z: number; forestScore: number }> = [];

  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      if (riverMap[x][z]) continue;
      if (biomeMap[x][z] === "snow") continue;

      const surfaceHeight = heightMap[x][z];
      const normalizedHeight = (surfaceHeight - baseHeight) / Math.max(1, heightVariation);
      const tempN = (temperatureMap[x][z] - minTemp) / tempRange;
      const moistureN = (moistureMap[x][z] - minMoisture) / moistureRange;
      const forestBand = 1 - Math.abs(normalizedHeight - 0.15);
      const forestScore = moistureN * 0.55 + tempN * 0.25 + forestBand * 0.2;

      nonRiverCells.push({ x, z, forestScore });
    }
  }

  const forestCount = Math.floor(nonRiverCells.length * targetForestRatio);
  const forestCandidates = [...nonRiverCells].sort((a, b) => b.forestScore - a.forestScore);
  for (let i = 0; i < forestCount && i < forestCandidates.length; i++) {
    biomeMap[forestCandidates[i].x][forestCandidates[i].z] = "forest";
  }

  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      const surfaceHeight = heightMap[x][z];
      const riverDist = Math.abs(z - riverCenter[x]);
      const riverEdge = riverWidth[x];
      const carveStrength = riverMap[x][z]
        ? riverStrengthMap[x][z]
        : clamp(1 - (riverDist - riverEdge) / 1.8, 0, 1);
      const riverNoise = fbmPerlin3D(x * terrainScale * 0.75, 67.2, z * terrainScale * 0.75, 2);
      const isRiver = riverMap[x][z];
      const riverDepth = isRiver
        ? Math.round(1 + carveStrength * 1.2 + (riverNoise > 0.2 ? 1 : 0))
        : 0;
      const localWaterTop = clamp(surfaceHeight - 1, minSurface + 1, maxSurface);
      const localRiverBed = clamp(localWaterTop - 1, minSurface, maxSurface);
      let terrainTop = isRiver
        ? clamp(localRiverBed - Math.max(0, riverDepth - 1), minSurface, maxSurface)
        : surfaceHeight;
      if (!isRiver && carveStrength > 0.25) {
        terrainTop = clamp(terrainTop - 1, minSurface, maxSurface);
      }
      heightMap[x][z] = terrainTop;

      for (let y = 0; y <= terrainTop; y++) {
        let type: BlockData["type"] = BlockType.ROCK;

        if (y === terrainTop) {
          const nearWater = !isRiver && carveStrength > 0.1 && terrainTop < snowLine - 12;
          let slope = 0;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              const nx = clamp(x + dx, 0, p.worldSize - 1);
              const nz = clamp(z + dz, 0, p.worldSize - 1);
              slope = Math.max(slope, Math.abs(heightMap[nx][nz] - terrainTop));
            }
          }
          if (nearWater) {
            type = BlockType.SAND;
          } else if (slope >= 3) {
            type = BlockType.ROCK;
          } else {
            const transitionWidth = 12;
            const snowFactor = clamp((terrainTop - (snowLine - transitionWidth)) / transitionWidth, 0, 1);
            if (snowFactor >= 1) {
              type = BlockType.SNOW;
            } else if (snowFactor > 0) {
              const patchNoise = fbmPerlin3D(x * terrainScale * 4 + 5.5, 88.4, z * terrainScale * 4 - 3.1, 2);
              type = patchNoise < snowFactor * 2 - 1 ? BlockType.SNOW : BlockType.GRASS;
            } else {
              type = BlockType.GRASS;
            }
          }
        } else if (y >= terrainTop - 2) {
          type = BlockType.DIRT;
        } else if (y >= rockLine) {
          type = BlockType.ROCK;
        }

        blocks.push({ x, y, z, type });
      }

      if (isRiver) {
        const waterTop = clamp(Math.max(localWaterTop, terrainTop + 1), minSurface + 1, maxSurface);
        for (let y = terrainTop + 1; y <= waterTop; y++) {
          blocks.push({ x, y, z, type: BlockType.WATER });
        }
      }
    }
  }

  const hasNearbyTree = (cx: number, cz: number, radius: number) => {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= p.worldSize || nz < 0 || nz >= p.worldSize) continue;
        if (treeMask[nx][nz]) return true;
      }
    }
    return false;
  };

  const localSlope = (cx: number, cz: number) => {
    let minH = heightMap[cx][cz];
    let maxH = heightMap[cx][cz];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= p.worldSize || nz < 0 || nz >= p.worldSize) continue;
        const h = heightMap[nx][nz];
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }

    return maxH - minH;
  };

  const placeTree = (x: number, z: number) => {
    const nx = x * terrainScale;
    const nz = z * terrainScale;
    const treeSeed = fbmPerlin3D(nx * 1.35 + 8.9, 93.7, nz * 1.35 - 4.2, 3);
    const topY = heightMap[x][z];
    if (topY >= snowLine) return false;
    const trunkHeight = treeSeed > 0.45 ? 5 : 4;
    treeMask[x][z] = true;

    for (let t = 1; t <= trunkHeight; t++) {
      const y = topY + t;
      if (y < p.worldHeight) {
        blocks.push({ x, y, z, type: BlockType.WOOD });
      }
    }

    const leafBase = topY + trunkHeight - 1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 0; dy <= 2; dy++) {
          const manhattan = Math.abs(dx) + Math.abs(dz);
          const canopyLimit = dy === 2 ? 0 : 1;
          if (manhattan > canopyLimit) continue;

          const lx = x + dx;
          const lz = z + dz;
          const ly = leafBase + dy;

          if (lx < 0 || lx >= p.worldSize || lz < 0 || lz >= p.worldSize) continue;
          if (ly >= p.worldHeight) continue;
          if (ly <= heightMap[lx][lz] + 1) continue;

          blocks.push({
            x: lx,
            y: ly,
            z: lz,
            type: BlockType.LEAVES,
          });
        }
      }
    }

    return true;
  };

  const forestCells: Array<{ x: number; z: number; score: number }> = [];
  const grassFallbackCells: Array<{ x: number; z: number; score: number }> = [];
  for (let x = 3; x < p.worldSize - 3; x++) {
    for (let z = 3; z < p.worldSize - 3; z++) {
      if (riverMap[x][z]) continue;
      const nx = x * terrainScale;
      const nz = z * terrainScale;
      const slope = localSlope(x, z);
      if (slope > 3) continue;

      const s = fbmPerlin3D(nx * 1.2 + 5.7, 19.1, nz * 1.2 - 2.3, 2);
      const moistureScore = moistureMap[x][z] * 0.35;

      if (biomeMap[x][z] === "forest") {
        forestCells.push({ x, z, score: s + moistureScore });
      } else if (biomeMap[x][z] === "grass") {
        grassFallbackCells.push({ x, z, score: s + moistureScore - Math.max(0, normalizedHeightPenalty(heightMap[x][z], baseHeight, heightVariation)) });
      }
    }
  }

  forestCells.sort((a, b) => b.score - a.score);
  grassFallbackCells.sort((a, b) => b.score - a.score);
  const targetTrees = Math.max(
    12,
    Math.floor(p.worldSize * p.worldSize * 0.03),
  );
  let placedTrees = 0;

  for (let i = 0; i < forestCells.length && placedTrees < targetTrees; i++) {
    const cell = forestCells[i];
    if (hasNearbyTree(cell.x, cell.z, 2)) continue;
    if (placeTree(cell.x, cell.z)) placedTrees++;
  }

  for (let i = 0; i < grassFallbackCells.length && placedTrees < targetTrees; i++) {
    const cell = grassFallbackCells[i];
    if (hasNearbyTree(cell.x, cell.z, 2)) continue;
    if (placeTree(cell.x, cell.z)) placedTrees++;
  }

  return blocks;
}

function normalizedHeightPenalty(
  height: number,
  baseHeight: number,
  heightVariation: number,
) {
  const normalizedHeight = (height - baseHeight) / Math.max(1, heightVariation);
  return Math.max(0, normalizedHeight - 0.12);
}