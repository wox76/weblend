import * as THREE from 'three';

export class SetMaterialValueCommand {
  static type = 'SetMaterialValueCommand';

  /**
   * @param {Editor} editor
   * @param {THREE.Object3D|null} object
   * @param {string} attributeName
   * @param {any} newValue
   * @param {number} materialIndex
   */
  constructor(editor, object = null, attributeName = '', newValue = null, materialIndex = -1) {
    this.editor = editor;
    this.name = `Set Material Value: ${attributeName}`;
    
    this.attributeName = attributeName;
    this.objectUuid = object ? object.uuid : null;
    this.materialIndex = materialIndex;
    
    const material = this.getMaterial(object);
    this.oldValue = material?.[attributeName] ?? null;
    this.newValue = newValue;
  }

  getMaterial(object) {
      if (!object) return null;
      if (Array.isArray(object.material)) {
          if (this.materialIndex >= 0 && this.materialIndex < object.material.length) {
              return object.material[this.materialIndex];
          }
          return object.material[0]; // Default to first if index invalid/missing
      }
      return object.material;
  }

  execute() {
    const object = this.editor.objectByUuid(this.objectUuid);
    const material = this.getMaterial(object);
    
    if (!material) return;

    material[this.attributeName] = this.newValue;
    material.needsUpdate = true;
    this.editor.signals.objectChanged.dispatch();
  }

  undo() {
    const object = this.editor.objectByUuid(this.objectUuid);
    const material = this.getMaterial(object);
    
    if (!material) return;

    material[this.attributeName] = this.oldValue;
    material.needsUpdate = true;
    this.editor.signals.objectChanged.dispatch();
  }

  toJSON() {
    return {
      type: SetMaterialValueCommand.type,
      objectUuid: this.objectUuid,
      attributeName: this.attributeName,
      oldValue: this.oldValue,
      newValue: this.newValue,
      materialIndex: this.materialIndex
    };
  }

  static fromJSON(editor, json) {
    if (!json || json.type !== SetMaterialValueCommand.type) return null;

    const command = new SetMaterialValueCommand(editor, null, json.attributeName, json.newValue, json.materialIndex);

    command.objectUuid = json.objectUuid;
    command.oldValue = json.oldValue;

    return command;
  }
}
