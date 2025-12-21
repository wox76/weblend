import * as THREE from 'three';
import { BevelCommand } from '../commands/BevelCommand.js';
import { VertexEditor } from './VertexEditor.js';
import { MeshData } from '../core/MeshData.js';

export class BevelTool {
  constructor(editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.editSelection = editor.editSelection;
    this.controls = editor.controlsManager;

    this.isModalBeveling = false;
    this.initialMouseX = 0;
    this.radius = 0;
    this.segments = 1;

    this.onModalMouseMoveHandler = this.onModalMouseMove.bind(this);
    this.onModalMouseUpHandler = this.onModalMouseUp.bind(this);
    this.onModalWheelHandler = this.onModalWheel.bind(this);
  }

  enable() {}

  disable() {
    this.cancelModalBevel();
  }

  startModalBevel() {
    if (this.isModalBeveling) return;

    if (this.editSelection.selectedEdgeIds.size === 0 && this.editSelection.selectedFaceIds.size > 0) {
      const meshData = this.editSelection.editedObject.userData.meshData;
      const edgesFromFaces = new Set();
      for (const faceId of this.editSelection.selectedFaceIds) {
        const face = meshData.faces.get(faceId);
        if (face) {
          for (const edgeId of face.edgeIds) edgesFromFaces.add(edgeId);
        }
      }
      if (edgesFromFaces.size > 0) this.editSelection.selectEdges(Array.from(edgesFromFaces));
    }

    if (this.editSelection.selectedEdgeIds.size === 0) return;

    this.isModalBeveling = true;
    this.initialMouseX = 0;
    this.radius = 0;
    this.segments = 1;

    this.targetEdgeIds = new Set(this.editSelection.selectedEdgeIds);
    this.editSelection.clearSelection();

    this.controls.enabled = false;

    const editedObject = this.editSelection.editedObject;
    if (editedObject && editedObject.userData.meshData) {
      this.beforeMeshData = MeshData.serializeMeshData(editedObject.userData.meshData);
    }

    window.addEventListener('mousemove', this.onModalMouseMoveHandler);
    window.addEventListener('mouseup', this.onModalMouseUpHandler);
    window.addEventListener('wheel', this.onModalWheelHandler, { passive: false });
  }

  onModalMouseMove(event) {
    if (!this.isModalBeveling) return;

    if (this.initialMouseX === 0) {
      this.initialMouseX = event.clientX;
      return;
    }

    const deltaX = event.clientX - this.initialMouseX;
    this.radius = Math.max(0, deltaX * 0.01);

    this.updateBevel();
  }

  onModalWheel(event) {
    if (!this.isModalBeveling) return;
    event.preventDefault();

    if (event.deltaY < 0) this.segments++;
    else this.segments = Math.max(1, this.segments - 1);

    this.updateBevel();
  }

  updateBevel() {
    if (!this.beforeMeshData) return;

    const editedObject = this.editSelection.editedObject;
    const freshMeshData = MeshData.deserializeMeshData(this.beforeMeshData);
    editedObject.userData.meshData = freshMeshData;

    if (this.radius > 0.00001) {
      this.applyBevel(freshMeshData, this.targetEdgeIds, this.radius, this.segments);
    }

    const vertexEditor = new VertexEditor(this.editor, editedObject);
    vertexEditor.updateGeometryAndHelpers();
    this.signals.objectChanged.dispatch();
  }

