export class SettingsPanel {
  constructor(editor) {
    this.editor = editor;
    this.containerId = 'settings-panel-container';
    this.init();
  }

  async init() {
    await this.editor.uiLoader.loadComponent(this.containerId, 'components/settings-panel.html', (element) => {
      this.element = element;
      this.setupEventListeners();
    });
  }

  setupEventListeners() {
    const backdrop = this.element.querySelector('#settings-panel-backdrop');
    const closeBtn = this.element.querySelector('#settings-close');
    const tabs = this.element.querySelectorAll('.settings-sidebar li');

    // Close buttons
    if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hide());
    }

    if (backdrop) {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
          this.hide();
        }
      });
    }

    // Tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            this.updateContent(tab.dataset.tab);
        });
    });
  }

  updateContent(tabName) {
    const contentArea = this.element.querySelector('#settings-content-area');
    if (!contentArea) return;

    let html = '';
    
    if (tabName === 'interface') {
         html = `
          <h3>Interface</h3>
          <div class="setting-group">
             <label>Display</label>
             <div class="setting-item">
                <span>Resolution Scale</span>
                <input type="number" value="1.0" step="0.1">
             </div>
             <div class="setting-item">
                <span>Line Width</span>
                <input type="number" value="1" step="1">
             </div>
          </div>
          <div class="setting-group">
             <label>Editors</label>
             <div class="setting-item">
                <span>Header Position</span>
                <select style="background: #333; color: #fff; border: 1px solid #444; border-radius: 3px;">
                    <option>Top</option>
                    <option>Bottom</option>
                </select>
             </div>
          </div>`;
    } else {
        const title = tabName.charAt(0).toUpperCase() + tabName.slice(1);
        html = `<h3>${title}</h3>`;
        html += `<div class="setting-group"><label>Settings for ${title}</label><div class="setting-item"><span>Example Setting</span><input type="checkbox" checked></div></div>`;
    }
    
    contentArea.innerHTML = html;
  }

  hide() {
    const backdrop = this.element.querySelector('#settings-panel-backdrop');
    if (backdrop) {
      backdrop.classList.remove('visible');
    }
  }

  show() {
    const backdrop = this.element.querySelector('#settings-panel-backdrop');
    if (backdrop) {
      backdrop.classList.add('visible');
    }
  }
}
