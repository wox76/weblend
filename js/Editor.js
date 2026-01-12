import * as THREE from 'three';
import Renderer from './core/Renderer.js';
import SceneManager from './core/SceneManager.js';
import CameraManager from './core/CameraManager.js';
import ControlsManager from './core/ControlsManager.js';
import Toolbar from './tools/Toolbar.js';
import Selection from './tools/Selection.js';
import UIComponentsLoader from './ui/UIComponentsLoader.js';
import PanelResizer from './ui/PanelResizer.js';
import { ViewportViewHelper } from './tools/Viewport.ViewHelper.js';
import Menubar from './ui/Menubar.js';
import { Signal } from './utils/Signals.js';
import { ObjectFactory } from './utils/ObjectFactory.js';
import { History } from './core/History.js';
import { KeyHandler } from './tools/KeyHandler.js';
import ViewportControls from './tools/Viewport.Controls.js';
import Sidebar from './ui/Sidebar.js';
import Config from './core/Config.js';
import { Storage } from './core/Storage.js';
import EditSelection from './tools/EditSelection.js';
import ContextMenu from './ui/ContextMenu.js';
import { MeshEditDispatcher } from './tools/MeshEditDispatcher.js';
import { ObjectEditDispatcher } from './tools/ObjectEditDispatcher.js';
import EditHelpers from './helpers/EditHelpers.js';
import { SelectionBox } from './tools/SelectionBox.js';
import { AddMenu } from './ui/AddMenu.js';
import { ApplyMenu } from './ui/ApplyMenu.js';
import { ShadingMenu } from './ui/ShadingMenu.js';
import ViewportNavigation from './tools/Viewport.Navigation.js';
import { SplashScreen } from './ui/SplashScreen.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { NumberDragger } from './ui/NumberDragger.js';
import { OperatorPanel } from './ui/OperatorPanel.js';
import { MergeMenu } from './ui/MergeMenu.js';

export default class Editor {
  constructor() {
    // Signals
    this.signals = {
      showHelpersChanged: new Signal(),

      viewportCameraChanged: new Signal(),
      viewportShadingChanged: new Signal(),

      cameraAdded: new Signal(),
      cameraRemoved: new Signal(),

      objectAdded: new Signal(),
      objectRemoved: new Signal(),

      objectSelected: new Signal(),
      objectFocused: new Signal(),
      objectChanged: new Signal(),
      objectDeleted: new Signal(),

      historyChanged: new Signal(),
      emptyScene: new Signal(),

      sceneGraphChanged: new Signal(),
      modeChanged: new Signal(),
      subSelectionModeChanged: new Signal(),
      switchMode: new Signal(),
      multiSelectChanged: new Signal(),

      createFaceFromVertices: new Signal(),
      deleteSelectedFaces: new Signal(),
      separateSelection: new Signal(),

      editSelectionChanged: new Signal(),
      editSelectionCleared: new Signal(),

      transformDragStarted: new Signal(),
      transformDragEnded: new Signal(),
      modalExtrudeEnded: new Signal(),
      modalBevelEnded: new Signal(),
      
      renderImage: new Signal(),
      textureAdded: new Signal(),

      showOperatorPanel: new Signal(),
      refreshSidebarObject: new Signal(),
    }

    this.helpers = {};
    this.textures = [];
    this.materials = [];

    // Core setup
    this.config = new Config();
    this.history = new History(this);
    this.renderer = new Renderer(this);
    this.objectFactory = new ObjectFactory(this);
    this.cameraManager = new CameraManager(this);
    this.sceneManager = new SceneManager(this);
    this.controlsManager = new ControlsManager(this);

    // Helpers
    this.viewportViewHelper = new ViewportViewHelper(this);
    this.selectionBox = new SelectionBox(this);
    this.selection = new Selection(this);
    this.editSelection = new EditSelection(this);
    this.editHelpers = new EditHelpers(this);
    this.keyHandler = new KeyHandler(this);

    // UI
    this.uiLoader = new UIComponentsLoader();
    this.panelResizer = new PanelResizer(this);
    this.contextMenu = new ContextMenu(this);
    this.addMenu = new AddMenu(this);
    this.applyMenu = new ApplyMenu(this);
    this.shadingMenu = new ShadingMenu(this);
    this.viewportNavigation = new ViewportNavigation(this);
    this.splashScreen = new SplashScreen(this);
    this.settingsPanel = new SettingsPanel(this);
    this.numberDragger = new NumberDragger(this);
    this.operatorPanel = new OperatorPanel(this);
    this.mergeMenu = new MergeMenu(this);

    this.clock = new THREE.Clock();

    this.animate = this.animate.bind(this);
  }

  async init() {
    this.viewportControls = new ViewportControls(this);  
    this.toolbar = new Toolbar(this);
    this.menubar = new Menubar(this);
    this.meshEditDispatcher = new MeshEditDispatcher(this);
    this.objectEditDispatcher = new ObjectEditDispatcher(this);

    const saved = await Storage.get('scene');
    if (saved) {
      this.fromJSON(saved);
    } else {
      this.sceneManager.addDemoObjects();
      // Auto-select the default Cube
      const cube = this.sceneManager.mainScene.getObjectByName('Cube');
      if (cube) {
        this.selection.select(cube);
      }
    }
    this.sceneManager.sceneEditorHelpers.add(this.sceneManager.gridHelper);

    this.sidebar = new Sidebar(this);
    
    this.setupListeners();
    this.animate();
  }

