import { Command } from './Commands.js';
import { weldVertices } from '../utils/WeldVertices.js';
import * as THREE from 'three';

export class MergeByDistanceCommand extends Command {
	constructor( editor, object, distance ) {
		super( editor );
		this.type = 'MergeByDistanceCommand';
		this.name = 'Merge by Distance';
		
		this.object = object;
		this.distance = distance;
		this.oldGeometry = object.geometry;
		this.newGeometry = null;
        
        // Removed vertices count for reporting
        this.removedCount = 0;
	}

	execute() {
		if ( !this.newGeometry ) {
            // Perform the weld
			this.newGeometry = weldVertices( this.oldGeometry, this.distance );
            this.removedCount = this.oldGeometry.getAttribute('position').count - this.newGeometry.getAttribute('position').count;
		}

		this.object.geometry = this.newGeometry;
		this.editor.signals.objectChanged.dispatch( this.object );
        this.editor.signals.sceneGraphChanged.dispatch();
        
        // Update selection if needed (Vertex selection might be invalid now, so we clear it or switch to object mode)
        // Usually good practice to clear sub-object selection after topology change
        if (this.editor.editSelection.editedObject === this.object) {
             this.editor.editSelection.clearSelection();
             this.editor.editHelpers.refreshHelpers();
        }

        console.log(`Merged vertices. Removed ${this.removedCount} vertices.`);
	}

	undo() {
		this.object.geometry = this.oldGeometry;
		this.editor.signals.objectChanged.dispatch( this.object );
        this.editor.signals.sceneGraphChanged.dispatch();
        
        if (this.editor.editSelection.editedObject === this.object) {
             this.editor.editSelection.clearSelection();
             this.editor.editHelpers.refreshHelpers();
        }
	}

	toJSON() {
		const output = super.toJSON( this );
		output.objectUuid = this.object.uuid;
		output.distance = this.distance;
		return output;
	}

	fromJSON( json ) {
		super.fromJSON( json );
		this.object = this.editor.objectByUuid( json.objectUuid );
		this.distance = json.distance;
		this.oldGeometry = this.object.geometry;
	}
}