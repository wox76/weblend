import * as THREE from 'three';
import { TransformControls } from 'jsm/controls/TransformControls.js';
import { VertexEditor } from './VertexEditor.js';
import { MeshData } from '../core/MeshData.js';
import { calculateVertexIdsNormal, getCentroidFromVertices, getEdgeMidpoint } from '../utils/AlignedNormalUtils.js';
import { ExtrudeCommand } from '../commands/ExtrudeCommand.js';
import { Signal } from '../utils/Signals.js';

export class ExtrudeTool {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.camera = editor.cameraManager.camera;
    this.renderer = editor.renderer;
    this.sceneEditorHelpers = editor.sceneManager.sceneEditorHelpers;
    this.controls = editor.controlsManager;
    this._worldPosHelper = new THREE.Vector3();
    this.editSelection = editor.editSelection;

    this.isModalExtruding = false;
    this.initialMousePosition = new THREE.Vector2();
    this.currentExtrusionVector = new THREE.Vector3();
    this.extrusionNormal = new THREE.Vector3();
    this.extrusionCentroid = new THREE.Vector3();
    this.onModalMouseMoveHandler = this.onModalMouseMove.bind(this);
    this.onModalMouseUpHandler = this.onModalMouseUp.bind(this);

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.size = 0.4;
    this.transformControls.setMode('translate');
    this.transformControls.visible = false;

    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      if (!event.value) this.signals.objectChanged.dispatch();
    });

    this.transformControls.addEventListener('mouseDown', () => {
      this.signals.transformDragStarted.dispatch();
    });

    this.transformControls.addEventListener('mouseUp', () => {
      requestAnimationFrame(() => {
        this.signals.transformDragEnded.dispatch();
      });
    });

    this.sceneEditorHelpers.add(this.transformControls.getHelper());

    this.changeTransformControlsColor();

    this.setupTransformListeners();
  }

  changeTransformControlsColor() {
    const xColor = new THREE.Color(0xff0000);
    const yColor = new THREE.Color(0x00ff00);
    const zColor = new THREE.Color(0x0000ff);

    const helper = this.transformControls.getHelper();

    helper.traverse(child => {
      if (!child.isMesh || !child.name) return;
            if (child.name === 'Z' || child.name === 'XY') {
        child.material.color.set(xColor);
      } else if (child.name === 'Y' || child.name === 'XZ') {
        child.material.color.set(zColor);
      } else if (child.name === 'X' || child.name === 'YZ') {
        child.material.color.set(yColor);
      }
    });
  }

  setupTransformListeners() {
    this.transformControls.addEventListener('mouseDown', () => {
      const handle = this.transformControls.object;
      if (!handle) return;
      this.objectPositionOnDown = handle.getWorldPosition(this._worldPosHelper).clone();
      this.extrudeStarted = false;
    });

    this.transformControls.addEventListener('change', () => {
      const handle = this.transformControls.object;
      if (!handle || !this.objectPositionOnDown) return;

      if (!this.extrudeStarted) {
        this.startExtrude();
        this.extrudeStarted = true;
      }

      this.updateExtrude();
    });

    this.transformControls.addEventListener('mouseUp', () => {
      this.objectPositionOnDown = null;
      this.extrudeStarted = false;

      const mode = this.editSelection.subSelectionMode;
      const editedObject = this.editSelection.editedObject;
      const vertexEditor = new VertexEditor(this.editor, editedObject);
      vertexEditor.updateGeometryAndHelpers();
      const meshData = editedObject.userData.meshData;
      this.afterMeshData = MeshData.serializeMeshData(meshData);

      this.editor.execute(new ExtrudeCommand(this.editor, editedObject, this.beforeMeshData, this.afterMeshData));

      // Keep selection on the new vertices
      if (mode === 'vertex') {
        this.editSelection.selectVertices(this.newVertexIds);
      } else if (mode === 'edge') {
        this.editSelection.selectEdges(this.newEdgeIds);
      } else if (mode === 'face') {
        this.editSelection.selectFaces(this.newFaceIds);
      }
    });
  }

  enableFor(object) {
    if (!object) return;
    this.transformControls.attach(object);
    this.transformControls.visible = true;
  }

  disable() {
    this.transformControls.detach();
    this.transformControls.visible = false;
  }

  startModalExtrude() {
    if (this.isModalExtruding) return;

    this.isModalExtruding = true;
    this.initialPositionSet = false;
    this.currentExtrusionVector.set(0, 0, 0);

    this.editSelection.enable = false;
    this.transformControls.detach(); // Detach gizmo
    this.controls.enabled = false; // Disable orbit controls

    this.startExtrudeInternal();

    window.addEventListener('mousemove', this.onModalMouseMoveHandler);
    window.addEventListener('mouseup', this.onModalMouseUpHandler);
  }

  onModalMouseMove(event) {
    if (!this.isModalExtruding) return;

    const mouseX = event.clientX;
    const mouseY = event.clientY;

    if (!this.initialPositionSet) {
      this.initialMousePosition.set(mouseX, mouseY);
      this.initialPositionSet = true;
      return;
    }

    const mouseDelta = new THREE.Vector2(mouseX - this.initialMousePosition.x, mouseY - this.initialMousePosition.y);
    const editedObject = this.editSelection.editedObject;

    // Project normal to screen space
    const centroidWorld = this.extrusionCentroid.clone().applyMatrix4(editedObject.matrixWorld);
    
    // Transform normal to world space (using normal matrix approx)
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(editedObject.matrixWorld);
    const normalWorld = this.extrusionNormal.clone().applyMatrix3(normalMatrix).normalize();
    
    const normalEndWorld = centroidWorld.clone().add(normalWorld);
    
    const centroidScreen = centroidWorld.clone().project(this.camera);
    const normalEndScreen = normalEndWorld.clone().project(this.camera);
    
    // Screen space vector (NDC -> roughly screen direction, Y inverted)
    const screenNormal = new THREE.Vector2(normalEndScreen.x - centroidScreen.x, -(normalEndScreen.y - centroidScreen.y));
    
    // If the normal is perpendicular to view (pointing at/away from camera), screenNormal length is ~0.
    // In that case, we fallback to simple Y drag or similar.
    let amount = 0;
    if (screenNormal.lengthSq() < 0.0001) {
        // Fallback: Just use mouse Y
        amount = -mouseDelta.y;
    } else {
        screenNormal.normalize();
        amount = mouseDelta.dot(screenNormal);
    }

    // Scale factor to convert screen pixels to world units roughly
    // This depends on camera distance/zoom.
    // For now, a constant or distance-based factor.
    const distance = this.camera.position.distanceTo(centroidWorld);
    // Simple heuristic factor
    const scaleFactor = distance * 0.002; 
    
    this.currentExtrusionVector.copy(this.extrusionNormal).multiplyScalar(amount * scaleFactor);

    this.updateExtrudeInternal(this.currentExtrusionVector);
  }

  onModalMouseUp() {
    if (!this.isModalExtruding) return;
    this.confirmExtrude();
  }

  confirmExtrude() {
    this.editor.viewportControls.clearOperationStatus();
    if (!this.isModalExtruding) return;

    window.removeEventListener('mousemove', this.onModalMouseMoveHandler);
    window.removeEventListener('mouseup', this.onModalMouseUpHandler);

    this.editSelection.enable = true;
    this.isModalExtruding = false;
    this.controls.enabled = true;

    // Finalize the command
    const editedObject = this.editSelection.editedObject;
    const vertexEditor = new VertexEditor(this.editor, editedObject);
    vertexEditor.updateGeometryAndHelpers(); // Ensure all changes are applied
    const meshData = editedObject.userData.meshData;
    this.afterMeshData = MeshData.serializeMeshData(meshData);

    this.editor.execute(new ExtrudeCommand(this.editor, editedObject, this.beforeMeshData, this.afterMeshData));

    // Keep selection on the new vertices
    const mode = this.editSelection.subSelectionMode;
    if (mode === 'vertex') {
        this.editSelection.selectVertices(this.newVertexIds);
    } else if (mode === 'edge') {
        this.editSelection.selectEdges(this.newEdgeIds);
    } else if (mode === 'face') {
        this.editSelection.selectFaces(this.newFaceIds);
    }

    this.signals.objectChanged.dispatch();
    this.signals.modalExtrudeEnded.dispatch();
  }

  cancelModalExtrude() {
    this.editor.viewportControls.clearOperationStatus();
    if (!this.isModalExtruding) return;

    window.removeEventListener('mousemove', this.onModalMouseMoveHandler);
    window.removeEventListener('mouseup', this.onModalMouseUpHandler);

    this.editSelection.enable = true;
    this.isModalExtruding = false;
    this.controls.enabled = true;

    // Revert changes by setting meshData back to beforeMeshData
    const editedObject = this.editSelection.editedObject;
    const vertexEditor = new VertexEditor(this.editor, editedObject);
    const beforeData = MeshData.deserializeMeshData(this.beforeMeshData);
    vertexEditor.applyMeshData(beforeData);
    vertexEditor.updateGeometryAndHelpers();
    this.signals.objectChanged.dispatch();
    this.signals.modalExtrudeEnded.dispatch();
  }

  startExtrudeInternal() {
    const editedObject = this.editSelection.editedObject;
    const vertexEditor = new VertexEditor(this.editor, editedObject);
    const meshData = editedObject.userData.meshData;
    this.beforeMeshData = MeshData.serializeMeshData(meshData);

    const mode = this.editSelection.subSelectionMode;
    const selectedVertexIds = Array.from(this.editSelection.selectedVertexIds);
    const selectedEdgeIds = Array.from(this.editSelection.selectedEdgeIds);
    const selectedFaceIds = Array.from(this.editSelection.selectedFaceIds);

    // Calculate normal and centroid for interaction
    if (mode === 'face' && selectedFaceIds.length > 0) {
        const vIds = selectedFaceIds.flatMap(faceId => Array.from(meshData.faces.get(faceId).vertexIds));
        this.extrusionCentroid.copy(getCentroidFromVertices(vIds, meshData));
        this.extrusionNormal.copy(calculateVertexIdsNormal(meshData, vIds));
    } else if (mode === 'edge' && selectedEdgeIds.length > 0) {
        const vIds = selectedEdgeIds.flatMap(edgeId => {
             const e = meshData.edges.get(edgeId);
             return [e.v1Id, e.v2Id];
        });
        const connectedFaceIds = Array.from(selectedEdgeIds.flatMap(edgeId => Array.from(meshData.edges.get(edgeId).faceIds)));
        this.extrusionCentroid.copy(getCentroidFromVertices(vIds, meshData));
        if (connectedFaceIds.length > 0) {
             const faceVIds = connectedFaceIds.flatMap(faceId => Array.from(meshData.faces.get(faceId).vertexIds));
             this.extrusionNormal.copy(calculateVertexIdsNormal(meshData, faceVIds));
        } else {
             this.extrusionNormal.set(0, 1, 0);
        }
    } else if (mode === 'vertex' && selectedVertexIds.length > 0) {
        this.extrusionCentroid.copy(getCentroidFromVertices(selectedVertexIds, meshData));
        const connectedFaceIds = Array.from(selectedVertexIds.flatMap(vId => Array.from(meshData.vertices.get(vId).faceIds)));
        if (connectedFaceIds.length > 0) {
             const faceVIds = connectedFaceIds.flatMap(faceId => Array.from(meshData.faces.get(faceId).vertexIds));
             this.extrusionNormal.copy(calculateVertexIdsNormal(meshData, faceVIds));
        } else {
             this.extrusionNormal.set(0, 1, 0);
        }
    } else {
        this.extrusionCentroid.set(0,0,0);
        this.extrusionNormal.set(0,1,0);
    }

    // Duplicate the selected vertices
    let duplicationResult;
    if (mode === 'vertex') {
      duplicationResult = vertexEditor.duplicateSelectionVertices(selectedVertexIds);
    } else if (mode === 'edge') {
      duplicationResult = vertexEditor.duplicateSelectionEdges(selectedEdgeIds);
    } else if (mode === 'face') {
      duplicationResult = vertexEditor.duplicateSelectionFaces(selectedFaceIds);
    }
    this.mappedVertexIds = duplicationResult.mappedVertexIds;
    this.newVertexIds = duplicationResult.newVertexIds;
    this.newEdgeIds = duplicationResult.newEdgeIds;
    this.newFaceIds = duplicationResult.newFaceIds;

    vertexEditor.updateGeometryAndHelpers();
    this.initialDuplicatedPositions = vertexEditor.getVertexPositions(this.newVertexIds);

    this.boundaryEdges = vertexEditor.getBoundaryEdges(meshData, selectedVertexIds, selectedEdgeIds, selectedFaceIds);

    // Recreate side faces
    for (let i = 0; i < this.boundaryEdges.length; i++) {
      const edge = this.boundaryEdges[i];
      const newEdge = meshData.getEdge(this.mappedVertexIds[edge.v1Id], this.mappedVertexIds[edge.v2Id]);

      const sideFaceVertexIds = [edge.v1Id, edge.v2Id, this.mappedVertexIds[edge.v2Id], this.mappedVertexIds[edge.v1Id]];

      const faceId = Array.from(newEdge.faceIds)[0];

      if (faceId !== undefined) {
        const face = meshData.faces.get(faceId);
        const faceCentroid = getCentroidFromVertices(face.vertexIds, meshData);
        const newEdgeMidpoint = getEdgeMidpoint(newEdge, meshData);

        const sideFaceNormal = new THREE.Vector3().subVectors(newEdgeMidpoint, faceCentroid);
        if (sideFaceNormal.lengthSq() > 0) sideFaceNormal.normalize();

        const faceNormal = calculateVertexIdsNormal(meshData, face.vertexIds);
        const edgeVector = new THREE.Vector3().subVectors(meshData.getVertex(edge.v2Id).position, meshData.getVertex(edge.v1Id).position);
        if (edgeVector.lengthSq() > 0) edgeVector.normalize();

        const testNormal = new THREE.Vector3().crossVectors(edgeVector, faceNormal);
        if (testNormal.lengthSq() > 0) testNormal.normalize();

        if (testNormal.dot(sideFaceNormal) < 0) {
          sideFaceVertexIds.reverse();
        }
      }

      vertexEditor.createFaceFromVertices(sideFaceVertexIds);
    }

    // Handle isolated vertices
    const connectedVertexIds = new Set();
    for (let edgeId of selectedEdgeIds) {
      const edge = meshData.edges.get(edgeId);
      if (!edge) continue;
      connectedVertexIds.add(edge.v1Id);
      connectedVertexIds.add(edge.v2Id);
    }
    const leftoverVertexIds = selectedVertexIds.filter(vId => !connectedVertexIds.has(vId));

    for (let vId of leftoverVertexIds) {
      const newVId = this.mappedVertexIds[vId];
      meshData.addEdge(meshData.getVertex(vId), meshData.getVertex(newVId));
    }

    // Delete old selection
    if (mode === 'vertex') {
      // vertexEditor.deleteSelectionVertices(selectedVertexIds);
      vertexEditor.updateGeometryAndHelpers(false);
      this.editSelection.selectVertices(this.newVertexIds);
    } else if (mode === 'edge') {
      // vertexEditor.deleteSelectionEdges(selectedEdgeIds);
      vertexEditor.updateGeometryAndHelpers(false);
      this.editSelection.selectEdges(this.newEdgeIds);
    } else if (mode === 'face') {
      vertexEditor.deleteSelectionFaces(selectedFaceIds);
      vertexEditor.updateGeometryAndHelpers(false);
      this.editSelection.selectFaces(this.newFaceIds);
    }
  }

  updateExtrudeInternal(offset) {
    const dist = offset.length().toFixed(4);
    this.editor.viewportControls.setOperationStatus('EXTRUDE', `D: ${dist}`);

    const editedObject = this.editSelection.editedObject;
    const vertexEditor = new VertexEditor(this.editor, editedObject);

    // Move duplicated vertices
    const newPositions = this.initialDuplicatedPositions.map(pos => pos.clone().add(offset));
    vertexEditor.setVerticesWorldPositions(this.newVertexIds, newPositions);
  }

  resetExtrusion() {
    this.currentExtrusionVector.set(0, 0, 0);
    this.updateExtrudeInternal(this.currentExtrusionVector);
    this.signals.objectChanged.dispatch();
  }

  // Original startExtrude and updateExtrude methods, now adapted for gizmo use
  startExtrude() {
    this.startExtrudeInternal();
  }

  updateExtrude() {
    const handle = this.transformControls.object;
    if (!handle || !this.objectPositionOnDown) return;

    const currentPos = handle.getWorldPosition(this._worldPosHelper);
    const offset = new THREE.Vector3().subVectors(currentPos, this.objectPositionOnDown);
    this.updateExtrudeInternal(offset);
  }
}