  applyBevel(meshData, selectedEdgeIdsSet, radius, segments) {
    const selectedEdges = new Set(selectedEdgeIdsSet);
    const bevelVertices = new Set();
    for (const edgeId of selectedEdges) {
      const edge = meshData.edges.get(edgeId);
      if (edge) {
        bevelVertices.add(edge.v1Id);
        bevelVertices.add(edge.v2Id);
      }
    }

    const faceCornerReplacements = new Map();
    const getReplacement = (faceId, vertexId) => {
      if (!faceCornerReplacements.has(faceId)) return null;
      return faceCornerReplacements.get(faceId).get(vertexId) || null;
    };
    const setReplacement = (faceId, vertexId, replacements) => {
      if (!faceCornerReplacements.has(faceId)) faceCornerReplacements.set(faceId, new Map());
      faceCornerReplacements.get(faceId).set(vertexId, replacements);
    };

    const originalFaces = Array.from(meshData.faces.values());

    for (const face of originalFaces) {
      const vIds = face.vertexIds;
      const n = vIds.length;

      for (let i = 0; i < n; i++) {
        const vId = vIds[i];
        if (!bevelVertices.has(vId)) continue;

        const prevV = vIds[(i - 1 + n) % n];
        const nextV = vIds[(i + 1) % n];
        const edgePrev = meshData.getEdge(prevV, vId);
        const edgeNext = meshData.getEdge(vId, nextV);
        if (!edgePrev || !edgeNext) continue;

        const isPrevSel = selectedEdges.has(edgePrev.id);
        const isNextSel = selectedEdges.has(edgeNext.id);

        if (!isPrevSel && !isNextSel) continue;

        const vPos = meshData.getVertex(vId).position;
        const V = new THREE.Vector3(vPos.x, vPos.y, vPos.z);

        const getEdgeVec = (neighborVId) => {
          const neighborPos = meshData.getVertex(neighborVId).position;
          return new THREE.Vector3(
            neighborPos.x - vPos.x,
            neighborPos.y - vPos.y,
            neighborPos.z - vPos.z
          );
        };

        const vecPrev = getEdgeVec(prevV);
        const vecNext = getEdgeVec(nextV);

        let newIds = [];

        if (isPrevSel && isNextSel) {
          const u = vecPrev.clone().normalize();
          const v = vecNext.clone().normalize();
          const angle = u.angleTo(v);
          const halfAngle = angle * 0.5;
          const sinHalf = Math.sin(halfAngle);
          const dist = sinHalf > 0.00001 ? (radius / sinHalf) : radius;
          const bisector = u.clone().add(v).normalize();
          const pos = V.clone().add(bisector.multiplyScalar(dist));
          newIds.push(meshData.addVertex({ x: pos.x, y: pos.y, z: pos.z }).id);
        } else if (isPrevSel && !isNextSel) {
          const dir = vecPrev.clone().normalize();
          const pos = V.clone().add(dir.multiplyScalar(radius));
          newIds.push(meshData.addVertex({ x: pos.x, y: pos.y, z: pos.z }).id);
          // Keep V to close the gap with unselected edge
          newIds.push(vId);
        } else if (!isPrevSel && isNextSel) {
          const dir = vecNext.clone().normalize();
          const pos = V.clone().add(dir.multiplyScalar(radius));
          // Keep V to close the gap with unselected edge
          newIds.push(vId);
          newIds.push(meshData.addVertex({ x: pos.x, y: pos.y, z: pos.z }).id);
        }

        if (newIds.length > 0) setReplacement(face.id, vId, newIds);
      }
    }

    const facesToRemove = [];
    for (const face of originalFaces) {
      let newVertexIds = [];
      let modified = false;
      for (const vId of face.vertexIds) {
        const repls = getReplacement(face.id, vId);
        if (repls) {
          newVertexIds.push(...repls);
          modified = true;
        } else {
          newVertexIds.push(vId);
        }
      }
      if (modified) {
        newVertexIds = newVertexIds.filter((v, i, arr) => v !== arr[(i + 1) % arr.length]);
        if (newVertexIds.length >= 3) {
          meshData.addFace(newVertexIds.map(id => meshData.getVertex(id)));
        }
        facesToRemove.push(face);
      }
    }
    facesToRemove.forEach(f => meshData.deleteFace(f));

    const cornerChains = new Map();
    const addChain = (vId, chain) => {
        if (!cornerChains.has(vId)) cornerChains.set(vId, []);
        cornerChains.get(vId).push(chain);
    };

    const processedEdges = new Set();
    for (const edgeId of selectedEdges) {
      if (processedEdges.has(edgeId)) continue;
      const edge = meshData.edges.get(edgeId);
      if (!edge) continue;

      const adjacentFaces = originalFaces.filter(f => {
          const eIds = Array.isArray(f.edgeIds) ? f.edgeIds : Array.from(f.edgeIds);
          return eIds.includes(edgeId);
      });

      if (adjacentFaces.length !== 2) continue;

      const f1 = adjacentFaces[0];
      const f2 = adjacentFaces[1];

      const r1 = getReplacement(f1.id, edge.v1Id);
      const r2 = getReplacement(f2.id, edge.v1Id);
      const r3 = getReplacement(f1.id, edge.v2Id);
      const r4 = getReplacement(f2.id, edge.v2Id);
      
      if (!r1 || !r2 || !r3 || !r4) continue;

      // Extract bevel vertices (skip original vId if present)
      const p1 = r1.find(id => id !== edge.v1Id); 
      const p4 = r2.find(id => id !== edge.v1Id);
      const p2 = r3.find(id => id !== edge.v2Id);
      const p3 = r4.find(id => id !== edge.v2Id);

      if (!p1 || !p2 || !p3 || !p4) continue;

      const vOrig1 = meshData.getVertex(edge.v1Id).position;
      const vOrig2 = meshData.getVertex(edge.v2Id).position;
      const c1 = new THREE.Vector3(vOrig1.x, vOrig1.y, vOrig1.z);
      const c2 = new THREE.Vector3(vOrig2.x, vOrig2.y, vOrig2.z);

      const result = this.createBevelStrip(meshData, p1, p2, p3, p4, segments, c1, c2);
      
      addChain(edge.v1Id, result.chainNear);
      addChain(edge.v2Id, result.chainFar);

      processedEdges.add(edgeId);
    }

    for (const [vId, chains] of cornerChains) {
        if (chains.length < 2) continue;

        // Simplify Loop Construction:
        // Collect all vertices, remove duplicates, form a set.
        // If chains are connected, they share ends.
        
        let allIds = [];
        chains.forEach(c => allIds.push(...c));
        
        // Remove duplicates (consecutive mostly)
        // But order matters.
        // Let's try "Smart Linking" again but robust.
        
        let ordered = [];
        let visited = new Set();
        let curr = chains[0];
        visited.add(curr);
        
        // Push first chain
        curr.forEach(id => ordered.push(id));
        
        // Find next chain starting with last id
        for (let step=0; step<chains.length; step++) {
            let lastId = ordered[ordered.length-1];
            
            // Find chain starting or ending with lastId
            let nextChain = null;
            let reversed = false;
            
            for(const c of chains) {
                if(visited.has(c)) continue;
                if(c[0] === lastId) {
                    nextChain = c;
                    reversed = false;
                    break;
                } else if(c[c.length-1] === lastId) {
                    nextChain = c;
                    reversed = true;
                    break;
                }
            }
            
            if(nextChain) {
                visited.add(nextChain);
                if(reversed) {
                    for(let k=nextChain.length-2; k>=0; k--) ordered.push(nextChain[k]);
                } else {
                    for(let k=1; k<nextChain.length; k++) ordered.push(nextChain[k]);
                }
            } else {
                break;
            }
        }
        
        // Remove closing duplicate or close with original vertex
        if(ordered.length > 1 && ordered[0] === ordered[ordered.length-1]) {
            ordered.pop();
        } else {
            // Loop is open (partial bevel). Close it with original vertex to fill the gap.
            ordered.push(vId);
        }
        
        const polyVertices = ordered.map(id => meshData.getVertex(id)).filter(v=>v);
        
        if (polyVertices.length >= 3) {
             let cx=0, cy=0, cz=0;
             polyVertices.forEach(v => { cx+=v.position.x; cy+=v.position.y; cz+=v.position.z; });
             cx/=polyVertices.length; cy/=polyVertices.length; cz/=polyVertices.length;

             const originalV = meshData.getVertex(vId);
             let avgDist = 0;
             if (originalV) {
                 // Robust Normal Calculation using Centroid fan
                 // Sum of cross products around the centroid gives the area-weighted normal of the polygon
                 const n = new THREE.Vector3();
                 const centroidVec = new THREE.Vector3(cx, cy, cz);
                 
                 for (let i = 0; i < polyVertices.length; i++) {
                     const cur = polyVertices[i].position;
                     const next = polyVertices[(i+1)%polyVertices.length].position;
                     
                     const u = new THREE.Vector3(cur.x, cur.y, cur.z).sub(centroidVec);
                     const v = new THREE.Vector3(next.x, next.y, next.z).sub(centroidVec);
                     
                     n.add(new THREE.Vector3().crossVectors(u, v));
                 }
                 
                 // Reference OUTWARD (Corner - Centroid)
                 // The vector from the new recessed centroid to the original corner tip points roughly OUT of the mesh
                 const origPosVec = new THREE.Vector3(originalV.position.x, originalV.position.y, originalV.position.z);
                 const refOut = new THREE.Vector3().subVectors(origPosVec, centroidVec); 
                 
                 // If normal opposes the outward direction, flip winding
                 if (n.dot(refOut) < 0) polyVertices.reverse();

                 // Convex Cap Heuristic:
                 // The Bezier strips pull the surface towards 'origPos'. 
                 // To match this bulge, we pull the center vertex towards 'origPos' as well.
                 
                 // FIX: Always use centroid (0.0) for now to ensure robustness and avoid spikes/intersections.
                 const blendFactor = 0.0;
                 const newPos = new THREE.Vector3().addVectors(centroidVec, refOut.multiplyScalar(blendFactor));
                 cx = newPos.x;
                 cy = newPos.y;
                 cz = newPos.z;
             }

             const centerVertex = meshData.addVertex({x: cx, y: cy, z: cz});
             
             // Deduplicate polyVertices just in case
             const uniquePolyVertices = polyVertices.filter((v, i) => {
                 const prev = polyVertices[(i - 1 + polyVertices.length) % polyVertices.length];
                 return v.id !== prev.id;
             });
             
             for (let i = 0; i < uniquePolyVertices.length; i++) {
                 const v1 = uniquePolyVertices[i];
                 const v2 = uniquePolyVertices[(i + 1) % uniquePolyVertices.length];
                 if (v1.id !== v2.id) {
                     meshData.addFace([v1, v2, centerVertex]);
                 }
             }
        }
    }

    for (const vId of bevelVertices) {
        const v = meshData.getVertex(vId);
        if (v && !isVertexUsed(v.id, meshData)) meshData.deleteVertex(v);
    }
  }

