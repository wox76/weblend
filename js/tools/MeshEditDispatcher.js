import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';
import { VertexEditor } from './VertexEditor.js';
import { getSortedVertexIds } from '../utils/SortUtils.js';
import { getNeighborFaces, shouldFlipNormal } from '../utils/AlignedNormalUtils.js';
import { CreateFaceCommand } from '../commands/CreateFaceCommand.js';
import { DeleteSelectionCommand } from '../commands/DeleteSelectionCommand.js';
import { SeparateSelectionCommand } from '../commands/SeparateSelectionCommand.js';

export class MeshEditDispatcher {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.editSelection = editor.editSelection;

    this.setupListeners();
  }

  setupListeners() {
    this.signals.createFaceFromVertices.add(() => {
      const editedObject = this.editSelection.editedObject;
      const mode = this.editSelection.subSelectionMode;

      const meshData = editedObject.userData.meshData;
      if (!editedObject || !meshData) return null;
      this.beforeMeshData = MeshData.serializeMeshData(meshData);

      const selectedVertexIds = Array.from(this.editSelection.selectedVertexIds);
      const selectedEdgeIds = Array.from(this.editSelection.selectedEdgeIds);
      const selectedFaceIds = Array.from(this.editSelection.selectedFaceIds);

      // Handle Face Bridge
      if (mode === 'face') {
          if (selectedFaceIds.length === 2) {
              const vertexEditor = new VertexEditor(this.editor, editedObject);
              const newFaceIds = vertexEditor.bridgeFaces(selectedFaceIds[0], selectedFaceIds[1]);
              
              if (newFaceIds) {
                  this.afterMeshData = MeshData.serializeMeshData(meshData);
                  this.editor.execute(new CreateFaceCommand(this.editor, editedObject, this.beforeMeshData, this.afterMeshData));
                  this.editSelection.selectFaces(newFaceIds);
              }
          }
          return;
      }

      if (!selectedVertexIds || selectedVertexIds.length < 3) return null;

      // Prevent creating a face identical to the selected face
      if (selectedFaceIds.length === 1) {
        const face = meshData.faces.get(selectedFaceIds[0]);
        if (face && selectedVertexIds.length === face.vertexIds.length) {
          return null;
        }
      }
      
      const vertexEditor = new VertexEditor(this.editor, editedObject);
      
      const { sortedVertexIds, normal } = getSortedVertexIds(meshData, selectedVertexIds);
      const neighbors = getNeighborFaces(meshData, selectedEdgeIds);
      const shouldFlip = shouldFlipNormal(meshData, sortedVertexIds, normal, neighbors);

      if (shouldFlip) {
        sortedVertexIds.reverse();
      }

      const newFaceId = vertexEditor.createFaceFromVertices(sortedVertexIds);
      const newFace = meshData.faces.get(newFaceId);
      const newVertices = [...newFace.vertexIds];
      const newEdges = [...newFace.edgeIds];

      this.afterMeshData = MeshData.serializeMeshData(meshData);
      this.editor.execute(new CreateFaceCommand(this.editor, editedObject, this.beforeMeshData, this.afterMeshData));

      if (mode === 'vertex') {
        this.editSelection.selectVertices(newVertices);
      } else if (mode === 'edge') {
        this.editSelection.selectEdges(newEdges);
      }
    });

    this.signals.deleteSelectedFaces.add(() => {
      const editedObject = this.editSelection.editedObject;
      const mode = this.editSelection.subSelectionMode;

      const selectedVertexIds = this.editSelection.selectedVertexIds;
      const selectedEdgeIds = this.editSelection.selectedEdgeIds;
      const selectedFaceIds = this.editSelection.selectedFaceIds;

      const meshData = editedObject.userData.meshData;
      this.beforeMeshData = MeshData.serializeMeshData(meshData);

      const vertexEditor = new VertexEditor(this.editor, editedObject);
      if (mode === 'vertex') {
        vertexEditor.deleteSelectionVertices(selectedVertexIds);
      } else if (mode === 'edge') {
        vertexEditor.deleteSelectionEdges(selectedEdgeIds);
      } else if (mode === 'face') {
        vertexEditor.deleteSelectionFaces(selectedFaceIds);
      }

      this.afterMeshData = MeshData.serializeMeshData(meshData);
      this.editor.execute(new DeleteSelectionCommand(this.editor, editedObject, this.beforeMeshData, this.afterMeshData));
    });

    this.signals.separateSelection.add(() => {
      const editedObject = this.editSelection.editedObject;
      const mode = this.editSelection.subSelectionMode;

      const selectedVertexIds = this.editSelection.selectedVertexIds;
      const selectedEdgeIds = this.editSelection.selectedEdgeIds;
      const selectedFaceIds = this.editSelection.selectedFaceIds;

      const meshData = editedObject.userData.meshData;
      this.beforeMeshData = MeshData.serializeMeshData(meshData);

      let newVertexIds = [];
      let newEdgeIds = [];
      let newFaceIds = [];

      const vertexEditor = new VertexEditor(this.editor, editedObject);
      if (mode === 'vertex') {
        ({ newVertexIds } = vertexEditor.duplicateSelectionVertices(selectedVertexIds));
        vertexEditor.deleteSelectionVertices(selectedVertexIds);
      } else if (mode === 'edge') {
        ({ newEdgeIds } = vertexEditor.duplicateSelectionEdges(selectedEdgeIds));
        vertexEditor.deleteSelectionEdges(selectedEdgeIds);
      } else if (mode === 'face') {
        ({ newFaceIds } = vertexEditor.duplicateSelectionFaces(selectedFaceIds));
        vertexEditor.deleteSelectionFaces(selectedFaceIds);
      }

      this.afterMeshData = MeshData.serializeMeshData(meshData);
      this.editor.execute(new SeparateSelectionCommand(this.editor, editedObject, this.beforeMeshData, this.afterMeshData));

      if (mode === 'vertex') {
        this.editSelection.selectVertices(newVertexIds);
      } else if (mode === 'edge') {
        this.editSelection.selectEdges(newEdgeIds);
      } else if (mode === 'face') {
        this.editSelection.selectFaces(newFaceIds);
      }
    });
  }
}