import * as THREE from 'three';
import { MergeSelectionCommand } from '../commands/MergeSelectionCommand.js';

export class MergeMenu {
  constructor(editor) {
    this.editor = editor;
    this.uiLoader = editor.uiLoader;
    this.menuEl = null;
    this.containerEl = null;

    this.load();
  }

  load() {
    // We'll create a dedicated container for this menu if it doesn't exist
    let container = document.getElementById('floating-merge-menu-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'floating-merge-menu-container';
        document.querySelector('.app-container').appendChild(container);
    }
    this.containerEl = container;

    this.uiLoader.loadComponent('#floating-merge-menu-container', 'components/merge-menu.html', (el) => {
      this.menuEl = el.querySelector('.merge-menu');
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
      const target = e.target.closest('[data-merge]');
      if (!target) return;

      const mergeType = target.dataset.merge;
      this.handleMerge(mergeType);
      this.hide();
    });
  }

  show(x, y) {
    if (!this.menuEl) return;
    this.menuEl.style.display = 'block';
    this.menuEl.style.left = `${x}px`;
    this.menuEl.style.top = `${y}px`;
  }

  hide() {
    if (this.menuEl) {
      this.menuEl.style.display = 'none';
    }
  }

  handleMerge(type) {
    const selection = this.editor.selection;
    const object = selection.selectedObjects[0] || this.editor.editSelection.editedObject;
    if (!object || !object.userData.meshData || !this.editor.editSelection) return;
    
    const vertexIds = this.editor.editSelection.getSelectedVertexIds();
    if (!vertexIds || vertexIds.length < 2) {
        alert('Select at least two vertices to merge.');
        return;
    }

    const meshData = object.userData.meshData;
    let targetPos = new THREE.Vector3();
    let targetVertexId = null;

    if (type === 'center' || type === 'collapse') {
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

    const newMeshData = MergeSelectionCommand.performMerge(meshData, vertexIds, type, targetPos, targetVertexId);

    if (newMeshData) {
      const cmd = new MergeSelectionCommand(this.editor, object, meshData, newMeshData);
      this.editor.execute(cmd);
      
      let survivorId = (type === 'first' || type === 'last') ? targetVertexId : vertexIds[0];
      
      this.editor.editSelection.clearSelection();
      this.editor.editSelection.selectVertices([survivorId]);
    }
  }
}
