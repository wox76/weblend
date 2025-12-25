export class UpdateModifierCommand {
  static type = 'UpdateModifierCommand';

  constructor(editor, object, modifierId, propertyName, newValue) {
    this.editor = editor;
    this.name = `Update Modifier: ${propertyName}`;
    this.objectUuid = object.uuid;
    this.modifierId = modifierId;
    this.propertyName = propertyName;
    this.newValue = newValue;
    
    this.oldValue = null;
  }

  execute() {
    const object = this.editor.objectByUuid(this.objectUuid);
    if (!object || !object.userData.modifiers) return;

    const modifier = object.userData.modifiers.find(mod => mod.id === this.modifierId);
    if (modifier) {
      if (this.propertyName === 'enabled' || this.propertyName === 'showInEditMode' || this.propertyName === 'showInRender' || this.propertyName === 'name') {
        this.oldValue = modifier[this.propertyName];
        modifier[this.propertyName] = this.newValue;
      } else { // Properties inside 'properties' object
        if (!modifier.properties) modifier.properties = {};
        this.oldValue = modifier.properties[this.propertyName];
        modifier.properties[this.propertyName] = this.newValue;
      }
      this.editor.signals.objectChanged.dispatch(object);
    }
  }

  undo() {
    const object = this.editor.objectByUuid(this.objectUuid);
    if (!object || !object.userData.modifiers) return;

    const modifier = object.userData.modifiers.find(mod => mod.id === this.modifierId);
    if (modifier) {
      if (this.propertyName === 'enabled' || this.propertyName === 'showInEditMode' || this.propertyName === 'showInRender' || this.propertyName === 'name') {
        modifier[this.propertyName] = this.oldValue;
      } else {
        if (!modifier.properties) modifier.properties = {}; // Should exist if oldValue was set
        modifier.properties[this.propertyName] = this.oldValue;
      }
      this.editor.signals.objectChanged.dispatch(object);
    }
  }

  toJSON() {
    return {
      type: UpdateModifierCommand.type,
      objectUuid: this.objectUuid,
      modifierId: this.modifierId,
      propertyName: this.propertyName,
      newValue: this.newValue,
      oldValue: this.oldValue
    };
  }

  static fromJSON(editor, json) {
    const command = new UpdateModifierCommand(editor, null, json.modifierId, json.propertyName, json.newValue);
    command.objectUuid = json.objectUuid;
    command.oldValue = json.oldValue;
    return command;
  }
}
