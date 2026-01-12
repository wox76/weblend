import { SwitchSubModeCommand } from '../commands/SwitchSubModeCommand.js';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { JoinObjectsCommand } from '../commands/JoinObjectsCommand.js';
import { MeshData } from '../core/MeshData.js';

export class KeyHandler {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.config = editor.config;
    this.selection = editor.selection;
    this.extruding = false;
    this.shortcuts = null;
    this.currentMode = 'object';
    this.mouse = { x: 0, y: 0 };
    this.lastAPressTime = 0;
    
    this.init();
    this.setupListeners();
  }

  async init() {
    await this.config.loadSettings();
    this.shortcuts = this.config.get('shortcuts');

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      this.signals.multiSelectChanged.dispatch(false);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
  }

  setupListeners() {
    this.signals.modeChanged.add((newMode) => {
      this.currentMode = newMode;
      this.extruding = false; // Reset extruding state on mode change
    });

    this.signals.modalExtrudeEnded.add(() => {
      this.extruding = false;
    });
  }

  onKeyDown(event) {
    if (event.defaultPrevented) return;

    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    if (event.key === 'Escape') {
      if (this.extruding) {
        this.editor.cancelExtrude();
        this.extruding = false;
        return;
      }

      if (this.editor.toolbar.isModalTransforming()) {
        return;
      }

      const activeTool = this.editor.toolbar.getActiveTool();
      if (activeTool === 'knife' && this.editor.toolbar.knifeTool.active && this.editor.toolbar.knifeTool.cutPoints.length > 0) {
          return;
      }
      if (activeTool === 'loopcut' && this.editor.toolbar.loopCutTool.active && this.editor.toolbar.loopCutTool.state !== 'idle') {
          return;
      }

      if (this.currentMode === 'object') {
        this.selection.deselect();
      } else {
        this.editor.editSelection.clearSelection();
      }
      return;
    }

    if (event.key === 'Enter' && this.extruding) {
      this.editor.confirmExtrude();
      this.extruding = false;
      return;
    }

    if (this.editor.toolbar.isModalTransforming() && !this.extruding) {
      return;
    }


    if (event.ctrlKey && event.key === this.shortcuts['undo']) {
      this.editor.undo();
    } else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === this.shortcuts['undo']) {
      this.editor.redo();
    } else if (event.key === 'w') {
      this.editor.toolbar.setActiveTool('select');
    } else if (event.key.toLowerCase() === 'z' && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      this.editor.shadingMenu.show(this.mouse.x, this.mouse.y);
    } else if (event.key === this.shortcuts['translate'] && !event.ctrlKey) {
      if (this.extruding) this.editor.confirmExtrude();
      this.editor.toolbar.setActiveTool('move');
      this.editor.toolbar.moveTool.startModal();
    } else if (event.key === this.shortcuts['rotate'] && !event.ctrlKey) {
      if (this.extruding) this.editor.confirmExtrude();
      this.editor.toolbar.setActiveTool('rotate');
      this.editor.toolbar.rotateTool.startModal();
    } else if (event.key === this.shortcuts['scale'] && !event.ctrlKey) {
      if (this.extruding) {
          this.editor.toolbar.extrudeTool.resetExtrusion();
          this.editor.confirmExtrude();
      }
      this.editor.toolbar.setActiveTool('scale');
      this.editor.toolbar.scaleTool.startModal();
    } else if (event.shiftKey && event.key === 'F12') {
      event.preventDefault();
      this.signals.renderImage.dispatch();
    } else if (event.key === 'Shift') {
      this.signals.multiSelectChanged.dispatch(true);
    }

    if (this.currentMode === 'object') {
      if (event.key.toLowerCase() === 'a') {
         const now = Date.now();
         const isDoubleTap = (now - this.lastAPressTime < 300);
         this.lastAPressTime = now;

         if (isDoubleTap && !event.shiftKey && !event.ctrlKey && !event.altKey) {
             this.selection.deselect();
         } else if (event.altKey) {
             this.selection.deselect();
         } else if (!event.shiftKey && !event.ctrlKey) {
             this.selection.selectAll();
         } else if (event.shiftKey) {
             this.editor.addMenu.show(this.mouse.x, this.mouse.y);
         } else if (event.ctrlKey) {
             this.editor.applyMenu.show(this.mouse.x, this.mouse.y);
         }
      } else if (event.ctrlKey && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        const selected = this.editor.selection.selectedObjects;
        if (selected.length > 1) {
             this.editor.execute(new JoinObjectsCommand(this.editor, selected));
        }
      } else if (event.key.toLowerCase() === 'i' && event.ctrlKey) {
          this.selection.invert();
      } else if (event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        const objects = this.selection.selectedObjects;
        if (objects && objects.length > 0) {
          objects.forEach(object => {
            const clone = object.clone();
            
            // Deep clone MeshData to ensure independence
            if (object.userData.meshData) {
                const serialized = MeshData.serializeMeshData(object.userData.meshData);
                clone.userData.meshData = MeshData.deserializeMeshData(serialized);
            }
            
            // Ensure unique geometry and material references
            if (clone.geometry) {
                clone.geometry = clone.geometry.clone();
            }
            if (clone.material) {
                // If array, clone array. If single, clone single.
                if (Array.isArray(clone.material)) {
                    clone.material = clone.material.map(m => m.clone());
                } else {
                    clone.material = clone.material.clone();
                }
            }

            this.editor.execute(new AddObjectCommand(this.editor, clone));
          });
        }
      } else if (event.key === 'Delete' || event.key.toLowerCase() === 'x') {
        this.signals.objectDeleted.dispatch();
      } else if (event.shiftKey && event.key.toLowerCase() === this.shortcuts['focus']) {
        this.signals.objectFocused.dispatch();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
        } 
        this.signals.switchMode.dispatch('edit');
      }
    } else if (this.currentMode === 'edit') {
      if (this.extruding) return;
      
      if (event.key === 'w') {
        this.editor.toolbar.setActiveTool('select');
      } else if (event.key.toLowerCase() === 'a') {
          const now = Date.now();
          const isDoubleTap = (now - this.lastAPressTime < 300);
          this.lastAPressTime = now;

          if (isDoubleTap && !event.shiftKey && !event.ctrlKey && !event.altKey) {
              this.editor.editSelection.clearSelection();
          } else if (event.altKey) {
              this.editor.editSelection.clearSelection();
          } else if (!event.shiftKey && !event.ctrlKey) {
              this.editor.editSelection.selectAll();
          }
      } else if (event.key.toLowerCase() === 'i' && event.ctrlKey) {
          this.editor.editSelection.invert();
      } else if (event.key === 'f') {
        this.signals.createFaceFromVertices.dispatch();
      } else if (event.key === 'Delete' || event.key.toLowerCase() === 'x') {
        this.signals.deleteSelectedFaces.dispatch();
      } else if (event.key.toLowerCase() === 'm') {
        this.editor.mergeMenu.show(this.mouse.x, this.mouse.y);
      } else if (event.key === 'p') {
        this.signals.separateSelection.dispatch();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
        }
        this.signals.switchMode.dispatch('object');
      } else if (event.key === 'e') {
        if (this.editor.editSelection.selectedVertexIds.size > 0 || this.editor.editSelection.selectedEdgeIds.size > 0 || this.editor.editSelection.selectedFaceIds.size > 0) {
          this.editor.startModalExtrude();
          this.extruding = true;
        }
      } else if (event.ctrlKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        this.editor.toolbar.setActiveTool('loopcut');
      } else if (event.ctrlKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        this.editor.toolbar.setActiveTool('bevel');
        this.editor.startModalBevel();
      } else if (event.key === 'k') {
        this.editor.toolbar.setActiveTool('knife');
      } else if (event.key === '1') {
        const current = this.editor.editSelection.subSelectionMode;
        if (current !== 'vertex') {
          this.editor.execute(new SwitchSubModeCommand(this.editor, 'vertex', current));
        }
      } else if (event.key === '2') {
        const current = this.editor.editSelection.subSelectionMode;
        if (current !== 'edge') {
          this.editor.execute(new SwitchSubModeCommand(this.editor, 'edge', current));
        }
      } else if (event.key === '3') {
        const current = this.editor.editSelection.subSelectionMode;
        if (current !== 'face') {
          this.editor.execute(new SwitchSubModeCommand(this.editor, 'face', current));
        }
      }
    } 
  }

  onKeyUp(event) {
    if (event.key === 'Shift') {
      this.signals.multiSelectChanged.dispatch(false);
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
  }
}