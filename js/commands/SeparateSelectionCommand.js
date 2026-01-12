import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';
import { AddObjectCommand } from './AddObjectCommand.js';
import { MeshDataCommand } from './MeshDataCommand.js';
import { MultiCommand } from './MultiCommand.js';

// SeparateSelectionCommand: Splits mesh data into new objects
export class SeparateSelectionCommand {
  static type = 'SeparateSelectionCommand';

  constructor(editor, object, type) {
    this.editor = editor;
    this.object = object;
    this.type = type; // 'selection', 'material', 'loose'
    this.name = `Separate: ${type}`;
    this.multiCmd = null;
  }

  execute() {
    this.multiCmd = new MultiCommand(this.editor, this.name);
    const meshData = this.object.userData.meshData;

    if (this.type === 'selection') {
        this.separateBySelection(meshData);
    } else if (this.type === 'material') {
        this.separateByMaterial(meshData);
    } else if (this.type === 'loose') {
        this.separateByLooseParts(meshData);
    }

    if (this.multiCmd.commands.length > 0) {
        this.multiCmd.execute();
        this.editor.editSelection.clearSelection();
    }
  }

  undo() {
    if (this.multiCmd) this.multiCmd.undo();
  }

  toJSON() {
    // Complex state, might rely on MultiCommand serialization or reconstruction
    return {
      type: SeparateSelectionCommand.type,
      objectUuid: this.object.uuid,
      separateType: this.type
    };
  }

  static fromJSON(editor, json) {
     const object = editor.objectByUuid(json.objectUuid);
     return new SeparateSelectionCommand(editor, object, json.separateType);
  }

  separateBySelection(meshData) {
      const selectedFaceIds = Array.from(this.editor.editSelection.selectedFaceIds);
      if (selectedFaceIds.length === 0) return;

      const newObjectMeshData = new MeshData();
      const facesToDelete = new Set();

      this.moveFacesToNewMesh(meshData, newObjectMeshData, selectedFaceIds, facesToDelete);
      
      this.finalizeSeparation(meshData, [newObjectMeshData], facesToDelete);
  }

  separateByMaterial(meshData) {
      const groups = new Map(); // materialIndex -> [faceIds]

      for (const [fid, face] of meshData.faces) {
          const matIndex = face.materialIndex || 0;
          if (!groups.has(matIndex)) groups.set(matIndex, []);
          groups.get(matIndex).push(fid);
      }

      if (groups.size <= 1) return; // Nothing to separate

      // Keep the largest group in the original object? Or split all?
      // Blender keeps one part and makes new objects for others.
      // Let's keep the first group in original, separate others.
      
      const sortedKeys = Array.from(groups.keys()).sort();
      const keepMatIndex = sortedKeys[0]; 
      
      const newMeshesData = [];
      const facesToDelete = new Set();

      for (let i = 1; i < sortedKeys.length; i++) {
          const matIndex = sortedKeys[i];
          const faceIds = groups.get(matIndex);
          
          const newMeshData = new MeshData();
          this.moveFacesToNewMesh(meshData, newMeshData, faceIds, facesToDelete);
          newMeshesData.push(newMeshData);
      }

      this.finalizeSeparation(meshData, newMeshesData, facesToDelete);
  }

