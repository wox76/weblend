import * as THREE from 'three'; // For UUID generation

export class AddModifierCommand {
  static type = 'AddModifierCommand';

  constructor(editor, object, modifierType, modifierProperties, name) {
    this.editor = editor;
    this.name = `Add Modifier: ${modifierType}`;
    this.objectUuid = object.uuid;
    this.modifierType = modifierType;
    this.modifierProperties = modifierProperties; // Default properties for the modifier
    this.modifierName = name || modifierType; // Store the custom name
    
    this.newModifierId = THREE.MathUtils.generateUUID(); // Unique ID for this modifier instance
    this.oldModifiers = null; // To store state for undo
  }

  execute() {
    const object = this.editor.objectByUuid(this.objectUuid);
    if (!object) return;

    if (!object.userData.modifiers) {
      object.userData.modifiers = [];
    }

    this.oldModifiers = structuredClone(object.userData.modifiers);

    const newModifier = {
      id: this.newModifierId,
      name: this.modifierName, // Persist the name
      type: this.modifierType,
      enabled: true, // Default to enabled
      showInEditMode: true,
      showInRender: true,
      properties: structuredClone(this.modifierProperties)
    };

    object.userData.modifiers.push(newModifier);
    this.editor.signals.objectChanged.dispatch(object);
  }

  undo() {
    const object = this.editor.objectByUuid(this.objectUuid);
    if (!object) return;

    object.userData.modifiers = structuredClone(this.oldModifiers);
    this.editor.signals.objectChanged.dispatch(object);
  }

  toJSON() {
    return {
      type: AddModifierCommand.type,
      objectUuid: this.objectUuid,
      modifierType: this.modifierType,
      modifierProperties: this.modifierProperties,
      modifierName: this.modifierName,
      newModifierId: this.newModifierId,
      oldModifiers: this.oldModifiers
    };
  }

  static fromJSON(editor, json) {
    const command = new AddModifierCommand(editor, null, json.modifierType, json.modifierProperties, json.modifierName);
    command.objectUuid = json.objectUuid;
    command.newModifierId = json.newModifierId;
    command.oldModifiers = json.oldModifiers;
    return command;
  }
}
