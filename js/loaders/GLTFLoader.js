import * as THREE from 'three';
import { GLTFLoader } from 'jsm/loaders/GLTFLoader.js';
import { MeshData } from '../core/MeshData.js';

export class GLTFImporter {
  async load(file) {
    const arrayBuffer = await file.arrayBuffer();
    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
      loader.parse(arrayBuffer, '', (gltf) => {
        const meshes = [];
        
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            const meshData = this.geometryToMeshData(child.geometry);
            if (meshData) {
              meshes.push({
                name: child.name || 'GLTF_Mesh',
                meshData: meshData,
                originalMaterial: child.material
              });
            }
          }
        });

        resolve(meshes);
      }, (error) => {
        reject(error);
      });
    });
  }

  geometryToMeshData(geometry) {
    const meshData = new MeshData();
    const posAttr = geometry.attributes.position;
    const indexAttr = geometry.index;
    const uvAttr = geometry.attributes.uv;

    if (!posAttr) return null;

    // Add vertices
    const vertices = [];
    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      vertices.push(v);
    }
    
    // We will use a map to deduplicate positions to rebuild topology
    const posMap = new Map(); // key: "x,y,z", value: MeshData Vertex
    const createdVertices = new Array(vertices.length);

    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const key = `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
        
        let meshVertex = posMap.get(key);
        if (!meshVertex) {
            meshVertex = meshData.addVertex(v);
            posMap.set(key, meshVertex);
        }
        createdVertices[i] = meshVertex;
    }

    // Add faces
    if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i += 3) {
            const a = indexAttr.getX(i);
            const b = indexAttr.getX(i+1);
            const c = indexAttr.getX(i+2);
            
            const v1 = createdVertices[a];
            const v2 = createdVertices[b];
            const v3 = createdVertices[c];
            
            let faceUVs = [];
            if (uvAttr) {
                faceUVs = [
                    new THREE.Vector2().fromBufferAttribute(uvAttr, a),
                    new THREE.Vector2().fromBufferAttribute(uvAttr, b),
                    new THREE.Vector2().fromBufferAttribute(uvAttr, c)
                ];
            }
            
            if (v1 && v2 && v3 && v1 !== v2 && v1 !== v3 && v2 !== v3) {
                 meshData.addFace([v1, v2, v3], faceUVs);
            }
        }
    } else {
        for (let i = 0; i < posAttr.count; i += 3) {
            const v1 = createdVertices[i];
            const v2 = createdVertices[i+1];
            const v3 = createdVertices[i+2];

            let faceUVs = [];
            if (uvAttr) {
                faceUVs = [
                    new THREE.Vector2().fromBufferAttribute(uvAttr, i),
                    new THREE.Vector2().fromBufferAttribute(uvAttr, i+1),
                    new THREE.Vector2().fromBufferAttribute(uvAttr, i+2)
                ];
            }

            if (v1 && v2 && v3 && v1 !== v2 && v1 !== v3 && v2 !== v3) {
                meshData.addFace([v1, v2, v3], faceUVs);
            }
        }
    }

    return meshData;
  }
}
