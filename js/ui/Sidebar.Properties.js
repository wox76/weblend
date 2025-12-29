import { SidebarObject } from './Sidebar.Object.js?v=2';
import { SidebarMaterial } from './Sidebar.Material.js';
import { SidebarModifier } from './Sidebar.Modifier.js'; // Import Modifier
import { SidebarProject } from './Sidebar.Project.js'; // Import SidebarProject

export default class SidebarProperties {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.uiLoader = editor.uiLoader;
    this.activeTabIndex = 1; // Default to Object tab (index 1)
    this.tabs = [];
    this.panels = [];
    this.load(editor);
  }

  load(editor) {
    this.uiLoader.loadComponent('#details-panel-container', 'components/details-panel.html', () => {
      this.tabs = document.querySelectorAll('.details-panel .tab-icon');
      this.panels = document.querySelectorAll('.properties-content');
      this.titleEl = document.getElementById('properties-title');

      this.tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
          this.activeTabIndex = index;
          this.showActiveTab();
        });
      });

      new SidebarProject(editor);
      new SidebarObject(editor);
      new SidebarModifier(editor); // Instantiate Modifier
      new SidebarMaterial(editor);

      this.showActiveTab();
      this.updateTabVisibility([]);
    });

    this.signals.objectSelected.add(selectedObjects => {
      this.updateTabVisibility(selectedObjects);
    });

    this.signals.modeChanged.add((mode) => {
      this.updateTabVisibility(this.editor.selection.selectedObjects, mode);
    });
  }

  showActiveTab() {
    this.tabs.forEach(t => t.classList.remove('active'));
    this.panels.forEach(p => p.style.display = 'none');

    if (this.tabs[this.activeTabIndex] && this.panels[this.activeTabIndex]) {
      this.tabs[this.activeTabIndex].classList.add('active');
      this.panels[this.activeTabIndex].style.display = 'block';

      if (this.titleEl) {
        const tabName = this.tabs[this.activeTabIndex].getAttribute('data-tab');
        this.titleEl.textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);
      }
    }
  }

  updateTabVisibility(selectedObjects, modeOverride = null) {
    let object = null;
    let count = 0;

    const mode = modeOverride || (this.editor.viewportControls ? this.editor.viewportControls.currentMode : 'object');

    if (mode === 'edit') {
        object = this.editor.editSelection.editedObject;
        count = object ? 1 : 0;
    } else {
        count = selectedObjects.length;
        object = count === 1 ? selectedObjects[0] : null;
    }

    this.objectTab = document.querySelector('.tab-icon[data-tab="object"]');
    this.modifierTab = document.querySelector('.tab-icon[data-tab="modifier"]');
    this.materialTab = document.querySelector('.tab-icon[data-tab="material"]');

    const isMesh = !!(object && object.isMesh);

    if (this.objectTab) this.objectTab.style.display = count >= 1 ? 'flex' : 'none'; // Object tab visible if any object selected
    if (this.modifierTab) this.modifierTab.style.display = isMesh ? 'flex' : 'none'; // Modifier tab visible if mesh selected
    if (this.materialTab) this.materialTab.style.display = isMesh ? 'flex' : 'none'; // Material tab visible if mesh selected

    // If current tab is not suitable for selection, switch to Object (index 1)
    // Index mapping: 0=Output, 1=Object, 2=Modifier, 3=Material
    if (this.activeTabIndex === 2 && !isMesh) { // Modifier tab
       this.activeTabIndex = 1; // Switch to Object
       this.showActiveTab();
    } else if (this.activeTabIndex === 3 && !isMesh) { // Material tab
       this.activeTabIndex = 1; // Switch to Object
       this.showActiveTab();
    } else if (this.activeTabIndex === 1 && count === 0) { // Object tab but no selection
       this.activeTabIndex = 0; // Switch to Output
       this.showActiveTab();
    }
  }
}