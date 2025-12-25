import * as THREE from 'three';
import { VertexEditor } from './VertexEditor.js';
import { SwitchModeCommand } from '../commands/SwitchModeCommand.js';
import { SwitchSubModeCommand } from '../commands/SwitchSubModeCommand.js';
import { MenubarAdd } from '../ui/Menubar.Add.js';
import { MenubarMesh } from '../ui/Menubar.Mesh.js';
import { MenubarObject } from '../ui/Menubar.Object.js';
import { MenubarView } from '../ui/Menubar.View.js';
import { MenubarSelect } from '../ui/Menubar.Select.js';
import { MenubarHelp } from '../ui/Menubar.Help.js';

export default class ViewportControls {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.uiLoader = editor.uiLoader;
    this.cameraManager = editor.cameraManager;
    this.selection = editor.selection;
    this.editSelection = editor.editSelection;
    this.editHelpers = editor.editHelpers;
    this.currentMode = 'object';
    
    this.snapEnabled = false;
    this.snapMode = 'vertex';

    this.load();
  }

  load() {
    this.uiLoader.loadComponent('#viewport-controls-container', 'components/viewport-controls.html', (container) => {
      this.setupViewportControls(container);
      this.setupListeners();
      this.resetCameraOption(this.cameraManager.cameras);

      // Initialize Menus moved to Viewport Header
      new MenubarView(this.editor);
      new MenubarAdd(this.editor, container);
      new MenubarMesh(this.editor, container);
      new MenubarObject(this.editor, container);
      new MenubarSelect(this.editor);
      new MenubarHelp(this.editor);
    });
  }

  setupViewportControls(container) {
    const root = container || document;
    this.cameraDropdown = root.querySelector('#cameraDropdown');
    this.interactionDropdown = root.querySelector('#interaction-modes');
    this.selectionModeBar = root.querySelector('.selection-mode');
    this.shadingButtonsContainer = root.querySelector('.shading-modes-buttons');
    this.shadingButtons = null; // Initialize

    this.snapMagnet = root.querySelector('#snap-magnet');
    this.snapMenuButton = root.querySelector('#snap-menu-button');
    this.snapDropdown = root.querySelector('#snap-dropdown');
    this.snapCurrentIcon = root.querySelector('#snap-current-icon');

    this.statusEl = root.querySelector('#operation-status');
    this.statusNameEl = root.querySelector('#operation-name');
    this.statusValuesEl = root.querySelector('#operation-values');
    
    this.menuMesh = root.querySelector('#menu-mesh');
    if (this.menuMesh) {
        this.menuMesh.classList.toggle('hidden', this.currentMode !== 'edit');
    }

    if (this.snapMagnet) {
      this.snapMagnet.addEventListener('click', () => {
        this.snapEnabled = !this.snapEnabled;
        this.snapMagnet.classList.toggle('active', this.snapEnabled);
      });
    }

    if (this.snapMenuButton && this.snapDropdown) {
      this.snapMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.snapDropdown.classList.toggle('hidden');
      });

      this.snapDropdown.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', (e) => {
          this.snapMode = li.dataset.snap;
          this.snapDropdown.classList.add('hidden');
          
          // Update icon
          const iconSrc = li.querySelector('img').src;
          this.snapCurrentIcon.src = iconSrc;
        });
      });

      document.addEventListener('click', () => {
        if (!this.snapDropdown.classList.contains('hidden')) {
          this.snapDropdown.classList.add('hidden');
        }
      });
    }

    if (this.cameraDropdown) {
      this.cameraDropdown.addEventListener('change', (e) => {
        const value = e.target.value;
        this.cameraDropdown.value = value;
        const camera = this.cameraManager.cameras[value];
        this.signals.viewportCameraChanged.dispatch(camera);
      });
    }

    if (this.shadingButtonsContainer) {
      this.shadingButtons = this.shadingButtonsContainer.querySelectorAll('.shading-button');
      this.shadingButtons.forEach(button => {
        button.addEventListener('click', () => {
          this.shadingButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          const value = button.dataset.shadingMode;
          this.signals.viewportShadingChanged.dispatch(value);
        });
      });
      // Set initial active state and dispatch signal
      const initialActiveButton = this.shadingButtonsContainer.querySelector('.shading-button.active');
      if (initialActiveButton) {
        const initialValue = initialActiveButton.dataset.shadingMode;
        this.signals.viewportShadingChanged.dispatch(initialValue);
      }
    }

    if (this.interactionDropdown) {
      this.currentMode = this.interactionDropdown.value;
      
      this.interactionDropdown.addEventListener('change', (e) => {
        this.switchMode(e.target.value);
      });
    }

    if (this.selectionModeBar) {
      this.selectionButtons = this.selectionModeBar.querySelectorAll('.selection-button');
      this.selectionButtons.forEach(button => {
        button.addEventListener('click', () => {
          this.selectionButtons.forEach(b => b.classList.remove('active'));
          button.classList.add('active');

          const newMode = button.dataset.tool;
          const currentMode = this.editSelection.subSelectionMode;
          if (newMode === currentMode) return;

          this.editor.execute(new SwitchSubModeCommand(this.editor, newMode, currentMode));
        })
      })
    }
  }

  setupListeners() {
    this.signals.cameraAdded.add((cameras) => {
      this.resetCameraOption(cameras);
    });

    this.signals.cameraRemoved.add((cameras) => {
      this.resetCameraOption(cameras);
    });

    this.signals.modeChanged.add((newMode) => {
      this.currentMode = newMode;
      
      if (this.menuMesh) {
          this.menuMesh.classList.toggle('hidden', newMode !== 'edit');
      }

      if (this.interactionDropdown) {
        this.interactionDropdown.value = newMode;
      }
      if (this.selectionModeBar) {
        this.selectionModeBar.classList.toggle('hidden', newMode === 'object');
      }
    });

    this.signals.switchMode.add((newMode) => {
      this.switchMode(newMode);
    });

    this.signals.subSelectionModeChanged.add((newMode) => {
      if (this.selectionButtons) {
        this.selectionButtons.forEach(button => {
          button.classList.toggle('active', button.dataset.tool === newMode);
        });
      }

      this.editHelpers.refreshHelpers();
      this.editSelection.updateVertexHandle();
    });

    this.signals.emptyScene.add(() => {
      this.editSelection.setSubSelectionMode('vertex');
      this.signals.subSelectionModeChanged.dispatch('vertex');

      this.enterObjectMode();
      this.signals.modeChanged.dispatch('object');
    });
  }

  resetCameraOption(cameras) {
    if (!this.cameraDropdown) return;
    this.cameraDropdown.innerHTML = '';

    const defaultCamera = Object.values(cameras).find(cam => cam.isDefault);

    const defaultOption = document.createElement('option');
    defaultOption.value = defaultCamera.uuid;
    defaultOption.textContent = 'CAMERA';
    this.cameraDropdown.appendChild(defaultOption);

    Object.values(cameras).forEach((camera) => {
      if (camera.uuid === defaultCamera.uuid) return;

      const option = document.createElement('option');
      option.value = camera.uuid;
      option.textContent = camera.type.toUpperCase();
      this.cameraDropdown.appendChild(option);
    });

    this.cameraDropdown.value = this.cameraManager.camera.uuid;
  }

