export class ShadingMenu {
  constructor(editor) {
    this.editor = editor;
    this.uiLoader = editor.uiLoader;
    this.menuEl = null;
    this.containerEl = null;

    this.load();
  }

  load() {
    this.uiLoader.loadComponent('#floating-shading-menu-container', 'components/shading-menu.html', (container) => {
      this.containerEl = container;
      this.menuEl = container.querySelector('.shading-menu');
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
      const target = e.target.closest('.submenu-item');
      if (!target) return;

      const shading = target.dataset.shading;
      if (shading) {
          this.editor.signals.viewportShadingChanged.dispatch(shading);
          this.hide();
      }
    });
  }

  show(x, y) {
    if (!this.menuEl) return;
    this.containerEl.classList.add('active');
    this.menuEl.style.display = 'block';
    this.menuEl.style.left = `${x}px`;
    this.menuEl.style.top = `${y}px`;
  }

  hide() {
    if (!this.menuEl) return;
    this.containerEl.classList.remove('active');
    this.menuEl.style.display = 'none';
  }
}