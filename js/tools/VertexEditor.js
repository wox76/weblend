import * as THREE from 'three';
import { ShadingUtils } from "../utils/ShadingUtils.js";
import { MeshData } from "../core/MeshData.js";
import { modifierStack } from "../modifiers/ModifierStack.js";

export class VertexEditor {
  constructor(editor, object3D) {
    this.editor = editor;
    this.object = object3D;
    this.sceneManager = editor.sceneManager;
    this.editHelpers = editor.editHelpers;
  }

  get geometry() {
    return this.object.geometry;
  }

  set geometry(value) {
    this.object.geometry = value;
  }

  get positionAttr() {
    return this.object.geometry.attributes.position;
  }

  setVerticesWorldPositions(logicalVertexIds, worldPositions) {
    if (!this.object || !this.positionAttr) return;

    // Direct vertex manipulation only works on the BASE mesh data.
    // If modifiers are active, we update the base mesh data, 
    // BUT the visual geometry might be different (modified).
    // This function updates the 'position' attribute of the geometry directly for performance during drag.
    // However, if the geometry is the result of modifiers, the indices might not match 
    // the base mesh data indices 1:1 if topological changes occurred.
    // Array modifier duplicates vertices, so original vertices [0..N] are still at [0..N] in the buffer?
    // Not guaranteed if the modifier creates a new MeshData from scratch or reorders.
    // MeshData.to...Geometry uses bufferIndexToVertexId map.
    
    // For now, assume standard editing works on the base mesh.
    // If modifiers are enabled, visual feedback during editing might be tricky if we don't re-run modifiers.
    // Ideally, we drag the base vertices, and re-run modifiers on every frame? Expensive.
    // Or we disable modifiers during Edit Mode?
    // Blender shows modifiers in Edit Mode but you edit the "cage".
    
    // Simplification: If we are dragging, we update the meshData, and RE-GENERATE geometry if modifiers exist.
    // Or if no modifiers, use fast path.
    
    const meshData = this.object.userData.meshData;
    const inverseW = new THREE.Matrix4().copy(this.object.matrixWorld).invert();
    
    for (let i = 0; i < logicalVertexIds.length; i++) {
        const logicalId = logicalVertexIds[i];
        const worldPos = worldPositions[i];
        const localPos = worldPos.clone().applyMatrix4(inverseW);
        
        const v = meshData.getVertex(logicalId);
        if (v) {
            v.position = { x: localPos.x, y: localPos.y, z: localPos.z };
        }
    }
    
    // If modifiers are present, we must regenerate to see the effect on copies
    if (this.object.userData.modifiers && this.object.userData.modifiers.some(m => m.enabled)) {
        this.updateGeometryAndHelpers();
    } else {
        // Fast path for no modifiers
        const vertexIndexMap = meshData.vertexIndexMap;
        for (let i = 0; i < logicalVertexIds.length; i++) {
            const logicalId = logicalVertexIds[i];
            const v = meshData.getVertex(logicalId);
            if (!v) continue;
            
            const indices = vertexIndexMap.get(logicalId);
            if (!indices) continue;
            
            for (let bufferIndex of indices) {
                this.positionAttr.setXYZ(bufferIndex, v.position.x, v.position.y, v.position.z);
            }
        }
        this.positionAttr.needsUpdate = true;
        this.geometry.computeVertexNormals();
        this.geometry.computeBoundingBox();
        this.geometry.computeBoundingSphere();
        
        // Update helpers (subset) - tricky if full regen
        // For simplicity, we trigger full refresh if needed or just positions
    }
    
    // Helpers update is handled by updateGeometryAndHelpers usually
    // But setVerticesWorldPositions is optimized.
    // Let's rely on standard flow.
  }

  getVertexPosition(logicalVertexId) {
    if (!this.object || !this.positionAttr) return null;

    const meshData = this.object.userData.meshData;
    
    // We get position from MeshData directly, not Geometry buffer, 
    // because Geometry buffer might be modified/instanced.
    const v = meshData.getVertex(logicalVertexId);
    if (!v) return null;
    
    const localPos = new THREE.Vector3(v.position.x, v.position.y, v.position.z);
    return localPos.applyMatrix4(this.object.matrixWorld);
  }

