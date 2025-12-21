import * as THREE from 'three';
import { BevelCommand } from '../commands/BevelCommand.js';
import { VertexEditor } from './VertexEditor.js';
import { MeshData } from '../core/MeshData.js';

export class BevelTool {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.editSelection = editor.editSelection;
    this.controls = editor.controlsManager;

    this.isModalBeveling = false;
    this.initialMouseX = 0;
    this.bevelSize = 0;
    this.segments = 1;

    this.onModalMouseMoveHandler = this.onModalMouseMove.bind(this);
    this.onModalMouseUpHandler = this.onModalMouseUp.bind(this);
    this.onModalWheelHandler = this.onModalWheel.bind(this);
  }

  enable() {}

  disable() {
    this.cancelModalBevel();
  }

  startModalBevel() {
    if (this.isModalBeveling) return;
    
    // Check if we have selected faces. ExtrudeGeometry works best with Shapes (Faces).
    if (this.editSelection.selectedFaceIds.size === 0) return;

    this.isModalBeveling = true;
    this.initialMouseX = 0;
    this.bevelSize = 0;
    this.segments = 1;

    this.controls.enabled = false;

    const editedObject = this.editSelection.editedObject;
    if (editedObject && editedObject.userData.meshData) {
      this.beforeMeshData = MeshData.serializeMeshData(editedObject.userData.meshData);
    }

    window.addEventListener('mousemove', this.onModalMouseMoveHandler);
    window.addEventListener('mouseup', this.onModalMouseUpHandler);
    window.addEventListener('wheel', this.onModalWheelHandler, { passive: false });
  }

  onModalMouseMove(event) {
    if (!this.isModalBeveling) return;

    if (this.initialMouseX === 0) {
      this.initialMouseX = event.clientX;
      return;
    }

    const deltaX = event.clientX - this.initialMouseX;
    // Scale sensitivity as needed (reduced to 0.005 for finer control)
    this.bevelSize = deltaX * 0.005;

    this.updateBevel();
  }

  onModalWheel(event) {
    if (!this.isModalBeveling) return;
    event.preventDefault();

    if (event.deltaY < 0) this.segments++;
    else this.segments = Math.max(1, this.segments - 1);

    this.updateBevel();
  }

  updateBevel() {
    if (!this.beforeMeshData) return;

    const editedObject = this.editSelection.editedObject;
    // Reset to initial state before re-applying
    const freshMeshData = MeshData.deserializeMeshData(this.beforeMeshData);
    editedObject.userData.meshData = freshMeshData;

    if (Math.abs(this.bevelSize) > 0.00001) {
      this.applyBevel(freshMeshData, this.editSelection.selectedFaceIds, this.bevelSize, this.segments);
    }

    const vertexEditor = new VertexEditor(this.editor, editedObject);
    vertexEditor.updateGeometryAndHelpers();
    this.signals.objectChanged.dispatch();
  }

  applyBevel(meshData, selectedFaceIds, size, segments) {
    const facesToProcess = Array.from(selectedFaceIds);
    const facesToRemove = [];

    for (const faceId of facesToProcess) {
        const face = meshData.faces.get(faceId);
        if (!face) continue;

        const originalVertexIds = face.vertexIds;
        const originalVertices = originalVertexIds.map(id => meshData.getVertex(id));
        
        // 1. Create Coordinate System
        const v0 = originalVertices[0].position;
        const v1 = originalVertices[1].position;
        const v2 = originalVertices[2].position;
        
        const ab = new THREE.Vector3().subVectors(v1, v0);
        const ac = new THREE.Vector3().subVectors(v2, v0);
        const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
        
        const center = new THREE.Vector3();
        originalVertices.forEach(v => center.add(v.position));
        center.divideScalar(originalVertices.length);

        const zAxis = normal.clone();
        let xAxis = new THREE.Vector3(1, 0, 0);
        if (Math.abs(zAxis.dot(xAxis)) > 0.9) xAxis.set(0, 1, 0);
        xAxis.cross(zAxis).normalize();
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

        const worldToLocal = (vec) => {
            const rel = new THREE.Vector3().subVectors(vec, center);
            return new THREE.Vector2(rel.dot(xAxis), rel.dot(yAxis));
        };

        const localToWorld = (vec2, z = 0) => {
            return new THREE.Vector3()
                .addScaledVector(xAxis, vec2.x)
                .addScaledVector(yAxis, vec2.y)
                .addScaledVector(zAxis, z)
                .add(center);
        };

        // 2. Create Shape
        const shapePoints = originalVertices.map(v => worldToLocal(v.position));
        const shape = new THREE.Shape(shapePoints);

        // 3. Extrude
        // We keep ALL vertices but squash the Back Bevel (Z < 0) to the Original Face (Z=0).
        const magnitude = Math.abs(size);
        if (magnitude < 0.00001) continue;

        const options = {
            depth: 0, 
            bevelEnabled: true,
            bevelThickness: magnitude, 
            bevelSize: size, 
            bevelSegments: segments,
            curveSegments: 1 
        };

        const geometry = new THREE.ExtrudeGeometry(shape, options);
        
        const posAttr = geometry.attributes.position;
        const indexAttr = geometry.index;
        
        if (!posAttr) continue;

        const newVertexMapping = new Map(); // geometryIndex -> meshDataVertexId
        const zTolerance = 0.001; 

        for (let i = 0; i < posAttr.count; i++) {
            const lz = posAttr.getZ(i);
            const lx = posAttr.getX(i);
            const ly = posAttr.getY(i);
            
            // Squash Back Bevel (Z < 0) to Original Face
            if (lz < zTolerance) {
                let bestId = null;
                let minDistSq = Infinity;
                
                for (let k = 0; k < shapePoints.length; k++) {
                    const sp = shapePoints[k];
                    const dx = lx - sp.x;
                    const dy = ly - sp.y;
                    const dSq = dx*dx + dy*dy;
                    if (dSq < minDistSq) {
                        minDistSq = dSq;
                        bestId = originalVertices[k].id;
                    }
                }
                
                if (bestId !== null) {
                    newVertexMapping.set(i, bestId);
                    continue; 
                }
            }

            // Create new vertex for Z > 0
            const worldPos = localToWorld(new THREE.Vector2(lx, ly), lz);
            const newV = meshData.addVertex({ x: worldPos.x, y: worldPos.y, z: worldPos.z });
            newVertexMapping.set(i, newV.id);
        }

        // Add Faces
        const addFaceSafe = (i1, i2, i3) => {
            const vId1 = newVertexMapping.get(i1);
            const vId2 = newVertexMapping.get(i2);
            const vId3 = newVertexMapping.get(i3);
            
            if (vId1 === undefined || vId2 === undefined || vId3 === undefined) return;

            // Skip Base Cap faces (formed entirely by original vertices)
            const isBaseCap = 
                originalVertexIds.includes(vId1) && 
                originalVertexIds.includes(vId2) && 
                originalVertexIds.includes(vId3);

            if (!isBaseCap) {
                if (vId1 !== vId2 && vId2 !== vId3 && vId1 !== vId3) {
                     meshData.addFace([
                         meshData.getVertex(vId1), 
                         meshData.getVertex(vId2), 
                         meshData.getVertex(vId3)
                     ]);
                }
            }
        };

        if (indexAttr) {
            for (let i = 0; i < indexAttr.count; i += 3) {
                addFaceSafe(indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2));
            }
        } else {
             for (let i = 0; i < posAttr.count; i += 3) {
                addFaceSafe(i, i + 1, i + 2);
             }
        }

        facesToRemove.push(face);
    }

    facesToRemove.forEach(f => meshData.deleteFace(f));
  }

  onModalMouseUp() {
    this.confirmBevel();
  }

  confirmBevel() {
    if (!this.isModalBeveling) return;
    this.cleanupListeners();
    this.isModalBeveling = false;
    this.controls.enabled = true;
    if (Math.abs(this.bevelSize) > 0.00001) {
      const editedObject = this.editSelection.editedObject;
      const afterMeshData = MeshData.serializeMeshData(editedObject.userData.meshData);
      this.editor.execute(new BevelCommand(this.editor, editedObject, this.beforeMeshData, afterMeshData));
    }
    this.signals.modalBevelEnded.dispatch();
    this.signals.objectChanged.dispatch();
  }

  cancelModalBevel() {
    if (!this.isModalBeveling) return;
    this.cleanupListeners();
    this.isModalBeveling = false;
    this.controls.enabled = true;
    const editedObject = this.editSelection.editedObject;
    if (editedObject && this.beforeMeshData) {
      editedObject.userData.meshData = MeshData.deserializeMeshData(this.beforeMeshData);
      const vertexEditor = new VertexEditor(this.editor, editedObject);
      vertexEditor.updateGeometryAndHelpers();
    }
    this.signals.modalBevelEnded.dispatch();
    this.signals.objectChanged.dispatch();
  }

  cleanupListeners() {
    window.removeEventListener('mousemove', this.onModalMouseMoveHandler);
    window.removeEventListener('mouseup', this.onModalMouseUpHandler);
    window.removeEventListener('wheel', this.onModalWheelHandler);
  }
}