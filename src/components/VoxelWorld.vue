<script setup lang="ts">
import { onMounted, ref, watch, onUnmounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  BlockType,
  type TerrainParams,
  type GenFunction,
  type CameraTransform,
  BLOCK_COLORS,
  mapOrbitTarget,
} from "../types/terrain";

interface Props {
  params: TerrainParams;
  genFunction: GenFunction;
  title: string;
  syncEnabled: boolean;
  sharedTransform: CameraTransform;
  autoRegenerateMs?: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "camera-update", payload: CameraTransform): void;
}>();

const container = ref<HTMLDivElement | null>(null);

let animationId: number | null = null;
let regenerateTimerId: number | null = null;
let pendingEmitFrame: number | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let skipCameraEmit = false;
let instancedMeshes: THREE.InstancedMesh[] = [];

const updateRegenerateTimer = () => {
  if (regenerateTimerId !== null) {
    window.clearInterval(regenerateTimerId);
    regenerateTimerId = null;
  }

  if ((props.autoRegenerateMs ?? 0) > 0) {
    regenerateTimerId = window.setInterval(() => {
      generate();
      renderFrame();
    }, props.autoRegenerateMs);
  }
};

const disposeInstancedMesh = (mesh: THREE.InstancedMesh) => {
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => m.dispose());
  } else {
    mesh.material.dispose();
  }
};

function applySharedPositionFromSync() {
  const t = mapOrbitTarget(props.params);
  controls.target.set(t[0], t[1], t[2]);
  skipCameraEmit = true;
  camera.position.fromArray(props.sharedTransform.position);
  controls.update();
  skipCameraEmit = false;
}

function orbitDistanceLimits(p: TerrainParams) {
  const ws = p.worldSize;
  return {
    min: ws * 0.18,
    max: ws * 10,
  };
}

function configureOrbitDistanceAndAngles(p: TerrainParams) {
  const lim = orbitDistanceLimits(p);
  controls.minDistance = lim.min;
  controls.maxDistance = lim.max;
}

function scheduleEmitCameraIfSync() {
  if (!props.syncEnabled || skipCameraEmit) return;
  if (pendingEmitFrame !== null) return;
  pendingEmitFrame = requestAnimationFrame(() => {
    pendingEmitFrame = null;
    emit("camera-update", {
      position: camera.position.toArray() as [number, number, number],
    });
  });
}

const onControlsChange = () => {
  scheduleEmitCameraIfSync();
};

const onWindowResize = () => {
  if (!container.value) return;
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  renderFrame();
};

const animateLoop = () => {
  animationId = requestAnimationFrame(animateLoop);
  controls.update();
  renderer.render(scene, camera);
};

const renderFrame = () => {
  renderer.render(scene, camera);
};

const init = () => {
  if (!container.value) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 20, props.params.worldSize * 2);

  const aspect = container.value.clientWidth / container.value.clientHeight;
  camera = new THREE.PerspectiveCamera(55, aspect, 0.1, Math.max(2000, props.params.worldSize * 15));

  camera.position.fromArray(props.sharedTransform.position);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.value.appendChild(renderer.domElement);

  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(50, 100, 50);
  scene.add(sun);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.screenSpacePanning = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.92;

  controls.minPolarAngle = THREE.MathUtils.degToRad(12);
  controls.maxPolarAngle = Math.PI / 2 - THREE.MathUtils.degToRad(10);

  configureOrbitDistanceAndAngles(props.params);
  controls.target.set(...mapOrbitTarget(props.params));

  skipCameraEmit = true;
  controls.update();
  skipCameraEmit = false;

  controls.addEventListener("change", onControlsChange);

  window.addEventListener("resize", onWindowResize);

  generate();
  renderFrame();
  updateRegenerateTimer();

  animateLoop();

  onUnmounted(() => {
    if (pendingEmitFrame !== null) cancelAnimationFrame(pendingEmitFrame);
    window.removeEventListener("resize", onWindowResize);
    controls.removeEventListener("change", onControlsChange);
    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;
    if (regenerateTimerId !== null) {
      window.clearInterval(regenerateTimerId);
      regenerateTimerId = null;
    }
    controls.dispose();
    renderer.dispose();
  });
};

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

