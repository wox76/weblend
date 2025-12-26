import * as THREE from 'three';
import { MergeSelectionCommand } from '../commands/MergeSelectionCommand.js';
import { MergeByDistanceCommand } from "../commands/MergeByDistanceCommand.js";

export class MenubarMesh {
  constructor(editor, container) {
    this.editor = editor;
    this.signals = editor.signals;
    this.container = container || document;
    this.init();
  }

  init() {
    const meshMenu = this.container.querySelector('#menu-mesh');
    // if (!meshMenu) return; // Might be null if container isn't full doc, but querySelector handles it.

    // --- Merge Selection Logic ---

    // Helper to check if we can merge
    const canMerge = () => {
      const selection = this.editor.selection;
      const object = selection.selectedObjects[0]; // Only support single object editing for now
      if (!object || !object.userData.meshData || !this.editor.editSelection) return false;
      
      const vertexIds = this.editor.editSelection.getSelectedVertexIds();
      return vertexIds && vertexIds.length >= 2;
    };

    // Generic merge handler
    const handleMerge = (type) => {
      if (!canMerge()) {
        alert('Select at least two vertices to merge.');
        return;
      }

      const selection = this.editor.selection;
      const object = selection.selectedObjects[0];
      const meshData = object.userData.meshData;
      const vertexIds = this.editor.editSelection.getSelectedVertexIds();

      let targetPos = new THREE.Vector3();
      let targetVertexId = null;

      if (type === 'center' || type === 'collapse') {
        // Calculate average center
        const positions = [];
        for (const id of vertexIds) {
          const v = meshData.getVertex(id);
          if (v) positions.push(v.position);
        }
        
        let x = 0, y = 0, z = 0;
        for (const p of positions) {
          x += p.x;
          y += p.y;
          z += p.z;
        }
        targetPos.set(x / positions.length, y / positions.length, z / positions.length);

      } else if (type === 'cursor') {
        // Use 3D cursor position if available, else (0,0,0)
        const cursor = this.editor.sceneManager.sceneHelpers.getObjectByName('Cursor') || 
                       this.editor.sceneManager.sceneHelpers.getObjectByName('GridHelper');
        
        if (cursor && cursor.position) {
             targetPos.copy(cursor.position);
        } else {
             targetPos.set(0, 0, 0);
        }

      } else if (type === 'first') {
        targetVertexId = vertexIds[0];
      } else if (type === 'last') {
        targetVertexId = vertexIds[vertexIds.length - 1];
      }

      // Generate new MeshData
      const newMeshData = MergeSelectionCommand.performMerge(meshData, vertexIds, type, targetPos, targetVertexId);

      if (newMeshData) {
        const cmd = new MergeSelectionCommand(this.editor, object, meshData, newMeshData);
        this.editor.execute(cmd);
        
        // Clear selection or select the survivor?
        let survivorId = (type === 'first' || type === 'last') ? targetVertexId : vertexIds[0];
        
        this.editor.editSelection.clearSelection();
        this.editor.editSelection.selectVertices([survivorId]);
      }
    };

    // Attach listeners for Merge Selection
    const addListener = (selector, type) => {
        const el = this.container.querySelector(selector);
        if (el) {
            el.addEventListener('click', () => handleMerge(type));
        }
    };

    addListener('.mesh-merge-center', 'center');
    addListener('.mesh-merge-cursor', 'cursor');
    addListener('.mesh-merge-collapse', 'collapse');
    addListener('.mesh-merge-first', 'first');
    addListener('.mesh-merge-last', 'last');


    // --- Merge By Distance Logic ---

    const mergeBtn = this.container.querySelector('#menu-mesh-cleanup-merge');
    if (mergeBtn) {
      mergeBtn.addEventListener('click', () => {
        this.handleMergeByDistance();
      });
    }

    
    // --- Visibility ---

    // Update visibility based on mode
    this.signals.modeChanged.add((mode) => {
        if (meshMenu) meshMenu.style.display = (mode === 'edit') ? 'block' : 'none';
    });
    
    // Initial check
    if (meshMenu) {
        meshMenu.style.display = (this.editor.mode === 'edit') ? 'block' : 'none';
        if (!this.editor.mode) meshMenu.style.display = 'none'; 
    }
  }

  handleMergeByDistance() {
    const object = this.editor.editSelection.editedObject;
    if (!object || !object.isMesh) {
      alert("Please enter Edit Mode on a mesh first.");
      return;
    }

    const defaultDistance = 0.001;

    // Execute the command first
    const cmd = new MergeByDistanceCommand(this.editor, object, defaultDistance);
    this.editor.execute(cmd);

    const updatePanel = (distance, removedCount) => {
        this.editor.signals.showOperatorPanel.dispatch(
          'Merge by Distance',
          {
            distance: { type: 'number', value: distance, label: 'Distance', step: 0.0001, min: 0 },
            info: { type: 'info', value: `Removed: ${removedCount} vertices`, label: 'Stats' }
          },
          (key, value) => {
            if (key === 'distance') {
               this.editor.undo();
               const newCmd = new MergeByDistanceCommand(this.editor, object, value);
               this.editor.execute(newCmd);
               // Re-render panel to show new stats
               updatePanel(value, newCmd.removedCount);
            }
          }
        );
    };

    updatePanel(defaultDistance, cmd.removedCount);
  }
}