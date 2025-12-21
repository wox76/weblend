export class RemoveModifierCommand {
  static type = 'RemoveModifierCommand';

  constructor(editor, object, modifierId) {
    this.editor = editor;
    this.name = 'Remove Modifier';
    this.objectUuid = object.uuid;
    this.modifierId = modifierId;
    
    this.oldModifiers = null;
    this.removedModifier = null;
  }

  execute() {
    const object = this.editor.objectByUuid(this.objectUuid);
    if (!object || !object.userData.modifiers) return;

    this.oldModifiers = structuredClone(object.userData.modifiers);
    const index = object.userData.modifiers.findIndex(mod => mod.id === this.modifierId);

    if (index !== -1) {
      this.removedModifier = object.userData.modifiers.splice(index, 1)[0];
      this.editor.signals.objectChanged.dispatch(object);
    }
  }

  undo() {
    const object = this.editor.objectByUuid(this.objectUuid);
    if (!object) return;

    object.userData.modifiers = structuredClone(this.oldModifiers);
    this.editor.signals.objectChanged.dispatch(object);
  }

  toJSON() {
    return {
      type: RemoveModifierCommand.type,
      objectUuid: this.objectUuid,
      modifierId: this.modifierId,
      oldModifiers: this.oldModifiers,
      removedModifier: this.removedModifier
    };
  }

  static fromJSON(editor, json) {
    const command = new RemoveModifierCommand(editor, null, json.modifierId);
    command.objectUuid = json.objectUuid;
    command.oldModifiers = json.oldModifiers;
    command.removedModifier = json.removedModifier;
    return command;
  }
}
