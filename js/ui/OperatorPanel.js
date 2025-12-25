export class OperatorPanel {
  constructor(editor) {
    this.editor = editor;
    this.container = null;
    this.panel = null;
    this.header = null;
    this.title = null;
    this.content = null;

    // Define signal
    if (!this.editor.signals.showOperatorPanel) {
        // We need to check if we can add it dynamically or if Editor.js needs mod
        // Usually signals are defined in Editor.js constructor. 
        // But we can add it here if it's missing, though cleaner in Editor.js
    }

    this.editor.uiLoader.loadComponent('#operator-panel-container', 'components/operator-panel.html', (element) => {
      this.panel = element.querySelector('#operator-panel');
      this.header = element.querySelector('#operator-header');
      this.title = element.querySelector('#operator-title');
      this.content = element.querySelector('#operator-content');

      this.header.addEventListener('click', () => {
        this.panel.classList.toggle('collapsed');
      });

      this.editor.signals.showOperatorPanel.add(this.show.bind(this));
      
      // Hide on some events?
      this.editor.signals.objectSelected.add(() => this.hide());
      this.editor.signals.modeChanged.add(() => this.hide());
    });
  }

  hide() {
    if (this.panel) this.panel.classList.add('hidden');
  }

  show(title, schema, callback) {
    if (!this.panel) return;

    this.title.textContent = title;
    this.content.innerHTML = '';
    this.panel.classList.remove('hidden');
    this.panel.classList.remove('collapsed');

    for (const key in schema) {
      const item = schema[key];
      const type = item.type;
      const value = item.value;
      const label = item.label || key;

      const row = document.createElement('div');
      row.className = 'row';

      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      row.appendChild(labelEl);

      let input;
      if (type === 'number') {
        input = document.createElement('input');
        input.type = 'number';
        input.value = value;
        if (item.step) input.step = item.step;
        if (item.min) input.min = item.min;
        if (item.max) input.max = item.max;

        input.addEventListener('change', () => {
             callback(key, parseFloat(input.value));
        });
      }

      row.appendChild(input);
      this.content.appendChild(row);
    }
  }
}