  createBevelStrip(meshData, id1, id2, id3, id4, segments, c1, c2) {
      const v1 = meshData.getVertex(id1);
      const v2 = meshData.getVertex(id2);
      const v3 = meshData.getVertex(id3);
      const v4 = meshData.getVertex(id4);
      
      const chainNear = [id1]; 
      const chainFar = [id2];
      
      let prevRow = [v1, v2];
      
      for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          
          // Quadratic Bezier Interpolation
          // P(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
          // P0=Start, P1=Corner(Control), P2=End
          
          const mt = 1 - t;
          const w0 = mt * mt;
          const w1 = 2 * mt * t;
          const w2 = t * t;
          
          const pA = new THREE.Vector3()
              .addScaledVector(v1.position, w0)
              .addScaledVector(c1, w1)
              .addScaledVector(v4.position, w2);

          const pB = new THREE.Vector3()
              .addScaledVector(v2.position, w0)
              .addScaledVector(c2, w1)
              .addScaledVector(v3.position, w2);
          
          let rowVertices;
          if (i === segments) {
              rowVertices = [v4, v3];
          } else {
              const vA = meshData.addVertex({x: pA.x, y: pA.y, z: pA.z});
              const vB = meshData.addVertex({x: pB.x, y: pB.y, z: pB.z});
              rowVertices = [vA, vB];
          }
          
          meshData.addFace([prevRow[0], prevRow[1], rowVertices[1], rowVertices[0]]);
          
          chainNear.push(rowVertices[0].id);
          chainFar.push(rowVertices[1].id);
          
          prevRow = rowVertices;
      }
      
