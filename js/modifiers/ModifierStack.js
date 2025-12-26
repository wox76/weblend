import { MeshData } from '../core/MeshData.js';
import { ArrayModifier } from './ArrayModifier.js';
import { MirrorModifier } from './MirrorModifier.js';
import { SubdivisionSurfaceModifier } from './SubdivisionSurfaceModifier.js';

export class ModifierStack {
  constructor() {
    this.modifiers = new Map();
    this.register(ArrayModifier);
    this.register(MirrorModifier);
    this.register(SubdivisionSurfaceModifier);
  }

  register(modifierClass) {
    this.modifiers.set(modifierClass.type, new modifierClass());
  }

  applyModifiers(object, originalMeshData) {
    if (!object.userData.modifiers || object.userData.modifiers.length === 0) {
      return originalMeshData;
    }

    const enabledModifiers = object.userData.modifiers.filter(m => m.enabled);
    if (enabledModifiers.length === 0) {
      return originalMeshData;
    }

    // Clone the MeshData to apply modifiers non-destructively
    // We use serialization/deserialization for a clean deep copy
    // Optimization: implement clone() in MeshData
    let currentMeshData = MeshData.deserializeMeshData(MeshData.serializeMeshData(originalMeshData));

    for (const modData of enabledModifiers) {
      const modifier = this.modifiers.get(modData.type);
      if (modifier) {
        currentMeshData = modifier.apply(currentMeshData, modData.properties, object);
      }
    }

    return currentMeshData;
  }
}

export const modifierStack = new ModifierStack();