  separateByLooseParts(meshData) {
      const visitedFaces = new Set();
      const parts = [];

      for (const [fid, face] of meshData.faces) {
          if (visitedFaces.has(fid)) continue;

          // Start BFS/DFS to find connected component
          const partFaceIds = [];
          const stack = [fid];
          visitedFaces.add(fid);

          while (stack.length > 0) {
              const currFid = stack.pop();
              partFaceIds.push(currFid);
              
              const currFace = meshData.faces.get(currFid);
              if (!currFace) continue; // Should not happen

              // Neighbors via edges
              for (const eid of currFace.edgeIds) {
                  const edge = meshData.edges.get(eid);
                  if (edge) {
                      for (const neighborFid of edge.faceIds) {
                          if (!visitedFaces.has(neighborFid)) {
                              visitedFaces.add(neighborFid);
                              stack.push(neighborFid);
                          }
                      }
                  }
              }
          }
          parts.push(partFaceIds);
      }

      if (parts.length <= 1) return;

      // Keep part 0, separate others
      const newMeshesData = [];
      const facesToDelete = new Set();

      for (let i = 1; i < parts.length; i++) {
          const faceIds = parts[i];
          const newMeshData = new MeshData();
          this.moveFacesToNewMesh(meshData, newMeshData, faceIds, facesToDelete);
          newMeshesData.push(newMeshData);
      }

      this.finalizeSeparation(meshData, newMeshesData, facesToDelete);
  }

  moveFacesToNewMesh(sourceMeshData, targetMeshData, faceIds, facesToDeleteSet) {
      const vertexMap = new Map(); // oldId -> newVertex

      for (const fid of faceIds) {
          const face = sourceMeshData.faces.get(fid);
          if (!face) continue;
          
          facesToDeleteSet.add(fid);

          // Get/Create vertices in new mesh
          const newVertexIds = [];
          for (const vid of face.vertexIds) {
              if (!vertexMap.has(vid)) {
                  const v = sourceMeshData.vertices.get(vid);
                  const newV = targetMeshData.addVertex({ ...v.position });
                  vertexMap.set(vid, newV);
              }
              newVertexIds.push(vertexMap.get(vid));
          }

          // Create face in new mesh
          targetMeshData.addFace(newVertexIds, face.uvs, face.materialIndex);
      }
  }

  finalizeSeparation(originalMeshData, newMeshesData, facesToDelete) {
      // 1. Create Command to update Original Object (Remove faces)
      const afterMeshData = MeshData.deserializeMeshData(MeshData.serializeMeshData(originalMeshData)); // Clone
      
      // Perform deletion on 'afterMeshData'
      // We need to delete faces and isolated vertices
      // Using VertexEditor logic would be easier but we are in a Command.
      // Let's rely on MeshData methods.
      
      // Delete faces
      for (const fid of facesToDelete) {
          const f = afterMeshData.faces.get(fid);
          if (f) afterMeshData.deleteFace(f);
      }

      // Cleanup isolated edges (edges with no faces)
      const isolatedEdges = [];
      for (const [eid, e] of afterMeshData.edges) {
          if (!e.faceIds || e.faceIds.size === 0) {
              isolatedEdges.push(e);
          }
      }
      for (const e of isolatedEdges) afterMeshData.deleteEdge(e);

      // Cleanup isolated vertices
      const isolatedVertices = [];
      for (const [vid, v] of afterMeshData.vertices) {
          if ((!v.edgeIds || v.edgeIds.size === 0) && (!v.faceIds || v.faceIds.size === 0)) {
              isolatedVertices.push(v);
          }
      }
      for (const v of isolatedVertices) afterMeshData.deleteVertex(v);

      // Create Update Command
      const updateCmd = new MeshDataCommand(this.editor, this.object, originalMeshData, afterMeshData);
      this.multiCmd.add(updateCmd);

      // 2. Create Commands to Add New Objects
      for (const newMD of newMeshesData) {
          const newObj = this.object.clone(); // Clone material, transform, etc.
          
          // Generate actual geometry from MeshData
          newObj.geometry = newMD.toDuplicatedVertexGeometry(); 
          
          newObj.userData.meshData = newMD;
          newObj.name = this.editor.sceneManager.getUniqueName(this.object.name + '.sep');
          
          // Ensure clean state
          newObj.uuid = THREE.MathUtils.generateUUID();
          if (newObj.children) newObj.children = []; // Don't clone children?

          const addCmd = new AddObjectCommand(this.editor, newObj);
          this.multiCmd.add(addCmd);
      }
  }
}