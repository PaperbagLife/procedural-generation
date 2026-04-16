<script setup lang="ts">
import { reactive } from "vue";
import VoxelWorld from "./components/VoxelWorld.vue";
import { type TerrainParams } from "./types/terrain";

import { generateTopLeft } from "./gen_functions/yunkunlu";
import { generateTopRight } from "./gen_functions/kaijielai";
import { generateBottomLeft } from "./gen_functions/yuxincao";
import { generateBottomRight } from "./gen_functions/yutaocao";

// --- State ---
const params = reactive<TerrainParams>({
  freq: 0.015,
  amp: 25,
  octaves: 3,
  worldSize: 100,
  worldHeight: 100,
  groundLevel: 70,
  seed: Date.now(),
});

const regenerateSeed = () => {
  params.seed = Date.now();
};
</script>

<template>
  <div class="app-container">
    <aside class="sidebar">
      <h2>Generator</h2>
      <div class="control-group">
        <label>Frequency ({{ params.freq.toFixed(3) }})</label>
        <input type="range" v-model.number="params.freq" min="0.001" max="0.1" step="0.001" />
      </div>
      <div class="control-group">
        <label>Amplitude ({{ params.amp }})</label>
        <input type="range" v-model.number="params.amp" min="1" max="50" step="1" />
      </div>
      <div class="control-group">
        <label>Octaves ({{ params.octaves }})</label>
        <input type="range" v-model.number="params.octaves" min="1" max="6" step="1" />
      </div>
      <div class="control-group">
        <label>World Size ({{ params.worldSize }})</label>
        <input type="range" v-model.number="params.worldSize" min="20" max="120" step="5" />
      </div>
      <div class="control-group">
        <label>Seed ({{ params.seed }})</label>
        <button class="regen-button" type="button" @click="regenerateSeed">
          Generate
        </button>
      </div>
    </aside>
    <main class="viewport-grid">
      <VoxelWorld title="TopLeft" :params="params" :genFunction="generateTopLeft" />
      <VoxelWorld title="TopRight" :params="params" :genFunction="generateTopRight" />
      <VoxelWorld title="BottomLeft" :params="params" :genFunction="generateBottomLeft" />
      <VoxelWorld title="BottomRight" :params="params" :genFunction="generateBottomRight" />
    </main>
  </div>
</template>

<style>
body {
  margin: 0;
  overflow: hidden;
  background: #000;
}

.app-container {
  display: flex;
  width: 100vw;
  height: 100vh;
}

.sidebar {
  width: 280px;
  background: #1e1e1e;
  color: white;
  padding: 20px;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  gap: 15px;
  z-index: 10;
}

.viewport-grid {
  flex-grow: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  background: #333;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.regen-button {
  border: 1px solid #5a5a5a;
  background: #2b2b2b;
  color: #f4f4f4;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
}

.regen-button:hover {
  background: #3a3a3a;
}

.regen-button:active {
  transform: translateY(1px);
}

input[type="range"] {
  width: 100%;
}
</style>
