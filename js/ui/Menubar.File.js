import * as THREE from 'three';
import { Loader } from '../loaders/Loader.js';
import { Exporter } from '../utils/Exporter.js';

export class MenubarFile {
  constructor(editor) {
    this.signals = editor.signals;
    this.sceneManager = editor.sceneManager;
    this.objectFactory = editor.objectFactory;
    this.selection = editor.selection;
    this.toolbar = editor.toolbar;
    this.init(editor);
  }

  init(editor) {
     document.querySelectorAll('[data-new]').forEach(item => {
      item.addEventListener('click', (event) => {
        const sceneType = event.target.getAttribute('data-new');
        this.tryCreateScene(sceneType);
      })
     });

     document.querySelector('.open').addEventListener('click', () => {
      this.openProject(editor);
     });

     document.querySelector('.save').addEventListener('click', () => {
      this.saveProject(editor);
     });

     document.querySelector('.import').addEventListener('click', () => {
      this.importObject(editor);
     });

     document.querySelectorAll('[data-export]').forEach(item => {
      item.addEventListener('click', (event) => {
        const exportFormat = event.target.getAttribute('data-export');
        this.exportObject(editor, exportFormat);
      });
    });
  }

  tryCreateScene(type) {
    const confirmed = window.confirm('Any unsaved data will be lost. Continue?');
    if (confirmed) {
      this.createScene(type);
    }
  }

  createScene(type) {
    this.selection.deselect();

    switch (type) {
      case 'empty':
        this.sceneManager.emptyAllScenes();
        this.signals.sceneGraphChanged.dispatch();
        break;
      case 'cube': {
        this.sceneManager.emptyAllScenes();
        const cube = this.objectFactory.createGeometry('Cube');
        this.sceneManager.addObject(cube);
        this.signals.sceneGraphChanged.dispatch();
        break;
      }
      case 'torus': {
        this.sceneManager.emptyAllScenes();
        const cube = this.objectFactory.createGeometry('Torus');
        this.sceneManager.addObject(cube);
        this.signals.sceneGraphChanged.dispatch();
        break;
      }
      case 'camera': {
        this.sceneManager.emptyAllScenes();
        const cube = this.objectFactory.createGeometry('Cube');
        this.sceneManager.addObject(cube);
        const camera = this.objectFactory.createCamera('Perspective', this.sceneManager);
        camera.position.set(0, 0, 10);
        this.sceneManager.addObject(camera);
        this.signals.sceneGraphChanged.dispatch();
        break;
      }
    }

    this.toolbar.updateTools();
  }

  openProject(editor) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb, .gltf, .json';

    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;

      const filename = file.name.toLowerCase();

      if (filename.endsWith('.json')) {
          // Legacy JSON support
          try {
            const text = await file.text();
            const json = JSON.parse(text);
            this.sceneManager.emptyAllScenes();
            editor.fromJSON(json);
            return;
          } catch(e) { console.error(e); }
      }

      // GLB/GLTF loading
      try {
        const { GLTFLoader } = await import('jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        const arrayBuffer = await file.arrayBuffer();
        
        loader.parse(arrayBuffer, '', (gltf) => {
            const projectData = gltf.scene.userData.weblendProject || (gltf.userData && gltf.userData.weblendProject);

            if (projectData) {
                // It's a Weblend Project File
                console.log("Restoring Weblend Project from GLB...");
                this.sceneManager.emptyAllScenes();
                editor.fromJSON(projectData);
                requestAnimationFrame(() => editor.panelResizer.onWindowResize());
            } else {
                // It's a standard GLB model (e.g. from Blender)
                console.log("Importing standard GLB model...");
                // Just add the scene objects
                while(gltf.scene.children.length > 0) {
                    const obj = gltf.scene.children[0];
                    this.sceneManager.addObject(obj);
                }
            }
            console.log(`File loaded: ${file.name}`);
        }, (err) => {
            console.error(err);
            alert("Failed to load GLB file.");
        });

      } catch (e) {
        console.error('Failed to open project:', e);
        alert('Failed to open project.');
      }
    });

    input.click();
  }

  async saveProject(editor, filename = 'project.glb') {
    try {
      const { GLTFExporter } = await import('jsm/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();

      // 1. Serialize full Weblend state
      const projectJson = editor.toJSON();

      // 2. Prepare scene for export (Clone to avoid modifying live scene)
      // We explicitly export the main scene. 
      // Note: We create a container to attach userdata if needed, or attach to scene.
      const sceneToExport = this.sceneManager.mainScene.clone();
      
      // 3. Inject Weblend Data into userData
      sceneToExport.userData.weblendProject = projectJson;

      // 4. Export to GLB
      exporter.parse(
        sceneToExport,
        (result) => {
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
            console.log(`Project saved as ${filename}`);
        },
        (err) => {
            console.error('An error occurred during GLB export:', err);
            alert('Failed to create GLB file.');
        },
        { 
            binary: true,
            onlyVisible: false, // Export everything
            truncateDrawRange: false
        }
      );

    } catch (e) {
      console.error('Failed to save project:', e);
      alert('Failed to save project.');
    }
  }

  importObject(editor) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.obj, .gltf, .glb';
    input.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const loader = new Loader(editor);
      loader.load(file);
    });

    input.click();
  }

  exportObject(editor, format) {
    const objects = this.selection.selectedObjects;
    const exporter = new Exporter(editor);

    if (!objects || objects.length === 0) {
      alert('Please select an object to export.');
      return;
    }
    exporter.export(objects, format);
  }
}