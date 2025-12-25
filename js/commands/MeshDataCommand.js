import { VertexEditor } from '../tools/VertexEditor.js';

export class MeshDataCommand {
  /**
   * @param {Editor} editor
   * @param {THREE.Object3D|null} object
   * @param {object|null} beforeMeshData
   * @param {object|null} afterMeshData
   * @param {string} name
   * @constructor
   */
  constructor(editor, object, beforeMeshData, afterMeshData, name = 'MeshDataCommand') {
    this.editor = editor;
    this.name = name;
    this.objectUuid = object ? object.uuid : null;

    this.beforeMeshData = beforeMeshData ? structuredClone(beforeMeshData) : null;
    this.afterMeshData = afterMeshData ? structuredClone(afterMeshData) : null;
  }

  execute() {
    console.log('MeshDataCommand: execute() called for object', this.objectUuid); // LOG
    this.applyMeshData(this.afterMeshData);
  }

  undo() {
    console.log('MeshDataCommand: undo() called for object', this.objectUuid); // LOG
    this.applyMeshData(this.beforeMeshData);
  }

  applyMeshData(meshData) {
    const object = this.editor.objectByUuid(this.objectUuid);
    console.log('MeshDataCommand: applyMeshData for object:', object?.name, 'with meshData:', meshData); // LOG 
    if (!object || !meshData) {
      console.warn('MeshDataCommand: applyMeshData - object or meshData missing!', object, meshData); // LOG
      return;
    }

    const vertexEditor = new VertexEditor(this.editor, object);
    console.log('MeshDataCommand: vertexEditor created for object:', object.name); // LOG
    vertexEditor.applyMeshData(meshData);
    console.log('MeshDataCommand: vertexEditor.applyMeshData(meshData) called.'); // LOG
    vertexEditor.updateGeometryAndHelpers();
    console.log('MeshDataCommand: vertexEditor.updateGeometryAndHelpers() called.'); // LOG
  }

  toJSON() {
    return {
      type: this.constructor.type,
      objectUuid: this.objectUuid,
      beforeMeshData: this.beforeMeshData,
      afterMeshData: this.afterMeshData,
    };
  }

  static fromJSON(editor, json) {
    if (!json || json.type !== this.type) return null;

    const command = new this(editor);
    command.objectUuid = json.objectUuid;
    command.beforeMeshData = json.beforeMeshData;
    command.afterMeshData = json.afterMeshData;
    return command;
  }
}
