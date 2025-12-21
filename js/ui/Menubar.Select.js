export class MenubarSelect {
  constructor(editor) {
    this.editor = editor;
    this.init();
  }

  init() {
    const selectAll = document.querySelector('.select-all');
    const selectNone = document.querySelector('.select-none');
    const selectInvert = document.querySelector('.select-invert');

    if (selectAll) {
        selectAll.addEventListener('click', () => {
            if (this.editor.viewportControls.currentMode === 'object') {
                this.editor.selection.selectAll();
            } else {
                this.editor.editSelection.selectAll();
            }
        });
    }

    if (selectNone) {
        selectNone.addEventListener('click', () => {
            if (this.editor.viewportControls.currentMode === 'object') {
                this.editor.selection.deselect();
            } else {
                this.editor.editSelection.clearSelection();
            }
        });
    }

    if (selectInvert) {
        selectInvert.addEventListener('click', () => {
            if (this.editor.viewportControls.currentMode === 'object') {
                this.editor.selection.invert();
            } else {
                this.editor.editSelection.invert();
            }
        });
    }
  }
}
