import { AddObjectCommand } from "../commands/AddObjectCommand.js";

export class AddMenu {
  constructor(editor) {
    this.editor = editor;
    this.uiLoader = editor.uiLoader;
    this.objectFactory = editor.objectFactory;
    this.menuEl = null;
    this.containerEl = null; // Reference to #floating-add-menu-container

    this.load();
  }

  load() {
    this.uiLoader.loadComponent('#floating-add-menu-container', 'components/add-menu.html', (container) => {
      this.containerEl = container; // Store reference to wrapper
      this.menuEl = container.querySelector('.add-menu');
      // console.log('AddMenu: menuEl loaded:', this.menuEl); // LOG
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

      const group = target.dataset.group;
      const geometry = target.dataset.geometry;
      const image = target.dataset.image;
      const light = target.dataset.light;
      const camera = target.dataset.camera;

      if (group) {
        this.editor.execute(new AddObjectCommand(this.editor, this.objectFactory.createGroup(group)));
        this.hide();
      } else if (geometry) {
        this.editor.execute(new AddObjectCommand(this.editor, this.objectFactory.createGeometry(geometry)));
        this.hide();
      } else if (image) {
        this.editor.execute(new AddObjectCommand(this.editor, this.objectFactory.createImage(image)));
        this.hide();
      } else if (light) {
        this.editor.execute(new AddObjectCommand(this.editor, this.objectFactory.createLight(light)));
        this.hide();
      } else if (camera) {
        this.editor.execute(new AddObjectCommand(this.editor, this.objectFactory.createCamera(camera)));
        this.hide();
      }
    });
  }

  show(x, y) {
    if (!this.menuEl) {
        console.warn('AddMenu: menuEl is null in show()');
        return;
    }
    // console.log('AddMenu: show() called at', x, y, 'menuEl:', this.menuEl); // LOG
    this.containerEl.classList.add('active'); // Activate container
    this.menuEl.style.display = 'block';
    this.menuEl.style.left = `${x}px`;
    this.menuEl.style.top = `${y}px`;
    // console.log('AddMenu: menuEl display after setting:', this.menuEl.style.display); // LOG
  }

  hide() {
    if (!this.menuEl) return;
    this.containerEl.classList.remove('active'); // Deactivate container
    this.menuEl.style.display = 'none';
    // console.log('AddMenu: Hiding menu.'); // LOG
  }
}
