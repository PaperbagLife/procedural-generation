<template>
  <div class="container">
    <div id="three-container"></div>
    <div v-if="!isLocked" class="overlay">
      <div class="instructions">
        <h1>Voxel World</h1>
        <p>Click to Start</p>
        <p>(W,A,S,D = Move, Space = Up, Shift = Down, Mouse = Look)</p>
      </div>
    </div>
    <div class="crosshair"></div>
  </div>
</template>

<script setup>
import { onMounted, ref, onUnmounted } from 'vue';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { createNoise2D, createNoise3D } from 'simplex-noise';


// --- Configuration ---
const WORLD_SIZE = 100;
const WORLD_HEIGHT = 100;
const GROUND_LEVEL = 70; // Top 30 layers are "above ground"
const isLocked = ref(false);
const clock = new THREE.Clock();

// Block Types
const BLOCKS = {
  NULL: 0,
  GRASS: 1,
  SNOW: 2,
  ROCK: 3,
  WATER: 4
};

// Colors
const COLORS = {
  [BLOCKS.GRASS]: 0x559944,
  [BLOCKS.SNOW]: 0xffffff,
  [BLOCKS.ROCK]: 0x888888,
  [BLOCKS.WATER]: 0x3366ff
};

let scene, camera, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, moveUp = false, moveDown = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

const noise2D = createNoise2D();
const noise3D = createNoise3D();

onMounted(() => {
  init();
  generateWorld();
  animate();
});

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue
  scene.fog = new THREE.Fog(0x87ceeb, 20, WORLD_SIZE * 1.5);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  // Start camera above ground
  camera.position.set(WORLD_SIZE / 2, GROUND_LEVEL + 10, WORLD_SIZE / 2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.getElementById('three-container').appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sunLight.position.set(50, 100, 50);
  scene.add(sunLight);

  // Controls
  controls = new PointerLockControls(camera, renderer.domElement);

  document.addEventListener('click', () => controls.lock());
  controls.addEventListener('lock', () => (isLocked.value = true));
  controls.addEventListener('unlock', () => (isLocked.value = false));

  const onKeyDown = (e) => {
    switch (e.code) {
      case 'KeyW': moveForward = true; break;
      case 'KeyA': moveLeft = true; break;
      case 'KeyS': moveBackward = true; break;
      case 'KeyD': moveRight = true; break;
      case 'Space': moveUp = true; break;
      case 'ShiftLeft': moveDown = true; break;
    }
  };
  const onKeyUp = (e) => {
    switch (e.code) {
      case 'KeyW': moveForward = false; break;
      case 'KeyA': moveLeft = false; break;
      case 'KeyS': moveBackward = false; break;
      case 'KeyD': moveRight = false; break;
      case 'Space': moveUp = false; break;
      case 'ShiftLeft': moveDown = false; break;
    }
  };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  window.addEventListener('resize', onWindowResize);
}

function generateWorld() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);

  // Storage for Instanced Meshes
  const instancedData = {
    [BLOCKS.GRASS]: [],
    [BLOCKS.SNOW]: [],
    [BLOCKS.ROCK]: [],
    [BLOCKS.WATER]: []
  };

  // Generate Voxel Data
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {

      // 1. Determine Surface Height using 2D Noise
      // Frequency and amplitude for mountains
      const noiseX = x / 40;
      const noiseZ = z / 40;
      const heightOffset = (noise2D(noiseX, noiseZ) * 15);
      const surfaceY = Math.floor(GROUND_LEVEL + heightOffset);

      for (let y = 0; y < WORLD_HEIGHT; y++) {
        let blockType = BLOCKS.NULL;

        if (y <= surfaceY) {
          if (y < GROUND_LEVEL - 5) {
            // 2. Below Ground Logic (Caves using 3D Noise)
            const caveNoise = noise3D(x / 15, y / 15, z / 15);
            // If caveNoise is high, it's a solid Rock, otherwise it's Null (cave)
            if (caveNoise > -0.2) {
              blockType = BLOCKS.ROCK;
            }
          } else {
            // 3. Above Ground / Surface Logic
            if (y === surfaceY) {
              if (y > 85) blockType = BLOCKS.SNOW;
              else if (y < 65) blockType = BLOCKS.WATER;
              else blockType = BLOCKS.GRASS;
            } else if (y < surfaceY) {
              blockType = BLOCKS.ROCK;
            }
          }
        }

        if (blockType !== BLOCKS.NULL) {
          instancedData[blockType].push(new THREE.Matrix4().makeTranslation(x, y, z));
        }
      }
    }
  }

  // Create Instanced Meshes for performance
  Object.keys(instancedData).forEach(type => {
    const matrices = instancedData[type];
    if (matrices.length === 0) return;

    const material = new THREE.MeshPhongMaterial({ color: COLORS[type] });
    const imesh = new THREE.InstancedMesh(geometry, material, matrices.length);

    for (let i = 0; i < matrices.length; i++) {
      imesh.setMatrixAt(i, matrices[i]);
    }
    scene.add(imesh);
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (controls.isLocked) {
    // getDelta() tells us how much time passed since the last frame
    const delta = clock.getDelta();

    // ADJUST THESE TO TWEAK FEEL:
    const speed = 15.0;     // Lower = slower movement
    const friction = 20.0;  // Higher = stops faster when keys released

    // 1. Apply Friction (Damping)
    // We multiply by delta so the slowdown is smooth
    velocity.x -= velocity.x * friction * delta;
    velocity.z -= velocity.z * friction * delta;
    velocity.y -= velocity.y * friction * delta;

    // 2. Determine Direction
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.y = Number(moveUp) - Number(moveDown);
    direction.normalize();

    // 3. Apply Acceleration
    // We use (speed * delta) to ensure consistent movement
    if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;
    if (moveUp || moveDown) velocity.y += direction.y * speed * delta;

    // 4. Apply Translation to the Camera
    // We multiply by 10 here just to scale the small velocity numbers 
    // to a visible movement range
    controls.moveRight(-velocity.x * 10 * delta);
    controls.moveForward(-velocity.z * 10 * delta);
    camera.position.y += (velocity.y * 10 * delta);
  }

  renderer.render(scene, camera);
}
</script>

<style>
body {
  margin: 0;
  overflow: hidden;
  font-family: sans-serif;
}

.container {
  position: relative;
  width: 100vw;
  height: 100vh;
}

#three-container {
  width: 100%;
  height: 100%;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
  text-align: center;
  cursor: pointer;
}

.instructions {
  padding: 20px;
  background: rgba(0, 0, 0, 0.8);
  border: 2px solid white;
  border-radius: 10px;
}

.crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>