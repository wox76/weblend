import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';

export default class OBJLoader {
  static fromOBJText(objText) {
    const lines = objText.split('\n');
    const objects = [];
    let current = { name: '', positions: [], uvs: [], faces: [], vertexOffset: 0, uvOffset: 0 };

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length === 0) continue;

      switch (parts[0]) {
        case 'o':
        case 'g':
          if (current.faces.length > 0) {
            objects.push(current);
            current = { 
              name: parts.slice(1).join(' '), 
              positions: [], 
              uvs: [],
              faces: [], 
              vertexOffset: current.vertexOffset + current.positions.length,
              uvOffset: current.uvOffset + current.uvs.length
            };
          } else {
             // Just updating name if empty? Or new object? 
             // If multiple o/g follow each other, we might skip.
             current.name = parts.slice(1).join(' ');
          }
          break;

        case 'v':
          const x = parseFloat(parts[1]);
          const y = parseFloat(parts[2]);
          const z = parseFloat(parts[3]);

          if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
            current.positions.push(null);
          } else {
            current.positions.push([x, y, z]);
          }
          break;

        case 'vt':
          const u = parseFloat(parts[1]);
          const v = parseFloat(parts[2]);
          current.uvs.push([u, v]);
          break;

        case 'f':
          const faceItems = parts.slice(1).map(token => {
            const [vIdxStr, vtIdxStr] = token.split('/');
            const vIdx = parseInt(vIdxStr, 10) - 1 - current.vertexOffset;
            let uv = null;
            if (vtIdxStr) {
                const vtIdx = parseInt(vtIdxStr, 10) - 1 - current.uvOffset;
                if (current.uvs[vtIdx]) uv = current.uvs[vtIdx];
            }
            return { v: vIdx, uv };
          });
          current.faces.push(faceItems);
          break;
      }
    }
    
    if (current.faces.length > 0) objects.push(current);

    return objects.map(obj => {
      const { positions, faces, name } = obj;
      const meshData = new MeshData();
      const verts = positions.map(p => p ? meshData.addVertex(new THREE.Vector3(...p)) : null);
      
      for (const face of faces) {
        const vertexArray = face.map(item => verts[item.v]).filter(v => v !== null && v !== undefined);
        const uvArray = face.map(item => item.uv ? new THREE.Vector2(item.uv[0], item.uv[1]) : new THREE.Vector2(0,0));
        
        // Filter uvArray to match vertexArray length if some vertices were null?
        // But usually if v is valid, we keep it.
        // Assuming geometry is valid.
        
        if (vertexArray.length >= 3) meshData.addFace(vertexArray, uvArray);
      }
      return { name, meshData };
    });
  }
}