  getVertexPositions(vertexIds) {
    const positions = [];

    if (!this.object || !this.positionAttr || !vertexIds || vertexIds.length === 0) {
      return positions;
    }

    for (let vId of vertexIds) {
      const pos = this.getVertexPosition(vId);
      if (pos) positions.push(pos.clone());
    }

    return positions;
  }

  updateGeometryAndHelpers(useEarcut = true) {
    if (!this.object || !this.object.userData.meshData) return;

    const baseMeshData = this.object.userData.meshData;
    
    // Apply Modifiers
    const finalMeshData = modifierStack.applyModifiers(this.object, baseMeshData);

    const shading = this.object.userData.shading;
    this.geometry = ShadingUtils.createGeometryWithShading(finalMeshData, shading, useEarcut);
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();

    this.editHelpers.refreshHelpers();
  }

  applyMeshData(newMeshData) {
    if (!this.object) return false;

    // structuredClone strips methods from MeshData class instance. 
    // Use serialization to ensure we get a clean POJO that rehydrateMeshData can properly restore.
    const serialized = MeshData.serializeMeshData(newMeshData);
    // We can assign the serialized object directly; rehydrate will handle conversion to Maps/Instances.
    this.object.userData.meshData = serialized;

    MeshData.rehydrateMeshData(this.object);
  }

  duplicateSelectionVertices(vertexIds) {
    const meshData = this.object.userData.meshData;

    const selectedVertices = new Set(vertexIds);
    const duplicatedVertices = new Map();
    const duplicatedEdges = new Map();
    const duplicatedFaces = new Map();

    // Duplicate vertices
    for (let vid of selectedVertices) {
      const oldVertex = meshData.getVertex(vid);
      if (!oldVertex) continue;

      const newPos = {
        x: oldVertex.position.x,
        y: oldVertex.position.y,
        z: oldVertex.position.z
      };

      const newVertex = meshData.addVertex(newPos);
      duplicatedVertices.set(oldVertex.id, newVertex);
    }

    // Find faces inside selection
    const facesToDuplicate = [];
    for (let face of meshData.faces.values()) {
      const faceVertices = new Set(face.vertexIds);
      const isInside = Array.from(faceVertices).every(vId => selectedVertices.has(vId));
      if (isInside) facesToDuplicate.push(face);
    }

    // Duplicate faces
    for (let oldFace of facesToDuplicate) {
      const newVertices = oldFace.vertexIds.map(vId => duplicatedVertices.get(vId));
      const newFace = meshData.addFace(newVertices);
      duplicatedFaces.set(oldFace.id, newFace);
    }

    // Handle Leftover edges
    for (let edge of meshData.edges.values()) {
      const v1Selected = selectedVertices.has(edge.v1Id);
      const v2Selected = selectedVertices.has(edge.v2Id);

      if (v1Selected && v2Selected) {
        const allFacesDuplicated = Array.from(edge.faceIds).every(fid =>
          duplicatedFaces.has(fid)
        );

        if (!allFacesDuplicated) {
          const v1 = duplicatedVertices.get(edge.v1Id);
          const v2 = duplicatedVertices.get(edge.v2Id);

          if (v1 && v2) {
            const newEdge = meshData.addEdge(v1, v2);
            duplicatedEdges.set(edge.id, newEdge);
          }
        }
      }
    }

    const mappedVertexIds = {};
    for (let [oldId, newVertex] of duplicatedVertices.entries()) {
      mappedVertexIds[oldId] = newVertex.id;
    }

    const newVertexIds = Array.from(duplicatedVertices.values()).map(v => v.id);
    const newEdgeIds = Array.from(duplicatedEdges.values()).map(e => e.id);
    const newFaceIds = Array.from(duplicatedFaces.values()).map(f => f.id);
    return { mappedVertexIds, newVertexIds, newEdgeIds, newFaceIds };
  }

