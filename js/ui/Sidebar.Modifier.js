import { AddModifierCommand } from '../commands/AddModifierCommand.js';
import { RemoveModifierCommand } from '../commands/RemoveModifierCommand.js';
import { UpdateModifierCommand } from '../commands/UpdateModifierCommand.js';
import { MoveModifierCommand } from '../commands/MoveModifierCommand.js';
import { ApplyModifierCommand } from '../commands/ApplyModifierCommand.js';

export class SidebarModifier {
  constructor(editor) {
    this.editor = editor;
    this.container = document.getElementById('modifier-properties-content');
    this.modifiersContainer = document.createElement('ul');
    this.modifiersContainer.className = 'project-settings-list';
    this.addModifierButton = null;
    this.modifierListDropdown = null;
    this.selectedObject = null;
    this.activeModifierId = null; 
    this.currentModifierIds = []; 
    this.draggedItemIndex = null; // Store index during drag

    this.setupListeners();
    this.renderInitialUI();
  }

  setupListeners() {
    const updateSelection = (modeOverride = null) => {
        const mode = modeOverride || (this.editor.viewportControls ? this.editor.viewportControls.currentMode : 'object');
        if (mode === 'edit') {
            this.selectedObject = this.editor.editSelection.editedObject;
        } else {
            const selected = this.editor.selection.selectedObjects;
            this.selectedObject = (selected.length === 1) ? selected[0] : null;
        }
        this.activeModifierId = null; 
        this.refreshUI(true); 
    };

    this.editor.signals.objectSelected.add(updateSelection);
    this.editor.signals.modeChanged.add((mode) => updateSelection(mode));

    this.editor.signals.objectChanged.add((obj) => {
      if (this.selectedObject === obj) {
          this.refreshUI(false);
      }
    });
  }