switchMode(newMode) {
  const previousMode = this.currentMode;

  let object = null;

  if (previousMode === 'object') {
    const selected = this.selection.selectedObjects;

    if (newMode === 'edit') {
      if (selected.length !== 1) {
        alert('Please select one mesh to enter Edit Mode.');
        this.interactionDropdown.value = previousMode;
        return;
      }

      object = selected[0];
    } else {
      object = this.editSelection.editedObject;
    }
  } else {
    object = this.editSelection.editedObject;
  }


  if (newMode === 'edit' && !(object && object.isMesh)) {
    alert('No mesh selected. Please select a mesh object.');
    this.interactionDropdown.value = previousMode;
    return;
  }

  this.editor.execute(new SwitchModeCommand(this.editor, object, newMode, previousMode));
  this.currentMode = newMode;
}

  enterObjectMode() {
    this.selection.enable = true;
    this.editSelection.enable = false;

    if (this.editHelpers) {
      this.editHelpers.removeVertexPoints();
      this.editHelpers.removeEdgeLines();
    }

    if (this.editSelection.editedObject) {
      this.editSelection.clearSelection();
      this.selection.select(this.editSelection.editedObject);
      this.editSelection.editedObject = null;
    }
  }

  enterEditMode(selectedObject) {
    this.selection.enable = false;
    this.editSelection.enable = true;

    this.editSelection.editedObject = selectedObject;
    this.editHelpers.refreshHelpers();
    this.editSelection.clearSelection();
    this.selection.deselect();
  }

  setOperationStatus(name, values) {
    if (this.statusEl) {
      this.statusEl.classList.remove('hidden');
      if (this.statusNameEl) this.statusNameEl.textContent = name;
      if (this.statusValuesEl) this.statusValuesEl.textContent = values;
    }
  }

  clearOperationStatus() {
    if (this.statusEl) {
      this.statusEl.classList.add('hidden');
    }
  }

  toJSON() {
    return {
      mode: this.interactionDropdown?.value || 'object',
      editedObjectUuid: this.editSelection.editedObject?.uuid || null,
      subSelectionMode: this.editSelection.subSelectionMode || 'vertex'
    };
  }

  fromJSON(json) {
    const mode = json.mode;
    const uuid = json.editedObjectUuid;
    const subMode = json.subSelectionMode || 'vertex';

    this.editSelection.setSubSelectionMode(subMode);
    this.signals.subSelectionModeChanged.dispatch(subMode);

    if (mode === 'edit' && uuid) {
      const object = this.editor.objectByUuid(uuid);

      if (object && object.isMesh) {
        this.selection.select(object);
        this.enterEditMode(object);
        this.signals.modeChanged.dispatch('edit');
      }
    } else {
      this.enterObjectMode();
      this.signals.modeChanged.dispatch('object');
    }
  }
}