  duplicateSelectionEdges(edgeIds) {
    const meshData = this.object.userData.meshData;

    const selectedEdges = new Set(edgeIds);
    const duplicatedVertices = new Map();
    const duplicatedEdges = new Map();
    const duplicatedFaces = new Map();

    // Duplicate vertices at the ends of selected edges
    for (let edgeId of selectedEdges) {
      const edge = meshData.edges.get(edgeId);
      if (!edge) continue;

      [edge.v1Id, edge.v2Id].forEach(vId => {
        if (!duplicatedVertices.has(vId)) {
          const oldVertex = meshData.getVertex(vId);
          if (!oldVertex) return;

          const newVertex = meshData.addVertex({
            x: oldVertex.position.x,
            y: oldVertex.position.y,
            z: oldVertex.position.z
          });

          duplicatedVertices.set(vId, newVertex);
        }
      });
    }

    // Duplicate edges
    for (let edgeId of selectedEdges) {
      const oldEdge = meshData.edges.get(edgeId);
      if (!oldEdge) continue;

      const v1 = duplicatedVertices.get(oldEdge.v1Id);
      const v2 = duplicatedVertices.get(oldEdge.v2Id);
      if (!v1 || !v2) continue;

      const newEdge = meshData.addEdge(v1, v2);
      duplicatedEdges.set(edgeId, newEdge);
    }

    // Duplicate faces where all edges are selected
    for (let face of meshData.faces.values()) {
      const allEdgesSelected = [...face.edgeIds].every(eid => selectedEdges.has(eid));
      if (allEdgesSelected) {
        const newVertices = face.vertexIds.map(vId => duplicatedVertices.get(vId));
        if (newVertices.every(v => v)) {
          const newFace = meshData.addFace(newVertices);
          duplicatedFaces.set(face.id, newFace);
        }
      }
    }

    // Map old vertex IDs to new ones
    const mappedVertexIds = {};
    for (let [oldId, newVertex] of duplicatedVertices.entries()) {
      mappedVertexIds[oldId] = newVertex.id;
    }

    const newVertexIds = Array.from(duplicatedVertices.values()).map(v => v.id);
    const newEdgeIds = Array.from(duplicatedEdges.values()).map(e => e.id);
    const newFaceIds = Array.from(duplicatedFaces.values()).map(f => f.id);
    return { mappedVertexIds, newVertexIds, newEdgeIds, newFaceIds };
  }

  duplicateSelectionFaces(faceIds) {
    const meshData = this.object.userData.meshData;

    const selectedFaces = new Set(faceIds);
    const duplicatedVertices = new Map();
    const duplicatedEdges = new Map();
    const duplicatedFaces = new Map();

    // Duplicate all vertices belonging to selected faces
    for (let faceId of selectedFaces) {
      const face = meshData.faces.get(faceId);
      if (!face) continue;

      for (let vId of face.vertexIds) {
        if (!duplicatedVertices.has(vId)) {
          const oldVertex = meshData.getVertex(vId);
          if (!oldVertex) continue;

          const newVertex = meshData.addVertex({
            x: oldVertex.position.x,
            y: oldVertex.position.y,
            z: oldVertex.position.z
          });

          duplicatedVertices.set(vId, newVertex);
        }
      }
    }

    // Duplicate edges belonging only to selected faces
    for (let faceId of selectedFaces) {
      const face = meshData.faces.get(faceId);
      if (!face) continue;

      for (let eId of face.edgeIds) {
        if (duplicatedEdges.has(eId)) continue;

        const oldEdge = meshData.edges.get(eId);
        if (!oldEdge) continue;

        const v1 = duplicatedVertices.get(oldEdge.v1Id);
        const v2 = duplicatedVertices.get(oldEdge.v2Id);

        if (!v1 || !v2) continue;

        const newEdge = meshData.addEdge(v1, v2);
        duplicatedEdges.set(eId, newEdge);
      }
    }

    // Duplicate the faces
    for (let faceId of selectedFaces) {
      const oldFace = meshData.faces.get(faceId);
      if (!oldFace) continue;

      const newVertices = oldFace.vertexIds.map(vId => duplicatedVertices.get(vId));

      if (!newVertices.every(v => v)) continue;

      const newFace = meshData.addFace(newVertices, oldFace.uvs, oldFace.materialIndex);
      duplicatedFaces.set(faceId, newFace);
    }

    // Map old vertex IDs to new ones
    const mappedVertexIds = {};
    for (let [oldId, newVertex] of duplicatedVertices.entries()) {
      mappedVertexIds[oldId] = newVertex.id;
    }

    const newVertexIds = Array.from(duplicatedVertices.values()).map(v => v.id);
    const newEdgeIds = Array.from(duplicatedEdges.values()).map(e => e.id);
    const newFaceIds = Array.from(duplicatedFaces.values()).map(f => f.id);
    return { mappedVertexIds, newVertexIds, newEdgeIds, newFaceIds };
  }

