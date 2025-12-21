import * as THREE from 'three';
import { AddObjectCommand } from './AddObjectCommand.js';
import { RemoveObjectCommand } from './RemoveObjectCommand.js';
import { MeshData } from '../core/MeshData.js';
import { ShadingUtils } from '../utils/ShadingUtils.js';

export class JoinObjectsCommand {
  static type = 'JoinObjectsCommand';

  constructor(editor, objects = []) {
    this.editor = editor;
    this.objects = objects; 
    this.newObject = null;
    this.commands = [];
    this.name = 'Join Objects';
  }

  execute() {
    if (this.objects.length < 2) return;

    const meshes = this.objects.filter(obj => obj.isMesh);
    if (meshes.length < 2) return;

    // The active object is usually the last selected
    const activeObject = meshes[meshes.length - 1];
    const inverseActiveMatrix = activeObject.matrixWorld.clone().invert();
    
    // Create new combined MeshData
    const newMeshData = new MeshData();
    
    meshes.forEach(mesh => {
      const sourceMeshData = mesh.userData.meshData;
      if (!sourceMeshData) return; // Should not happen for editable objects

      // Calculate transform from mesh local to activeObject local
      const transformMatrix = new THREE.Matrix4();
      transformMatrix.multiplyMatrices(inverseActiveMatrix, mesh.matrixWorld);
      
      const vertexMap = new Map(); // oldId -> newId

      // 1. Add Vertices
      sourceMeshData.vertices.forEach(vertex => {
        const pos = new THREE.Vector3(vertex.position.x, vertex.position.y, vertex.position.z);
        pos.applyMatrix4(transformMatrix);
        
        const newVertex = newMeshData.addVertex({ x: pos.x, y: pos.y, z: pos.z });
        vertexMap.set(vertex.id, newVertex.id);
      });

      // 2. Add Faces
      sourceMeshData.faces.forEach(face => {
        const newVertexIds = face.vertexIds.map(vid => vertexMap.get(vid));
        // We need to resolve the actual vertex objects for addFace
        const newVertices = newVertexIds.map(vid => newMeshData.vertices.get(vid));
        
        const newFace = newMeshData.addFace(newVertices, face.uvs, face.materialIndex);
        // Note: Edge creation is handled automatically by addFace
      });
    });

    // Create Geometry from new MeshData
    // We use the shading mode of the active object
    const shading = activeObject.userData.shading || 'flat';
    const geometry = ShadingUtils.createGeometryWithShading(newMeshData, shading);
    
    this.newObject = new THREE.Mesh(geometry, activeObject.material);
    this.newObject.name = activeObject.name;
    this.newObject.position.copy(activeObject.position);
    this.newObject.rotation.copy(activeObject.rotation);
    this.newObject.scale.copy(activeObject.scale);
    
    // Copy userData but replace meshData
    this.newObject.userData = JSON.parse(JSON.stringify(activeObject.userData));
    this.newObject.userData.meshData = newMeshData;
    this.newObject.userData.shading = shading;

    // Execute sub-commands
    this.commands = [];
    
    // Remove original objects
    meshes.forEach(mesh => {
        const cmd = new RemoveObjectCommand(this.editor, mesh);
        cmd.execute();
        this.commands.push(cmd);
    });

    // Add new joined object
    const addCmd = new AddObjectCommand(this.editor, this.newObject);
    addCmd.execute();
    this.commands.push(addCmd);
    
    this.editor.selection.select(this.newObject);
  }

  undo() {
    for (let i = this.commands.length - 1; i >= 0; i--) {
        this.commands[i].undo();
    }
  }

  toJSON() {
     return {
         type: JoinObjectsCommand.type,
         objectUuids: this.objects.map(o => o.uuid)
     };
  }

  static fromJSON(editor, json) {
      const objects = json.objectUuids.map(uuid => editor.objectByUuid(uuid)).filter(o => o !== undefined);
      return new JoinObjectsCommand(editor, objects);
  }
}
