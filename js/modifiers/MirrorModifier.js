import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';

export class MirrorModifier {
  static type = 'mirror';

  constructor() {
  }

  apply(meshData, properties, object) {
    const axis = properties.axis || { x: true, y: false, z: false };

    // Axes to process
    const activeAxes = [];
    if (axis.x) activeAxes.push('x');
    if (axis.y) activeAxes.push('z');
    if (axis.z) activeAxes.push('y');

    if (activeAxes.length === 0) return meshData;

    for (const codeAxis of activeAxes) {
        this.reflect(meshData, codeAxis);
    }

    return meshData;
  }

  reflect(meshData, axis) {
      // Capture current state to duplicate (snapshot of IDs)
      const originalVertices = Array.from(meshData.vertices.values());
      const originalFaces = Array.from(meshData.faces.values());
      
      const vertexMap = new Map(); // Old ID -> New Object

      // Duplicate Vertices with Reflection
      for (const v of originalVertices) {
          const newPos = {
              x: v.position.x,
              y: v.position.y,
              z: v.position.z
          };
          
          // Invert coordinate
          newPos[axis] = -newPos[axis];
          
          const newV = meshData.addVertex(newPos);
          vertexMap.set(v.id, newV);
      }

      // Duplicate Faces with Winding Reversal
      for (const f of originalFaces) {
          const newFaceVertices = f.vertexIds.map(vid => vertexMap.get(vid));
          
          if (newFaceVertices.every(v => v !== undefined)) {
              // Reverse for correct normal
              newFaceVertices.reverse(); 
              
              // Handle UVs
              // Since we reversed vertices, we must reverse UVs to match vertex-uv correspondence
              let newUVs = f.uvs ? [...f.uvs] : undefined;
              if (newUVs) newUVs.reverse();
              
              meshData.addFace(newFaceVertices, newUVs, f.materialIndex);
          }
      }
  }
}