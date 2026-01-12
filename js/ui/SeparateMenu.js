import { SeparateSelectionCommand } from '../commands/SeparateSelectionCommand.js';

export class SeparateMenu {
  constructor(editor) {
    this.editor = editor;
    this.uiLoader = editor.uiLoader;
    this.menuEl = null;
    this.containerEl = null;

    this.load();
  }

  load() {
    let container = document.getElementById('floating-separate-menu-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'floating-separate-menu-container';
        document.querySelector('.app-container').appendChild(container);
    }
    this.containerEl = container;

    this.uiLoader.loadComponent('#floating-separate-menu-container', 'components/separate-menu.html', (el) => {
      this.menuEl = el.querySelector('.separate-menu');
      this.initEvents();
    });
  }

  initEvents() {
    document.addEventListener('mousedown', (e) => {
      if (this.menuEl && this.menuEl.style.display === 'block') {
        if (!this.menuEl.contains(e.target)) {
          this.hide();
        }
      }
    });

    this.menuEl.addEventListener('click', (e) => {
      const target = e.target.closest('[data-separate]');
      if (!target) return;

      const separateType = target.dataset.separate;
      this.handleSeparate(separateType);
      this.hide();
    });
  }

  show(x, y) {
    if (!this.menuEl) return;
    this.menuEl.style.display = 'block';
    this.menuEl.style.left = `${x}px`;
    this.menuEl.style.top = `${y}px`;
  }

  hide() {
    if (this.menuEl) {
      this.menuEl.style.display = 'none';
    }
  }

  handleSeparate(type) {
    // If command requires logic that isn't simple, handle it here or in Command.
    // Command expects (editor, object, type). Logic inside execute.
    const object = this.editor.editSelection.editedObject;
    if (!object) return;
    
    this.editor.execute(new SeparateSelectionCommand(this.editor, object, type));
  }
}