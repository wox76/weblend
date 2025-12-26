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
      finalPos = { ...survivor.position };
    } else {
      survivorId = vertexIds[0];
      victimIds = vertexIds.slice(1);
      if (targetPos) {
        finalPos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
      } else {
        const survivor = newMeshData.getVertex(survivorId);
        finalPos = { ...survivor.position };
      }
    }

    const survivorVertex = newMeshData.getVertex(survivorId);
    if (!survivorVertex) return null;

    // Update survivor position
    survivorVertex.position = finalPos;

    // Collect all faces that involve victim vertices
    const affectedFaceIds = new Set();
    for (const victimId of victimIds) {
      const victim = newMeshData.getVertex(victimId);
      if (victim) {
        victim.faceIds.forEach(fid => affectedFaceIds.add(fid));
      }
    }
    // Also include survivor's faces as they might need topology update
    survivorVertex.faceIds.forEach(fid => affectedFaceIds.add(fid));

    // Recreate affected faces
    for (const faceId of affectedFaceIds) {
      const face = newMeshData.faces.get(faceId);
      if (!face) continue;

      // Map old vertex IDs to new ones (victim -> survivor)
      const oldVertexIds = face.vertexIds;
      const newVertexIds = oldVertexIds.map(vid => victimIds.includes(vid) ? survivorId : vid);

      // Remove consecutive duplicates (and circular duplicates)
      const uniqueVertexIds = [];
      for (let i = 0; i < newVertexIds.length; i++) {
        const vid = newVertexIds[i];
        if (uniqueVertexIds.length === 0 || vid !== uniqueVertexIds[uniqueVertexIds.length - 1]) {
          uniqueVertexIds.push(vid);
        }
      }
      // Wrap around check
      if (uniqueVertexIds.length > 1 && uniqueVertexIds[0] === uniqueVertexIds[uniqueVertexIds.length - 1]) {
        uniqueVertexIds.pop();
      }

      const matIndex = face.materialIndex;

      // Delete the old face
      newMeshData.deleteFace(face);

      // Add new face if it still has at least 3 vertices
      if (uniqueVertexIds.length >= 3) {
        const vertices = uniqueVertexIds.map(vid => newMeshData.getVertex(vid));
        newMeshData.addFace(vertices, [], matIndex);
      }
    }

    // Delete victim vertices (deleteFace/deleteEdge should have cleaned up refs)
    for (const victimId of victimIds) {
      const victim = newMeshData.getVertex(victimId);
      if (victim) {
        // Force cleanup of edges connected to victim that weren't part of faces
        const edgeIds = Array.from(victim.edgeIds);
        for (const eid of edgeIds) {
          const edge = newMeshData.edges.get(eid);
          if (edge) {
            // Remap edge if possible, or delete if it would become degenerate
            const otherId = edge.v1Id === victimId ? edge.v2Id : edge.v1Id;
            const remappedOtherId = victimIds.includes(otherId) ? survivorId : otherId;
            
            newMeshData.deleteEdge(edge);

            if (remappedOtherId !== survivorId) {
              const v1 = newMeshData.getVertex(survivorId);
              const v2 = newMeshData.getVertex(remappedOtherId);
              if (v1 && v2) newMeshData.addEdge(v1, v2);
            }
          }
        }
        newMeshData.vertices.delete(victimId);
      }
    }

    // Final cleanup: remove any degenerate edges or faces that might have slipped through
    for (const edge of Array.from(newMeshData.edges.values())) {
      if (edge.v1Id === edge.v2Id) newMeshData.deleteEdge(edge);
    }
    
    return newMeshData;
  }
}