import { MeshData } from '../core/MeshData.js';
import * as THREE from 'three';

export class SubdivisionSurfaceModifier {
  static type = 'subdivision_surface';

  constructor() {
  }

  apply(meshData, properties) {
    const levels = properties.levels || 1;
    const type = properties.subdivisionType || 'catmull-clark'; // 'catmull-clark' or 'simple'

    // Weld vertices first to ensure topology is connected
    let currentMesh = this.mergeVertices(meshData);
    
    // Iterate for 'levels' times
    // Note: levels > 2 or 3 can be very slow and heavy in JS.
    const iterations = Math.min(levels, 3); 

    for (let i = 0; i < iterations; i++) {
        currentMesh = this.subdivide(currentMesh, type === 'simple');
    }

    return currentMesh;
  }

  mergeVertices(mesh) {
     const newMesh = new MeshData();
     const uniqueVertices = []; // { pos: {x,y,z}, newV: Vertex }
     const oldIdToNewV = new Map();
     const epsilon = 1e-5;

     for (const v of mesh.vertices.values()) {
         let match = null;
         // Simple linear search is fine for typical low-poly control meshes. 
         // For high-poly, spatial hashing would be needed.
         for (const unique of uniqueVertices) {
             if (Math.abs(unique.pos.x - v.position.x) < epsilon &&
                 Math.abs(unique.pos.y - v.position.y) < epsilon &&
                 Math.abs(unique.pos.z - v.position.z) < epsilon) {
                 match = unique.newV;
                 break;
             }
         }

         if (match) {
             oldIdToNewV.set(v.id, match);
         } else {
             const newV = newMesh.addVertex(v.position);
             uniqueVertices.push({ pos: v.position, newV: newV });
             oldIdToNewV.set(v.id, newV);
         }
     }

     for (const f of mesh.faces.values()) {
         const newVerts = f.vertexIds.map(vid => oldIdToNewV.get(vid));
         
         // Avoid degenerate faces (less than 3 unique vertices)
         const uniqueIds = new Set(newVerts.map(v => v.id));
         if (uniqueIds.size >= 3) {
             newMesh.addFace(newVerts, f.uvs, f.materialIndex);
         }
     }
     
     return newMesh;
  }