  deleteSelectionVertices(vertexIds) {
    const meshData = this.object.userData.meshData;
    const selected = new Set(vertexIds);

    const deletedFaces = new Set();
    const deletedEdges = new Set();
    const deletedVertices = new Set();

    // 1. Delete ALL faces connected to ANY selected vertex
    for (const vId of selected) {
      const vertex = meshData.getVertex(vId);
      if (!vertex) continue;

      // Copy faceIds to avoid modification issues while iterating
      const facesToDelete = [...vertex.faceIds]; 
      for (const fId of facesToDelete) {
        if (deletedFaces.has(fId)) continue;
        
        const face = meshData.faces.get(fId);
        if (face) {
          meshData.deleteFace(face);
          deletedFaces.add(fId);
        }
      }
    }

    // 2. Delete ALL edges connected to ANY selected vertex
    for (const vId of selected) {
      const vertex = meshData.getVertex(vId);
      if (!vertex) continue;

      const edgesToDelete = [...vertex.edgeIds];
      for (const eId of edgesToDelete) {
        if (deletedEdges.has(eId)) continue;

        const edge = meshData.edges.get(eId);
        if (edge) {
          meshData.deleteEdge(edge);
          deletedEdges.add(eId);
        }
      }
    }

    // 3. Delete the selected vertices themselves
    for (const vId of selected) {
      const vertex = meshData.getVertex(vId);
      if (vertex) {
        meshData.deleteVertex(vertex);
        deletedVertices.add(vId);
      }
    }

    return {
      deletedFaces: Array.from(deletedFaces),
      deletedEdges: Array.from(deletedEdges),
      deletedVertices: Array.from(deletedVertices)
    };
  }

  deleteSelectionEdges(edgeIds) {
    const meshData = this.object.userData.meshData;
    const selected = new Set(edgeIds);

    const deletedFaces = new Set();
    const deletedEdges = new Set();
    const deletedVertices = new Set();

    // 1. Delete ALL faces connected to ANY selected edge
    for (const eId of selected) {
      const edge = meshData.edges.get(eId);
      if (!edge) continue;

      const facesToDelete = [...edge.faceIds];
      for (const fId of facesToDelete) {
        if (deletedFaces.has(fId)) continue;

        const face = meshData.faces.get(fId);
        if (face) {
          meshData.deleteFace(face);
          deletedFaces.add(fId);
        }
      }
    }

    // 2. Delete the selected edges
    for (const eId of selected) {
      const edge = meshData.edges.get(eId);
      if (edge) {
        meshData.deleteEdge(edge);
        deletedEdges.add(eId);
      }
    }

    // 3. Cleanup: Delete vertices that are now isolated (no edges attached)
    // We iterate over all vertices or just the ones potentially affected? 
    // Optimization: check vertices of the deleted edges.
    const potentialIsolatedVertices = new Set();
    // We need to know which vertices were touched. Since we deleted edges, 
    // we can't look them up easily unless we stored them. 
    // But meshData.deleteEdge updates the vertices' edge lists.
    // So we can iterate over all vertices in the mesh to find isolated ones.
    // For performance on large meshes, we might want to track affected vertices, 
    // but iterating all vertices is safer and easier to implement for now 
    // unless the mesh is huge.
    // Actually, let's just check the whole mesh for isolated vertices to be safe and clean.
    
    for (const [vId, vertex] of [...meshData.vertices.entries()]) {
        if ((!vertex.edgeIds || vertex.edgeIds.size === 0) && (!vertex.faceIds || vertex.faceIds.size === 0)) {
            meshData.deleteVertex(vertex);
            deletedVertices.add(vId);
        }
    }

    return {
      deletedFaces: Array.from(deletedFaces),
      deletedEdges: Array.from(deletedEdges),
      deletedVertices: Array.from(deletedVertices)
    };
  }

