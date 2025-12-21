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
    this.initialMouseY = 0;

    // Extrude Settings (defaults from schema)
    this.depth = 0; 
    this.bevelThickness = 0;
    this.bevelSize = 0;
    this.bevelSegments = 3; 

    this.onModalMouseMoveHandler = this.onModalMouseMove.bind(this);
    this.onModalMouseUpHandler = this.onModalMouseUp.bind(this);
  }

  enable() {}

  disable() {
    this.cancelModalBevel();
  }

  startModalBevel() {
    if (this.isModalBeveling) return;
    
    if (this.editSelection.selectedFaceIds.size === 0) return;

    this.isModalBeveling = true;
    this.controls.enabled = false;
    this.initialMouseX = 0;
    this.initialMouseY = 0;
    this.depth = 0;
    this.bevelThickness = 0;
    this.bevelSize = 0;

    const object = this.editSelection.editedObject;
    if (!object || !object.userData.meshData) {
        this.cancelModalBevel();
        return;
    }

    this.beforeMeshData = MeshData.serializeMeshData(object.userData.meshData);
    
    this.selectedFacesData = [];
    const meshData = object.userData.meshData;

    for (const faceId of this.editSelection.selectedFaceIds) {
        const face = meshData.faces.get(faceId);
        if (!face) continue;

        const vertices = face.vertexIds.map(id => {
            const v = meshData.getVertex(id);
            return new THREE.Vector3(v.position.x, v.position.y, v.position.z);
        });

        if (vertices.length < 3) continue;

        const { shape, matrix } = this.computeFaceShapeAndTransform(vertices);
        this.selectedFacesData.push({
            faceId: faceId,
            shape: shape,
            matrix: matrix
        });
    }

    window.addEventListener('mousemove', this.onModalMouseMoveHandler);
    window.addEventListener('mouseup', this.onModalMouseUpHandler);
  }

  onModalMouseMove(event) {
    if (!this.isModalBeveling) return;

    if (this.initialMouseX === 0) {
      this.initialMouseX = event.clientX;
      this.initialMouseY = event.clientY;
      return;
    }

    const dx = event.clientX - this.initialMouseX;
    const dy = event.clientY - this.initialMouseY;
    
    this.depth = Math.max(0, -dy * 0.05); 
    this.bevelSize = Math.max(0, dx * 0.01);
    this.bevelThickness = this.bevelSize; 

    this.updateBevel();
  }

  updateBevel() {
    const object = this.editSelection.editedObject;
    const meshData = MeshData.deserializeMeshData(this.beforeMeshData);

    const extrudeSettings = {
        steps: 2,
        depth: this.depth,
        bevelEnabled: true,
        bevelThickness: this.bevelThickness,
        bevelSize: this.bevelSize,
        bevelOffset: -this.bevelSize, // Inset base to match hole after snap
        bevelSegments: this.bevelSegments
    };

    // Build spatial map for vertex merging
    const globalVertexMap = new Map();
    const posKey = (x, y, z) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    
    for (const v of meshData.vertices.values()) {
        globalVertexMap.set(posKey(v.position.x, v.position.y, v.position.z), v);
    }

    const facesToDelete = [];

    for (const data of this.selectedFacesData) {
        const geometry = new THREE.ExtrudeGeometry(data.shape, extrudeSettings);
        
        // Z-Clip: Remove Back Bevel (z < 0)
        this.clipBackBevel(geometry);
        
        const face = meshData.faces.get(data.faceId);
        const originalVerts = face ? face.vertexIds.map(id => meshData.getVertex(id)) : [];

        this.mergeGeometryToMeshData(meshData, geometry, data.matrix, globalVertexMap, posKey, originalVerts, this.bevelSize);

        if (face) facesToDelete.push(face);
    }

    facesToDelete.forEach(f => meshData.deleteFace(f));

    object.userData.meshData = meshData;
    const vertexEditor = new VertexEditor(this.editor, object);
    vertexEditor.updateGeometryAndHelpers();
    this.signals.objectChanged.dispatch();
  }

  onModalMouseUp() {
    this.confirmBevel();
  }

  confirmBevel() {
    if (!this.isModalBeveling) return;
    this.cleanupListeners();
    this.isModalBeveling = false;
    this.controls.enabled = true;

    const editedObject = this.editSelection.editedObject;
    const afterMeshData = MeshData.serializeMeshData(editedObject.userData.meshData);
    
    this.editor.execute(new BevelCommand(this.editor, editedObject, this.beforeMeshData, afterMeshData));
    
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
  }

  computeFaceShapeAndTransform(vertices) {
      const v0 = vertices[0];
      const v1 = vertices[1];
      const v2 = vertices[2];

      const ab = new THREE.Vector3().subVectors(v1, v0);
      const cb = new THREE.Vector3().subVectors(v2, v1);
      const normal = new THREE.Vector3().crossVectors(ab, cb).normalize();

      const xAxis = new THREE.Vector3().subVectors(v1, v0).normalize();
      const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

      const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, normal);
      matrix.setPosition(v0);

      const invMatrix = matrix.clone().invert();

      const shape = new THREE.Shape();
      vertices.forEach((v, i) => {
          const vec = v.clone().applyMatrix4(invMatrix);
          if (i === 0) shape.moveTo(vec.x, vec.y);
          else shape.lineTo(vec.x, vec.y);
      });
      shape.closePath();

      return { shape, matrix };
  }

  clipBackBevel(geometry) {
      const pos = geometry.attributes.position;
      const index = geometry.index;
      if (!index) return; // Assume indexed for ExtrudeGeometry

      const newIndices = [];
      const threshold = -0.0001; 

      for (let i = 0; i < index.count; i += 3) {
          const a = index.getX(i);
          const b = index.getX(i+1);
          const c = index.getX(i+2);
          
          const zA = pos.getZ(a);
          const zB = pos.getZ(b);
          const zC = pos.getZ(c);
          
          // Keep face only if ALL vertices are above threshold (z >= 0)
          // Or at least SOME?
          // Back bevel faces connect 0 to -Thick. They have some vertices < 0.
          // We want to remove them.
          if (zA > threshold && zB > threshold && zC > threshold) {
              newIndices.push(a, b, c);
          }
      }
      
      geometry.setIndex(newIndices);
  }

  mergeGeometryToMeshData(meshData, geometry, transformMatrix, globalVertexMap, posKey, originalVertices, bevelSize = 0) {
      const posAttr = geometry.attributes.position;
      const indexAttr = geometry.index;
      const bufferIndexToVertex = new Map();

      // Add Vertices with Merging
      for (let i = 0; i < posAttr.count; i++) {
          const localPt = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
          let worldPt = localPt.clone().applyMatrix4(transformMatrix);
          
          let v = null;
          
          // 1. Try snapping to original face boundary (Edges + Vertices)
          if (originalVertices && Math.abs(localPt.z) < 0.001) {
              const snapDistSq = (bevelSize * 1.5) ** 2; // Tolerance
              const threshold = (bevelSize > 0) ? snapDistSq : 0.00001;
              let bestDistSq = threshold;
              let bestPt = null;
              let bestV = null;

              // Check Vertices
              for (const origV of originalVertices) {
                  const d2 = (origV.position.x - worldPt.x)**2 + 
                             (origV.position.y - worldPt.y)**2 + 
                             (origV.position.z - worldPt.z)**2;
                  if (d2 < bestDistSq) {
                      bestDistSq = d2;
                      bestPt = origV.position;
                      bestV = origV;
                  }
              }

              // Check Edges if not snapped to vertex
              if (!bestV) {
                  const tempPt = new THREE.Vector3();
                  const target = new THREE.Vector3(worldPt.x, worldPt.y, worldPt.z);
                  
                  for (let j = 0; j < originalVertices.length; j++) {
                      const v1 = originalVertices[j].position;
                      const v2 = originalVertices[(j + 1) % originalVertices.length].position;
                      const line = new THREE.Line3(
                          new THREE.Vector3(v1.x, v1.y, v1.z), 
                          new THREE.Vector3(v2.x, v2.y, v2.z)
                      );
                      
                      line.closestPointToPoint(target, true, tempPt);
                      const d2 = tempPt.distanceToSquared(target);
                      
                      if (d2 < bestDistSq) {
                          bestDistSq = d2;
                          bestPt = tempPt.clone();
                          // Don't set bestV, it's on an edge
                      }
                  }
              }

              if (bestPt) {
                  worldPt.copy(bestPt); // Snap coordinate
                  v = bestV; // Use existing vertex ID if corner
              }
          }

          const key = posKey(worldPt.x, worldPt.y, worldPt.z);

          // 2. Try global hash map
          if (!v) {
              v = globalVertexMap.get(key);
          }
          
          // 3. Create new
          if (!v) {
              v = meshData.addVertex({ x: worldPt.x, y: worldPt.y, z: worldPt.z });
              globalVertexMap.set(key, v);
          }
          bufferIndexToVertex.set(i, v);
      }

      // Add Faces
      if (indexAttr) {
          for (let i = 0; i < indexAttr.count; i += 3) {
              const a = indexAttr.getX(i);
              const b = indexAttr.getX(i + 1);
              const c = indexAttr.getX(i + 2);
              
              const vA = bufferIndexToVertex.get(a);
              const vB = bufferIndexToVertex.get(b);
              const vC = bufferIndexToVertex.get(c);
              
              if (vA !== vB && vA !== vC && vB !== vC) {
                  meshData.addFace([vA, vB, vC]);
              }
          }
      } else {
          for (let i = 0; i < posAttr.count; i += 3) {
              const vA = bufferIndexToVertex.get(i);
              const vB = bufferIndexToVertex.get(i+1);
              const vC = bufferIndexToVertex.get(i+2);
              if (vA !== vB && vA !== vC && vB !== vC) {
                  meshData.addFace([vA, vB, vC]);
              }
          }
      }
  }
}