  subdivide(mesh, isSimple) {
      const newMesh = new MeshData();
      
      // 1. Calculate Face Points
      // Map<FaceID, NewVertex>
      const facePoints = new Map();
      
      for (const face of mesh.faces.values()) {
          let avgPos = { x: 0, y: 0, z: 0 };
          const vIds = face.vertexIds;
          
          for (const vid of vIds) {
              const v = mesh.vertices.get(vid);
              avgPos.x += v.position.x;
              avgPos.y += v.position.y;
              avgPos.z += v.position.z;
          }
          
          avgPos.x /= vIds.length;
          avgPos.y /= vIds.length;
          avgPos.z /= vIds.length;
          
          const newV = newMesh.addVertex(avgPos);
          facePoints.set(face.id, newV);
      }

      // 2. Calculate Edge Points
      // Map<EdgeID, NewVertex>
      const edgePoints = new Map();
      
      for (const edge of mesh.edges.values()) {
          const v1 = mesh.vertices.get(edge.v1Id);
          const v2 = mesh.vertices.get(edge.v2Id);
          
          let pos = { x: 0, y: 0, z: 0 };
          
          if (isSimple) {
              // Simple: just midpoint
              pos.x = (v1.position.x + v2.position.x) / 2;
              pos.y = (v1.position.y + v2.position.y) / 2;
              pos.z = (v1.position.z + v2.position.z) / 2;
          } else {
              // Catmull-Clark Edge Point: (v1 + v2 + f1_pt + f2_pt) / 4
              // Boundary edges only have 1 face usually? Or we handle boundaries differently.
              // Assuming manifold for now or basic boundary handling.
              
              let fCount = 0;
              pos.x = v1.position.x + v2.position.x;
              pos.y = v1.position.y + v2.position.y;
              pos.z = v1.position.z + v2.position.z;
              
              const faces = Array.from(edge.faceIds).map(fid => mesh.faces.get(fid)).filter(f => f);
              
              if (faces.length > 0) {
                   for (const f of faces) {
                       const fp = facePoints.get(f.id);
                       pos.x += fp.position.x;
                       pos.y += fp.position.y;
                       pos.z += fp.position.z;
                       fCount++;
                   }
                   const div = 2 + fCount;
                   pos.x /= div;
                   pos.y /= div;
                   pos.z /= div;
              } else {
                  // Floating edge? Just midpoint
                  pos.x /= 2;
                  pos.y /= 2;
                  pos.z /= 2;
              }
          }
          
          const newV = newMesh.addVertex(pos);
          edgePoints.set(edge.id, newV);
      }

      // 3. New Vertex Points (original vertices moved)
      // Map<OldVertexID, NewVertex>
      const newVertexPoints = new Map();

      for (const v of mesh.vertices.values()) {
          let newPos = { x: 0, y: 0, z: 0 };
          
          if (isSimple) {
               newPos = { ...v.position };
          } else {
              // Catmull-Clark Vertex Point
              // F = Average of face points for faces touching V
              // R = Average of edge midpoints for edges touching V
              // P = Old vertex position
              // n = Valence
              // New = (F + 2R + (n-3)P) / n
              
              const faceIds = Array.from(v.faceIds);
              const edgeIds = Array.from(v.edgeIds);
              const n = edgeIds.length; // Valence approx
              
              if (n < 3) { 
                  // Corner case or boundary
                  // Simplified logic for boundaries/low valence to avoid explosions
                  newPos = { ...v.position }; 
              } else {
                  // F
                  let F = { x: 0, y: 0, z: 0 };
                  let fCount = 0;
                  for (const fid of faceIds) {
                      const fp = facePoints.get(fid);
                      if (fp) {
                          F.x += fp.position.x;
                          F.y += fp.position.y;
                          F.z += fp.position.z;
                          fCount++;
                      }
                  }
                  if (fCount > 0) { F.x /= fCount; F.y /= fCount; F.z /= fCount; }

                  // R
                  let R = { x: 0, y: 0, z: 0 };
                  let eCount = 0;
                  for (const eid of edgeIds) {
                      const edge = mesh.edges.get(eid);
                      const v1 = mesh.vertices.get(edge.v1Id);
                      const v2 = mesh.vertices.get(edge.v2Id);
                      R.x += (v1.position.x + v2.position.x) / 2;
                      R.y += (v1.position.y + v2.position.y) / 2;
                      R.z += (v1.position.z + v2.position.z) / 2;
                      eCount++;
                  }
                  if (eCount > 0) { R.x /= eCount; R.y /= eCount; R.z /= eCount; }

                  const P = v.position;

                  newPos.x = (F.x + 2 * R.x + (n - 3) * P.x) / n;
                  newPos.y = (F.y + 2 * R.y + (n - 3) * P.y) / n;
                  newPos.z = (F.z + 2 * R.z + (n - 3) * P.z) / n;
              }
          }

          const newV = newMesh.addVertex(newPos);
          newVertexPoints.set(v.id, newV);
      }

      // 4. Reconstruct Faces (Topology)
      // Each old face becomes N quads (where N is number of vertices in face)
      for (const face of mesh.faces.values()) {
          const fp = facePoints.get(face.id);
          const vIds = face.vertexIds;
          const len = vIds.length;

          for (let i = 0; i < len; i++) {
              const vId = vIds[i];
              const nextVId = vIds[(i + 1) % len];
              const prevVId = vIds[(i - 1 + len) % len]; // Not needed if we iterate edges

              // We need edge points for (v, nextV) and (prevV, v)
              // Let's find edge between v and nextV
              const edge = mesh.getEdge(vId, nextVId);
              const prevEdge = mesh.getEdge(prevVId, vId);

              const ep = edgePoints.get(edge.id);
              const prevEp = edgePoints.get(prevEdge.id);
              const vp = newVertexPoints.get(vId);

              // Quad: VP -> EP -> FP -> PrevEP
              // But winding order matters.
              // Original Face: v -> nextV ...
              // So new quad should respect that.
              // v (new) -> edge (new) -> face (new) -> prevEdge (new)
              
              if (vp && ep && fp && prevEp) {
                  newMesh.addFace(
                      [vp, ep, fp, prevEp], 
                      [], // UVs todo: interpolate UVs
                      face.materialIndex
                  );
              }
          }
      }

      return newMesh;
  }
}