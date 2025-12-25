import { JoinObjectsCommand } from '../commands/JoinObjectsCommand.js';
import { ApplyTransformCommand } from '../commands/ApplyTransformCommand.js';

export class MenubarObject {
  constructor(editor, container = document.body) {
    this.editor = editor;
    this.container = container;
    this.init();
  }

  init() {
    const joinBtn = this.container.querySelector('#menu-object-join');
    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        const selected = this.editor.selection.selectedObjects;
        if (selected.length > 1) {
             this.editor.execute(new JoinObjectsCommand(this.editor, selected));
        } else {
            alert('Select at least two meshes to join.');
        }
      });
    }

    const applyMenu = this.container.querySelector('#menu-object-apply');
    if (applyMenu) {
        applyMenu.querySelectorAll('.submenu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const type = e.target.getAttribute('data-apply');
                const selected = this.editor.selection.selectedObjects;
                if (selected.length > 0 && type) {
                    this.editor.execute(new ApplyTransformCommand(this.editor, selected, type));
                }
            });
        });
    }
  }
}
