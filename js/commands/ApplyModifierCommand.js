import { modifierStack } from '../modifiers/ModifierStack.js';
import { MeshData } from '../core/MeshData.js';
import { ShadingUtils } from '../utils/ShadingUtils.js';

export class ApplyModifierCommand {
    static type = 'ApplyModifierCommand';

    constructor(editor, object, modifierId) {
        this.editor = editor;
        this.object = object;
        this.objectUuid = object.uuid;
        this.modifierId = modifierId;
        this.name = 'Apply Modifier';

        this.oldMeshData = null;
        this.oldModifiers = null;
        this.newMeshData = null;
    }

    execute() {
        if (!this.object) {
            this.object = this.editor.objectByUuid(this.objectUuid);
        }
        
        // Backup state on first run
        if (!this.oldMeshData) {
            this.oldMeshData = MeshData.serializeMeshData(this.object.userData.meshData);
            this.oldModifiers = JSON.parse(JSON.stringify(this.object.userData.modifiers));
        }

        const modifiers = this.object.userData.modifiers;
        const index = modifiers.findIndex(m => m.id === this.modifierId);
        
        if (index === -1) {
            // Modifier might have been removed or something went wrong
            return;
        }

        if (this.newMeshData) {
            // Redo: Use cached result
            const deserialized = MeshData.deserializeMeshData(this.newMeshData);
            this.object.userData.meshData = deserialized;
            
            // Remove applied modifiers (0 to index)
            // Wait, do we remove modifiers 0..index-1 too?
            // Yes, because we baked them into the mesh.
            this.object.userData.modifiers = modifiers.slice(index + 1);
        } else {
            // Calculate new mesh data
            // We need to apply modifiers from 0 to index
            let currentMeshData = MeshData.deserializeMeshData(this.oldMeshData);

            for (let i = 0; i <= index; i++) {
                const modData = modifiers[i];
                // Note: We apply even if disabled? Blender does.
                // But if it's disabled, maybe the user expects it to NOT apply?
                // Usually "Apply" means "Make Real". If it's disabled, making it real usually means "Do Nothing" (remove it) or "Apply the effect".
                // In Blender, if you apply a disabled modifier, it applies the effect.
                // If you want to delete it, you delete it.
                // So we apply it.
                
                const modifier = modifierStack.modifiers.get(modData.type);
                if (modifier) {
                    currentMeshData = modifier.apply(currentMeshData, modData.properties, this.object);
                }
            }

            this.newMeshData = MeshData.serializeMeshData(currentMeshData);
            this.object.userData.meshData = currentMeshData;
            
            // Remove modifiers
            this.object.userData.modifiers = modifiers.slice(index + 1);
        }
        
        // Update Geometry
        this.updateGeometry();

        this.editor.signals.objectChanged.dispatch(this.object);
        this.editor.signals.sceneGraphChanged.dispatch();
        
        if (this.editor.editSelection.editedObject === this.object) {
             this.editor.editSelection.clearSelection();
             this.editor.editHelpers.refreshHelpers();
        }
    }

    undo() {
        if (!this.object) {
            this.object = this.editor.objectByUuid(this.objectUuid);
        }
        
        if (this.oldMeshData) {
            this.object.userData.meshData = MeshData.deserializeMeshData(this.oldMeshData);
            this.object.userData.modifiers = JSON.parse(JSON.stringify(this.oldModifiers));
            
            // Restore geometry (approximate, since we don't cache the old geometry, but we can regenerate it)
            this.updateGeometry();

            this.editor.signals.objectChanged.dispatch(this.object);
            this.editor.signals.sceneGraphChanged.dispatch();
            
            if (this.editor.editSelection.editedObject === this.object) {
                 this.editor.editSelection.clearSelection();
                 this.editor.editHelpers.refreshHelpers();
            }
        }
    }
    
    updateGeometry() {
        const mode = this.editor.sceneManager.currentShadingMode || 'flat';
        // Use ShadingUtils to match existing logic if possible, but ShadingUtils might not be imported or we want to avoid circular deps if it depends on something.
        // But ShadingUtils is safe.
        // Actually, we imported ShadingUtils.
        
        // Wait, ShadingUtils.createGeometryWithShading takes 'finalMeshData'.
        // But if we have remaining modifiers, we should apply them for the VISUAL geometry?
        // YES.
        // The object.geometry should reflect (Base + Remaining Modifiers).
        
        // So we must run the stack again for the remaining modifiers!
        
        const base = this.object.userData.meshData;
        const final = modifierStack.applyModifiers(this.object, base);
        const geometry = ShadingUtils.createGeometryWithShading(final, mode);
        
        if (this.object.geometry) this.object.geometry.dispose();
        this.object.geometry = geometry;
    }

    toJSON() {
        return {
            type: ApplyModifierCommand.type,
            objectUuid: this.objectUuid,
            modifierId: this.modifierId
        };
    }

    static fromJSON(editor, json) {
        const object = editor.objectByUuid(json.objectUuid);
        return new ApplyModifierCommand(editor, object, json.modifierId);
    }
}
