import SidebarProperties from './Sidebar.Properties.js';
import { MoveObjectCommand } from '../commands/MoveObjectCommand.js';

export class SidebarScene {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.panelResizer = editor.panelResizer;
    this.sidebarProperties = new SidebarProperties(editor);
    this.scene = editor.sceneManager.mainScene;
    this.selection = editor.selection;
    this.toolbar = editor.toolbar;
    this.outlinerList = document.getElementById('outliner-list')

    this.expandedObjects = new WeakSet();
    this.expandedObjects.add(this.scene);

    this.init();
    this.rebuild();
    
    // Auto-expand 'Collection' group if present on init
    const collection = this.scene.getObjectByName('Collection');
    if (collection) this.expandedObjects.add(collection);
    this.rebuild(); 
  }

  init() {
    this.outlinerList.addEventListener('click', (event) => {
      // Handle Arrow Click
      if (event.target.classList.contains('arrow')) {
        event.stopPropagation();
        const item = event.target.closest('.outliner-item');
        const uuid = item.dataset.uuid;
        
        // Special case for root scene if uuid lookup fails (though root has uuid)
        const targetObj = (uuid === this.scene.uuid) ? this.scene : this.scene.getObjectByProperty('uuid', uuid);

        if (targetObj) {
            if (this.expandedObjects.has(targetObj)) {
                this.expandedObjects.delete(targetObj);
            } else {
                this.expandedObjects.add(targetObj);
            }
            this.rebuild();
        }
        return;
      }

      const item = event.target.closest('.outliner-item');
      if (!item) {
        this.selection.deselect();
        this.toolbar.updateTools();
        return;
      }

      this.outlinerList.querySelectorAll('.outliner-item.selected')
        .forEach(i => i.classList.remove('selected'));

      this.selectObjectFromOutlinerItem(item);
    });

    this.dragDropReordering();
    this.panelResizer.initOutlinerResizer();
    this.setupListeners();
  }

  setupListeners() {
    this.signals.objectAdded.add(() => this.rebuild());
    this.signals.objectRemoved.add(() => this.rebuild());
    this.signals.objectChanged.add(() => this.rebuild());
    this.signals.sceneGraphChanged.add(() => this.rebuild());
    this.signals.objectSelected.add(selectedObjects => this.highlightOutlinerItem(selectedObjects));
  }

  rebuild() {
    this.outlinerList.innerHTML = '';
    this.traverse(this.scene, 0);
  }

  traverse(object, depth) {
    if (object.name === '__VertexPoints' || object.name === '__EdgeLines' || object.name === '__FacePolygons') return;
    if (object.isHelpers) return; 

    const li = document.createElement('li');
    li.className = 'outliner-item';
    li.dataset.uuid = object.uuid;
    li.setAttribute('draggable', 'true');

    // Indentation
    for (let i = 0; i < depth; i++) {
      const spacer = document.createElement('span');
      spacer.className = 'indent';
      spacer.style.width = '16px'; 
      li.appendChild(spacer);
    }

    // Arrow
    const hasChildren = object.children.length > 0; // Simplified check
    // We should filter children to see if they are actually displayable objects
    const visibleChildren = object.children.filter(c => 
        c.name !== '__VertexPoints' && 
        c.name !== '__EdgeLines' && 
        c.name !== '__FacePolygons' && 
        !c.isHelpers
    );
    const showArrow = visibleChildren.length > 0;
    const isExpanded = this.expandedObjects.has(object);

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = showArrow ? (isExpanded ? '▼' : '▶') : ''; 
    // Prevent dragging when clicking arrow? handled in dragstart? 
    // Better handled in click listener.
    li.appendChild(arrow);

    // Type Icon
    const typeIcon = document.createElement('span');
    typeIcon.className = 'type-icon';
    typeIcon.textContent = this.getIconForObject(object);
    typeIcon.title = object.type;
    li.appendChild(typeIcon);

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    // Special name for Root
    if (object === this.scene) {
        nameSpan.textContent = 'Scene Collection';
    } else {
        nameSpan.textContent = object.name || object.type;
    }
    li.appendChild(nameSpan);

    // Visibility Toggle
    const visBtn = document.createElement('span');
    visBtn.className = 'visibility';
    visBtn.textContent = object.visible ? '👁' : '—'; 
    visBtn.title = 'Toggle Visibility';
    visBtn.onclick = (e) => {
      e.stopPropagation();
      object.visible = !object.visible;
      visBtn.textContent = object.visible ? '👁' : '—';
      visBtn.style.opacity = object.visible ? '1' : '0.5';
      this.editor.signals.sceneGraphChanged.dispatch();
    };
    li.appendChild(visBtn);

    this.outlinerList.appendChild(li);

    if (showArrow && isExpanded) {
        const sortedChildren = this.sortByNameOrType(visibleChildren);
        sortedChildren.forEach(child => this.traverse(child, depth + 1));
    }
  }

  getIconForObject(object) {
    if (object === this.scene) return '📁';
    if (object.isMesh) return '▽';
    if (object.isLight) return '☼';
    if (object.isCamera) return '📷';
    if (object.isGroup || object.type === 'Scene') return '📁';
    return '•';
  }

  sortByNameOrType(objects) {
    return [...objects].sort((a, b) => {
      const nameA = (a.name || a.type || '').toLowerCase();
      const nameB = (b.name || b.type || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  dragDropReordering() {
    let draggedItem = null;
    let dropTarget = null;
    let nextDropTarget = null;
    let dropMode = null;

    this.outlinerList.addEventListener('dragstart', (event) => {
      const item = event.target.closest('.outliner-item');
      if (!item) return;

      // Prevent drag if multiple objects are selected
      if (this.selection.selectedObjects.length > 1) {
        event.preventDefault();
        return;
      }

      document.querySelectorAll('.outliner-item').forEach(el => {
        el.classList.remove('selected', 'dragTop', 'dragBottom', 'dragInto');
      });

      draggedItem = item;
      this.selectObjectFromOutlinerItem(item);
    });


    this.outlinerList.addEventListener('dragover', (event) => {
      event.preventDefault();

      const target = event.target.closest('.outliner-item');
      if (!target) return;

      document.querySelectorAll('.outliner-item').forEach(el => {
        el.classList.remove('dragTop', 'dragBottom', 'dragInto');
      });

      const bounding = target.getBoundingClientRect();
      const offset = event.clientY - bounding.top;
      const topQuarter = bounding.height * 0.25;
      const bottomQuarter = bounding.height * 0.75;

      if (offset < topQuarter) {
        dropMode = 'before';
        target.classList.add('dragTop');
        nextDropTarget = target;
      } else if (offset > bottomQuarter) {
        dropMode = 'after';
        target.classList.add('dragBottom');
        nextDropTarget = target.nextElementSibling?.closest('.outliner-item') ?? null;
      } else {
        dropMode = 'child';
        target.classList.add('dragInto');
      }

      dropTarget = target;
    });

    this.outlinerList.addEventListener('dragend', () => {
      document.querySelectorAll('.outliner-item').forEach(el => {
        el.classList.remove('dragTop', 'dragBottom', 'dragInto');
      });
      
      if (dropTarget) {
        const dropUuid = dropTarget.dataset.uuid;
        const dragUuid = draggedItem.dataset.uuid;

        const dropObject = this.scene.getObjectByProperty('uuid', dropUuid);
        const dragObject = this.scene.getObjectByProperty('uuid', dragUuid);

        let newParent = null;

        if (dropMode === 'child') {
          if (dragObject !== dropObject && !this.isAncestor(dropObject, dragObject)) {
            newParent = dropObject;
          }
        } else if (dropMode === 'before' || dropMode === 'after') {
          if (nextDropTarget === null) {
            newParent = this.scene;
          } else {
            const nextDropUuid = nextDropTarget.dataset.uuid;
            const nextDropObject = this.scene.getObjectByProperty('uuid', nextDropUuid);

            const dropParent = nextDropObject.parent;
            if (!dropParent || dragObject === dropParent || this.isAncestor(dropParent, dragObject)) {
              return;
            }
            newParent = dropParent;
          }
        }
        if (newParent && dragObject.parent !== newParent) {
          this.editor.execute(new MoveObjectCommand(this.editor, dragObject, newParent));
        }
      }

      dropTarget = nextDropTarget = dropMode = null;
      this.selectObjectFromOutlinerItem(draggedItem);
    });
  }

  isAncestor(child, possibleAncestor) {
    let current = child.parent;
    while (current) {
      if (current === possibleAncestor) return true;
      current = current.parent;
    }
    return false;
  }

  highlightOutlinerItem(selectedObjects) {
    document.querySelectorAll('.outliner-item').forEach(el => {
      el.classList.remove('selected');
    });

    if (!selectedObjects || selectedObjects.length === 0) return;

    selectedObjects.forEach(obj => {
      const objectItem = this.outlinerList.querySelector(`[data-uuid="${obj.uuid}"]`);
      if (objectItem) objectItem.classList.add('selected');
    });
  }

  selectObjectFromOutlinerItem(item) {
    if (!item) return;

    item.classList.add('selected');

    const uuid = item.dataset.uuid;
    if (!uuid) return;

    const object = this.scene.getObjectByProperty('uuid', uuid);
    if (!object) return;

    this.selection.select(object);
    this.toolbar.updateTools();
  }
}