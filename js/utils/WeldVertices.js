import * as THREE from 'three';

/**
 * Weld all vertices in a geometry by position.
 * 
 * @param {THREE.BufferGeometry} geometry
 * @param {number} tolerance
 */
export function weldVertices(geometry, tolerance = 1e-6) {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return geometry;

  const precision = 1 / tolerance;
  const vertexMap = new Map();
  const indexArray = [];
  let nextIndex = 0;
  
  // Create a map of unique positions
  // We need to store the mapping from old index -> new index
  const oldToNewIndex = new Array(posAttr.count);
  const uniqueIndices = []; // Stores the index of the first occurrence of each unique vertex

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    const key = `${Math.round(x * precision)}_${Math.round(y * precision)}_${Math.round(z * precision)}`;

    if (vertexMap.has(key)) {
      oldToNewIndex[i] = vertexMap.get(key);
    } else {
      vertexMap.set(key, nextIndex);
      oldToNewIndex[i] = nextIndex;
      uniqueIndices.push(i);
      nextIndex++;
    }
  }

  // If no vertices were merged, return the original geometry (cloned) or null?
  // Let's return a new geometry anyway for consistency
  if (uniqueIndices.length === posAttr.count) {
     return geometry.clone();
  }

  const newGeometry = new THREE.BufferGeometry();

  // Copy all attributes based on uniqueIndices
  for (const name in geometry.attributes) {
    const attr = geometry.attributes[name];
    const itemSize = attr.itemSize;
    const array = attr.array;
    const newArray = new array.constructor(uniqueIndices.length * itemSize);

    for (let i = 0; i < uniqueIndices.length; i++) {
      const oldIndex = uniqueIndices[i];
      for (let k = 0; k < itemSize; k++) {
        newArray[i * itemSize + k] = array[oldIndex * itemSize + k];
      }
    }

    newGeometry.setAttribute(name, new THREE.BufferAttribute(newArray, itemSize));
  }

  // Handle Index
  // If original geometry has index, we need to remap it
  // If not, we pretend it was 0,1,2,3... and map those to new indices
  
  const originalIndex = geometry.getIndex();
  let newIndices = [];

  if (originalIndex) {
    for (let i = 0; i < originalIndex.count; i++) {
      const oldIdx = originalIndex.getX(i);
      newIndices.push(oldToNewIndex[oldIdx]);
    }
  } else {
    // If no index, assume implicit index i -> i
    for (let i = 0; i < posAttr.count; i++) {
      newIndices.push(oldToNewIndex[i]);
    }
  }

  newGeometry.setIndex(newIndices);

  // cleanup
  // newGeometry.computeVertexNormals(); // Optional, maybe user wants to keep original normals if they were valid
  newGeometry.computeBoundingSphere();
  newGeometry.computeBoundingBox();

  return newGeometry;
}