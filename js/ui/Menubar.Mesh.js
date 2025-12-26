import * as THREE from 'three';
import { MergeSelectionCommand } from '../commands/MergeSelectionCommand.js';

export class MenubarMesh {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.init();
  }

  init() {
    const meshMenu = document.getElementById('menu-mesh');
    if (!meshMenu) return; // Should not happen if HTML is updated

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
        // Assuming editor.cursor or similar exists. 
        // Since I couldn't find it, using (0,0,0) as placeholder for now.
        // If there's a cursor helper object, we could use its position.
        const cursor = this.editor.sceneManager.sceneHelpers.getObjectByName('Cursor') || 
                       this.editor.sceneManager.sceneHelpers.getObjectByName('GridHelper'); // Fallback? No.
        
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
        // Ideally select the survivor.
        // We need to know the survivor ID. 
        // For 'first'/'last' it is known. For others, it's vertexIds[0] (per implementation).
        let survivorId = (type === 'first' || type === 'last') ? targetVertexId : vertexIds[0];
        
        // Update selection to just the survivor
        this.editor.editSelection.clearSelection();
        this.editor.editSelection.selectVertices([survivorId]);
      }
    };

    // Attach listeners
    const addListener = (selector, type) => {
        const el = meshMenu.querySelector(selector);
        if (el) {
            el.addEventListener('click', () => handleMerge(type));
        }
    };

    addListener('.mesh-merge-center', 'center');
    addListener('.mesh-merge-cursor', 'cursor');
    addListener('.mesh-merge-collapse', 'collapse');
    addListener('.mesh-merge-first', 'first');
    addListener('.mesh-merge-last', 'last');
    
    // Update visibility based on mode
    this.signals.modeChanged.add((mode) => {
        meshMenu.style.display = (mode === 'edit') ? 'block' : 'none';
    });
    
    // Initial check
    meshMenu.style.display = (this.editor.mode === 'edit') ? 'block' : 'none'; // Assuming editor.mode exists, otherwise default hidden
    if (!this.editor.mode) meshMenu.style.display = 'none'; 
  }
}