  deleteSelectionFaces(faceIds) {
    const meshData = this.object.userData.meshData;
    const selected = new Set(faceIds);

    const deletedFaces = new Set();
    const deletedEdges = new Set();
    const deletedVertices = new Set();

    // 1. Delete selected faces
    for (const fId of selected) {
      const face = meshData.faces.get(fId);
      if (face) {
        meshData.deleteFace(face);
        deletedFaces.add(fId);
      }
    }

    // 2. Cleanup: Delete edges that are now isolated (no faces attached)
    for (const [eId, edge] of [...meshData.edges.entries()]) {
      if (edge.faceIds.size === 0) {
        meshData.deleteEdge(edge);
        deletedEdges.add(eId);
      }
    }

    // 3. Cleanup: Delete vertices that are now isolated (no edges attached)
    for (const [vId, vertex] of [...meshData.vertices.entries()]) {
        if ((!vertex.edgeIds || vertex.edgeIds.size === 0) && (!vertex.faceIds || vertex.faceIds.size === 0)) {
            meshData.deleteVertex(vertex);
            deletedVertices.add(vId);
        }
    }

    return {
      deletedFaces: Array.from(deletedFaces),
      deletedEdges: Array.from(deletedEdges),
      deletedVertices: Array.from(deletedVertices)
    };
  }

  createFaceFromVertices(vertexIds, uvs = [], materialIndex = 0) {
    const meshData = this.object.userData.meshData;
    if (!meshData || !vertexIds || vertexIds.length < 3) {
      return null;
    }

    const vertices = vertexIds.map(id => meshData.getVertex(id)).filter(v => v !== undefined);
    if (vertices.length < 3) return null;

    const newFace = meshData.addFace(vertices, uvs, materialIndex);

    return newFace ? newFace.id : null;
  }

