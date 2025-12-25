export class MoveModifierCommand {
  static type = 'MoveModifierCommand';

  constructor(editor, object, oldIndex, newIndex) {
    this.editor = editor;
    this.name = 'Move Modifier';
    this.objectUuid = object.uuid;
    this.oldIndex = oldIndex;
    this.newIndex = newIndex;
  }

  execute() {
    const object = this.editor.objectByUuid(this.objectUuid);
    if (!object || !object.userData.modifiers) return;

    const modifiers = object.userData.modifiers;
    
    if (this.oldIndex < 0 || this.oldIndex >= modifiers.length || 
        this.newIndex < 0 || this.newIndex >= modifiers.length) return;

    const element = modifiers[this.oldIndex];
    modifiers.splice(this.oldIndex, 1);
    modifiers.splice(this.newIndex, 0, element);

    this.editor.signals.objectChanged.dispatch(object);
  }

  undo() {
    const object = this.editor.objectByUuid(this.objectUuid);
    if (!object || !object.userData.modifiers) return;

    const modifiers = object.userData.modifiers;

    // Reverse the move: move from newIndex back to oldIndex
    const element = modifiers[this.newIndex];
    modifiers.splice(this.newIndex, 1);
    modifiers.splice(this.oldIndex, 0, element);

    this.editor.signals.objectChanged.dispatch(object);
  }

  toJSON() {
    return {
      type: MoveModifierCommand.type,
      objectUuid: this.objectUuid,
      oldIndex: this.oldIndex,
      newIndex: this.newIndex
    };
  }

  static fromJSON(editor, json) {
    return new MoveModifierCommand(editor, { uuid: json.objectUuid }, json.oldIndex, json.newIndex);
  }
}
