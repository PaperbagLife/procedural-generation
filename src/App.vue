<template>
  <div class="app-wrapper">
    <div class="ui-panel">
      <h3>Terrain Settings</h3>
      <div class="control">
        <label>Frequency: {{ params.freq.toFixed(3) }}</label>
        <input
          type="range"
          v-model.number="params.freq"
          min="0.001"
          max="0.1"
          step="0.001"
        />
      </div>
      <div class="control">
        <label>Amplitude: {{ params.amp }}</label>
        <input
          type="range"
          v-model.number="params.amp"
          min="1"
          max="50"
          step="1"
        />
      </div>
      <div class="control">
        <label>Octaves: {{ params.octaves }}</label>
        <input
          type="range"
          v-model.number="params.octaves"
          min="1"
          max="6"
          step="1"
        />
      </div>
      <p class="hint">Click any window to fly</p>
    </div>

    <div class="grid-container">
      <VoxelWorld
        title="Basic Hills"
        :params="params"
        :genFunction="generateHills"
      />
      <VoxelWorld
        title="Jagged Peaks"
        :params="params"
        :genFunction="generatePeaks"
      />
      <VoxelWorld
        title="Floating Islands"
        :params="params"
        :genFunction="generateIslands"
      />
      <VoxelWorld
        title="Terraced Plains"
        :params="params"
        :genFunction="generateTerraced"
      />
    </div>
  </div>
</template>

<script setup>
import { reactive } from "vue";
import VoxelWorld from "./components/VoxelWorld.vue";
import { createNoise2D, createNoise3D } from "simplex-noise";

const params = reactive({
  freq: 0.02,
  amp: 20,
  octaves: 3,
  worldSize: 100, // Reduced size for performance (4 scenes is heavy!)
  worldHeight: 100,
  groundLevel: 50,
});

const noise2D = createNoise2D();
const noise3D = createNoise3D();

// Helper for Fractal Brownian Motion (Octaves)
function getNoise(x, z, p) {
  let v = 0;
  let f = p.freq;
  let a = 1;
  let maxV = 0;
  for (let i = 0; i < p.octaves; i++) {
    v += noise2D(x * f, z * f) * a;
    maxV += a;
    f *= 2;
    a *= 0.5;
  }
  return v / maxV;
}

// --- GENERATION FUNCTIONS (Split work for 4 people) ---

// PERSON 1: Smooth rolling hills
const generateHills = (p, addBlock) => {
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      const h = Math.floor(p.groundLevel + getNoise(x, z, p) * p.amp);
      for (let y = 0; y < h; y++) {
        addBlock(x, y, z, y === h - 1 ? 1 : 3);
      }
    }
  }
};

// PERSON 2: Ridged/Jagged Mountains
const generatePeaks = (p, addBlock) => {
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      // Abs noise creates sharp ridges
      const n = 1 - Math.abs(getNoise(x, z, p));
      const h = Math.floor(p.groundLevel + n * n * p.amp * 1.5);
      for (let y = 0; y < h; y++) {
        addBlock(x, y, z, y > 70 ? 2 : 3);
      }
    }
  }
};

// PERSON 3: 3D Caves & Floating Islands
const generateIslands = (p, addBlock) => {
  for (let x = 0; x < p.worldSize; x++) {
    for (let y = 0; y < p.worldHeight; y++) {
      for (let z = 0; z < p.worldSize; z++) {
        const n = noise3D(x * p.freq, y * p.freq, z * p.freq);
        if (n > 0.4) addBlock(x, y, z, 3);
      }
    }
  }
};

// PERSON 4: Terraced/Stepped terrain
const generateTerraced = (p, addBlock) => {
  for (let x = 0; x < p.worldSize; x++) {
    for (let z = 0; z < p.worldSize; z++) {
      let hRaw = p.groundLevel + getNoise(x, z, p) * p.amp;
      const h = Math.floor(hRaw / 5) * 5; // Snap to 5-block increments
      for (let y = 0; y < h; y++) {
        addBlock(x, y, z, y < 45 ? 4 : 1);
      }
    }
  }
};
</script>

<style>
body {
  margin: 0;
  background: #111;
  font-family: sans-serif;
  overflow: hidden;
}
.app-wrapper {
  display: flex;
  width: 100vw;
  height: 100vh;
}

.ui-panel {
  width: 250px;
  background: #222;
  color: white;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  border-right: 1px solid #444;
}

.grid-container {
  flex-grow: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
input[type="range"] {
  width: 100%;
  cursor: pointer;
}
.hint {
  font-size: 0.8rem;
  color: #888;
  margin-top: auto;
}
</style>
