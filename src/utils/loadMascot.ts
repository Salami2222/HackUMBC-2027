import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createMascotRig, disposeMascot } from './mascotRig';

export async function loadMascot() {
  const gltf = await new GLTFLoader().loadAsync('/models/kinetiq-mascot.glb');
  try {
    return createMascotRig(gltf.scene);
  } catch (error) {
    disposeMascot(gltf.scene);
    throw error;
  }
}
