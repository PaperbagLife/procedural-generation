<script setup lang="ts">
import { onMounted, ref, watch, onUnmounted } from "vue";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import {
  BlockType,
  type TerrainParams,
  type GenFunction,
  type CameraTransform,
  BLOCK_COLORS,
} from "../types/terrain";

interface Props {
  params: TerrainParams;
  genFunction: GenFunction;
  title: string;
  syncEnabled: boolean;
  sharedTransform: CameraTransform;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'camera-update', payload: CameraTransform): void
}>();

const container = ref<HTMLDivElement | null>(null);
const isLocked = ref(false);

let animationId: number | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: PointerLockControls;
let instancedMeshes: THREE.InstancedMesh[] = [];

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const clock = new THREE.Timer();

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, moveUp = false, moveDown = false;

const disposeInstancedMesh = (mesh: THREE.InstancedMesh) => {
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => m.dispose());
  } else {
    mesh.material.dispose();
  }
};

const init = () => {
  if (!container.value) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 20, props.params.worldSize * 2);

  const aspect = container.value.clientWidth / container.value.clientHeight;
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);

  // Set initial position from props
  camera.position.fromArray(props.sharedTransform.position);
  camera.quaternion.fromArray(props.sharedTransform.quaternion);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.value.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(50, 100, 50);
  scene.add(sun);

  controls = new PointerLockControls(camera, renderer.domElement);

  controls.addEventListener("lock", () => {
    isLocked.value = true;
    clock.update();
    if (animationId === null) animationId = requestAnimationFrame(animate);
  });

  controls.addEventListener("unlock", () => {
    isLocked.value = false;
  });

  container.value.addEventListener("click", () => controls.lock());

  const onKeyDown = (e: KeyboardEvent) => {
    if (!controls.isLocked) return;
    switch (e.code) {
      case "KeyW": moveForward = true; break;
      case "KeyA": moveLeft = true; break;
      case "KeyS": moveBackward = true; break;
      case "KeyD": moveRight = true; break;
      case "Space": moveUp = true; e.preventDefault(); break;
      case "ShiftLeft": moveDown = true; e.preventDefault(); break;
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case "KeyW": moveForward = false; break;
      case "KeyA": moveLeft = false; break;
      case "KeyS": moveBackward = false; break;
      case "KeyD": moveRight = false; break;
      case "Space": moveUp = false; break;
      case "ShiftLeft": moveDown = false; break;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onWindowResize);

  generate();
  renderFrame();

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onWindowResize);
    if (animationId) cancelAnimationFrame(animationId);
    renderer.dispose();
  });
};

const onWindowResize = () => {
  if (!container.value) return;
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  renderFrame();
};

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

const generate = () => {
  instancedMeshes.forEach((m) => {
    scene.remove(m);
    disposeInstancedMesh(m);
  });
  instancedMeshes = [];

  const instancedData: Record<number, THREE.Matrix4[]> = {
    [BlockType.GRASS]: [], [BlockType.SNOW]: [], [BlockType.ROCK]: [],
    [BlockType.WATER]: [], [BlockType.DIRT]: [], [BlockType.WOOD]: [],
    [BlockType.LEAVES]: [], [BlockType.SAND]: [], [BlockType.DARK_ROCK]: [],
  };

  const blockList = props.genFunction(props.params);

  blockList.forEach((block) => {
    if (block.type !== BlockType.NULL && instancedData[block.type]) {
      const matrix = new THREE.Matrix4().makeTranslation(block.x, block.y, block.z);
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

const renderFrame = () => {
  renderer.render(scene, camera);
};

// Sync incoming changes from other cameras
watch(() => props.sharedTransform, (newVal) => {
  if (props.syncEnabled && !isLocked.value) {
    camera.position.fromArray(newVal.position);
    camera.quaternion.fromArray(newVal.quaternion);
    renderFrame();
  }
}, { deep: true });

watch(() => props.params, () => {
  generate();
  renderFrame();
}, { deep: true });

const animate = () => {
  if (!isLocked.value) {
    animationId = null;
    return;
  }
  clock.update();
  const delta = clock.getDelta();

  const speed = 15.0;
  const friction = 10.0;

  velocity.x -= velocity.x * friction * delta;
  velocity.z -= velocity.z * friction * delta;
  velocity.y -= velocity.y * friction * delta;

  direction.z = Number(moveForward) - Number(moveBackward);
  direction.x = Number(moveRight) - Number(moveLeft);
  direction.y = Number(moveUp) - Number(moveDown);
  direction.normalize();

  if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
  if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;
  if (moveUp || moveDown) velocity.y += direction.y * speed * delta;

  controls.moveRight(-velocity.x * 10 * delta);
  controls.moveForward(-velocity.z * 10 * delta);
  camera.position.y += velocity.y * 10 * delta;

  // Sync outgoing changes if we are the leader
  if (props.syncEnabled) {
    emit('camera-update', {
      position: camera.position.toArray() as [number, number, number],
      quaternion: camera.quaternion.toArray() as [number, number, number, number]
    });
  }

  renderFrame();
  animationId = requestAnimationFrame(animate);
};

onMounted(init);
</script>

<template>
  <div class="world-container">
    <div ref="container" class="canvas-container"></div>
    <div class="label">{{ title }}</div>
    <div v-if="isLocked" class="crosshair"></div>
    <div v-if="isLocked && syncEnabled" class="sync-indicator">SYNC ACTIVE</div>
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
  cursor: crosshair;
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

.crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  border: 1px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>