const generate = () => {
  instancedMeshes.forEach((m) => {
    scene.remove(m);
    disposeInstancedMesh(m);
  });
  instancedMeshes = [];

  const instancedData: Record<number, THREE.Matrix4[]> = {
    [BlockType.GRASS]: [],
    [BlockType.SNOW]: [],
    [BlockType.ROCK]: [],
    [BlockType.WATER]: [],
    [BlockType.DIRT]: [],
    [BlockType.WOOD]: [],
    [BlockType.LEAVES]: [],
    [BlockType.SAND]: [],
    [BlockType.DARK_ROCK]: [],
    [BlockType.MAGMA]: [],
    [BlockType.SCULK]: [],
    [BlockType.MYCELIUM]: [],
    [BlockType.NETHERRACK]: [],
    [BlockType.TUNDRA_SURFACE]: [],
    [BlockType.TAIGA_SURFACE]: [],
    [BlockType.STEPPE_SURFACE]: [],
    [BlockType.FOREST_SURFACE]: [],
    [BlockType.TEMPERATE_FOREST_SURFACE]: [],
    [BlockType.GRASSLAND_SURFACE]: [],
    [BlockType.TROPICAL_FOREST_SURFACE]: [],
  };

  const blockList = props.genFunction(props.params);

  blockList.forEach((block) => {
    if (block.type !== BlockType.NULL && instancedData[block.type]) {
      const matrix = new THREE.Matrix4().makeTranslation(
        block.x,
        block.y,
        block.z,
      );
      instancedData[block.type].push(matrix);
    }
  });

  Object.entries(instancedData).forEach(([typeStr, matrices]) => {
    const type = parseInt(typeStr);
    if (matrices.length === 0) return;
    const material = new THREE.MeshPhongMaterial({
      color: BLOCK_COLORS[type].color,
      transparent: BLOCK_COLORS[type].transparent,
      opacity: BLOCK_COLORS[type].opacity,
    });
    const imesh = new THREE.InstancedMesh(boxGeo, material, matrices.length);
    for (let i = 0; i < matrices.length; i++) imesh.setMatrixAt(i, matrices[i]);
    scene.add(imesh);
    instancedMeshes.push(imesh);
  });
};

watch(
  () => props.sharedTransform,
  () => {
    if (!props.syncEnabled) return;
    applySharedPositionFromSync();
    renderFrame();
  },
  { deep: true },
);

watch(
  () => props.params,
  () => {
    generate();
    configureOrbitDistanceAndAngles(props.params);
    controls.target.set(...mapOrbitTarget(props.params));
    skipCameraEmit = true;
    controls.update();
    skipCameraEmit = false;
    renderFrame();
  },
  { deep: true },
);

watch(
  () => props.autoRegenerateMs,
  () => {
    updateRegenerateTimer();
  },
);

onMounted(init);
</script>

<template>
  <div class="world-container">
    <div ref="container" class="canvas-container"></div>
    <div class="label">{{ title }}</div>

    <div v-if="syncEnabled" class="sync-indicator">SYNC</div>
  </div>
</template>

<style scoped>
.world-container {
  position: relative;
  border: 1px solid #333;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #000;
}

.canvas-container {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.canvas-container:active {
  cursor: grabbing;
}

.label {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: #eee;
  padding: 5px 12px;
  pointer-events: none;
  font-family: monospace;
  font-size: 11px;
  border: 1px solid #555;
}

.orbit-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.65);
  color: #ccc;
  padding: 4px 10px;
  font-size: 10px;
  pointer-events: none;
  border-radius: 4px;
  white-space: nowrap;
}

.sync-indicator {
  position: absolute;
  top: 10px;
  right: 10px;
  background: #27ae60;
  color: white;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: bold;
  border-radius: 4px;
  pointer-events: none;
}
</style>
