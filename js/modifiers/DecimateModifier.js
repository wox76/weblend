import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

export class DecimateModifier {
  static type = 'decimate';

  constructor() {
  }

  apply(meshData, properties, object) {
    // Ratio: 1.0 = Keep all. 0.0 = Collapse all.
    const ratio = Math.min(1, Math.max(0, properties.ratio !== undefined ? properties.ratio : 1.0));
    
    if (ratio >= 0.999) return meshData; 

    // Convert MeshData to BufferGeometry
    // We use shared vertex geometry to ensure connectivity is known for simplification
    const geometry = meshData.toSharedVertexGeometry(); 
    
    const originalCount = geometry.attributes.position.count;
    const targetCount = Math.floor(originalCount * ratio);

    if (targetCount >= originalCount) {
        geometry.dispose();
        return meshData;
    }

    const modifier = new SimplifyModifier();
    let simplifiedGeometry;
    try {
        simplifiedGeometry = modifier.modify(geometry, targetCount);
    } catch (e) {
        console.warn("DecimateModifier: Simplification failed or returned error.", e);
        geometry.dispose();
        return meshData;
    }

    // Convert back to MeshData
    const newMeshData = MeshData.fromBufferGeometry(simplifiedGeometry);
    
    geometry.dispose();
    simplifiedGeometry.dispose();

    return newMeshData;
  }
}