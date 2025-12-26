import { weldVertices } from '../utils/WeldVertices.js';
import * as THREE from 'three';

export class MergeByDistanceCommand {
    static type = 'MergeByDistanceCommand';

	constructor( editor, object, distance ) {
		this.editor = editor;
		this.name = 'Merge by Distance';
		
        if (object) {
		    this.object = object;
            this.objectUuid = object.uuid;
		    this.distance = distance;
		    this.oldGeometry = object.geometry;
		    this.newGeometry = null;
            this.removedCount = 0;
        }
	}

	execute() {
        // Re-fetch object if needed (e.g. from JSON deserialization)
        if (!this.object) {
             this.object = this.editor.objectByUuid(this.objectUuid);
             this.oldGeometry = this.object.geometry; 
             // Note: if oldGeometry is not preserved/serialized, undo might fail if we don't save it. 
             // The History system usually keeps the command instance in memory.
        }

		if ( !this.newGeometry ) {
            // Perform the weld
			this.newGeometry = weldVertices( this.oldGeometry, this.distance );
            this.removedCount = this.oldGeometry.getAttribute('position').count - this.newGeometry.getAttribute('position').count;
		}

		this.object.geometry = this.newGeometry;
		this.editor.signals.objectChanged.dispatch( this.object );
        this.editor.signals.sceneGraphChanged.dispatch();
        
        if (this.editor.editSelection.editedObject === this.object) {
             this.editor.editSelection.clearSelection();
             this.editor.editHelpers.refreshHelpers();
        }

        console.log(`Merged vertices. Removed ${this.removedCount} vertices.`);
	}

	undo() {
        if (!this.object) {
             this.object = this.editor.objectByUuid(this.objectUuid);
        }

		this.object.geometry = this.oldGeometry;
		this.editor.signals.objectChanged.dispatch( this.object );
        this.editor.signals.sceneGraphChanged.dispatch();
        
        if (this.editor.editSelection.editedObject === this.object) {
             this.editor.editSelection.clearSelection();
             this.editor.editHelpers.refreshHelpers();
        }
	}

	toJSON() {
		return {
            type: MergeByDistanceCommand.type,
		    objectUuid: this.objectUuid,
		    distance: this.distance
        };
	}

	static fromJSON( editor, json ) {
        if (!json || json.type !== MergeByDistanceCommand.type) return null;
		
        // Note: We can't fully restore oldGeometry here if we don't serialize it. 
        // For simple property commands, it's easy. For geometry changes, we might need to rely on the fact 
        // that 'execute' will generate new geometry from CURRENT geometry.
        // But if we undo, we need the OLD geometry. 
        // Typically, geometry commands are heavy and might not survive a full page reload (serialization) 
        // unless we serialize the geometries themselves. 
        // For now, we assume this command is created fresh.
        
        const object = editor.objectByUuid( json.objectUuid );
        const cmd = new MergeByDistanceCommand( editor, object, json.distance );
		return cmd;
	}
}