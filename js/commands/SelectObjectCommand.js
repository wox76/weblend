import * as THREE from 'three';

export class SelectObjectCommand {
  static type = 'SelectObjectCommand';

  constructor(editor, newSelection = []) {
    this.editor = editor;
    this.name = 'Select Object';
    
    this.newSelectionUuids = newSelection.map(o => o.uuid);
    this.oldSelectionUuids = editor.selection.selectedObjects.map(o => o.uuid);
  }

  execute() {
    this.editor.selection.setSelectionByUuids(this.newSelectionUuids);
  }

  undo() {
    this.editor.selection.setSelectionByUuids(this.oldSelectionUuids);
  }

  toJSON() {
    return {
      type: SelectObjectCommand.type,
      newSelectionUuids: this.newSelectionUuids,
      oldSelectionUuids: this.oldSelectionUuids
    };
  }

  static fromJSON(editor, json) {
    if (!json || json.type !== SelectObjectCommand.type) return null;
    
    // We pass empty array to constructor to avoid reading current selection state during restoration
    const cmd = new SelectObjectCommand(editor, []);
    cmd.newSelectionUuids = json.newSelectionUuids;
    cmd.oldSelectionUuids = json.oldSelectionUuids;
    
    return cmd;
  }
}