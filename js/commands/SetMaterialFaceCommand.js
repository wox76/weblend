import { MeshDataCommand } from './MeshDataCommand.js';
import { MeshData } from '../core/MeshData.js';

export class SetMaterialFaceCommand extends MeshDataCommand {
  static type = 'SetMaterialFaceCommand';

  constructor(editor, object, faceIds, materialIndex) {
    super(editor, object, null, null, 'Assign Material');
    this.faceIds = faceIds; // Iterable of face IDs
    this.materialIndex = materialIndex;
  }

  execute() {
    if (!this.beforeMeshData) {
      const object = this.editor.objectByUuid(this.objectUuid);
      if (object && object.userData.meshData) {
        this.beforeMeshData = MeshData.serializeMeshData(object.userData.meshData);
        
        // Create After State
        const newMeshData = MeshData.deserializeMeshData(this.beforeMeshData);
        
        for (const faceId of this.faceIds) {
          const face = newMeshData.faces.get(faceId);
          if (face) {
            face.materialIndex = this.materialIndex;
          }
        }
        
        this.afterMeshData = MeshData.serializeMeshData(newMeshData);
      }
    }
    
    super.execute();
  }
  
  static fromJSON(editor, json) {
      const cmd = super.fromJSON(editor, json);
      // We don't serialize faceIds/materialIndex because before/afterMeshData captures the result.
      return cmd;
  }
}