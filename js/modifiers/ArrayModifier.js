import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';

export class ArrayModifier {
  static type = 'array';

  constructor() {
  }

  apply(meshData, properties, object) {
    const count = Math.max(1, Math.floor(properties.count || 1));
    if (count === 1) return meshData; // No copies needed

    // Handle legacy structure (where relativeOffset might be the vector itself) or new structure (boolean + Vec)
    let relativeOffsetVec = { x: 0, y: 0, z: 0 };
    if (properties.relativeOffset === true) {
        const vec = properties.relativeOffsetVec || {};
        relativeOffsetVec = {
            x: Number(vec.x) || 0,
            y: Number(vec.y) || 0,
            z: Number(vec.z) || 0
        };
    } else if (typeof properties.relativeOffset === 'object' && properties.relativeOffset !== null) {
        relativeOffsetVec = {
            x: Number(properties.relativeOffset.x) || 0,
            y: Number(properties.relativeOffset.y) || 0,
            z: Number(properties.relativeOffset.z) || 0
        };
    }

    let constantOffsetVec = { x: 0, y: 0, z: 0 };
    if (properties.constantOffset === true) {
        const vec = properties.constantOffsetVec || {};
        constantOffsetVec = {
            x: Number(vec.x) || 0,
            y: Number(vec.y) || 0,
            z: Number(vec.z) || 0
        };
    } else if (typeof properties.constantOffset === 'object' && properties.constantOffset !== null) {
        constantOffsetVec = {
            x: Number(properties.constantOffset.x) || 0,
            y: Number(properties.constantOffset.y) || 0,
            z: Number(properties.constantOffset.z) || 0
        };
    }

    // Calculate Bounding Box for Relative Offset
    const bbox = new THREE.Box3();
    for (const v of meshData.vertices.values()) {
      bbox.expandByPoint(new THREE.Vector3(v.position.x, v.position.y, v.position.z));
    }
    const size = new THREE.Vector3();
    bbox.getSize(size);

    console.log('ArrayModifier Debug:', {
        relativeOffset: properties.relativeOffset,
        relativeOffsetVec,
        constantOffset: properties.constantOffset,
        constantOffsetVec,
        bboxSize: size
    });

    const offsetVector = new THREE.Vector3(
      constantOffsetVec.x + (relativeOffsetVec.x * size.x),
      constantOffsetVec.y + (relativeOffsetVec.y * size.y),
      constantOffsetVec.z + (relativeOffsetVec.z * size.z)
    );
    
    if (isNaN(offsetVector.x) || isNaN(offsetVector.y) || isNaN(offsetVector.z)) {
        console.error('ArrayModifier: OffsetVector contains NaN', offsetVector);
    } else {
        console.log('ArrayModifier: OffsetVector', offsetVector);
    }

    // We modify meshData in place (it's already a clone in the stack)
    // We need to capture original vertices/faces to replicate
    const originalVertices = Array.from(meshData.vertices.values());
    const originalFaces = Array.from(meshData.faces.values());

    for (let i = 1; i < count; i++) {
      const currentOffset = offsetVector.clone().multiplyScalar(i);
      
      const vertexMap = new Map(); // Old ID -> New Object

      // Duplicate Vertices
      for (const v of originalVertices) {
        const newPos = {
          x: v.position.x + currentOffset.x,
          y: v.position.y + currentOffset.y,
          z: v.position.z + currentOffset.z
        };
        const newV = meshData.addVertex(newPos);
        vertexMap.set(v.id, newV);
      }

      // Duplicate Faces
      for (const f of originalFaces) {
        const newFaceVertices = f.vertexIds.map(vid => vertexMap.get(vid));
        // Check if all vertices exist (should be yes)
        if (newFaceVertices.every(v => v !== undefined)) {
          meshData.addFace(newFaceVertices, f.uvs, f.materialIndex);
        }
      }
    }

    return meshData;
  }
}
