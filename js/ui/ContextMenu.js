import * as THREE from 'three';
import { RemoveObjectCommand } from "../commands/RemoveObjectCommand.js";
import { SetShadingCommand } from "../commands/SetShadingCommand.js";
import { SubdivideCommand } from "../commands/SubdivideCommand.js";

export default class ContextMenu {
  constructor( editor ) {
    this.editor = editor;
    this.uiLoader = editor.uiLoader;
    this.selection = editor.selection;
    this.menuEl = null;
    this.containerEl = null; // Reference to #floating-context-menu-container

    this.load();
  }

  load() {
    this.uiLoader.loadComponent('#floating-context-menu-container', 'components/context-menu.html', (container) => {
      this.containerEl = container; // Store reference to wrapper
      this.menuEl = container.querySelector('.context-menu');

      const appContainer = document.querySelector('.app-container');
      appContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault(); 
      });

      const canvas = document.querySelector('#three-canvas');
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault(); 
        e.stopPropagation();

        const object = this.selection.getSingleSelectedObject(e);
        if (object) {
            if (!this.selection.selectedObjects.includes(object)) {
                this.selection.select(object);
            }
            this.show(e.clientX, e.clientY);
        } else {
            this.hide();
        }
      });

      document.addEventListener('click', () => {
          this.hide();
      });
      document.addEventListener('mousedown', (e) => {
        if (e.button === 1) { 
          this.hide();
        }
      });

      this.menuEl.querySelectorAll('[data-action]').forEach((item) => {
        item.addEventListener('click', () => {
          const action = item.getAttribute('data-action');
          this.handleAction(action);
          this.hide();
        });
      });
    });
  }

  show(x, y) {
    if (!this.menuEl) return;
    
    // Toggle Subdivide based on mode
    const isEditMode = this.editor.viewportControls && this.editor.viewportControls.currentMode === 'edit';
    const subItem = this.menuEl.querySelector('#ctx-subdivide');
    const subDiv = this.menuEl.querySelector('#ctx-subdivide-divider');
    if (subItem) subItem.style.display = isEditMode ? 'block' : 'none';
    if (subDiv) subDiv.style.display = isEditMode ? 'block' : 'none';

    this.containerEl.classList.add('active'); // Activate container
    this.menuEl.style.display = 'block';
    this.menuEl.style.position = 'absolute';
    this.menuEl.style.left = `${x}px`;
    this.menuEl.style.top = `${y}px`;
  }

  hide() {
    if (this.menuEl) {
      this.containerEl.classList.remove('active'); // Deactivate container
      this.menuEl.style.display = 'none';
    }
  }

  handleAction(action) {
    const objects = this.selection.selectedObjects;
    if (!objects || objects.length === 0) return;

    if (action === 'subdivide') {
        const cmd = new SubdivideCommand(this.editor, 1);
        this.editor.execute(cmd);
        
        this.editor.signals.showOperatorPanel.dispatch(
            'Subdivide',
            {
                cuts: { type: 'number', value: 1, min: 1, max: 10, step: 1, label: 'Number of Cuts' }
            },
            (key, value) => {
                if (key === 'cuts') {
                    this.editor.undo();
                    this.editor.execute(new SubdivideCommand(this.editor, value));
                }
            }
        );
        return;
    }

    if (action === 'delete') {
      objects.forEach(obj => {
        this.editor.execute(new RemoveObjectCommand(this.editor, obj));
      })
      return;
    }

    if (action === 'shade-smooth' || action === 'shade-flat' || action === 'shade-auto') {
      objects.forEach(obj => {
        if (!(obj instanceof THREE.Mesh)) return;

        const currentShading = obj.userData.shading;
        if (action === 'shade-smooth' && currentShading !== 'smooth') {
          this.editor.execute(new SetShadingCommand(this.editor, obj, 'smooth', currentShading));
        } else if (action === 'shade-flat' && currentShading !== 'flat') {
          this.editor.execute(new SetShadingCommand(this.editor, obj, 'flat', currentShading));
        } else if (action === 'shade-auto' && currentShading !== 'auto') {
          this.editor.execute(new SetShadingCommand(this.editor, obj, 'auto', currentShading));
        }
      });
      return;
    }
  }
}