  bridgeFaces(faceId1, faceId2) {
    const meshData = this.object.userData.meshData;
    const f1 = meshData.faces.get(faceId1);
    const f2 = meshData.faces.get(faceId2);

    if (!f1 || !f2 || f1.vertexIds.length !== f2.vertexIds.length) {
      console.warn("Bridge requires two faces with the same number of vertices.");
      return false;
    }

    const v1s = f1.vertexIds.map(id => meshData.getVertex(id));
    const v2s = f2.vertexIds.map(id => meshData.getVertex(id)).reverse();

    // Find best alignment (minimize total edge length)
    let bestShift = 0;
    let minTotalDist = Infinity;
    const n = v1s.length;

    for (let k = 0; k < n; k++) {
      let dist = 0;
      for (let i = 0; i < n; i++) {
        const p1 = v1s[i].position;
        const p2 = v2s[(i + k) % n].position;
        dist += (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2;
      }
      if (dist < minTotalDist) {
        minTotalDist = dist;
        bestShift = k;
      }
    }

    // Create bridge faces
    // We connect f1[i] to f2[i+shift]
    // Order: f1[i], f1[i+1], f2[i+1+shift], f2[i+shift] ?
    // Or reversed? Depends on normals.
    // Assuming standard winding, we often need to connect in reverse order for one face to make normals point out?
    // Let's try standard connection first.
    
    // Check if we need to reverse v2s to minimize twist or based on normals?
    // For now, assume simple bridge.
    
    const newFaceIds = [];
    for (let i = 0; i < n; i++) {
      const idx1 = i;
      const idx2 = (i + 1) % n;
      const idx3 = (i + 1 + bestShift) % n;
      const idx4 = (i + bestShift) % n;

      const bridgeFaceVertices = [
        v1s[idx2], // Next on F1
        v1s[idx1], // Curr on F1
        v2s[idx4], // Curr on F2 (shifted)
        v2s[idx3]  // Next on F2 (shifted)
      ];
      
      // Note: Ordering [v1_next, v1_curr, v2_curr, v2_next] creates a quad.
      // Winding: F1 is CCW. F2 is CCW.
      // Edge on F1 is v1_curr -> v1_next.
      // Edge on F2 is v2_curr -> v2_next.
      // Bridge face should go v1_next -> v1_curr -> v2_curr -> v2_next.
      // This opposes F1 edge and F2 edge?
      // F1 edge: curr->next. Bridge edge: next->curr. Consistent.
      
      const newFace = meshData.addFace(bridgeFaceVertices);
      if (newFace) newFaceIds.push(newFace.id);
    }

    // Delete original faces
    meshData.deleteFace(f1);
    meshData.deleteFace(f2);
    
    // Also delete the internal edges of f1 and f2?
    // deleteFace handles edge references update.
    
    this.updateGeometryAndHelpers();
    return newFaceIds;
  }

  getBoundaryEdges(meshData, vertexIds, edgeIds, faceIds) {
    const selectedVertexSet = new Set(vertexIds);
    const selectedFaceSet = new Set(faceIds);

    // Map edgeKey -> count (how many selected faces reference this edge)
    const edgeCount = new Map();

    for (const faceId of selectedFaceSet) {
      const face = meshData.faces.get(faceId);
      if (!face) continue;
      const vIds = face.vertexIds;

      for (let i = 0; i < vIds.length; i++) {
        const v1 = vIds[i];
        const v2 = vIds[(i + 1) % vIds.length];

        if (selectedVertexSet.has(v1) && selectedVertexSet.has(v2)) {
          const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
          edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        }
      }
    }

    // Boundary edges from faces
    const boundaryEdges = [];
    for (const [key, count] of edgeCount) {
      if (count === 1) {
        const [a, b] = key.split("_").map(Number);
        const edge = meshData.getEdge(a, b);
        if (edge) boundaryEdges.push(edge);
      }
    }

    // Add remaining selected edges not part of any selected face
    if (edgeIds && edgeIds.length > 0) {
      for (const eId of edgeIds) {
        const edge = meshData.edges.get(eId);
        if (!edge) continue;

        const key = edge.v1Id < edge.v2Id ? `${edge.v1Id}_${edge.v2Id}` : `${edge.v2Id}_${edge.v1Id}`;
        if (!edgeCount.has(key)) {
          boundaryEdges.push(edge);
        }
      }
    }

    return boundaryEdges; // Array of Edge objects
  }

  // Proxy methods for atomic operations on MeshData
  addVertex(position) {
    const meshData = this.object.userData.meshData;
    const vertex = meshData.addVertex(position);
    return vertex.id;
  }

  addEdge(v1Id, v2Id) {
    const meshData = this.object.userData.meshData;
    const v1 = meshData.vertices.get(v1Id);
    const v2 = meshData.vertices.get(v2Id);
    if (v1 && v2) {
        const edge = meshData.addEdge(v1, v2);
        return edge ? edge.id : null;
    }
    return null;
  }

  deleteEdge(edgeId) {
    const meshData = this.object.userData.meshData;
    const edge = meshData.edges.get(edgeId);
    if (edge) {
      meshData.deleteEdge(edge);
    }
  }

  deleteFace(faceId) {
    const meshData = this.object.userData.meshData;
    const face = meshData.faces.get(faceId);
    if (face) {
      meshData.deleteFace(face);
    }
  }

  setVertexPosition(vertexId, position) {
      const meshData = this.object.userData.meshData;
      const vertex = meshData.vertices.get(vertexId);
      if (vertex) {
          vertex.position = { x: position.x, y: position.y, z: position.z };
      }
  }
}