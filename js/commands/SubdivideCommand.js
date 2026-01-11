import { subdivide } from '../utils/SubdivideUtil.js';
import { MeshData } from '../core/MeshData.js';

export class SubdivideCommand {
    static type = 'SubdivideCommand';

    constructor(editor, cuts = 1) {
        this.editor = editor;
        this.name = 'Subdivide';
        
        const object = editor.editSelection.editedObject;
        if (object) {
            this.objectUuid = object.uuid;
            this.object = object;
            this.cuts = cuts;
            
            // Clone mesh data for undo (Deep Copy)
            this.oldMeshData = MeshData.serializeMeshData(object.userData.meshData);
            
            // Capture selection IDs (explicit or implicit)
            this.selectedFaceIds = Array.from(editor.editSelection.getFacesFromSelection());
        }
    }

    execute() {
        if (!this.object) {
            this.object = this.editor.objectByUuid(this.objectUuid);
        }

        // Deserialize old to start fresh
        const workingMeshData = MeshData.deserializeMeshData(this.oldMeshData);
        
        let currentSelection = [...this.selectedFaceIds];
        
        for (let i = 0; i < this.cuts; i++) {
            const newFaces = subdivide(workingMeshData, currentSelection);
            if (!newFaces || newFaces.length === 0) break;
            currentSelection = newFaces;
        }

        // Apply to Object
        this.object.userData.meshData = workingMeshData;
        
        // Update Geometry
        // We use toSharedVertexGeometry as standard for mesh editing here
        if (this.object.geometry) this.object.geometry.dispose();
        this.object.geometry = workingMeshData.toSharedVertexGeometry();
        
        // Update Selection to new faces
        this.editor.editSelection.clear();
        currentSelection.forEach(id => this.editor.editSelection.selectedFaceIds.add(id));
        
        this.editor.signals.objectChanged.dispatch(this.object);
        this.editor.signals.sceneGraphChanged.dispatch();
        this.editor.editHelpers.refreshHelpers();
        this.editor.signals.editSelectionChanged.dispatch('face');
    }

    undo() {
        if (!this.object) this.object = this.editor.objectByUuid(this.objectUuid);
        
        // Restore Old Data
        const restored = MeshData.deserializeMeshData(this.oldMeshData);
        this.object.userData.meshData = restored;
        
        if (this.object.geometry) this.object.geometry.dispose();
        this.object.geometry = restored.toSharedVertexGeometry();
        
        // Restore Old Selection
        this.editor.editSelection.clear();
        this.selectedFaceIds.forEach(id => this.editor.editSelection.selectedFaceIds.add(id));
        
        this.editor.signals.objectChanged.dispatch(this.object);
        this.editor.signals.sceneGraphChanged.dispatch();
        this.editor.editHelpers.refreshHelpers();
        this.editor.signals.editSelectionChanged.dispatch('face');
    }

    toJSON() {
        return {
            type: SubdivideCommand.type,
            objectUuid: this.objectUuid,
            cuts: this.cuts,
            selectedFaceIds: this.selectedFaceIds
        };
    }

    static fromJSON(editor, json) {
        // To properly support this, we'd need to store the oldMeshData in JSON 
        // or have a way to fetch the state "before" this command from history stack.
        // For now, we return null or basic shell.
        return null; 
    }
}