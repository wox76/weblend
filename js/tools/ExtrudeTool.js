import * as THREE from 'three';
import { TransformControls } from 'jsm/controls/TransformControls.js';
import { VertexEditor } from './VertexEditor.js';
import { MeshData } from '../core/MeshData.js';
import { calculateVertexIdsNormal, calculateFaceNormal, getCentroidFromVertices, getEdgeMidpoint } from '../utils/AlignedNormalUtils.js';
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
    
    // Viewport drag handlers
    this.onViewportMouseDown = this.onViewportMouseDown.bind(this);
    this.onViewportMouseMove = this.onViewportMouseMove.bind(this);
    this.onViewportMouseUp = this.onViewportMouseUp.bind(this);

    // Initialize without domElement to prevent internal event listeners
    this.transformControls = new TransformControls(this.camera, undefined);
    this.transformControls.size = 0.4;
    this.transformControls.setMode('translate');
    this.transformControls.visible = false;
    this.transformControls.enabled = false; // Disable interaction raycasting

    // We don't listen to transformControls events anymore because we handle input manually
    this.sceneEditorHelpers.add(this.transformControls.getHelper());

    this.changeTransformControlsColor();
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
    // Deprecated: transformControls is now passive (visual only)
  }

  enableFor(object) {
    console.log('ExtrudeTool: enableFor', object);
    if (!object) return;
    this.transformControls.attach(object);
    this.transformControls.visible = true;
    
    // Attach viewport listeners
    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', this.onViewportMouseDown);
    dom.addEventListener('mousemove', this.onViewportMouseMove);
    dom.addEventListener('mouseup', this.onViewportMouseUp);
  }

  disable() {
    this.transformControls.detach();
    this.transformControls.visible = false;
    
    // Remove viewport listeners
    const dom = this.renderer.domElement;
    dom.removeEventListener('mousedown', this.onViewportMouseDown);
    dom.removeEventListener('mousemove', this.onViewportMouseMove);
    dom.removeEventListener('mouseup', this.onViewportMouseUp);
  }
  
  onViewportMouseDown(event) {
      if (event.button !== 0) return; // Only left click
      
      this.isDragging = false;
      this.mouseDownPos = new THREE.Vector2(event.clientX, event.clientY);
  }
  
  onViewportMouseMove(event) {
      if (!this.mouseDownPos) return;
      
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      const dx = mouseX - this.mouseDownPos.x;
      const dy = mouseY - this.mouseDownPos.y;
      
      // Start drag threshold
      if (!this.isDragging && (dx*dx + dy*dy > 4)) { // 2px threshold squared
          this.isDragging = true;
          this.signals.transformDragStarted.dispatch();
          
          // Cancel any potential box selection
          if (this.editor.selectionBox) {
              this.editor.selectionBox.finishSelection();
          }

          // Initialize extrusion
          this.initialMousePosition.set(this.mouseDownPos.x, this.mouseDownPos.y);
          this.startExtrudeInternal();
          this.extrudeStarted = true;
      }
      
      if (this.isDragging) {
          // Reuse projection logic from Modal Mouse Move
          this.handleExtrudeMove(mouseX, mouseY, this.mouseDownPos.x, this.mouseDownPos.y);
      }
  }
  
  onViewportMouseUp(event) {
      if (event.button !== 0) return;
      
      if (this.isDragging) {
          // Finish extrusion
          this.confirmExtrude();
          this.signals.transformDragEnded.dispatch();
      }
      
      this.isDragging = false;
      this.mouseDownPos = null;
      this.extrudeStarted = false;
  }
  
  handleExtrudeMove(mouseX, mouseY, startX, startY) {
    const mouseDelta = new THREE.Vector2(mouseX - startX, mouseY - startY);
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
    
    let amount = 0;
    if (screenNormal.lengthSq() < 0.0001) {
        amount = -mouseDelta.y;
    } else {
        screenNormal.normalize();
        amount = mouseDelta.dot(screenNormal);
    }

    const distance = this.camera.position.distanceTo(centroidWorld);
    const scaleFactor = distance * 0.002; 
    
    this.currentExtrusionVector.copy(this.extrusionNormal).multiplyScalar(amount * scaleFactor);

    this.updateExtrudeInternal(this.currentExtrusionVector);
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
    vertexEditor.applyMeshData(this.beforeMeshData);
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
    let selectedVertexIds = Array.from(this.editSelection.selectedVertexIds);
    const selectedEdgeIds = Array.from(this.editSelection.selectedEdgeIds);
    const selectedFaceIds = Array.from(this.editSelection.selectedFaceIds);

    // Robustness: Ensure selectedVertexIds includes all vertices of selected faces
    if (mode === 'face') {
        const vSet = new Set(selectedVertexIds);
        for (const fId of selectedFaceIds) {
            const f = meshData.faces.get(fId);
            if (f) f.vertexIds.forEach(vid => vSet.add(vid));
        }
        selectedVertexIds = Array.from(vSet);
    }

    // Calculate normal and centroid for interaction
    if (mode === 'face' && selectedFaceIds.length > 0) {
        const vIds = [];
        const normalSum = new THREE.Vector3();
        
        selectedFaceIds.forEach(faceId => {
            const face = meshData.faces.get(faceId);
            if (face) {
                face.vertexIds.forEach(vid => vIds.push(vid));
                const n = calculateFaceNormal(meshData, face);
                normalSum.add(n);
            }
        });

        this.extrusionCentroid.copy(getCentroidFromVertices(vIds, meshData));
        
        if (normalSum.lengthSq() > 0.0001) {
            this.extrusionNormal.copy(normalSum.normalize());
        } else {
            // Fallback for balanced selections (e.g. ring, sphere) where sum is zero
            this.extrusionNormal.set(0, 1, 0); 
        }
    } else if (mode === 'edge' && selectedEdgeIds.length > 0) {
        const vIds = selectedEdgeIds.flatMap(edgeId => {
             const e = meshData.edges.get(edgeId);
             return e ? [e.v1Id, e.v2Id] : [];
        });
        const connectedFaceIds = Array.from(selectedEdgeIds.flatMap(edgeId => {
             const e = meshData.edges.get(edgeId);
             return e ? Array.from(e.faceIds) : [];
        }));
        this.extrusionCentroid.copy(getCentroidFromVertices(vIds, meshData));
        if (connectedFaceIds.length > 0) {
             const faceVIds = connectedFaceIds.flatMap(faceId => {
                 const face = meshData.faces.get(faceId);
                 return face ? Array.from(face.vertexIds) : [];
             });
             this.extrusionNormal.copy(calculateVertexIdsNormal(meshData, faceVIds));
        } else {
             this.extrusionNormal.set(0, 1, 0);
        }
    } else if (mode === 'vertex' && selectedVertexIds.length > 0) {
        this.extrusionCentroid.copy(getCentroidFromVertices(selectedVertexIds, meshData));
        const connectedFaceIds = Array.from(selectedVertexIds.flatMap(vId => {
            const vertex = meshData.vertices.get(vId);
            return vertex ? Array.from(vertex.faceIds) : [];
        }));
        if (connectedFaceIds.length > 0) {
             const faceVIds = connectedFaceIds.flatMap(faceId => {
                 const face = meshData.faces.get(faceId);
                 return face ? Array.from(face.vertexIds) : [];
             });
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

    // Nudge removed to prevent subdivision artifacts at 0 distance.
    // 0-area faces are handled safely by NormalCalculator (ignored).

    this.boundaryEdges = vertexEditor.getBoundaryEdges(
        meshData, 
        selectedVertexIds, 
        mode === 'edge' ? selectedEdgeIds : [], 
        mode === 'face' ? selectedFaceIds : []
    );

    // Recreate side faces
    for (let i = 0; i < this.boundaryEdges.length; i++) {
      const edge = this.boundaryEdges[i];
      if (!edge || !edge.faceIds) continue;

      const newEdge = meshData.getEdge(this.mappedVertexIds[edge.v1Id], this.mappedVertexIds[edge.v2Id]);

      if (!newEdge || !newEdge.faceIds) continue;

      const sideFaceVertexIds = [edge.v1Id, edge.v2Id, this.mappedVertexIds[edge.v2Id], this.mappedVertexIds[edge.v1Id]];

      const faceId = Array.from(newEdge.faceIds)[0];

      if (faceId !== undefined) {
        const face = meshData.faces.get(faceId);
        const nv1 = this.mappedVertexIds[edge.v1Id];
        const nv2 = this.mappedVertexIds[edge.v2Id];

        if (nv1 === undefined || nv2 === undefined) continue;

        // Robust topological check:
        // If the Cap Face goes nv1 -> nv2, then our Side Face (v1 -> v2 -> nv2 -> nv1)
        // produces a top edge (nv2 -> nv1) which opposes the Cap Face edge (nv1 -> nv2).
        // This is correct for manifold meshes.
        // So, if Aligned (nv1 -> nv2), do NOTHING.
        // If Opposed (nv2 -> nv1), REVERSE.

        const vIds = face.vertexIds;
        const idx1 = vIds.indexOf(nv1);
        
        // Check if nv2 follows nv1 (wrapping around)
        const isAligned = (vIds[(idx1 + 1) % vIds.length] === nv2);

        if (!isAligned) {
            sideFaceVertexIds.reverse();
        }
      } else {
        const oldFaceId = Array.from(edge.faceIds)[0];
        if (oldFaceId !== undefined) {
          const oldFace = meshData.faces.get(oldFaceId);
          if (oldFace) {
            const vIds = oldFace.vertexIds;
            const idx1 = vIds.indexOf(edge.v1Id);
            if (idx1 !== -1) {
              const idx2 = (idx1 + 1) % vIds.length;
              if (vIds[idx2] === edge.v2Id) {
                sideFaceVertexIds.reverse();
              }
            }
          }
        }
      }

      // Find the source face (from selection) to inherit material from
      let sourceFace = null;
      if (mode === 'face') {
        for (const fid of edge.faceIds) {
             if (selectedFaceIds.includes(fid)) {
                 sourceFace = meshData.faces.get(fid);
                 break;
             }
        }
      } else {
        // Fallback for non-face modes: just pick first face
        const fid = Array.from(edge.faceIds)[0];
        if (fid !== undefined) sourceFace = meshData.faces.get(fid);
      }

      const materialIndex = sourceFace ? sourceFace.materialIndex : 0;
      // UVs for side faces are complex to generate automatically without projection, keeping empty for now.

      vertexEditor.createFaceFromVertices(sideFaceVertexIds, [], materialIndex);
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