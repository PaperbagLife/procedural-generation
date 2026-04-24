<script setup lang="ts">
import { reactive, ref } from "vue";
import VoxelWorld from "./components/VoxelWorld.vue";
import { type TerrainParams } from "./types/terrain";

import { generateTopLeft } from "./gen_functions/yunkunlu";
import { generateTopRight } from "./gen_functions/kaijielai";
import { generateBottomLeft } from "./gen_functions/yuxincao";
import { generateBottomRight } from "./gen_functions/yutaocao";

const isTopLeftExpanded = ref(false);
const toggleTopLeft = () => {
  isTopLeftExpanded.value = !isTopLeftExpanded.value;
};

// --- State ---
const params = reactive<TerrainParams>({
  freq: 0.015,
  amp: 25,
  octaves: 3,
  worldSize: 100,
  worldHeight: 100,
  groundLevel: 70,
  seaParms: {
    seaLevel: 60,
    seabedLevel: 40,
  },
  caveParams: {
    caveThreshold: -0.1,
    caveFreq: 0.08,
    caveSafetyBuffer: 5,
    tunnelOffset: 1000,
    tunnelWidth: 0.1,
  },
  seed: Date.now(),
});

const regenerateSeed = () => {
  params.seed = Date.now();
};
</script>

<template>
  <div class="app-container">
    <aside class="sidebar">
      <div class="control-group">
        <label>Seed ({{ params.seed }})</label>
        <button class="regen-button" type="button" @click="regenerateSeed">
          Generate
        </button>
      </div>
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
        <label>Ground Level ({{ params.groundLevel }})</label>
        <input type="range" v-model.number="params.groundLevel" :min="10" :max="params.worldHeight - 10" step="1" />
      </div>
      <div class="foldable-container">
        <div class="foldable-header" @click="toggleTopLeft">
          <span>Top Left Controls</span>
          <span class="arrow" :class="{ 'arrow-rotated': !isTopLeftExpanded }">▼</span>
        </div>

        <transition name="fold">
          <div v-show="isTopLeftExpanded" class="foldable-content">
            <div class="control-group">
              <label>Sea Level ({{ params.seaParms.seaLevel }})</label>
              <input type="range" v-model.number="params.seaParms.seaLevel" :min="10" :max="params.groundLevel"
                step="1" />
            </div>

            <div class="control-group">
              <label>Seabed Level ({{ params.seaParms.seabedLevel }})</label>
              <input type="range" v-model.number="params.seaParms.seabedLevel" :min="5"
                :max="params.seaParms.seaLevel - 5" step="1" />
            </div>

            <div class="control-group">
              <label>Cave Threshold ({{ params.caveParams.caveThreshold.toFixed(2) }})</label>
              <input type="range" v-model.number="params.caveParams.caveThreshold" min="-0.5" max="0.5" step="0.01" />
            </div>

            <div class="control-group">
              <label>Cave Frequency ({{ params.caveParams.caveFreq.toFixed(3) }})</label>
              <input type="range" v-model.number="params.caveParams.caveFreq" min="0.01" max="0.1" step="0.005" />
            </div>

            <div class="control-group">
              <label>Cave Safety Buffer ({{ params.caveParams.caveSafetyBuffer }})</label>
              <input type="range" v-model.number="params.caveParams.caveSafetyBuffer" min="0"
                :max="params.worldHeight / 2" step="1" />
            </div>

            <div class="control-group">
              <label>Tunnel Width ({{ (params.caveParams.tunnelWidth * 100).toFixed(1) }}%)</label>
              <input type="range" v-model.number="params.caveParams.tunnelWidth" min="0.05" max="0.3" step="0.01" />
            </div>
          </div>
        </transition>
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
.viewport-grid>* {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.viewport-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  background: #333;
  height: 100%;
}

html,
body,
#app {
  height: 100%;
  margin: 0;
}

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
  overflow-y: auto;
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

/* Foldable Header */
.foldable-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #2b2b2b;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.9rem;
  margin-bottom: 5px;
  border: 1px solid #333;
}

.foldable-header:hover {
  background: #3a3a3a;
}

.arrow {
  font-size: 0.7rem;
  transition: transform 0.3s ease;
}

.arrow-rotated {
  transform: rotate(-90deg);
}

.foldable-content {
  padding: 10px 5px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* Transition Animation */
.fold-enter-active,
.fold-leave-active {
  transition: all 0.3s ease-in-out;
  max-height: 500px;
  /* Adjust based on content size */
  overflow: hidden;
}

.fold-enter-from,
.fold-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
