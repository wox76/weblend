export class SelectSubObjectCommand {
  static type = 'SelectSubObjectCommand';

  constructor(editor, mode, newSelection = []) {
    this.editor = editor;
    this.name = 'Select Sub-Object';
    
    this.mode = mode; // 'vertex', 'edge', 'face'
    this.newSelectionIds = [...newSelection];
    
    if (editor.editSelection) {
        if (mode === 'vertex') {
            this.oldSelectionIds = Array.from(editor.editSelection.selectedVertexIds);
        } else if (mode === 'edge') {
            this.oldSelectionIds = Array.from(editor.editSelection.selectedEdgeIds);
        } else if (mode === 'face') {
            this.oldSelectionIds = Array.from(editor.editSelection.selectedFaceIds);
        }
    } else {
        this.oldSelectionIds = [];
    }
  }

  execute() {
    if (this.mode === 'vertex') {
        this.editor.editSelection.setVertexSelection(this.newSelectionIds);
    } else if (this.mode === 'edge') {
        this.editor.editSelection.setEdgeSelection(this.newSelectionIds);
    } else if (this.mode === 'face') {
        this.editor.editSelection.setFaceSelection(this.newSelectionIds);
    }
  }

  undo() {
    if (this.mode === 'vertex') {
        this.editor.editSelection.setVertexSelection(this.oldSelectionIds);
    } else if (this.mode === 'edge') {
        this.editor.editSelection.setEdgeSelection(this.oldSelectionIds);
    } else if (this.mode === 'face') {
        this.editor.editSelection.setFaceSelection(this.oldSelectionIds);
    }
  }

  toJSON() {
    return {
      type: SelectSubObjectCommand.type,
      mode: this.mode,
      newSelectionIds: this.newSelectionIds,
      oldSelectionIds: this.oldSelectionIds
    };
  }

  static fromJSON(editor, json) {
      if (!json || json.type !== SelectSubObjectCommand.type) return null;

      const cmd = new SelectSubObjectCommand(editor, json.mode, []);
      cmd.newSelectionIds = json.newSelectionIds;
      cmd.oldSelectionIds = json.oldSelectionIds;

      return cmd;
  }
}