      return { chainNear, chainFar };
  }

  onModalMouseUp() {
    this.confirmBevel();
  }

  confirmBevel() {
    if (!this.isModalBeveling) return;
    this.cleanupListeners();
    this.isModalBeveling = false;
    this.controls.enabled = true;
    if (this.radius > 0.00001) {
      const editedObject = this.editSelection.editedObject;
      const afterMeshData = MeshData.serializeMeshData(editedObject.userData.meshData);
      this.editor.execute(new BevelCommand(this.editor, editedObject, this.beforeMeshData, afterMeshData));
    }
    this.signals.modalBevelEnded.dispatch();
    this.signals.objectChanged.dispatch();
  }

  cancelModalBevel() {
    if (!this.isModalBeveling) return;
    this.cleanupListeners();
    this.isModalBeveling = false;
    this.controls.enabled = true;
    const editedObject = this.editSelection.editedObject;
    if (editedObject && this.beforeMeshData) {
      editedObject.userData.meshData = MeshData.deserializeMeshData(this.beforeMeshData);
      const vertexEditor = new VertexEditor(this.editor, editedObject);
      vertexEditor.updateGeometryAndHelpers();
    }
    this.signals.modalBevelEnded.dispatch();
    this.signals.objectChanged.dispatch();
  }

  cleanupListeners() {
    window.removeEventListener('mousemove', this.onModalMouseMoveHandler);
    window.removeEventListener('mouseup', this.onModalMouseUpHandler);
    window.removeEventListener('wheel', this.onModalWheelHandler);
  }
}

function isVertexUsed(vid, meshData) {
    for (const f of meshData.faces.values()) {
        if (f.vertexIds.includes(vid)) return true;
    }
    return false;
}