  renderInitialUI() {
    this.container.innerHTML = '';
    this.modifiersContainer.innerHTML = '';

    const addBtnWrapper = document.createElement('li');
    addBtnWrapper.className = 'setting-option';
    addBtnWrapper.style.padding = '5px 10px';
    addBtnWrapper.style.position = 'sticky';
    addBtnWrapper.style.top = '0';
    addBtnWrapper.style.backgroundColor = '#2b2b2b';
    addBtnWrapper.style.zIndex = '10';
    this.addModifierButton = document.createElement('button');
    this.addModifierButton.className = 'action-button';
    this.addModifierButton.style.width = '100%';
    this.addModifierButton.textContent = '+ Add Modifier';
    addBtnWrapper.appendChild(this.addModifierButton);
    this.container.appendChild(addBtnWrapper);

    this.container.appendChild(this.modifiersContainer);

    this.addModifierButton.addEventListener('click', (e) => this.toggleModifierDropdown(e));

    this.modifierListDropdown = document.createElement('div');
    this.modifierListDropdown.className = 'add-menu';
    this.modifierListDropdown.style.display = 'none';
    this.modifierListDropdown.innerHTML = `
      <ul class="submenu">
        <li class="submenu-item" data-modifier="array">Array</li>
        <li class="submenu-item" data-modifier="mirror">Mirror</li>
        <li class="submenu-item" data-modifier="subdivision_surface">Subdivision Surface</li>
        <li class="submenu-item" data-modifier="decimate">Decimate</li>
      </ul>
    `;
    document.body.appendChild(this.modifierListDropdown); 
    
    this.modifierListDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.submenu-item');
        if (item) {
            this.addModifier(item.dataset.modifier);
            this.toggleModifierDropdown(e);
        }
    });

    document.addEventListener('click', (e) => {
        if (this.modifierListDropdown && this.modifierListDropdown.style.display === 'block' && 
            !this.addModifierButton.contains(e.target) && !this.modifierListDropdown.contains(e.target)) {
            this.modifierListDropdown.style.display = 'none';
        }
    });
  }

  toggleModifierDropdown(event) {
    if (!this.modifierListDropdown) return;
    const display = this.modifierListDropdown.style.display;
    if (display === 'none') {
      const rect = this.addModifierButton.getBoundingClientRect();
      this.modifierListDropdown.style.left = `${rect.left}px`;
      this.modifierListDropdown.style.top = `${rect.bottom + 5}px`;
      this.modifierListDropdown.style.display = 'block';
    } else {
      this.modifierListDropdown.style.display = 'none';
    }
  }

  getUniqueName(type) {
    if (!this.selectedObject || !this.selectedObject.userData.modifiers) {
        return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
    }
    const baseName = type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' '); 
    const modifiers = this.selectedObject.userData.modifiers;
    let name = baseName;
    let suffix = 1;
    const isNameTaken = (n) => modifiers.some(m => m.name === n);
    while (isNameTaken(name)) {
        name = `${baseName}.${suffix.toString().padStart(3, '0')}`;
        suffix++;
    }
    return name;
  }

  addModifier(type) {
    if (!this.selectedObject) return;
    const name = this.getUniqueName(type);
    let defaultProperties = {};
    if (type === 'array') {
      defaultProperties = {
        fitType: 'fixedCount',
        count: 2,
        relativeOffset: true,
        relativeOffsetVec: { x: 1, y: 0, z: 0 },
        constantOffset: false,
        constantOffsetVec: { x: 0, y: 0, z: 0 },
        merge: false,
        endCaps: false,
      };
    } else if (type === 'subdivision_surface') {
      defaultProperties = { 
          levels: 1, 
          renderLevels: 1, 
          subdivisionType: 'catmull-clark', 
          optimalDisplay: false 
      };
    } else if (type === 'mirror') {
      defaultProperties = { axis: { x: true, y: false, z: false } };
    } else if (type === 'decimate') {
      defaultProperties = { ratio: 1.0 };
    }
    this.editor.execute(new AddModifierCommand(this.editor, this.selectedObject, type, defaultProperties, name));
  }

  removeModifier(modifierId) {
    if (!this.selectedObject) return;
    this.editor.execute(new RemoveModifierCommand(this.editor, this.selectedObject, modifierId));
  }

  applyModifier(modifierId) {
    if (!this.selectedObject) return;
    this.editor.execute(new ApplyModifierCommand(this.editor, this.selectedObject, modifierId));
  }

  moveModifier(oldIndex, newIndex) {
    if (!this.selectedObject) return;
    this.editor.execute(new MoveModifierCommand(this.editor, this.selectedObject, oldIndex, newIndex));
  }

  updateModifierProperty(modifierId, propertyName, newValue, isPropertyOfProperties = true) {
    if (!this.selectedObject) return;
    this.editor.execute(new UpdateModifierCommand(this.editor, this.selectedObject, modifierId, propertyName, newValue));
  }

  refreshUI(forceRebuild = false) {
    if (!this.selectedObject) {
        this.modifiersContainer.innerHTML = '';
        this.currentModifierIds = [];
        return;
    }

    if (!this.selectedObject.userData.modifiers) {
        this.selectedObject.userData.modifiers = [];
    }
    const modifiers = this.selectedObject.userData.modifiers;
    const newIds = modifiers.map(m => m.id);

    // Check if structure changed
    const structureChanged = JSON.stringify(newIds) !== JSON.stringify(this.currentModifierIds);

    if (forceRebuild || structureChanged) {
        this.rebuildUI(modifiers);
    } else {
        this.updateUIValues(modifiers);
    }
    
    if (this.modifierListDropdown) this.modifierListDropdown.style.display = 'none';
  }

  rebuildUI(modifiers) {
    this.modifiersContainer.innerHTML = '';
    this.currentModifierIds = modifiers.map(m => m.id);

    modifiers.forEach((mod, index) => {
        const modifierPanel = this.renderModifierPanel(mod, index);
        this.modifiersContainer.appendChild(modifierPanel);
    });
  }

  updateUIValues(modifiers) {
    modifiers.forEach(mod => {
        const panel = this.modifiersContainer.querySelector(`.modifier-panel[data-id="${mod.id}"]`);
        if (!panel) return;

        // Helper to safely update value if not focused
        const updateInput = (selector, value) => {
            const input = panel.querySelector(selector);
            if (input && document.activeElement !== input) {
                if (input.type === 'checkbox') input.checked = value;
                else input.value = value;
            }
        };

        // Update Name
        updateInput('.modifier-name-input', mod.name || mod.type);

        // Update Properties
        const props = mod.properties;
        if (mod.type === 'array') {
            updateInput('[data-prop="fitType"]', props.fitType);
            updateInput('[data-prop="count"]', props.count);
            updateInput('[data-prop="relativeOffset"]', props.relativeOffset);
            
            if (props.relativeOffset) {
                 updateInput('[data-prop="relativeOffsetVec.x"]', props.relativeOffsetVec?.x ?? 0);
                 updateInput('[data-prop="relativeOffsetVec.y"]', props.relativeOffsetVec?.y ?? 0);
                 updateInput('[data-prop="relativeOffsetVec.z"]', props.relativeOffsetVec?.z ?? 0);
            }
        } else if (mod.type === 'subdivision_surface') {
            updateInput('[data-prop="subdivisionType"]', props.subdivisionType || 'catmull-clark');
            updateInput('[data-prop="levels"]', props.levels);
            updateInput('[data-prop="renderLevels"]', props.renderLevels);
            updateInput('[data-prop="optimalDisplay"]', props.optimalDisplay);
        } else if (mod.type === 'mirror') {
             ['x', 'y', 'z'].forEach(axis => {
                 const btn = panel.querySelector(`button[data-prop="axis.${axis}"]`);
                 if (btn && props.axis) {
                     const active = props.axis[axis];
                     btn.style.backgroundColor = active ? '#4772b3' : '#303030';
                     btn.style.color = active ? 'white' : '#ccc';
                 }
             });
        } else if (mod.type === 'decimate') {
            updateInput('[data-prop="ratio"]', props.ratio);
            const infoEl = panel.querySelector('.face-count-info');
            if (infoEl && this.selectedObject && this.selectedObject.geometry) {
                const geometry = this.selectedObject.geometry;
                const count = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
                infoEl.textContent = `Face Count: ${Math.floor(count)}`;
            }
        }
    });
  }

  renderModifierPanel(modifier, index) {
    const div = document.createElement('li');
    div.className = 'modifier-panel';
    div.dataset.id = modifier.id; 
    div.dataset.index = index; // Store index for DnD
    if (this.activeModifierId === modifier.id) {
        div.classList.add('active');
    }
    
    div.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        this.activeModifierId = modifier.id;
        Array.from(this.modifiersContainer.children).forEach(child => {
            child.classList.remove('active');
            if (child === div) child.classList.add('active');
        });
    });

    // --- Drag and Drop Logic ---
    div.addEventListener('dragstart', (e) => {
        this.draggedItemIndex = index;
        e.dataTransfer.effectAllowed = 'move';
        div.classList.add('dragging'); // Optional: styling for dragged item
    });

    div.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
        div.classList.add('drag-over'); // Optional: highlight target
    });

    div.addEventListener('dragleave', (e) => {
        div.classList.remove('drag-over');
    });

    div.addEventListener('dragend', (e) => {
        div.classList.remove('dragging');
        div.classList.remove('drag-over');
        Array.from(this.modifiersContainer.children).forEach(child => child.classList.remove('drag-over'));
    });

    div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.classList.remove('drag-over');
        if (this.draggedItemIndex !== null && this.draggedItemIndex !== index) {
            this.moveModifier(this.draggedItemIndex, index);
        }
        this.draggedItemIndex = null;
    });

    const header = document.createElement('div');
    header.className = 'modifier-header';
    
    // Arrow
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '▼';
    arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        header.classList.toggle('collapsed');
        const content = header.nextElementSibling;
        if (content) content.style.display = content.style.display === 'none' ? 'block' : 'none';
        arrow.style.transform = content.style.display === 'none' ? 'rotate(-90deg)' : 'rotate(0deg)';
    });
    header.appendChild(arrow);

    // Icon
    const icon = document.createElement('img');
    const iconName = modifier.type === 'decimate' ? 'mod_decim' : modifier.type;
    icon.src = `assets/icons/${iconName}.svg`;
    icon.className = 'modifier-icon';
    icon.onerror = () => { icon.style.display = 'none'; };
    header.appendChild(icon);

    // Name
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = modifier.name || modifier.type;
    nameInput.className = 'modifier-name-input';
    nameInput.addEventListener('change', (e) => {
        this.updateModifierProperty(modifier.id, 'name', e.target.value, false);
    });
    nameInput.addEventListener('click', (e) => e.stopPropagation());
    header.appendChild(nameInput);

    // Apply Button
    const applyBtn = document.createElement('span');
    applyBtn.className = 'header-icon-btn apply-btn';
    applyBtn.title = 'Apply';
    applyBtn.innerHTML = '&#10003;'; // Checkmark
    applyBtn.style.color = '#88dd88';
    applyBtn.style.fontSize = '14px';
    applyBtn.style.marginRight = '5px';
    applyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.applyModifier(modifier.id);
    });
    header.appendChild(applyBtn);

    // Icons (REMOVED as requested, only keeping container for structure if needed, or removing entirely)
    // User requested: "Elimina le icone a fianco al Nome del campo, mantieni solo la X e le lineette."
    
    // Remove (X)
    const removeBtn = document.createElement('span');
    removeBtn.className = 'header-icon-btn remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeModifier(modifier.id);
    });
    header.appendChild(removeBtn);

    // Drag Handle
    const dragHandle = document.createElement('span');
    dragHandle.className = 'header-drag-handle';
    dragHandle.textContent = '::::';
    dragHandle.style.cursor = 'grab';
    
    // Make draggable ONLY via handle? 
    // HTML5 DnD requires 'draggable' on the element moving. 
    // To restrict to handle, we set draggable=true on container ONLY when handle is moused down.
    dragHandle.addEventListener('mousedown', () => {
        div.setAttribute('draggable', 'true');
    });
    dragHandle.addEventListener('mouseup', () => {
        div.setAttribute('draggable', 'false');
    });
    // Fallback if mouse leaves without up
    div.addEventListener('dragend', () => {
         div.setAttribute('draggable', 'false'); 
         // ... reset styles
         div.classList.remove('dragging');
         Array.from(this.modifiersContainer.children).forEach(child => child.classList.remove('drag-over'));
    });

    header.appendChild(dragHandle);

    div.appendChild(header);

    const content = document.createElement('div');
    content.className = 'modifier-content';
    
    if (modifier.type === 'array') {
      this.renderArrayModifierUI(content, modifier);
    } else if (modifier.type === 'subdivision_surface') {
      this.renderSubdivisionSurfaceUI(content, modifier);
    } else if (modifier.type === 'mirror') {
      this.renderMirrorModifierUI(content, modifier);
    } else if (modifier.type === 'decimate') {
      this.renderDecimateModifierUI(content, modifier);
    }

    // Focus Trap Logic
    div.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        // Re-query focusable elements
        const focusableElements = Array.from(div.querySelectorAll('input, select, button, textarea, [tabindex]:not([tabindex="-1"])'));
        
        const visibleFocusable = focusableElements.filter(el => {
            return el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).visibility !== 'hidden';
        });

        if (visibleFocusable.length === 0) return;

        const firstElement = visibleFocusable[0];
        const lastElement = visibleFocusable[visibleFocusable.length - 1];

        if (e.shiftKey) { // Shift + Tab
            if (document.activeElement === firstElement) {
                e.preventDefault();
                e.stopImmediatePropagation();
                setTimeout(() => lastElement.focus(), 0);
            }
        } else { // Tab
            if (document.activeElement === lastElement) {
                e.preventDefault();
                e.stopImmediatePropagation();
                setTimeout(() => firstElement.focus(), 0);
            }
        }
    });

    div.appendChild(content);
    return div;
  }

  renderArrayModifierUI(container, modifier) {
    const props = modifier.properties;

    // Fit Type
    container.appendChild(this.createSelectRow('Fit Type', props.fitType, {
        'fixedCount': 'Fixed Count',
        'fitLength': 'Fit Length',
        'fitCurve': 'Fit Curve'
    }, 'fitType', (val) => this.updateModifierProperty(modifier.id, 'fitType', val)));

    // Count
    const countRow = this.createNumberRow('Count', props.count, 1, Infinity, 1, 'count', (val) => {
        this.updateModifierProperty(modifier.id, 'count', val);
    });
    if (props.fitType !== 'fixedCount') countRow.style.display = 'none';
    container.appendChild(countRow);

    // Relative Offset Checkbox
    const relOffsetHeader = document.createElement('div');
    relOffsetHeader.className = 'sub-panel-header';
    const relCheck = document.createElement('input');
    relCheck.type = 'checkbox';
    relCheck.checked = props.relativeOffset;
    relCheck.dataset.prop = 'relativeOffset';
    
    const relArrow = document.createElement('span');
    relArrow.textContent = '▼';
    relArrow.className = 'arrow';
    relArrow.style.transition = 'transform 0.1s';

    const relLabel = document.createElement('span');
    relLabel.textContent = 'Relative Offset';
    relLabel.style.marginLeft = '5px';

    relOffsetHeader.appendChild(relArrow);
    relOffsetHeader.appendChild(relCheck);
    relOffsetHeader.appendChild(relLabel);
    container.appendChild(relOffsetHeader);

    // Relative Offset Content
    const relContent = document.createElement('div');
    relContent.className = 'sub-panel-content';
    relContent.id = `rel-content-${modifier.id}`;
    if (!props.relativeOffset) {
        relContent.style.display = 'none';
        relArrow.style.transform = 'rotate(-90deg)';
        relArrow.style.opacity = '0.5';
    }

    // New "Compact" layout for X Y Z
    // Request: "Sposta le scritte factor XYZ a fianco al campo"
    relContent.appendChild(this.createCompactNumberRow('Factor X', props.relativeOffsetVec?.x ?? 1, 'relativeOffsetVec.x', (val) => {
        const vec = props.relativeOffsetVec || {x:1, y:0, z:0};
        vec.x = val;
        this.updateModifierProperty(modifier.id, 'relativeOffsetVec', vec);
    }));
    relContent.appendChild(this.createCompactNumberRow('Factor Y', props.relativeOffsetVec?.y ?? 0, 'relativeOffsetVec.y', (val) => {
        const vec = props.relativeOffsetVec || {x:1, y:0, z:0};
        vec.y = val;
        this.updateModifierProperty(modifier.id, 'relativeOffsetVec', vec);
    }));
    relContent.appendChild(this.createCompactNumberRow('Factor Z', props.relativeOffsetVec?.z ?? 0, 'relativeOffsetVec.z', (val) => {
        const vec = props.relativeOffsetVec || {x:1, y:0, z:0};
        vec.z = val;
        this.updateModifierProperty(modifier.id, 'relativeOffsetVec', vec);
    }));
    container.appendChild(relContent);

    relCheck.addEventListener('change', (e) => {
        const checked = e.target.checked;
        relContent.style.display = checked ? 'block' : 'none';
        relArrow.style.transform = checked ? 'rotate(0deg)' : 'rotate(-90deg)';
        relArrow.style.opacity = checked ? '1' : '0.5';
        this.updateModifierProperty(modifier.id, 'relativeOffset', checked);
    });
  }

  renderSubdivisionSurfaceUI(container, modifier) {
    const props = modifier.properties;
    
    // Type Selection (Catmull-Clark / Simple)
    const typeContainer = document.createElement('div');
    typeContainer.className = 'control-row';
    typeContainer.style.background = '#303030';
    typeContainer.style.borderRadius = '3px';
    typeContainer.style.padding = '2px';
    typeContainer.style.marginBottom = '8px';
    typeContainer.style.display = 'flex';
    
    const types = [
        { id: 'catmull-clark', label: 'Catmull-Clark' },
        { id: 'simple', label: 'Simple' }
    ];
    
    types.forEach(type => {
        const btn = document.createElement('div');
        btn.textContent = type.label;
        btn.style.flex = '1';
        btn.style.textAlign = 'center';
        btn.style.padding = '4px 0';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '11px';
        btn.style.borderRadius = '2px';
        
        if ((props.subdivisionType || 'catmull-clark') === type.id) {
            btn.style.backgroundColor = '#545454';
            btn.style.color = '#fff';
            btn.style.fontWeight = 'bold';
        } else {
            btn.style.color = '#aaa';
        }
        
        btn.onclick = () => {
             this.updateModifierProperty(modifier.id, 'subdivisionType', type.id);
        };
        
        typeContainer.appendChild(btn);
    });
    container.appendChild(typeContainer);

    // Levels
    const levelsGroup = document.createElement('div');
    levelsGroup.style.marginBottom = '5px';
    const levelsHeader = document.createElement('div');
    levelsHeader.textContent = 'Levels';
    levelsHeader.style.color = '#ccc';
    levelsHeader.style.fontSize = '11px';
    levelsHeader.style.marginBottom = '2px';
    levelsGroup.appendChild(levelsHeader);
    
    levelsGroup.appendChild(this.createNumberRow('Viewport', props.levels, 0, 6, 1, 'levels', (val) => {
        this.updateModifierProperty(modifier.id, 'levels', val);
    }));
    
    levelsGroup.appendChild(this.createNumberRow('Render', props.renderLevels ?? 1, 0, 6, 1, 'renderLevels', (val) => {
        this.updateModifierProperty(modifier.id, 'renderLevels', val);
    }));
    
    container.appendChild(levelsGroup);

    // Optimal Display
    container.appendChild(this.createCheckboxRow('Optimal Display', props.optimalDisplay || false, 'optimalDisplay', (val) => {
        this.updateModifierProperty(modifier.id, 'optimalDisplay', val);
    }));
  }

  renderMirrorModifierUI(container, modifier) {
    const props = modifier.properties;
    container.appendChild(this.createAxisSelector('Axis', props.axis || {x:true, y:false, z:false}, (axis) => {
        const currentAxis = modifier.properties.axis || {x:true, y:false, z:false};
        const newAxis = { ...currentAxis };
        newAxis[axis] = !newAxis[axis];
        this.updateModifierProperty(modifier.id, 'axis', newAxis);
    }));
  }

  renderDecimateModifierUI(container, modifier) {
    const props = modifier.properties;
    container.appendChild(this.createNumberRow('Ratio', props.ratio, 0.0, 1.0, 0.01, 'ratio', (val) => {
        this.updateModifierProperty(modifier.id, 'ratio', val);
    }));

    const infoRow = document.createElement('div');
    infoRow.className = 'control-row';
    infoRow.style.color = '#888';
    infoRow.style.fontSize = '11px';
    infoRow.style.justifyContent = 'flex-end';
    infoRow.style.marginTop = '4px';
    
    const faceCountLabel = document.createElement('span');
    faceCountLabel.className = 'face-count-info';
    faceCountLabel.textContent = 'Face Count: -';
    infoRow.appendChild(faceCountLabel);
    container.appendChild(infoRow);
  }

  createAxisSelector(label, valueObj, onToggle) {
      const div = document.createElement('div');
      div.className = 'control-row';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      
      const labelSpan = document.createElement('span');
      labelSpan.className = 'control-label';
      labelSpan.textContent = label;
      div.appendChild(labelSpan);

      const group = document.createElement('div');
      group.style.display = 'flex';
      group.style.gap = '2px';

      ['x', 'y', 'z'].forEach(axis => {
          const btn = document.createElement('button');
          btn.textContent = axis.toUpperCase();
          btn.style.border = '1px solid #3e3e3e';
          btn.style.borderRadius = '3px';
          btn.style.cursor = 'pointer';
          btn.style.width = '24px';
          btn.style.fontSize = '11px';
          btn.style.padding = '2px 0';
          
          if (valueObj[axis]) {
             btn.style.backgroundColor = '#4772b3';
             btn.style.color = 'white';
          } else {
             btn.style.backgroundColor = '#303030';
             btn.style.color = '#ccc';
          }
          
          btn.dataset.prop = `axis.${axis}`;
          
          btn.addEventListener('click', (e) => {
              e.stopPropagation();
              onToggle(axis);
          });
          
          group.appendChild(btn);
      });

      div.appendChild(group);
      return div;
  }

  // --- UI Helper functions ---
  createCheckboxRow(label, value, dataProp, onChange) {
    const div = document.createElement('div');
    div.className = 'control-row';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'control-label';
    labelSpan.textContent = label;
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    if (dataProp) input.dataset.prop = dataProp;
    
    input.addEventListener('change', (e) => onChange(e.target.checked));
    
    div.appendChild(labelSpan);
    div.appendChild(input);
    return div;
  }

  // --- UI Helper functions ---
  createNumberRow(label, value, min, max, step, dataProp, onChange) {
    const div = document.createElement('div');
    div.className = 'control-row';
    // Match the 'compact' look: Align to right, gap 10px
    div.style.justifyContent = 'space-between'; 
    div.style.alignItems = 'center';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'control-label';
    labelSpan.textContent = label;
    // labelSpan.style.color = '#ccc'; // Already in CSS
    
    const input = document.createElement('input');
    input.className = 'control-input number';
    input.type = 'number';
    input.value = value;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    if (step !== undefined) input.step = step;
    if (dataProp) input.dataset.prop = dataProp;
    
    // Enforce fixed width for consistency
    input.style.width = '60px';
    input.style.flex = 'none';
    input.style.textAlign = 'right';
    
    input.addEventListener('change', () => onChange(parseFloat(input.value)));
    input.addEventListener('click', (e) => e.stopPropagation());

    div.appendChild(labelSpan);
    div.appendChild(input);
    return div;
  }

  // New helper for "Factor X [input]" style where label is next to input
  createCompactNumberRow(label, value, dataProp, onChange) {
    const div = document.createElement('div');
    div.className = 'control-row';
    div.style.justifyContent = 'flex-end'; // Align content to the right
    div.style.gap = '10px'; // Space between items

    // Label
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    labelSpan.style.color = '#ccc';
    labelSpan.style.fontSize = '12px';
    // Remove fixed width so it sits next to input
    
    // Input
    const input = document.createElement('input');
    input.className = 'control-input number';
    input.type = 'number';
    input.value = value;
    input.step = 0.01;
    input.style.width = '60px'; // Fixed width for these specific inputs
    input.style.flex = 'none'; // Don't expand
    if (dataProp) input.dataset.prop = dataProp;
    
    input.addEventListener('change', () => onChange(parseFloat(input.value)));
    input.addEventListener('click', (e) => e.stopPropagation());

    div.appendChild(labelSpan);
    div.appendChild(input);
    return div;
  }

  createSelectRow(label, value, options, dataProp, onChange) {
      const div = document.createElement('div');
      div.className = 'control-row';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'control-label';
      labelSpan.textContent = label;
      
      const select = document.createElement('select');
      select.className = 'control-input select';
      if (dataProp) select.dataset.prop = dataProp;
      
      for (const key in options) {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = options[key];
          if (key == value) opt.selected = true;
          select.appendChild(opt);
      }
      
      select.addEventListener('change', () => onChange(select.value));
      select.addEventListener('click', (e) => e.stopPropagation());
      
      div.appendChild(labelSpan);
      div.appendChild(select);
      return div;
  }
}