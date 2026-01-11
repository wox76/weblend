import * as THREE from 'three';
import { SelectSubObjectCommand } from '../commands/SelectSubObjectCommand.js';

export default class EditSelection {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.viewportControls = editor.viewportControls;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.editedObject = null;
    this.sceneManager = editor.sceneManager;
    this.enable = true;
    this.subSelectionMode = 'vertex';

    this.vertexHandle = new THREE.Object3D();
    this.vertexHandle.name = '__VertexHandle';
    this.vertexHandle.visible = false;
    this.sceneManager.sceneEditorHelpers.add(this.vertexHandle);

    this.camera = editor.cameraManager.camera;
    this.renderer = editor.renderer;
    this.selectionBox = editor.selectionBox;

    this.multiSelectEnabled = false;
    this.selectedVertexIds = new Set();
    this.selectedEdgeIds = new Set();
    this.selectedFaceIds = new Set();
    this.setupListeners();
  }

  setupListeners() {
    this.signals.multiSelectChanged.add((shiftChanged) => {
      this.multiSelectEnabled = shiftChanged;
    });

    this.signals.emptyScene.add(() => {
      this.editedObject = null;
    });

    this.signals.transformDragStarted.add(() => {
      this.enable = false;
    });

    this.signals.transformDragEnded.add(() => {
      this.enable = true;
    });

    const dom = this.renderer.domElement;
    dom.addEventListener("mousedown", this.onMouseDown.bind(this));
    dom.addEventListener("mousemove", this.onMouseMove.bind(this));
    dom.addEventListener("mouseup", this.onMouseUp.bind(this));
  }

  setSubSelectionMode(mode) {
    this.subSelectionMode = mode;
  }

  applyClickSelection(event) {
    if (!this.enable) return;

    if (this.subSelectionMode === 'vertex') {
      const nearestVertexId = this.pickNearestVertexOnMouse(event, this.renderer, this.camera);
      if (nearestVertexId === null) {
        this.clearSelection();
        return;
      }

      this.selectVertices(nearestVertexId);
    } else if (this.subSelectionMode === 'edge') {
      const nearestEdgeId = this.pickNearestEdgeOnMouse(event, this.renderer, this.camera);
      if (nearestEdgeId === null) {
        this.clearSelection();
        return;
      }

      this.selectEdges(nearestEdgeId);
    } else if (this.subSelectionMode === 'face') {
      const nearestFaceId = this.pickNearestFaceOnMouse(event, this.renderer, this.camera);
      if (nearestFaceId === null) {
        this.clearSelection();
        return;
      }

      this.selectFaces(nearestFaceId);
    }
  }

  applyBoxSelection() {
    if (!this.enable) return;

    if (this.subSelectionMode === 'vertex') {
      const vertexIndices = this.getBoxSelectedVertexIds();
      if (vertexIndices === null) {
        this.clearSelection();
        return;
      }

      this.selectVertices(vertexIndices, true);
    } else if (this.subSelectionMode === 'edge') {
      const edgeIndices = this.getBoxSelectedEdgeIds();
      if (edgeIndices === null) {
        this.clearSelection();
        return;
      }

      this.selectEdges(edgeIndices, true);
    } else if (this.subSelectionMode === 'face') {
      const faceIndices = this.getBoxSelectedFaceIds();
      if (faceIndices === null) {
        this.clearSelection();
        return;
      }

      this.selectFaces(faceIndices, true);
    }
  }

  toggleSelectAll() {
    if (!this.editedObject || !this.editedObject.userData.meshData) return;

    const meshData = this.editedObject.userData.meshData;

    if (this.subSelectionMode === 'vertex') {
      if (this.selectedVertexIds.size > 0) {
        this.clearSelection();
      } else {
        const allIds = Array.from(meshData.vertices.keys());
        this.selectVertices(allIds);
      }
    } else if (this.subSelectionMode === 'edge') {
      if (this.selectedEdgeIds.size > 0) {
        this.clearSelection();
      } else {
        const allIds = Array.from(meshData.edges.keys());
        this.selectEdges(allIds);
      }
    } else if (this.subSelectionMode === 'face') {
      if (this.selectedFaceIds.size > 0) {
        this.clearSelection();
      } else {
        const allIds = Array.from(meshData.faces.keys());
        this.selectFaces(allIds);
      }
    }
  }

  onMouseDown(event) {
    if (!this.enable || event.button !== 0) return;

    this.dragging = false;
    this.mouseDownPos = { x: event.clientX, y: event.clientY };
  }

  onMouseMove(event) {
    if (!this.enable || !this.mouseDownPos) return;

    const dx = event.clientX - this.mouseDownPos.x;
    const dy = event.clientY - this.mouseDownPos.y;
    const dragThreshold = 1;

    if (!this.dragging && Math.hypot(dx, dy) > dragThreshold) {
      this.dragging = true;
      this.selectionBox.startSelection(event.clientX, event.clientY);
    }

    if (this.dragging) {
      this.selectionBox.updateSelection(event.clientX, event.clientY);
    }
  }

  onMouseUp(event) {
    if (!this.enable || event.button !== 0) return;
    
    this.selectionBox.finishSelection();

    // Store state
    const wasDragging = this.dragging;
    
    // Reset state
    this.dragging = false;
    this.mouseDownPos = null;

    if (wasDragging) {
      this.applyBoxSelection();
    } else {
      if (event.altKey) {
        this.handleLoopSelection(event);
      } else {
        this.applyClickSelection(event);
      }
    }
  }

  handleLoopSelection(event) {
    if (!this.editedObject || !this.editedObject.userData.meshData) return;

    // Try picking a vertex first (prioritize vertices for directional loop selection)
    const vertexId = this.pickNearestVertexOnMouse(event, this.renderer, this.camera);
    
    if (vertexId !== null) {
      this.selectLoopFromVertex(vertexId, event);
      return;
    }

    // Fallback to edge picking
    const edgeId = this.pickNearestEdgeOnMouse(event, this.renderer, this.camera);
    if (edgeId !== null) {
      this.selectLoopFromEdge(edgeId);
    }
  }

  selectLoopFromVertex(vertexId, event) {
    const meshData = this.editedObject.userData.meshData;
    const vertex = meshData.getVertex(vertexId);
    if (!vertex) return;

    // Project central vertex to screen
    const rect = this.renderer.domElement.getBoundingClientRect();
    const vPos = vertex.position;
    const pCenter = new THREE.Vector3(vPos.x, vPos.y, vPos.z).applyMatrix4(this.editedObject.matrixWorld).project(this.camera);
    
    const cx = (pCenter.x * 0.5 + 0.5) * rect.width;
    const cy = (-pCenter.y * 0.5 + 0.5) * rect.height;

    // Mouse position relative to vertex on screen
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    
    const dirX = mx - cx;
    const dirY = my - cy;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    
    // If click is exactly on vertex (rare), just pick an arbitrary edge or abort
    if (len < 0.001) return; 

    const mouseDir = new THREE.Vector2(dirX / len, dirY / len);

    let bestEdgeId = null;
    let maxDot = -Infinity;

    // Find the connected edge that aligns best with the mouse direction
    for (const eId of vertex.edgeIds) {
      const edge = meshData.edges.get(eId);
      if (!edge) continue;

      const neighborId = (edge.v1Id === vertexId) ? edge.v2Id : edge.v1Id;
      const neighbor = meshData.getVertex(neighborId);
      if (!neighbor) continue;

      const nPos = neighbor.position;
      const pNeighbor = new THREE.Vector3(nPos.x, nPos.y, nPos.z).applyMatrix4(this.editedObject.matrixWorld).project(this.camera);

      const nx = (pNeighbor.x * 0.5 + 0.5) * rect.width;
      const ny = (-pNeighbor.y * 0.5 + 0.5) * rect.height;

      const ex = nx - cx;
      const ey = ny - cy;
      const eLen = Math.sqrt(ex * ex + ey * ey);
      
      if (eLen < 0.001) continue;

      const edgeDir = new THREE.Vector2(ex / eLen, ey / eLen);
      const dot = mouseDir.dot(edgeDir);

      // We want the edge most parallel to the mouse direction. 
      // Loops go in two directions, but we usually want the one *along* the mouse line.
      // Actually, standard behavior: Alt-Click usually picks the loop "crossing" the edge you aimed at? 
      // No, user said: "Vertical or horizontal if the mouse is closer to a vertical or horizontal loop".
      // This implies the loop direction *is* the mouse direction relative to the vertex.
      // E.g. Click vertex, move mouse UP -> Select vertical loop.
      if (dot > maxDot) {
        maxDot = dot;
        bestEdgeId = eId;
      }
    }

    if (bestEdgeId !== null) {
      this.selectLoopFromEdge(bestEdgeId);
    }
  }

  selectLoopFromEdge(startEdgeId) {
    const meshData = this.editedObject.userData.meshData;
    const loopEdgeIds = this.getEdgeLoop(meshData, startEdgeId);

    if (this.subSelectionMode === 'vertex') {
      // Select all vertices in the edge loop
      const verticesToSelect = new Set();
      loopEdgeIds.forEach(eId => {
        const edge = meshData.edges.get(eId);
        if (edge) {
          verticesToSelect.add(edge.v1Id);
          verticesToSelect.add(edge.v2Id);
        }
      });
      this.selectVertices(Array.from(verticesToSelect), this.multiSelectEnabled); // Treat like box selection (add) if Shift is held? No, standard is replace unless Shift.
      // Wait, standard selectVertices logic handles multiselect flag internally. 
      // But here we are passing a list.
      // If Shift is pressed, we want to ADD to selection.
      // If not, we want to REPLACE.
      // My selectVertices method implementation:
      // "if (this.multiSelectEnabled) ... box selection: add only ... Click selection: toggle"
      // Since this is a "special" click, we probably want "Add" behavior if Shift is held, "Replace" if not.
      // The current 'selectVertices' method distinguishes between 'box selection' (add) and 'click selection' (toggle).
      // Loop selection is more like a "Box Selection" in terms of "Set the selection to this group".
      // Let's pass true for isBoxSelection to force "Add" behavior if multiSelect is on, 
      // or clear+add if off.
      // Wait, 'selectVertices' logic:
      // if multiSelect:
      //    if box: add only
      //    else: toggle
      // if not multiSelect:
      //    clear then add
      //
      // If I use isBoxSelection=true:
      //   Shift=True -> Add loop to existing. (Correct)
      //   Shift=False -> Clear, then Add loop. (Correct)
      this.selectVertices(Array.from(verticesToSelect), true);

    } else if (this.subSelectionMode === 'edge') {
      this.selectEdges(loopEdgeIds, true);
    } else if (this.subSelectionMode === 'face') {
      const loopFaceIds = this.getFaceLoop(meshData, startEdgeId);
      this.selectFaces(loopFaceIds, true);
    }
  }

  getEdgeLoop(meshData, startEdgeId) {
    const loopEdges = new Set([startEdgeId]);
    const startEdge = meshData.edges.get(startEdgeId);
    if (!startEdge) return [];

    // Traverse Direction 1 (from v1)
    this.collectLoopEdges(meshData, startEdge, startEdge.v1Id, loopEdges);
    // Traverse Direction 2 (from v2)
    this.collectLoopEdges(meshData, startEdge, startEdge.v2Id, loopEdges);

    return Array.from(loopEdges);
  }

  getFaceLoop(meshData, startEdgeId) {
    const startEdge = meshData.edges.get(startEdgeId);
    if (!startEdge) return [];

    const loopFaces = new Set();
    startEdge.faceIds.forEach(fid => loopFaces.add(fid));

    // There should be 2 faces sharing the start edge for a proper loop start
    if (startEdge.faceIds.size !== 2) {
      return Array.from(loopFaces);
    }

    const faces = Array.from(startEdge.faceIds);
    // Traverse Direction 1 (Face 0)
    this.collectFaceLoop(meshData, startEdge, faces[0], loopFaces);
    // Traverse Direction 2 (Face 1)
    this.collectFaceLoop(meshData, startEdge, faces[1], loopFaces);

    return Array.from(loopFaces);
  }

  collectFaceLoop(meshData, incomingEdge, startFaceId, accumulatedSet) {
    let currentEdge = incomingEdge;
    let currentFaceId = startFaceId;

    let count = 0;
    const MAX_STEPS = 10000;

    while (count++ < MAX_STEPS) {
      const face = meshData.faces.get(currentFaceId);
      if (!face) break;

      // Stop if not a quad (or roughly quad-like: must have 4 edges to define 'opposite')
      if (face.edgeIds.size !== 4) break;

      // Find edge opposite to currentEdge in this face
      // In a quad, the opposite edge shares NO vertices with the current edge.
      const currentEdgeObj = meshData.edges.get(currentEdge.id);
      if (!currentEdgeObj) break;
      const v1 = currentEdgeObj.v1Id;
      const v2 = currentEdgeObj.v2Id;

      let nextEdge = null;
      for (const eId of face.edgeIds) {
        if (eId === currentEdge.id) continue;
        const e = meshData.edges.get(eId);
        if (!e) continue;
        
        if (e.v1Id !== v1 && e.v1Id !== v2 && e.v2Id !== v1 && e.v2Id !== v2) {
          nextEdge = e;
          break;
        }
      }

      if (!nextEdge) break;

      // Now cross nextEdge to the neighbor face
      let nextFaceId = null;
      for (const fId of nextEdge.faceIds) {
        if (fId !== currentFaceId) {
          nextFaceId = fId;
          break;
        }
      }

      if (nextFaceId === null) break; // Boundary reached
      if (accumulatedSet.has(nextFaceId)) break; // Loop closed

      accumulatedSet.add(nextFaceId);

      currentEdge = nextEdge;
      currentFaceId = nextFaceId;
    }
  }

  collectLoopEdges(meshData, incomingEdge, startVertexId, accumulatedSet) {
    let currentEdge = incomingEdge;
    let currentVertexId = startVertexId;

    // Safety limit
    let count = 0;
    const MAX_STEPS = 10000;

    while (count++ < MAX_STEPS) {
      const vertex = meshData.getVertex(currentVertexId);
      if (!vertex) break;

      // Stop at poles (vertices with valence != 4) for quad-like logic
      // Ideally, loop stops if it's not a regular grid junction.
      if (vertex.edgeIds.size !== 4) break;

      // Find the "opposite" edge.
      // In a regular quad junction, the opposite edge shares NO faces with the incoming edge.
      const connectedEdges = Array.from(vertex.edgeIds).map(id => meshData.edges.get(id));
      const incomingFaceIds = incomingEdge.faceIds;

      let nextEdge = null;

      // Filter for edges that don't share a face
      for (const e of connectedEdges) {
        if (e.id === currentEdge.id) continue;

        let sharesFace = false;
        for (const fId of e.faceIds) {
          if (incomingFaceIds.has(fId)) {
            sharesFace = true;
            break;
          }
        }

        if (!sharesFace) {
          nextEdge = e;
          break; // Found it
        }
      }

      if (!nextEdge) break; // Could not find a clear opposite edge
      if (accumulatedSet.has(nextEdge.id)) break; // Loop closed

      accumulatedSet.add(nextEdge.id);

      // Move to next vertex
      currentEdge = nextEdge;
      currentVertexId = (nextEdge.v1Id === currentVertexId) ? nextEdge.v2Id : nextEdge.v1Id;
    }
  }

  pickNearestVertexOnMouse(event, renderer, camera, threshold = 0.1) {
    const rect = renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const vertexPoints = this.sceneManager.sceneHelpers.getObjectByName('__VertexPoints');
    if (!vertexPoints) return null;

    this.raycaster.setFromCamera(this.mouse, camera);
    this.raycaster.params.Points.threshold = threshold;

    const vertexHits = this.raycaster.intersectObject(vertexPoints);
    if (vertexHits.length === 0) return null;

    const visibleVertices = this.filterVisibleVertices(vertexHits, vertexPoints, camera);
    if (visibleVertices.length === 0) return null;

    const nearestVertexId = this.pickNearestVertex(visibleVertices, camera, rect, vertexPoints);

    return nearestVertexId;
  }

  pickNearestEdgeOnMouse(event, renderer, camera, threshold = 0.1) {
    const rect = renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const edgeLines = [];
    this.sceneManager.sceneHelpers.traverse(obj => {
      if (obj.name === '__EdgeLines' && obj.userData.edge) {
        edgeLines.push(obj);
      }
    });

    this.raycaster.setFromCamera(this.mouse, camera);
    this.raycaster.params.Line.threshold = threshold;
    
    const edgeHits = this.raycaster.intersectObjects(edgeLines, false);
    if (edgeHits.length === 0) return null;

    const visibleEdges = this.filterVisibleEdges(edgeHits, camera);
    if (visibleEdges.length === 0) return null;

    const nearestEdgeId = this.pickNearestEdge(visibleEdges, camera, rect);

    return nearestEdgeId;
  }

  pickNearestFaceOnMouse(event, renderer, camera) {
    const rect = renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const faceMesh = this.sceneManager.sceneHelpers.getObjectByName('__FacePolygons');
    if (!faceMesh) return null;

    this.raycaster.setFromCamera(this.mouse, camera);

    const faceHits = this.raycaster.intersectObject(faceMesh);
    if (faceHits.length === 0) return null;
    
    const visibleFaces = this.filterVisibleFaces(faceHits, faceMesh, camera);
    if (visibleFaces.length === 0) return null;

    const nearestFaceId = this.pickNearestFace(visibleFaces, camera, rect, faceMesh);

    return nearestFaceId;
  }

  getBoxSelectedVertexIds() {
    const frustum = this.selectionBox.computeFrustumFromSelection(this.camera);
    if (!frustum) return null;

    const vertexPoints = this.sceneManager.sceneHelpers.getObjectByName('__VertexPoints');
    if (!vertexPoints) return null;

    const vertexHits = this.selectionBox.getVerticesInFrustum(vertexPoints, frustum);
    if (vertexHits.length === 0) return null;

    const visibleVertices = this.filterVisibleVertices(vertexHits, vertexPoints, this.camera);
    if (visibleVertices.length === 0) return null;

    const vertexIndices = visibleVertices.map(v => v.index);
    return vertexIndices;
  }

  getBoxSelectedEdgeIds() {
    const frustum = this.selectionBox.computeFrustumFromSelection();
    if (!frustum) return null;

    const edgeLines = [];
    this.sceneManager.sceneHelpers.traverse(obj => {
      if (obj.name === '__EdgeLines' && obj.userData.edge) {
        edgeLines.push(obj);
      }
    });

    const edgeHits = this.selectionBox.getEdgesInFrustum(edgeLines, frustum);
    if (edgeHits.length === 0) return null;

    const visibleEdges = this.filterVisibleEdges(edgeHits, this.camera);
    if (visibleEdges.length === 0) return null;

    const insideHits = visibleEdges.filter(e => e.type === "endpoint");
    const clipHits = visibleEdges.filter(e => e.type === "clipping");

    // Prefer inside hits; if none exist, use clipping hits.
    const selectedEdges = insideHits.length > 0 ? insideHits : clipHits;

    const edgeIndices = selectedEdges.map(e => e.edge.id);
    return edgeIndices;
  }

  getBoxSelectedFaceIds() {
    const frustum = this.selectionBox.computeFrustumFromSelection();
    if (!frustum) return null;

    const faceMesh = this.sceneManager.sceneHelpers.getObjectByName('__FacePolygons');
    if (!faceMesh) return null;

    const faceHits = this.selectionBox.getFacesInFrustum(faceMesh, frustum);
    if (faceHits.length === 0) return null;

    const visibleFaces = this.filterVisibleFaces(faceHits, faceMesh, this.camera);
    if (visibleFaces.length === 0) return null;

    const faceIndices = visibleFaces.map(f => f.index);
    return faceIndices;
  }

  setVertexSelection(ids) {
    this.selectedVertexIds.clear();
    ids.forEach(id => this.selectedVertexIds.add(id));
    this.updateVertexHandle();
    this.signals.editSelectionChanged.dispatch('vertex');
  }

  setEdgeSelection(ids) {
    this.selectedEdgeIds.clear();
    ids.forEach(id => this.selectedEdgeIds.add(id));

    const vIds = this.getSelectedEdgeVertexIds();
    this.selectedVertexIds.clear();
    vIds.forEach(id => this.selectedVertexIds.add(id));

    this.updateVertexHandle();
    this.signals.editSelectionChanged.dispatch('edge');
  }

  setFaceSelection(ids) {
    this.selectedFaceIds.clear();
    ids.forEach(id => this.selectedFaceIds.add(id));

    const vIds = this.getSelectedFaceVertexIds();
    this.selectedVertexIds.clear();
    vIds.forEach(id => this.selectedVertexIds.add(id));

    this.updateVertexHandle();
    this.signals.editSelectionChanged.dispatch('face');
  }

  selectVertices(vertexIds, isBoxSelection = false) {
    const isArray = Array.isArray(vertexIds);
    if (!isArray) vertexIds = [vertexIds];

    let newIds = new Set();
    
    if (this.multiSelectEnabled) {
      newIds = new Set(this.selectedVertexIds);
      if (isBoxSelection) {
        vertexIds.forEach(id => newIds.add(id));
      } else {
        vertexIds.forEach(id => {
          if (newIds.has(id)) newIds.delete(id);
          else newIds.add(id);
        });
      }
    } else {
      newIds = new Set(vertexIds);
    }

    const currentArr = Array.from(this.selectedVertexIds).sort().join(',');
    const newArr = Array.from(newIds).sort().join(',');

    if (currentArr !== newArr) {
        this.editor.execute(new SelectSubObjectCommand(this.editor, 'vertex', Array.from(newIds)));
    }
  }

  selectEdges(edgeIds, isBoxSelection = false) {
    const isArray = Array.isArray(edgeIds);
    if (!isArray) edgeIds = [edgeIds];

    let newIds = new Set();

    if (this.multiSelectEnabled) {
      newIds = new Set(this.selectedEdgeIds);
      if (isBoxSelection) {
        edgeIds.forEach(id => newIds.add(id));
      } else {
        edgeIds.forEach(id => {
          if (newIds.has(id)) newIds.delete(id);
          else newIds.add(id);
        });
      }
    } else {
      newIds = new Set(edgeIds);
    }

    const currentArr = Array.from(this.selectedEdgeIds).sort().join(',');
    const newArr = Array.from(newIds).sort().join(',');

    if (currentArr !== newArr) {
        this.editor.execute(new SelectSubObjectCommand(this.editor, 'edge', Array.from(newIds)));
    }
  }

  selectFaces(faceIds, isBoxSelection = false) {
    const isArray = Array.isArray(faceIds);
    if (!isArray) faceIds = [faceIds];

    let newIds = new Set();

    if (this.multiSelectEnabled) {
      newIds = new Set(this.selectedFaceIds);
      if (isBoxSelection) {
        faceIds.forEach(id => newIds.add(id));
      } else {
        faceIds.forEach(id => {
          if (newIds.has(id)) newIds.delete(id);
          else newIds.add(id);
        });
      }
    } else {
      newIds = new Set(faceIds);
    }

    const currentArr = Array.from(this.selectedFaceIds).sort().join(',');
    const newArr = Array.from(newIds).sort().join(',');

    if (currentArr !== newArr) {
        this.editor.execute(new SelectSubObjectCommand(this.editor, 'face', Array.from(newIds)));
    }
  }

  clear() {
    this.selectedVertexIds.clear();
    this.selectedEdgeIds.clear();
    this.selectedFaceIds.clear();
    this.vertexHandle.visible = false;
    this.dragging = false;
    this.mouseDownPos = null;

    this.signals.editSelectionCleared.dispatch();
  }

  clearSelection() {
    // Only clear the current mode's selection to avoid side effects in other modes (and simpler undo)
    let count = 0;
    if (this.subSelectionMode === 'vertex') count = this.selectedVertexIds.size;
    else if (this.subSelectionMode === 'edge') count = this.selectedEdgeIds.size;
    else if (this.subSelectionMode === 'face') count = this.selectedFaceIds.size;
    
    if (count > 0) {
        this.editor.execute(new SelectSubObjectCommand(this.editor, this.subSelectionMode, []));
    } else {
        // Fallback for safety or if mixed modes (though we focus on current mode)
        this.clear();
    }
  }

  updateVertexHandle() {
    if (!this.vertexHandle || !this.editedObject) return;

    const meshData = this.editedObject.userData.meshData;
    if (!meshData) return;

    let vertexIds = [];

    if (this.subSelectionMode === 'vertex') {
      vertexIds = this.getSelectedVertexIds();
    } else if (this.subSelectionMode === 'edge') {
      vertexIds = this.getSelectedEdgeVertexIds();
    } else if (this.subSelectionMode === 'face') {
      vertexIds = this.getSelectedFaceVertexIds();
    }

    vertexIds = [...new Set(vertexIds)];

    if (vertexIds.length === 0) {
      this.vertexHandle.visible = false;
      return;
    }

    const worldPos = new THREE.Vector3();
    const sum = new THREE.Vector3();
    const localPos = new THREE.Vector3();

    for (const id of vertexIds) {
      const v = meshData.getVertex(id);
      if (!v) continue;

      localPos.set(v.position.x, v.position.y, v.position.z);
      worldPos.copy(localPos).applyMatrix4(this.editedObject.matrixWorld);

      sum.add(worldPos);
    }
    sum.divideScalar(vertexIds.length);

    this.vertexHandle.position.copy(sum);
    this.vertexHandle.visible = true;
  }

  filterVisibleVertices(vertexHits, vertexPoints, camera) {
    const mainObjects = this.sceneManager.mainScene.children;
    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);

    const reverseRay = new THREE.Raycaster();
    const visibleVertices = [];

    const posAttr = vertexPoints.geometry.getAttribute('position');
    const epsilon = 0.001;
    const occluders = mainObjects.filter(obj => obj !== vertexPoints);

    for (const hit of vertexHits) {
      const vertexPos = new THREE.Vector3(
        posAttr.getX(hit.index),
        posAttr.getY(hit.index),
        posAttr.getZ(hit.index)
      ).applyMatrix4(vertexPoints.matrixWorld);

      if (this.sceneManager.mainScene.overrideMaterial?.wireframe) {
        visibleVertices.push({ ...hit, point: vertexPos });
        continue;
      }

      const dirToCamera = new THREE.Vector3().subVectors(cameraPos, vertexPos).normalize();
      const rayOrigin = vertexPos.clone().add(dirToCamera.clone().multiplyScalar(epsilon));
      reverseRay.set(rayOrigin, dirToCamera);

      const hits = reverseRay.intersectObjects(occluders, true);
      const maxDist = vertexPos.distanceTo(cameraPos);
      const blocked = hits.some(h => h.distance < maxDist - epsilon);

      if (!blocked) {
        visibleVertices.push({ ...hit, point: vertexPos });
      }
    }

    return visibleVertices;
  }

  filterVisibleEdges(edgeHits, camera) {
    if (edgeHits.length === 0) return [];

    const mainObjects = this.sceneManager.mainScene.children;
    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);

    const epsilon = 0.001;
    const reverseRay = new THREE.Raycaster();
    const visibleEdges = [];

    // occluders: everything in the scene except the edge helper lines
    const occluders = mainObjects.filter(obj => obj.name !== '__EdgeLines');

    for (const hit of edgeHits) {
      const thinLine = hit.object;
      const geo = thinLine.geometry;
      const pos = geo.getAttribute('position');

      // world-space endpoints
      const vA = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0))
        .applyMatrix4(thinLine.matrixWorld);

      const vB = new THREE.Vector3(pos.getX(1), pos.getY(1), pos.getZ(1))
        .applyMatrix4(thinLine.matrixWorld);

      if (this.sceneManager.mainScene.overrideMaterial?.wireframe) {
        visibleEdges.push({
          thinLine,
          visualLine: thinLine.userData.visualLine,
          edge: thinLine.userData.edge,
          vA,
          vB,
          screenDist: hit.distance,
          type: hit.type,
        });
        continue;
      }

      const dirToCamera = new THREE.Vector3().subVectors(cameraPos, hit.point).normalize();
      const rayOrigin = (hit.point).clone().addScaledVector(dirToCamera, epsilon);

      reverseRay.set(rayOrigin, dirToCamera);

      const hits = reverseRay.intersectObjects(occluders, true);
      const maxDist = (hit.point).distanceTo(cameraPos);

      // If any hit is closer than the camera, the edge is occluded.
      const blocked = hits.some(h => h.distance < maxDist - epsilon);

      if (!blocked) {
        visibleEdges.push({
          thinLine,
          visualLine: thinLine.userData.visualLine,
          edge: thinLine.userData.edge,
          vA,
          vB,
          screenDist: hit.distance,
          type: hit.type,
        });
      }
    }

    return visibleEdges;
  }

  filterVisibleFaces(faceHits, faceMesh, camera) {
    if (!faceHits || faceHits.length === 0) return [];

    const visibleFaces = [];
    const mainObjects = this.sceneManager.mainScene.children;

    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);

    const reverseRay = new THREE.Raycaster();
    const epsilon = 0.001;
    const occluders = mainObjects.filter(obj => obj !== faceMesh);

    for (const hit of faceHits) {
      if (this.sceneManager.mainScene.overrideMaterial?.wireframe) {
        visibleFaces.push(hit);
        continue;
      }

      const facePoint = hit.point.clone();

      const dirToCamera = new THREE.Vector3().subVectors(cameraPos, facePoint).normalize();
      const rayOrigin = facePoint.clone().addScaledVector(dirToCamera, epsilon);

      reverseRay.set(rayOrigin, dirToCamera);

      const hits = reverseRay.intersectObjects(occluders, true);
      const maxDist = facePoint.distanceTo(cameraPos);

      const blocked = hits.some(h => {
        //  Skip self-face intersection
        if (h.object === this.editedObject) {
          const hitFaceId = this.findFaceIdFromTriIndex(h.faceIndex, faceMesh.userData.faceRanges);
          if (hitFaceId === hit.index) return false;
        }

        return h.distance < maxDist - epsilon;
      });

      if (!blocked) {
        visibleFaces.push(hit);
      }
    }

    return visibleFaces;
  }

  pickNearestVertex(vertexHits, camera, rect, vertexPoints) {
    let nearestVertexId = null;
    let minScreenDistSq = Infinity;

    const vertexIdAttr = vertexPoints.geometry.getAttribute('vertexId');

    const clickX = (this.mouse.x * 0.5 + 0.5) * rect.width;
    const clickY = (-this.mouse.y * 0.5 + 0.5) * rect.height;

    const screenPos = new THREE.Vector3();
    vertexHits.forEach(hit => {
      screenPos.copy(hit.point).project(camera);
      const sx = (screenPos.x * 0.5 + 0.5) * rect.width;
      const sy = (-screenPos.y * 0.5 + 0.5) * rect.height;

      const dx = sx - clickX;
      const dy = sy - clickY;
      const distPxSq = dx * dx + dy * dy;

      if (distPxSq < minScreenDistSq) {
        minScreenDistSq = distPxSq;
        nearestVertexId = vertexIdAttr.getX(hit.index);
      }
    });
    
    return nearestVertexId;
  }

  pickNearestEdge(edgeHits, camera, rect) {
    if (!edgeHits || edgeHits.length === 0) return null;

    let nearestEdgeId = null;
    let minDistSq = Infinity;

    edgeHits.forEach(edgeHit => {
      const result = this.getClosestPointOnScreenLine(edgeHit, camera, rect);

      if (result.distSq < minDistSq) {
        minDistSq = result.distSq;
        nearestEdgeId = result.edgeId;
      }
    });

    return nearestEdgeId;
  }

  pickNearestFace(faceHits, camera, rect, faceMesh) {
    let nearestFaceId = null;
    let minScreenDistSq = Infinity;

    const clickX = (this.mouse.x * 0.5 + 0.5) * rect.width;
    const clickY = (-this.mouse.y * 0.5 + 0.5) * rect.height;

    const screenPos = new THREE.Vector3();

    faceHits.forEach(hit => {
      screenPos.copy(hit.point).project(camera);

      const sx = (screenPos.x * 0.5 + 0.5) * rect.width;
      const sy = (-screenPos.y * 0.5 + 0.5) * rect.height;

      const dx = sx - clickX;
      const dy = sy - clickY;
      const distSq = dx * dx + dy * dy;

      const faceId = this.findFaceIdFromTriIndex(hit.faceIndex, faceMesh.userData.faceRanges);
      if (faceId === null) return;

      if (distSq < minScreenDistSq) {
        minScreenDistSq = distSq;
        nearestFaceId = faceId;
      }
    });

    return nearestFaceId;
  }

  findFaceIdFromTriIndex(triIndex, faceRanges) {
    for (const fr of faceRanges) {
      if (triIndex >= fr.triStart && triIndex < fr.triStart + fr.triCount) {
        return fr.faceId;
      }
    }
    return null;
  }

  getClosestPointOnScreenLine(edgeHit, camera, rect) {
    // Mouse in pixel coordinates
    const clickX = (this.mouse.x * 0.5 + 0.5) * rect.width;
    const clickY = (-this.mouse.y * 0.5 + 0.5) * rect.height;

    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();

    // Project both endpoints to NDC → screen
    pA.copy(edgeHit.vA).project(camera);
    pB.copy(edgeHit.vB).project(camera);

    const x1 = (pA.x * 0.5 + 0.5) * rect.width;
    const y1 = (-pA.y * 0.5 + 0.5) * rect.height;

    const x2 = (pB.x * 0.5 + 0.5) * rect.width;
    const y2 = (-pB.y * 0.5 + 0.5) * rect.height;

    // Vector AB and AP
    const ABx = x2 - x1;
    const ABy = y2 - y1;
    const APx = clickX - x1;
    const APy = clickY - y1;

    const abLenSq = ABx * ABx + ABy * ABy;

    // Handle zero-length (rare but safe)
    let t = 0;
    if (abLenSq > 0) {
      t = (APx * ABx + APy * ABy) / abLenSq;
    }

    // Clamp to segment
    t = Math.max(0, Math.min(1, t));

    // Closest point
    const cx = x1 + ABx * t;
    const cy = y1 + ABy * t;

    const dx = cx - clickX;
    const dy = cy - clickY;

    return {
      cx,
      cy,
      distSq: dx * dx + dy * dy,
      t,
      edgeId: edgeHit.edge.id
    };
  }

  getSelectedVertexIds() {
    return Array.from(this.selectedVertexIds);
  }

  getSelectedEdgeVertexIds() {
    if (!this.editedObject) return [];
    
    const meshData = this.editedObject.userData.meshData;
    if (!meshData) return [];

    const result = new Set();
    for (const edgeId of this.selectedEdgeIds) {
      const edge = meshData.edges.get(edgeId);
      if (!edge) continue;
      result.add(edge.v1Id);
      result.add(edge.v2Id);
    }
    return Array.from(result);
  }

  getSelectedFaceVertexIds() {
    if (!this.editedObject) return [];

    const meshData = this.editedObject.userData.meshData;
    if (!meshData) return [];

    const result = new Set();
    for (const faceId of this.selectedFaceIds) {
      const face = meshData.faces.get(faceId);
      if (!face) continue;
      for (const vId of face.vertexIds) {
        result.add(vId);
      }
    }
    return Array.from(result);
  }

  getFacesFromSelection() {
    if (!this.editedObject || !this.editedObject.userData.meshData) return new Set();
    const meshData = this.editedObject.userData.meshData;
    const faceIds = new Set();

    if (this.subSelectionMode === 'vertex') {
      const selectedV = this.selectedVertexIds;
      if (selectedV.size === 0) return faceIds;
      
      // Find faces where ALL vertices are selected
      for (const face of meshData.faces.values()) {
        let allSelected = true;
        for (const vid of face.vertexIds) {
          if (!selectedV.has(vid)) {
            allSelected = false;
            break;
          }
        }
        if (allSelected) {
          faceIds.add(face.id);
        }
      }
    } else if (this.subSelectionMode === 'edge') {
      const selectedE = this.selectedEdgeIds;
      if (selectedE.size === 0) return faceIds;

      // Find faces where ALL edges are selected
      for (const face of meshData.faces.values()) {
        let allSelected = true;
        for (const eid of face.edgeIds) {
          if (!selectedE.has(eid)) {
            allSelected = false;
            break;
          }
        }
        if (allSelected) {
          faceIds.add(face.id);
        }
      }
    } else {
      // Face mode
      return new Set(this.selectedFaceIds);
    }

    return faceIds;
  }

  selectAll() {
    if (!this.editedObject || !this.editedObject.userData.meshData) return;
    const meshData = this.editedObject.userData.meshData;

    if (this.subSelectionMode === 'vertex') {
      const allIds = Array.from(meshData.vertices.keys());
      this.editor.execute(new SelectSubObjectCommand(this.editor, 'vertex', allIds));
    } else if (this.subSelectionMode === 'edge') {
      const allIds = Array.from(meshData.edges.keys());
      this.editor.execute(new SelectSubObjectCommand(this.editor, 'edge', allIds));
    } else if (this.subSelectionMode === 'face') {
      const allIds = Array.from(meshData.faces.keys());
      this.editor.execute(new SelectSubObjectCommand(this.editor, 'face', allIds));
    }
  }

  invert() {
    if (!this.editedObject || !this.editedObject.userData.meshData) return;
    const meshData = this.editedObject.userData.meshData;

    if (this.subSelectionMode === 'vertex') {
      const allIds = Array.from(meshData.vertices.keys());
      const newIds = allIds.filter(id => !this.selectedVertexIds.has(id));
      this.editor.execute(new SelectSubObjectCommand(this.editor, 'vertex', newIds));
    } else if (this.subSelectionMode === 'edge') {
      const allIds = Array.from(meshData.edges.keys());
      const newIds = allIds.filter(id => !this.selectedEdgeIds.has(id));
      this.editor.execute(new SelectSubObjectCommand(this.editor, 'edge', newIds));
    } else if (this.subSelectionMode === 'face') {
      const allIds = Array.from(meshData.faces.keys());
      const newIds = allIds.filter(id => !this.selectedFaceIds.has(id));
      this.editor.execute(new SelectSubObjectCommand(this.editor, 'face', newIds));
    }
  }
}