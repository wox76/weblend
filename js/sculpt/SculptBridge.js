import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';

export class SculptBridge {
  constructor(editor) {
    this.editor = editor;
    this.sculptGL = null;
    this.overlayCanvas = null;
    this.isVisible = false;
    this.targetObject = null;
  }

  async init() {
    if (this.sculptGL) return;

    // Create overlay canvas
    // We reuse the existing container logic.
    const container = document.querySelector('.editor-container');
    
    // Ensure container has id 'viewport' for SculptGL
    if (!container.id) container.id = 'viewport';

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.id = 'canvas'; // SculptGL hardcoded ID
    this.overlayCanvas.style.position = 'absolute';
    this.overlayCanvas.style.top = '0';
    this.overlayCanvas.style.left = '0';
    this.overlayCanvas.style.width = '100%';
    this.overlayCanvas.style.height = '100%';
    this.overlayCanvas.style.zIndex = '15'; // Above Three.js canvas (zIndex 0)
    this.overlayCanvas.style.display = 'none';
    this.overlayCanvas.style.outline = 'none'; // Remove focus outline
    
    // We assume the main canvas has a different ID or we temporarily swap IDs if needed.
    // In index.html: <canvas id="three-canvas"></canvas>
    // So id="canvas" is free.
    
    container.appendChild(this.overlayCanvas);

    // SculptGL expects #fileopen element
    let fileInput = document.getElementById('fileopen');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'fileopen';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }

    // Dynamic import
    const { default: SculptGL } = await import('../../sculptgl-master/src_v2/SculptGL.js?v=' + Date.now());
    
    this.sculptGL = new SculptGL();
    this.sculptGL.start();

    // Monkey-patch event handlers to disable them when not active
    this.patchEvents();
  }

  patchEvents() {
    if (!this.sculptGL) return;

    // Patch key events
    const originalOnKeyDown = this.sculptGL.onKeyDown;
    this.sculptGL.onKeyDown = (e) => {
      if (this.isVisible) originalOnKeyDown.call(this.sculptGL, e);
    };

    const originalOnKeyUp = this.sculptGL.onKeyUp;
    this.sculptGL.onKeyUp = (e) => {
      if (this.isVisible) originalOnKeyUp.call(this.sculptGL, e);
    };

    // Patch Drag and Drop if possible? 
    // It is bound in addEvents using closures, so we can't easily patch the listener itself.
    // But SculptGL.loadFiles calls readFile, maybe we can intercept that?
    const originalLoadFiles = this.sculptGL.loadFiles;
    this.sculptGL.loadFiles = (event) => {
       if (this.isVisible) originalLoadFiles.call(this.sculptGL, event);
    };
  }

  async enter(object) {
    if (!object || !object.isMesh) {
      alert('Select a mesh to sculpt.');
      return false;
    }

    this.targetObject = object;
    await this.init();

    // Show overlay
    this.overlayCanvas.style.display = 'block';
    this.isVisible = true;

    // Force resize because it might have been initialized while hidden
    if (this.sculptGL) {
        this.sculptGL.onCanvasResize();
    }

    // Export Three.js mesh to OBJ
    const exporter = new OBJExporter();
    const objData = exporter.parse(object);

    // Load into SculptGL
    this.sculptGL.loadScene(objData, 'obj');

    // Hide standard helpers
    this.editor.signals.showHelpersChanged.dispatch(false);
    
    return true;
  }

  async exit() {
    if (!this.isVisible) return;

    // Get data back from SculptGL
    const meshes = this.sculptGL.getMeshes();
    if (meshes.length > 0) {
        const mesh = meshes[0];
        
        const nbVertices = mesh.getNbVertices();
        const nbFaces = mesh.getNbFaces();
        const vertices = mesh.getVertices().subarray(0, nbVertices * 3);
        const indices = mesh.getIndices().subarray(0, nbFaces * (mesh.isTriangles ? 3 : 4)); // indices are per face
        // Note: getIndices() returns the array for rendering? 
        // In SculptGL Multimesh, getIndices() returns the Element Array Buffer data.
        // If the mesh is dynamic, it might be different.
        // Let's assume standard triangle mesh for now.

        const newGeometry = new THREE.BufferGeometry();
        newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        // Re-calculate normals in Three.js or use SculptGL's?
        // SculptGL has normals.
        const normals = mesh.getNormals().subarray(0, nbVertices * 3);
        newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        
        // Indices
        // Flatten indices if they are not already flat? 
        // indices is a TypedArray (Uint16 or Uint32).
        newGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        
        // Compute bounds
        newGeometry.computeBoundingSphere();
        newGeometry.computeBoundingBox();

        // Update Three.js Object
        this.targetObject.geometry.dispose();
        this.targetObject.geometry = newGeometry;
        
        // Notify change
        this.editor.signals.objectChanged.dispatch(this.targetObject);
    }

    // Hide overlay
    this.overlayCanvas.style.display = 'none';
    this.isVisible = false;
    this.targetObject = null;
    this.sculptGL.clearScene();
    
    // Show helpers
    this.editor.signals.showHelpersChanged.dispatch(true);
  }
}
