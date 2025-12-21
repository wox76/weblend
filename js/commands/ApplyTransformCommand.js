import * as THREE from 'three';
import { ShadingUtils } from '../utils/ShadingUtils.js';

export class ApplyTransformCommand {
  static type = 'ApplyTransformCommand';

  constructor(editor, objects = [], transformType = 'all') {
    this.editor = editor;
    this.objects = Array.isArray(objects) ? objects : [objects];
    this.transformType = transformType; // 'translate', 'rotate', 'scale', 'all'
    this.name = `Apply ${transformType}`;

    this.previousTransforms = [];
  }

  execute() {
    this.previousTransforms = [];

    this.objects.forEach(object => {
      if (!object.isMesh) return;

      // Save previous state
      this.previousTransforms.push({
        uuid: object.uuid,
        position: object.position.clone(),
        rotation: object.rotation.clone(),
        scale: object.scale.clone(),
        // We don't save geometry here, we'll reverse the operation on undo
      });

      const matrix = new THREE.Matrix4();
      
      // Calculate the matrix to apply to geometry
      if (this.transformType === 'translate' || this.transformType === 'all') {
        matrix.multiply(new THREE.Matrix4().makeTranslation(object.position.x, object.position.y, object.position.z));
        object.position.set(0, 0, 0);
      }

      if (this.transformType === 'rotate' || this.transformType === 'all') {
        matrix.multiply(new THREE.Matrix4().makeRotationFromEuler(object.rotation));
        object.rotation.set(0, 0, 0);
      }

      if (this.transformType === 'scale' || this.transformType === 'all') {
        matrix.multiply(new THREE.Matrix4().makeScale(object.scale.x, object.scale.y, object.scale.z));
        object.scale.set(1, 1, 1);
      }

      // Apply to Geometry
      object.geometry.applyMatrix4(matrix);
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();

      // Apply to MeshData if present
      if (object.userData.meshData) {
         const meshData = object.userData.meshData;
         // Apply to vertices
         for (const vertex of meshData.vertices.values()) {
             const v = new THREE.Vector3(vertex.position.x, vertex.position.y, vertex.position.z);
             v.applyMatrix4(matrix);
             vertex.position = { x: v.x, y: v.y, z: v.z };
         }
         // Re-generate geometry to ensure everything is in sync (normals, etc)
         // Actually applyMatrix4 on BufferGeometry does a good job, but MeshData is the source of truth for editing.
         // If we don't regenerate, the BufferGeometry and MeshData match in position, but we might want to ensure
         // consistency. Since we modified MeshData vertices in place, and BufferGeometry in place, they should match.
         // However, ApplyMatrix4 on BufferGeometry also transforms normals. MeshData doesn't store normals explicitly (calculated on fly).
      }
      
      object.updateMatrixWorld(true);
    });
    
    this.editor.signals.objectChanged.dispatch(this.objects[0]); // Dispatch for UI updates
  }

  undo() {
    this.previousTransforms.forEach(prev => {
      const object = this.editor.objectByUuid(prev.uuid);
      if (!object) return;

      const matrix = new THREE.Matrix4();
      
      // We need to apply the INVERSE of what we did.
      // Note: Matrix multiplication order matters. 
      // In execute: M = T * R * S
      // v' = M * v
      // To undo: v = M^-1 * v'
      
      // Re-construct the matrix used
      const appliedMatrix = new THREE.Matrix4();
       if (this.transformType === 'translate' || this.transformType === 'all') {
        appliedMatrix.multiply(new THREE.Matrix4().makeTranslation(prev.position.x, prev.position.y, prev.position.z));
      }
      if (this.transformType === 'rotate' || this.transformType === 'all') {
        appliedMatrix.multiply(new THREE.Matrix4().makeRotationFromEuler(prev.rotation));
      }
      if (this.transformType === 'scale' || this.transformType === 'all') {
        appliedMatrix.multiply(new THREE.Matrix4().makeScale(prev.scale.x, prev.scale.y, prev.scale.z));
      }

      const inverseMatrix = appliedMatrix.invert();

      // Apply inverse to Geometry
      object.geometry.applyMatrix4(inverseMatrix);
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();

      // Apply inverse to MeshData
      if (object.userData.meshData) {
         const meshData = object.userData.meshData;
         for (const vertex of meshData.vertices.values()) {
             const v = new THREE.Vector3(vertex.position.x, vertex.position.y, vertex.position.z);
             v.applyMatrix4(inverseMatrix);
             vertex.position = { x: v.x, y: v.y, z: v.z };
         }
      }

      // Restore transform properties
      object.position.copy(prev.position);
      object.rotation.copy(prev.rotation);
      object.scale.copy(prev.scale);
      object.updateMatrixWorld(true);
      
      this.editor.signals.objectChanged.dispatch(object);
    });
  }

  toJSON() {
    return {
      type: ApplyTransformCommand.type,
      objectUuids: this.objects.map(o => o.uuid),
      transformType: this.transformType,
      previousTransforms: this.previousTransforms.map(p => ({
          uuid: p.uuid,
          position: p.position.toArray(),
          rotation: p.rotation.toArray(), // Euler to array (x,y,z,order) but we probably just need x,y,z usually
          scale: p.scale.toArray()
      }))
    };
  }

  static fromJSON(editor, json) {
      if (!json || json.type !== ApplyTransformCommand.type) return null;
      const objects = json.objectUuids.map(uuid => editor.objectByUuid(uuid)).filter(o => o !== undefined);
      const cmd = new ApplyTransformCommand(editor, objects, json.transformType);
      
      // Restore previous state for undo if loaded from history stack (not fresh from JSON usually, but for consistency)
      if (json.previousTransforms) {
          cmd.previousTransforms = json.previousTransforms.map(p => ({
              uuid: p.uuid,
              position: new THREE.Vector3().fromArray(p.position),
              rotation: new THREE.Euler().fromArray(p.rotation),
              scale: new THREE.Vector3().fromArray(p.scale)
          }));
      }
      return cmd;
  }
}
