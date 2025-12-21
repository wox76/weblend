export class SplashScreen {
  constructor(editor) {
    this.editor = editor;
    this.containerId = 'splash-screen-container';
    this.init();
  }

  async init() {
    await this.editor.uiLoader.loadComponent(this.containerId, 'components/splash-screen.html', (element) => {
      this.element = element;
      this.setupEventListeners();
      
      // Check local storage if we should show it
      const show = localStorage.getItem('weblend-show-splash');
      if (show === 'false') {
        this.hide();
        // Update checkbox state
        const checkbox = this.element.querySelector('#splash-show-on-startup');
        if (checkbox) checkbox.checked = false;
      }
    });
  }

  setupEventListeners() {
    const backdrop = this.element.querySelector('#splash-screen-backdrop');
    const newGeneralBtn = this.element.querySelector('#splash-new-general');
    const checkbox = this.element.querySelector('#splash-show-on-startup');

    // Close on click outside
    if (backdrop) {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
          this.hide();
        }
      });
    }

    // New General -> Reset scene (and close)
    if (newGeneralBtn) {
      newGeneralBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Trigger a new scene event or just reload, for now just close
        // In a real app: this.editor.signals.emptyScene.dispatch();
        this.hide();
      });
    }

    // Checkbox persistence
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        localStorage.setItem('weblend-show-splash', e.target.checked);
      });
    }
  }

  hide() {
    const backdrop = this.element.querySelector('#splash-screen-backdrop');
    if (backdrop) {
      backdrop.style.display = 'none';
    }
  }

  show() {
    const backdrop = this.element.querySelector('#splash-screen-backdrop');
    if (backdrop) {
      backdrop.style.display = 'flex';
    }
  }
}
