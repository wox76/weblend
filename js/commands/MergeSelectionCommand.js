import { MeshDataCommand } from './MeshDataCommand.js';
import * as THREE from 'three';

export class MergeSelectionCommand extends MeshDataCommand {
  static type = 'MergeSelectionCommand';

  constructor(editor, object, beforeMeshData, afterMeshData) {
    super(editor, object, beforeMeshData, afterMeshData, 'Merge Selection');
  }

  /**
   * Static helper to perform the merge operation on a MeshData object.
   * Does NOT modify the input meshData in place, returns a cloned and modified one.
   * 
   * @param {MeshData} meshData - The source mesh data.
   * @param {Array<number>} vertexIds - List of vertex IDs to merge.
   * @param {string} type - 'center', 'cursor', 'collapse', 'first', 'last'.
   * @param {THREE.Vector3} [targetPos] - Target position for center/cursor/collapse.
   * @param {number} [targetVertexId] - Target vertex ID for first/last.
   * @returns {MeshData} The new MeshData.
   */
  static performMerge(meshData, vertexIds, type, targetPos, targetVertexId) {
    if (!meshData || !vertexIds || vertexIds.length < 2) return null;

    // Clone the mesh data to work on
    const newMeshData = meshData.constructor.deserializeMeshData(meshData.constructor.serializeMeshData(meshData));
    
    // Determine survivor and victim vertices
    let survivorId;
    let victimIds;
    let finalPos;

    if (type === 'first' || type === 'last') {
      if (targetVertexId === undefined) return null;
      survivorId = targetVertexId;
      victimIds = vertexIds.filter(id => id !== survivorId);
      const survivor = newMeshData.getVertex(survivorId);
      if (!survivor) return null;
      finalPos = survivor.position;
    } else {
      // center, cursor, collapse
      // For these, we pick the first one as survivor, but move it.
      survivorId = vertexIds[0];
      victimIds = vertexIds.slice(1);
      
      if (targetPos) {
        finalPos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
      } else {
        // Fallback if no targetPos provided (shouldn't happen for center/cursor)
        const survivor = newMeshData.getVertex(survivorId);
        finalPos = survivor.position;
      }
    }

    const survivorVertex = newMeshData.getVertex(survivorId);
    if (!survivorVertex) return null;

    // Update survivor position
    survivorVertex.position = finalPos;

    // Remap victims to survivor
    for (const victimId of victimIds) {
      const victimVertex = newMeshData.getVertex(victimId);
      if (!victimVertex) continue;

      // Remap Faces
      // Iterate over a copy of faceIds because we modify the Set
      const victimFaceIds = Array.from(victimVertex.faceIds);
      for (const faceId of victimFaceIds) {
        const face = newMeshData.faces.get(faceId);
        if (!face) continue;

        // Replace victimId with survivorId in face.vertexIds
        for (let i = 0; i < face.vertexIds.length; i++) {
          if (face.vertexIds[i] === victimId) {
            face.vertexIds[i] = survivorId;
          }
        }

        // Update connectivity
        victimVertex.faceIds.delete(faceId);
        survivorVertex.faceIds.add(faceId);
      }

      // Remap Edges
      const victimEdgeIds = Array.from(victimVertex.edgeIds);
      for (const edgeId of victimEdgeIds) {
        const edge = newMeshData.edges.get(edgeId);
        if (!edge) continue;

        if (edge.v1Id === victimId) edge.v1Id = survivorId;
        if (edge.v2Id === victimId) edge.v2Id = survivorId;

        victimVertex.edgeIds.delete(edgeId);
        survivorVertex.edgeIds.add(edgeId);
      }

      // Finally delete the victim vertex
      // Note: deleteVertex() in MeshData deletes attached faces/edges too, 
      // but we just moved them to survivor! So the victim has no faces/edges now?
      // Wait, we manually cleared victimVertex.faceIds and edgeIds.
      // So calling deleteVertex now is safe and correct (it removes it from vertices Map).
      newMeshData.deleteVertex(victimVertex); 
    }

    // Cleanup Step 1: Remove degenerate edges (v1 == v2)
    // Also merge edges that are duplicates (connect same v1, v2)
    // We iterate over survivor's edges to check.
    
    // Filter survivor edges
    const edgesToCheck = Array.from(survivorVertex.edgeIds);
    const uniqueNeighborEdges = new Map(); // neighborId -> edgeId

    for (const edgeId of edgesToCheck) {
      const edge = newMeshData.edges.get(edgeId);
      if (!edge) {
        survivorVertex.edgeIds.delete(edgeId); // Cleanup stale ref
        continue;
      }

      // Self-loop?
      if (edge.v1Id === edge.v2Id) {
        newMeshData.deleteEdge(edge);
        continue;
      }

      // Duplicate edge?
      const neighborId = (edge.v1Id === survivorId) ? edge.v2Id : edge.v1Id;
      
      if (uniqueNeighborEdges.has(neighborId)) {
        // We found a duplicate edge connecting survivor to neighborId.
        // We must merge them.
        const keepEdgeId = uniqueNeighborEdges.get(neighborId);
        const keepEdge = newMeshData.edges.get(keepEdgeId);
        const dropEdge = edge;

        // Merge faces from dropEdge to keepEdge
        for (const faceId of dropEdge.faceIds) {
            const face = newMeshData.faces.get(faceId);
            if (face) {
                face.edgeIds.delete(dropEdge.id);
                face.edgeIds.add(keepEdge.id);
                keepEdge.faceIds.add(faceId);
            }
        }
        
        // Delete dropEdge
        newMeshData.deleteEdge(dropEdge);
      } else {
        uniqueNeighborEdges.set(neighborId, edgeId);
      }
    }

    // Cleanup Step 2: Remove degenerate faces
    // Faces with < 3 unique vertices
    // Or faces that have collapsed to a line/point
    // We check faces connected to survivor
    const facesToCheck = Array.from(survivorVertex.faceIds);
    for (const faceId of facesToCheck) {
      const face = newMeshData.faces.get(faceId);
      if (!face) continue;

      const uniqueV = new Set(face.vertexIds);
      if (uniqueV.size < 3) {
        newMeshData.deleteFace(face);
      }
    }

    return newMeshData;
  }
}