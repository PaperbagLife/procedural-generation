<template>
  <div class="world-container">
    <div ref="container" class="canvas-container"></div>
    <div class="label">{{ title }}</div>
    <!-- Crosshair only shows when this specific window is active -->
    <div v-if="isLocked" class="crosshair"></div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch, onUnmounted } from "vue";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";

const props = defineProps(["params", "genFunction", "title"]);
const container = ref(null);
const isLocked = ref(false);

let scene,
  camera,
  renderer,
  controls,
  instancedMeshes = [];
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const clock = new THREE.Clock();

// Movement States
let moveForward = false,
  moveBackward = false,
  moveLeft = false,
  moveRight = false,
  moveUp = false,
  moveDown = false;

const BLOCKS = { NULL: 0, GRASS: 1, SNOW: 2, ROCK: 3, WATER: 4 };
const COLORS = {
  [BLOCKS.GRASS]: 0x559944,
  [BLOCKS.SNOW]: 0xffffff,
  [BLOCKS.ROCK]: 0x888888,
  [BLOCKS.WATER]: 0x3366ff,
};

const init = () => {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  camera = new THREE.PerspectiveCamera(
    75,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000,
  );
  camera.position.set(
    props.params.worldSize / 2,
    70,
    props.params.worldSize / 2,
  );

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

  // Important: Pointer Lock Events
  controls.addEventListener("lock", () => (isLocked.value = true));
  controls.addEventListener("unlock", () => (isLocked.value = false));

  container.value.addEventListener("click", () => {
    controls.lock();
  });

  // KEY LISTENERS
  const onKeyDown = (e) => {
    if (!controls.isLocked) return;
    switch (e.code) {
      case "KeyW":
        moveForward = true;
        break;
      case "KeyA":
        moveLeft = true;
        break;
      case "KeyS":
        moveBackward = true;
        break;
      case "KeyD":
        moveRight = true;
        break;
      case "Space":
        moveUp = true;
        e.preventDefault();
        break;
      case "ShiftLeft":
        moveDown = true;
        e.preventDefault();
        break;
    }
  };

  const onKeyUp = (e) => {
    switch (e.code) {
      case "KeyW":
        moveForward = false;
        break;
      case "KeyA":
        moveLeft = false;
        break;
      case "KeyS":
        moveBackward = false;
        break;
      case "KeyD":
        moveRight = false;
        break;
      case "Space":
        moveUp = false;
        break;
      case "ShiftLeft":
        moveDown = false;
        break;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onWindowResize);

  generate();
  animate();

  // Cleanup listeners on destroy
  onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onWindowResize);
  });
};

const onWindowResize = () => {
  if (!container.value) return;
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
};

const generate = () => {
  instancedMeshes.forEach((m) => scene.remove(m));
  instancedMeshes = [];

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const instancedData = { [1]: [], [2]: [], [3]: [], [4]: [] };

  props.genFunction(props.params, (x, y, z, type) => {
    if (type !== BLOCKS.NULL) {
      instancedData[type].push(new THREE.Matrix4().makeTranslation(x, y, z));
    }
  });

  Object.keys(instancedData).forEach((type) => {
    const matrices = instancedData[type];
    if (matrices.length === 0) return;
    const material = new THREE.MeshPhongMaterial({ color: COLORS[type] });
    const imesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    for (let i = 0; i < matrices.length; i++) imesh.setMatrixAt(i, matrices[i]);
    scene.add(imesh);
    instancedMeshes.push(imesh);
  });
};

watch(
  () => props.params,
  () => generate(),
  { deep: true },
);

const animate = () => {
  requestAnimationFrame(animate);

  if (controls.isLocked) {
    const delta = clock.getDelta();
    const speed = 15.0;
    const friction = 10.0;

    // Friction
    velocity.x -= velocity.x * friction * delta;
    velocity.z -= velocity.z * friction * delta;
    velocity.y -= velocity.y * friction * delta;

    // Direction
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.y = Number(moveUp) - Number(moveDown);
    direction.normalize();

    // Acceleration
    if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;
    if (moveUp || moveDown) velocity.y += direction.y * speed * delta;

    // Apply Movement
    controls.moveRight(-velocity.x * 10 * delta);
    controls.moveForward(-velocity.z * 10 * delta);
    camera.position.y += velocity.y * 10 * delta;
  } else {
    // Stop clock accumulating delta when not active
    clock.getDelta();
  }

  renderer.render(scene, camera);
};

onMounted(init);
</script>

<style scoped>
.world-container {
  position: relative;
  border: 1px solid #444;
  height: 100%;
  overflow: hidden;
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
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 10px;
  pointer-events: none;
  border-radius: 4px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 10px;
  height: 10px;
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>
