import * as THREE from 'three';
import { SetMaterialValueCommand } from '../commands/SetMaterialValueCommand.js';
import { SetMaterialColorCommand } from '../commands/SetMaterialColorCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { SetMaterialFaceCommand } from '../commands/SetMaterialFaceCommand.js';

export class SidebarMaterial {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.container = document.getElementById('material-properties-content');
    this.selectedObject = null;
    this.activeSlotIndex = 0;
    this.currentMode = 'object';

    this.setupListeners();
  }

  setupListeners() {
    const updateSelection = (modeOverride = null) => {
        this.currentMode = modeOverride || (this.editor.viewportControls ? this.editor.viewportControls.currentMode : 'object');
        if (this.currentMode === 'edit') {
            this.selectedObject = this.editor.editSelection.editedObject;
        } else {
            const selected = this.editor.selection.selectedObjects;
            this.selectedObject = (selected.length === 1) ? selected[0] : null;
        }
        this.activeSlotIndex = 0; 
        this.refreshUI();
    };

    this.signals.objectSelected.add(updateSelection);
    this.signals.modeChanged.add((mode) => updateSelection(mode));

    this.signals.objectChanged.add(() => {
      this.refreshUI();
    });

    this.signals.textureAdded.add(() => {
      this.refreshUI();
    });
  }

  refreshUI() {
    this.container.innerHTML = '';
    
    if (!this.selectedObject || !this.selectedObject.isMesh) return;

    const materials = this.getMaterialsArray();
    
    // Slots Wrapper (Flex row)
    const slotsWrapper = document.createElement('div');
    slotsWrapper.style.display = 'flex';
    slotsWrapper.style.margin = '5px 10px';
    slotsWrapper.style.gap = '2px';

    const listElement = this.renderSlots(materials);
    listElement.style.flex = '1';
    listElement.style.margin = '0'; // Reset margin as wrapper handles it
    
    const controlsElement = this.renderSlotControls();
    controlsElement.style.display = 'flex';
    controlsElement.style.flexDirection = 'column';
    controlsElement.style.margin = '0';
    controlsElement.style.gap = '1px';

    slotsWrapper.appendChild(listElement);
    slotsWrapper.appendChild(controlsElement);
    this.container.appendChild(slotsWrapper);

    if (this.currentMode === 'edit') {
        this.renderMaterialActions();
    }

    const activeMaterial = (materials.length > 0 && this.activeSlotIndex < materials.length) 
        ? materials[this.activeSlotIndex] 
        : null;

    if (activeMaterial) {
        this.renderMaterialSelector(activeMaterial);
        // Preview section placeholder
        this.createSection('Preview', true); // Collapsed by default
        
        this.renderSurface(activeMaterial);
        // Settings/etc can be added here or inside Surface if mimicking exact layout
    } else if (materials.length > 0) {
        this.renderEmptySlotSelector();
    } else {
        this.renderNoSlotsUI();
    }
  }

  getMaterialsArray() {
      if (!this.selectedObject.material) return [];
      return Array.isArray(this.selectedObject.material) 
          ? this.selectedObject.material 
          : [this.selectedObject.material];
  }

  updateMaterialArray(newArray) {
      if (newArray.length === 0) {
          const defaultMat = new THREE.MeshStandardMaterial({ name: 'Default', color: 0xffffff });
          this.registerMaterial(defaultMat);
          this.editor.execute(new SetValueCommand(this.editor, this.selectedObject, 'material', defaultMat));
      } else if (newArray.length === 1) {
          this.editor.execute(new SetValueCommand(this.editor, this.selectedObject, 'material', newArray[0]));
      } else {
          this.editor.execute(new SetValueCommand(this.editor, this.selectedObject, 'material', newArray));
      }
  }

  registerMaterial(material) {
      if (!this.editor.materials) this.editor.materials = [];
      if (!this.editor.materials.includes(material)) {
          this.editor.materials.push(material);
      }
  }

  // ... (Slots and Actions rendering code remains same, omitted for brevity but should be kept) ...
  renderSlots(materials) {
      const list = document.createElement('div');
      list.className = 'material-slots-container';
      materials.forEach((mat, index) => {
          const item = document.createElement('div');
          item.className = 'material-slot';
          if (index === this.activeSlotIndex) item.classList.add('active');
          item.addEventListener('click', (e) => { 
              e.stopPropagation();
              this.activeSlotIndex = index; 
              this.refreshUI(); 
          });
          const icon = document.createElement('span');
          icon.className = 'slot-icon';
          if (mat && mat.color) icon.style.backgroundColor = '#' + mat.color.getHexString();
          item.appendChild(icon);
          const name = document.createElement('span');
          name.textContent = mat ? (mat.name || 'Material') : '<empty>';
          item.appendChild(name);
          list.appendChild(item);
      });
      return list;
  }

  renderSlotControls() {
      const div = document.createElement('div');
      div.className = 'slot-controls';
      const addBtn = document.createElement('div');
      addBtn.className = 'slot-btn'; addBtn.textContent = '+';
      addBtn.style.borderRadius = '3px 3px 0 0'; // Top corners
      addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const mats = this.getMaterialsArray();
          // Use Physical for IOR support
          const newMat = new THREE.MeshPhysicalMaterial({ name: 'Material', color: Math.random() * 0xffffff });
          this.registerMaterial(newMat);
          const newArray = [...mats, newMat];
          this.activeSlotIndex = newArray.length - 1;
          this.updateMaterialArray(newArray);
      });
      const removeBtn = document.createElement('div');
      removeBtn.className = 'slot-btn'; removeBtn.textContent = '-';
      removeBtn.style.borderRadius = '0 0 3px 3px'; // Bottom corners
      removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const mats = this.getMaterialsArray();
          if (mats.length === 0) return;
          const newArray = [...mats];
          newArray.splice(this.activeSlotIndex, 1);
          if (this.activeSlotIndex >= newArray.length) this.activeSlotIndex = Math.max(0, newArray.length - 1);
          this.updateMaterialArray(newArray);
      });
      div.appendChild(addBtn); div.appendChild(removeBtn);
      return div;
  }

  renderMaterialActions() {
      const div = document.createElement('div');
      div.className = 'material-actions';
      const assignBtn = document.createElement('button');
      assignBtn.className = 'action-btn';
      assignBtn.textContent = 'Assign';
      assignBtn.addEventListener('click', () => {
          if (this.editor.viewportControls && this.editor.viewportControls.currentMode === 'edit') {
              const object = this.editor.editSelection.editedObject;
              const selectedFaces = Array.from(this.editor.editSelection.selectedFaceIds);
              if (object && selectedFaces.length > 0) {
                  this.editor.execute(new SetMaterialFaceCommand(this.editor, object, selectedFaces, this.activeSlotIndex));
              }
          }
      });

      const selectBtn = document.createElement('button');
      selectBtn.className = 'action-btn';
      selectBtn.textContent = 'Select';
      selectBtn.addEventListener('click', () => {
          if (this.editor.viewportControls.currentMode === 'edit') {
              const object = this.editor.editSelection.editedObject;
              if (object && object.userData.meshData) {
                  const facesToSelect = [];
                  for (const face of object.userData.meshData.faces.values()) {
                      if ((face.materialIndex || 0) === this.activeSlotIndex) {
                          facesToSelect.push(face.id);
                      }
                  }
                  if (facesToSelect.length > 0) {
                      this.editor.editSelection.selectFaces(facesToSelect); // Add to selection
                  }
              }
          }
      });

      const deselectBtn = document.createElement('button');
      deselectBtn.className = 'action-btn';
      deselectBtn.textContent = 'Deselect';
      deselectBtn.addEventListener('click', () => {
          if (this.editor.viewportControls.currentMode === 'edit') {
              const object = this.editor.editSelection.editedObject;
              if (object && object.userData.meshData) {
                  const facesToDeselect = [];
                  for (const face of object.userData.meshData.faces.values()) {
                      if ((face.materialIndex || 0) === this.activeSlotIndex) {
                          facesToDeselect.push(face.id);
                      }
                  }
                  if (facesToDeselect.length > 0) {
                      this.editor.editSelection.deselectFaces(facesToDeselect);
                  }
              }
          }
      });
      
      div.appendChild(assignBtn); div.appendChild(selectBtn); div.appendChild(deselectBtn);
      this.container.appendChild(div);
  }

  renderMaterialSelector(material) {
      const row = document.createElement('div');
      row.className = 'material-selector-row';
      
      // Material Icon / Selector
      const icon = document.createElement('span');
      icon.textContent = '●';
      icon.style.color = '#' + material.color.getHexString();
      icon.style.fontSize = '16px';
      icon.style.cursor = 'pointer';
      row.appendChild(icon);

      // Dropdown logic
      icon.addEventListener('click', (e) => {
          e.stopPropagation();
          
          // Remove existing dropdowns
          const existing = document.querySelector('.material-dropdown');
          if (existing) existing.remove();

          const dropdown = document.createElement('ul');
          dropdown.className = 'modifier-dropdown material-dropdown'; // Reuse style
          dropdown.style.display = 'block';
          dropdown.style.position = 'absolute';
          // Position relative to icon
          const rect = icon.getBoundingClientRect();
          dropdown.style.left = `${rect.left}px`;
          dropdown.style.top = `${rect.bottom + 5}px`;
          
          // Collect Materials
          const materials = new Set();
          
          if (this.editor.materials) {
              this.editor.materials.forEach(m => materials.add(m));
          }

          this.editor.sceneManager.mainScene.traverse((obj) => {
              if (obj.material) {
                  if (Array.isArray(obj.material)) {
                      obj.material.forEach(m => {
                          materials.add(m);
                          this.registerMaterial(m); // Ensure found materials are registered
                      });
                  } else {
                      materials.add(obj.material);
                      this.registerMaterial(obj.material);
                  }
              }
          });

          // Add "New" option? Or just existing? User asked for "tutti i materiali della scena".
          
          materials.forEach(mat => {
              const li = document.createElement('li');
              li.className = 'modifier-dropdown-item';
              li.style.display = 'flex';
              li.style.alignItems = 'center';
              li.style.justifyContent = 'space-between';
              
              const contentSpan = document.createElement('div');
              contentSpan.style.display = 'flex';
              contentSpan.style.alignItems = 'center';
              contentSpan.style.flex = '1';

              // Color dot
              const dot = document.createElement('span');
              dot.textContent = '●';
              dot.style.color = '#' + mat.color.getHexString();
              dot.style.marginRight = '8px';
              contentSpan.appendChild(dot);
              
              const text = document.createTextNode(mat.name || 'Material');
              contentSpan.appendChild(text);
              
              contentSpan.addEventListener('click', () => {
                  const mats = this.getMaterialsArray();
                  const newArray = [...mats];
                  newArray[this.activeSlotIndex] = mat; 
                  this.updateMaterialArray(newArray);
                  dropdown.remove();
              });
              
              li.appendChild(contentSpan);

              // Delete button
              const delBtn = document.createElement('span');
              delBtn.textContent = '×'; // or -
              delBtn.style.color = '#888';
              delBtn.style.cursor = 'pointer';
              delBtn.style.marginLeft = '10px';
              delBtn.style.padding = '0 4px';
              delBtn.title = 'Delete Material';
              
              delBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  
                  // 1. Remove from library
                  if (this.editor.materials) {
                      const idx = this.editor.materials.indexOf(mat);
                      if (idx !== -1) this.editor.materials.splice(idx, 1);
                  }
                  
                  // 2. Unassign from scene objects
                  const defaultMat = new THREE.MeshStandardMaterial({ name: 'Default', color: 0xffffff });
                  let needsUpdate = false;

                  this.editor.sceneManager.mainScene.traverse((obj) => {
                      if (obj.material) {
                          if (Array.isArray(obj.material)) {
                              const newMats = obj.material.map(m => m === mat ? defaultMat : m);
                              // Check if changed
                              if (newMats.some((m, i) => m !== obj.material[i])) {
                                  obj.material = newMats;
                                  needsUpdate = true;
                              }
                          } else if (obj.material === mat) {
                              obj.material = defaultMat;
                              needsUpdate = true;
                          }
                      }
                  });
                  
                  if (needsUpdate) {
                      this.editor.signals.sceneGraphChanged.dispatch();
                      this.editor.signals.objectChanged.dispatch(this.selectedObject);
                  }
                  
                  // Remove from list
                  li.remove();
              });
              
              delBtn.addEventListener('mouseover', () => delBtn.style.color = '#fff');
              delBtn.addEventListener('mouseout', () => delBtn.style.color = '#888');

              li.appendChild(delBtn);
              
              dropdown.appendChild(li);
          });
          
          document.body.appendChild(dropdown);
          
          // Close on click out
          const closeHandler = (ev) => {
              if (!dropdown.contains(ev.target) && ev.target !== icon) {
                  dropdown.remove();
                  document.removeEventListener('click', closeHandler);
              }
          };
          setTimeout(() => document.addEventListener('click', closeHandler), 0);
      });

      const input = document.createElement('input');
      input.className = 'material-name-input';
      input.value = material.name;
      input.addEventListener('change', () => {
          this.editor.execute(new SetMaterialValueCommand(this.editor, this.selectedObject, 'name', input.value, this.activeSlotIndex));
      });
      row.appendChild(input);
      const unlinkBtn = document.createElement('button');
      unlinkBtn.className = 'icon-btn'; unlinkBtn.textContent = '×';
      unlinkBtn.addEventListener('click', () => {
          const newMat = new THREE.MeshPhysicalMaterial({ name: 'Material' });
          this.registerMaterial(newMat);
          const mats = this.getMaterialsArray();
          const newArray = [...mats];
          newArray[this.activeSlotIndex] = newMat; 
          this.updateMaterialArray(newArray);
      });
      row.appendChild(unlinkBtn);
      this.container.appendChild(row);
  }

  renderEmptySlotSelector() {
      const div = document.createElement('div');
      div.className = 'material-selector-row';
      const btn = document.createElement('button');
      btn.className = 'action-btn'; btn.textContent = 'New'; btn.style.flex = '1';
      btn.addEventListener('click', () => {
          const newMat = new THREE.MeshPhysicalMaterial({ name: 'Material' });
          this.registerMaterial(newMat);
          const mats = this.getMaterialsArray();
          const newArray = [...mats];
          newArray[this.activeSlotIndex] = newMat;
          this.updateMaterialArray(newArray);
      });
      div.appendChild(btn);
      this.container.appendChild(div);
  }

  renderNoSlotsUI() {
      const div = document.createElement('div');
      div.className = 'center-text';
      div.textContent = 'No Material Slots';
      div.style.fontSize = '12px'; div.style.color = '#666';
      this.container.appendChild(div);
  }

  // --- UI Replicating Blender Interface ---

  renderSurface(material) {
      const content = this.createSection('Surface');
      
      // Surface Type (Static for now)
      content.appendChild(this.createStaticRow('Surface', 'Principled BSDF', '#63C763'));

      // Base Color
      // Note: Blender puts texture inside the color input or separate. 
      // We'll mimic the layout: Label + Yellow Dot + Color Input (with texture support implicit?)
      // For now, standard color picker.
      content.appendChild(this.createColorRow('Base Color', material.color, '#C7C729', (hex) => {
          this.editor.execute(new SetMaterialColorCommand(this.editor, this.selectedObject, 'color', hex, this.activeSlotIndex));
      }));

      // Metallic
      content.appendChild(this.createNumberRow('Metallic', material.metalness, 0, 1, 0.01, '#636363', (val) => {
          this.editor.execute(new SetMaterialValueCommand(this.editor, this.selectedObject, 'metalness', val, this.activeSlotIndex));
      }));

      // Roughness
      content.appendChild(this.createNumberRow('Roughness', material.roughness, 0, 1, 0.01, '#636363', (val) => {
          this.editor.execute(new SetMaterialValueCommand(this.editor, this.selectedObject, 'roughness', val, this.activeSlotIndex));
      }));

      // Specular IOR (was IOR)
      const ior = material.ior !== undefined ? material.ior : 1.45;
      content.appendChild(this.createNumberRow('Specular IOR', ior, 1, 3, 0.001, '#636363', (val) => {
          if (material.ior !== undefined) {
              this.editor.execute(new SetMaterialValueCommand(this.editor, this.selectedObject, 'ior', val, this.activeSlotIndex));
          }
      }));

      // Alpha (Opacity)
      content.appendChild(this.createNumberRow('Alpha', material.opacity, 0, 1, 0.01, '#636363', (val) => {
          this.editor.execute(new SetMaterialValueCommand(this.editor, this.selectedObject, 'opacity', val, this.activeSlotIndex));
          // Auto-enable transparent if < 1?
          if (val < 1 && !material.transparent) {
              this.editor.execute(new SetMaterialValueCommand(this.editor, this.selectedObject, 'transparent', true, this.activeSlotIndex));
          }
      }));

      // IOR Level (specularIntensity) - Moved from Specular
      if (material.specularIntensity !== undefined) {
          content.appendChild(this.createNumberRow('IOR Level', material.specularIntensity, 0, 1, 0.01, '#636363', (val) => {
              this.editor.execute(new SetMaterialValueCommand(this.editor, this.selectedObject, 'specularIntensity', val, this.activeSlotIndex));
          }));
      }

      // Specular Tint (specularColor) - Moved from Specular
      if (material.specularColor !== undefined) {
           content.appendChild(this.createColorRow('Specular Tint', material.specularColor, '#C7C729', (hex) => {
              this.editor.execute(new SetMaterialColorCommand(this.editor, this.selectedObject, 'specularColor', hex, this.activeSlotIndex));
           }));
      }

      // Normal
      content.appendChild(this.createStaticRow('Normal', 'Default', '#6363C7'));
  }

  // renderSpecular removed as requested


  // --- UI Helpers ---

  createSection(title, collapsed = false) {
      const div = document.createElement('div');
      div.className = 'setting-group';
      
      const header = document.createElement('div');
      header.className = `group-header ${collapsed ? 'collapsed' : ''}`;
      header.innerHTML = `<span class="arrow">▼</span> ${title}`;
      header.addEventListener('click', () => {
          header.classList.toggle('collapsed');
      });
      div.appendChild(header);

      const content = document.createElement('div');
      content.className = 'group-content';
      div.appendChild(content);
      
      this.container.appendChild(div);
      return content;
  }

  createDot(color) {
      const dot = document.createElement('span');
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.borderRadius = '50%';
      dot.style.backgroundColor = color;
      dot.style.marginRight = '8px';
      dot.style.display = 'inline-block';
      return dot;
  }

  createRow(label, dotColor) {
      const li = document.createElement('li');
      li.className = 'setting-option';
      li.style.justifyContent = 'space-between'; // Align items
      
      const labelContainer = document.createElement('div');
      labelContainer.style.display = 'flex';
      labelContainer.style.alignItems = 'center';
      labelContainer.style.flex = '1';

      // Label (Right aligned text?? No, standard left)
      // Blender aligns labels to right of their container, then dot, then input.
      // We will do: Label (flex) -> Dot -> Input
      
      const labelSpan = document.createElement('span');
      labelSpan.className = 'label';
      labelSpan.textContent = label;
      labelSpan.style.textAlign = 'right';
      labelSpan.style.marginRight = '10px';
      labelSpan.style.minWidth = '100px'; 
      labelContainer.appendChild(labelSpan);

      if (dotColor) {
          labelContainer.appendChild(this.createDot(dotColor));
      }

      li.appendChild(labelContainer);
      return li;
  }

  createStaticRow(label, valueText, dotColor) {
      const li = this.createRow(label, dotColor);
      
      const valueSpan = document.createElement('div');
      valueSpan.textContent = valueText;
      valueSpan.style.backgroundColor = '#1d1d1d';
      valueSpan.style.padding = '3px 6px';
      valueSpan.style.borderRadius = '3px';
      valueSpan.style.color = '#ccc';
      valueSpan.style.fontSize = '12px';
      valueSpan.style.flex = '1'; // Fill
      valueSpan.style.border = '1px solid #3e3e3e';
      
      li.appendChild(valueSpan);
      return li;
  }

  createNumberRow(label, value, min, max, step, dotColor, onChange) {
      const li = this.createRow(label, dotColor);
      
      const input = document.createElement('input');
      input.className = 'number-input';
      input.type = 'number';
      input.value = value;
      if (min !== undefined) input.min = min;
      if (max !== undefined) input.max = max;
      if (step !== undefined) input.step = step;
      
      // Style to fill
      input.style.flex = '1';
      input.style.width = 'auto'; // Override fixed width? 
      // The user wants "Bar style". 
      // I will keep standard input for now but allow it to grow.
      // My global CSS forces 60px !important. 
      // I need to override that locally or use a container.
      input.style.setProperty('width', 'auto', 'important');
      input.style.setProperty('flex', '1');

      input.addEventListener('change', () => onChange(parseFloat(input.value)));
      li.appendChild(input);
      return li;
  }

  createColorRow(label, color, dotColor, onChange) {
      const li = this.createRow(label, dotColor);
      
      // Color input wrapper to look like a bar
      const wrapper = document.createElement('div');
      wrapper.style.flex = '1';
      wrapper.style.height = '22px';
      wrapper.style.backgroundColor = '#' + color.getHexString();
      wrapper.style.borderRadius = '3px';
      wrapper.style.border = '1px solid #3e3e3e';
      wrapper.style.cursor = 'pointer';
      wrapper.style.position = 'relative';

      const input = document.createElement('input');
      input.type = 'color';
      input.value = '#' + color.getHexString();
      input.style.opacity = '0';
      input.style.width = '100%';
      input.style.height = '100%';
      input.style.cursor = 'pointer';
      
      input.addEventListener('input', () => {
          wrapper.style.backgroundColor = input.value;
          onChange(parseInt(input.value.substring(1), 16));
      });

      wrapper.appendChild(input);
      li.appendChild(wrapper);
      return li;
  }
}
