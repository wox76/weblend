import { AddObjectCommand } from "../commands/AddObjectCommand.js";

export class MenubarAdd {
  constructor(editor, container = document.body) {
    this.editor = editor;
    this.container = container;
    this.sceneManager = editor.sceneManager;
    this.objectFactory = editor.objectFactory;
    this.init();
  }

  init() {
    const groupBtn = this.container.querySelector('[data-group]');
    if (groupBtn) {
      groupBtn.addEventListener('click', (event) => {
        const groupType = event.target.getAttribute('data-group');
        const group = this.objectFactory.createGroup(groupType);
        this.editor.execute(new AddObjectCommand(this.editor, group));
      });
    }

    this.container.querySelectorAll('[data-geometry]').forEach(item => {
      item.addEventListener('click', (event) => {
        const geometryType = event.target.getAttribute('data-geometry');
        const geometry = this.objectFactory.createGeometry(geometryType);
        this.editor.execute(new AddObjectCommand(this.editor, geometry));
      });
    });

    this.container.querySelectorAll('[data-image]').forEach(item => {
      item.addEventListener('click', (event) => {
        const imageType = event.target.getAttribute('data-image');
        const image = this.objectFactory.createImage(imageType);
        this.editor.execute(new AddObjectCommand(this.editor, image));
      });
    });

    this.container.querySelectorAll('[data-light]').forEach(item => {
      item.addEventListener('click', (event) => {
        const lightType = event.target.getAttribute('data-light');
        const light = this.objectFactory.createLight(lightType);
        this.editor.execute(new AddObjectCommand(this.editor, light));
      });
    });

    this.container.querySelectorAll('[data-camera]').forEach(item => {
      item.addEventListener('click', (event) => {
        const cameraType = event.target.getAttribute('data-camera');
        const camera = this.objectFactory.createCamera(cameraType);
        this.editor.execute(new AddObjectCommand(this.editor, camera));
      })
    });
  }
}