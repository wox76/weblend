import * as THREE from 'three';
import { RemoveObjectCommand } from "../commands/RemoveObjectCommand.js";
import { VertexEditor } from './VertexEditor.js';

export class ObjectEditDispatcher {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.selection = editor.selection;
    this.controlsManager = editor.controlsManager;
    this.editSelection = editor.editSelection;

    this.setupListeners();
  }

  setupListeners() {
    this.signals.objectDeleted.add(() => {
      const objects = this.selection.selectedObjects;
      if (!objects || objects.length === 0) return;
      objects.forEach(obj => {
        this.editor.execute(new RemoveObjectCommand(this.editor, obj));
      })
    });

    this.signals.objectFocused.add(() => {
      const objects = this.selection.selectedObjects;
      if (!objects || objects.length === 0) return;
      this.controlsManager.focus(objects);
    });

    this.signals.objectChanged.add((object) => {
        if (!object) return;

        // If object has modifiers (even empty list, meaning modifiers were supported/used), 
        // we must regenerate geometry to reflect changes (e.g. removal of last modifier).
        if (object.userData.modifiers) {
             const vertexEditor = new VertexEditor(this.editor, object);
             vertexEditor.updateGeometryAndHelpers();
        } else if (this.editSelection.editedObject === object) {
            // Also update if it IS the edited object (even if no modifiers, maybe meshData changed?)
            // updateGeometryAndHelpers handles meshData->Geometry conversion.
            const vertexEditor = new VertexEditor(this.editor, object);
            vertexEditor.updateGeometryAndHelpers();
        }
    });
  }
}