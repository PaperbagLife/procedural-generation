<script setup lang="ts">
import { reactive } from "vue";
import VoxelWorld from "./components/VoxelWorld.vue";
import {
  BlockType,
  type TerrainParams,
  type GenFunction,
} from "./types/terrain";

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
  groundLevel: 60,
});
</script>

<template>
  <div class="app-container">
    <aside class="sidebar">
      <h2>Generator</h2>
      <div class="control-group">
        <label>Frequency ({{ params.freq.toFixed(3) }})</label>
        <input
          type="range"
          v-model.number="params.freq"
          min="0.001"
          max="0.1"
          step="0.001"
        />
      </div>
      <div class="control-group">
        <label>Amplitude ({{ params.amp }})</label>
        <input
          type="range"
          v-model.number="params.amp"
          min="5"
          max="60"
          step="1"
        />
      </div>
      <div class="control-group">
        <label>Octaves ({{ params.octaves }})</label>
        <input
          type="range"
          v-model.number="params.octaves"
          min="1"
          max="6"
          step="1"
        />
      </div>
      <div class="control-group">
        <label>World Size ({{ params.worldSize }})</label>
        <input
          type="range"
          v-model.number="params.worldSize"
          min="20"
          max="80"
          step="5"
        />
      </div>
    </aside>
    <main class="viewport-grid">
      <VoxelWorld
        title="TopLeft"
        :params="params"
        :genFunction="generateTopLeft"
      />
      <VoxelWorld
        title="TopRight"
        :params="params"
        :genFunction="generateTopRight"
      />
      <VoxelWorld
        title="BottomLeft"
        :params="params"
        :genFunction="generateBottomLeft"
      />
      <VoxelWorld
        title="BottomRight"
        :params="params"
        :genFunction="generateBottomRight"
      />
    </main>
  </div>
</template>