  setupListeners() {
    this.signals.viewportCameraChanged.add((camera) => {
      this.cameraManager.camera = camera;
      this.controlsManager.setCamera(camera);
      this.panelResizer.onWindowResize();

      this.viewportViewHelper.setVisible(camera.isDefault);

      this.selection.deselect();
      this.toolbar.updateTools();
    });

    this.signals.historyChanged.add(async () => {
      await Storage.set('scene', this.toJSON());
    });
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    this.sceneManager.gridHelper.updateUniforms(this.cameraManager.camera);
    if (this.selection.getSelectedObject()) {
      this.selection.update();
    }

    this.renderer.clearAll();
    this.renderer.render(this.sceneManager.mainScene, this.cameraManager.camera);
    this.renderer.render(this.sceneManager.sceneHelpers, this.cameraManager.camera);
    this.renderer.render(this.sceneManager.sceneEditorHelpers, this.cameraManager.camera);

    const viewHelperAnimating = this.viewportViewHelper.viewHelper.animating;
    const isDefaultCamera = this.cameraManager.camera.isDefault;
    
    if (viewHelperAnimating) {
      this.controlsManager.disable();
      this.viewportViewHelper.update(delta);
    } else if (!isDefaultCamera || this.toolbar.isModalTransforming()) {
      this.controlsManager.disable();
    } else {
      this.controlsManager.enable();
    }

    this.viewportViewHelper.render();
  }

  async fromJSON(json) {
    const loader = new THREE.ObjectLoader();

    const scene = await loader.parseAsync(json.scene);
    this.sceneManager.setScene(scene);

    // Populate materials library
    this.materials = [];
    this.sceneManager.mainScene.traverse(obj => {
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => {
                if (!this.materials.includes(m)) this.materials.push(m);
            });
        }
    });

    const camera = await loader.parseAsync(json.camera);
    
    // Auto-migrate camera from Y-up to Z-up if needed
    if (camera.up.y > 0.9) {
        // Old Y-up camera detected.
        // Option 1: Just reset to new default (Safer)
        // camera.copy(this.cameraManager.createDefaultCamera());
        
        // Option 2: Rotate to match new Z-up world (X->X, Y->Z, Z->-Y)
        const oldPos = camera.position.clone();
        camera.position.set(oldPos.x, -oldPos.z, oldPos.y);
        
        camera.up.set(0, 0, 1);
        
        // Rotate quaternion: Rotate +90 degrees around X axis
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        camera.quaternion.premultiply(q);
        
        camera.updateMatrixWorld();
    }
    
    this.cameraManager.setCamera(camera);

    this.viewportControls.fromJSON(json.viewportControls);
    if (this.config.get('history')) {
      this.history.fromJSON(json.history);
    }
    this.signals.historyChanged.dispatch();
  }

  toJSON() {
    const currentShading = this.sceneManager.currentShadingMode;
    // Temporarily revert to material mode to save clean state (removes non-clonable userData.originalMaterial)
    if (currentShading !== 'material') {
        this.signals.viewportShadingChanged.dispatch('material');
    }

    // Sanitize scene before serialization to prevent crash
    const scene = this.sceneManager.mainScene;
    
    // Recursive sanitization function
    const sanitizeObject = (obj) => {
        if (!obj) return;
        
        // Sanitize userData
        if (obj.userData) {
            for (const key in obj.userData) {
                const val = obj.userData[key];
                // Remove functions or Three.js instances that cause CloneError
                if (typeof val === 'function' || (val && typeof val === 'object' && (val.isMaterial || val.isTexture || val.isObject3D))) {
                    delete obj.userData[key];
                }
            }
        }
        
        if (obj.children) {
            for (let i = obj.children.length - 1; i >= 0; i--) {
                const child = obj.children[i];
                if (typeof child.toJSON !== 'function') {
                    console.warn('Editor: Removing invalid object:', child);
                    obj.remove(child);
                } else {
                    sanitizeObject(child);
                }
            }
        }
    };
    
    sanitizeObject(scene);

    const json = {
      metadata: {
        version: 1.0,
        type: 'Project',
      },
      scene: this.sceneManager.mainScene.toJSON(),
      camera: this.cameraManager.camera.toJSON(),
      viewportControls: this.viewportControls.toJSON(),
    };

    if (this.config.get('history')) {
      json.history = this.history.toJSON();
    }

    // Restore shading mode
    if (currentShading !== 'material') {
        this.signals.viewportShadingChanged.dispatch(currentShading);
    }

    return JSON.parse(JSON.stringify(json));
  }

  objectByUuid(uuid) {
    return this.sceneManager.mainScene.getObjectByProperty('uuid', uuid);
  }

  execute(cmd) {
    this.history.execute(cmd);
  }

  undo() {
    this.history.undo();
  }

  redo() {
    this.history.redo();
  }

  startModalExtrude() {
    this.toolbar.extrudeTool.startModalExtrude();
  }

  cancelExtrude() {
    this.toolbar.extrudeTool.cancelModalExtrude();
  }

  confirmExtrude() {
    this.toolbar.extrudeTool.confirmExtrude();
  }

  startModalBevel() {
    this.toolbar.bevelTool.startModalBevel();
  }

  cancelBevel() {
    this.toolbar.bevelTool.cancelModalBevel();
  }

  confirmBevel() {
    this.toolbar.bevelTool.confirmBevel();
  }
}