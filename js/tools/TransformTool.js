import * as THREE from 'three';
import { TransformControls } from 'jsm/controls/TransformControls.js';
import { SetPositionCommand } from "../commands/SetPositionCommand.js";
import { SetRotationCommand } from "../commands/SetRotationCommand.js";
import { SetScaleCommand } from '../commands/SetScaleCommand.js';
import { VertexEditor } from './VertexEditor.js';
import { SetVertexPositionCommand } from '../commands/SetVertexPositionCommand.js';
import { ShadingUtils } from '../utils/ShadingUtils.js';
import { MultiCommand } from '../commands/MultiCommand.js';

export class TransformTool {
  constructor(mode, editor) {
    this.editor = editor;
    this.signals = editor.signals;
    this.mode = mode; // 'translate', 'rotate', or 'scale'
    this.camera = editor.cameraManager.camera;
    this.renderer = editor.renderer;
    this.sceneManager = editor.sceneManager;
    this.sceneEditorHelpers = this.sceneManager.sceneEditorHelpers;
    this.controls = editor.controlsManager;
    this.interactionMode = 'object';
    this.selection = editor.selection;
    this.editSelection = editor.editSelection;

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.size = 0.4;
    this.transformControls.setMode(this.mode);
    this.transformControls.visible = false;

    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      if (!event.value) this.signals.objectChanged.dispatch();
    });

    this.transformControls.addEventListener('mouseDown', () => {
      this.signals.transformDragStarted.dispatch();
    });

    this.transformControls.addEventListener('mouseUp', () => {
      requestAnimationFrame(() => {
        this.signals.transformDragEnded.dispatch();
      });
    });

    this.sceneEditorHelpers.add(this.transformControls.getHelper());

    this.customizeGizmo();

    this.setupListeners();
    this.setupTransformListeners();
    
    this._onModalPointerMove = this.onModalPointerMove.bind(this);
    this._onModalPointerDown = this.onModalPointerDown.bind(this);
    this._onModalKeyDown = this.onModalKeyDown.bind(this);
    this._onModalKeyUp = this.onModalKeyUp.bind(this);
    
    this.isModal = false;
    this.ctrlKey = false;
  }

  setupListeners() {
    this.signals.modeChanged.add((newMode) => {
      this.interactionMode = newMode;
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Control') {
        this.transformControls.rotationSnap = THREE.MathUtils.degToRad(5);
        this.ctrlKey = true;
      }
    });

    window.addEventListener('keyup', (event) => {
      if (event.key === 'Control') {
        this.transformControls.rotationSnap = null;
        this.ctrlKey = false;
      }
    });
  }

  // ... (rest of the file)

  startModal() {
    const handle = this.transformControls.object;
    if (!handle) return;
    
    // 1. Capture Initial State (Same as mouseDown)
    this.startPivotPosition = handle.getWorldPosition(new THREE.Vector3());
    this.startPivotQuaternion = handle.getWorldQuaternion(new THREE.Quaternion());
    this.startPivotScale = handle.getWorldScale(new THREE.Vector3());

    if (this.interactionMode === 'object') {
        const objects = this.selection.selectedObjects;
        if (!objects || objects.length === 0) return;

        this.startPositions = objects.map(obj => obj.getWorldPosition(new THREE.Vector3()));
        this.startQuaternions = objects.map(obj => obj.getWorldQuaternion(new THREE.Quaternion()));
        this.startScales = objects.map(obj => obj.getWorldScale(new THREE.Vector3()));
    } else if (this.interactionMode === 'edit') {
        const selectedVertexIds = Array.from(this.editSelection.selectedVertexIds);
        const editedObject = this.editSelection.editedObject;
        if (editedObject) {
          const vertexEditor = new VertexEditor(this.editor, editedObject);
          
          // Filter valid vertices and store aligned arrays
          this.modalVertexIds = [];
          this.oldPositions = [];
          for (const id of selectedVertexIds) {
              const pos = vertexEditor.getVertexPosition(id);
              if (pos) {
                  this.modalVertexIds.push(id);
                  this.oldPositions.push(pos.clone()); // getVertexPosition returns new vector but let's be safe or clone if it was reference (it clones)
              }
          }
          this.vertexEditor = vertexEditor;
        }
    }

    // 2. Setup Modal State
    this.numericInput = null;
    this.minBounds = new THREE.Vector3(Infinity, Infinity, Infinity);
    
    const positions = (this.interactionMode === 'object') ? this.startPositions : ((this.interactionMode === 'edit') ? this.oldPositions : null);

    if (positions) {
        for (const pos of positions) {
             if (pos.x < this.minBounds.x) this.minBounds.x = pos.x;
             if (pos.y < this.minBounds.y) this.minBounds.y = pos.y;
             if (pos.z < this.minBounds.z) this.minBounds.z = pos.z;
        }
    }

    this.modalStartX = null;
    this.modalStartY = null;
    this.modalCurrentX = null;
    this.modalCurrentY = null;
    this.modalAxis = null; // null, 'x', 'y', 'z'
    this.raycaster = new THREE.Raycaster();
    this.modalStartIntersection = null; // For translate

    this.controls.enabled = false;
    this.transformControls.visible = false; // Hide gizmo during modal op
    
    this.isModal = true;

    document.addEventListener('pointermove', this._onModalPointerMove);
    document.addEventListener('pointerdown', this._onModalPointerDown);
    document.addEventListener('keydown', this._onModalKeyDown);
    document.addEventListener('keyup', this._onModalKeyUp);
    document.addEventListener('contextmenu', this._onModalPointerDown); // Right click cancels
  }

  onModalPointerMove(event) {
    if (this.modalStartX === null) {
        this.modalStartX = event.clientX;
        this.modalStartY = event.clientY;
        this.modalCurrentX = event.clientX;
        this.modalCurrentY = event.clientY;

        // Initialize Translate Start Intersection if needed
        if (this.mode === 'translate') {
            const rect = this.renderer.domElement.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera({x, y}, this.camera);
            
            // Intersect with a plane at pivot depth facing camera
            const planeNormal = new THREE.Vector3();
            this.camera.getWorldDirection(planeNormal);
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, this.startPivotPosition);
            const target = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(plane, target);
            if (target) {
                this.modalStartIntersection = target.clone();
            }
        }
        return;
    }
    this.modalCurrentX = event.clientX;
    this.modalCurrentY = event.clientY;
    this.updateModalTransform();
  }

  applySnapping(delta) {
    const snapEnabled = this.editor.viewportControls.snapEnabled;
    const shouldSnap = snapEnabled !== this.ctrlKey;

    if (!shouldSnap) return delta;

    const snapMode = this.editor.viewportControls.snapMode;

    if (this.mode === 'translate') {
      if (snapMode === 'grid') {
        const step = 1.0;
        const threshold = 0.2; // Snap margin (20% of unit)
        
        const snapAxis = (val) => {
            const rounded = Math.round(val / step) * step;
            if (Math.abs(val - rounded) < threshold) {
                return rounded;
            }
            return val;
        };
        
        delta.x = snapAxis(delta.x);
        delta.y = snapAxis(delta.y);
        delta.z = snapAxis(delta.z);
      } else if (snapMode === 'vertex' || snapMode === 'face') {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const x = ((this.modalCurrentX - rect.left) / rect.width) * 2 - 1;
        const y = -((this.modalCurrentY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera({x, y}, this.camera);

        const objects = this.editor.sceneManager.mainScene.children; 
        const intersects = this.raycaster.intersectObjects(objects, true);
        
        const selectedSet = new Set(this.selection.selectedObjects.map(o => o.id));
        
        let snapTarget = null;
        
        for (const hit of intersects) {
            let obj = hit.object;
            let isSelected = false;
            while(obj) {
                if (selectedSet.has(obj.id)) {
                    isSelected = true;
                    break;
                }
                obj = obj.parent;
            }
            if (isSelected || !hit.object.visible) continue;
            
            if (snapMode === 'face') {
                snapTarget = hit.point;
            } else if (snapMode === 'vertex') {
                if (hit.object.isMesh) {
                    const localPoint = hit.point.clone().applyMatrix4(hit.object.matrixWorld.clone().invert());
                    const geom = hit.object.geometry;
                    const pos = geom.attributes.position;
                    let minDst = Infinity;
                    let closest = null;
                    
                    for (let i = 0; i < pos.count; i++) {
                        const vx = pos.getX(i);
                        const vy = pos.getY(i);
                        const vz = pos.getZ(i);
                        const d = (vx-localPoint.x)**2 + (vy-localPoint.y)**2 + (vz-localPoint.z)**2;
                        if (d < minDst) {
                            minDst = d;
                            closest = new THREE.Vector3(vx, vy, vz);
                        }
                    }
                    
                    if (closest) {
                        snapTarget = closest.applyMatrix4(hit.object.matrixWorld);
                    }
                } else {
                    snapTarget = hit.point;
                }
            }
            break; 
        }
        
        if (snapTarget && this.startPivotPosition) {
            delta.subVectors(snapTarget, this.startPivotPosition);
        }
      }
    }

    return delta;
  }

  updateModalTransform() {
    if (this.modalStartX === null || this.modalCurrentX === null) return;

    if (this.mode === 'translate') {
        if (!this.modalStartIntersection) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        const x = ((this.modalCurrentX - rect.left) / rect.width) * 2 - 1;
        const y = -((this.modalCurrentY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera({x, y}, this.camera);

        const planeNormal = new THREE.Vector3();
        this.camera.getWorldDirection(planeNormal);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, this.startPivotPosition);
        const target = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, target);

        if (target) {
            let delta = new THREE.Vector3().subVectors(target, this.modalStartIntersection);
            
            // Apply Snapping
            delta = this.applySnapping(delta);

            if (this.modalAxis === 'x') {
                delta.projectOnVector(new THREE.Vector3(1, 0, 0));
            } else if (this.modalAxis === 'y') {
                delta.projectOnVector(new THREE.Vector3(0, 1, 0));
            } else if (this.modalAxis === 'z') {
                delta.projectOnVector(new THREE.Vector3(0, 0, 1));
            }

            const dLen = delta.length().toFixed(4);
            const dVec = `(${delta.x.toFixed(4)}, ${delta.y.toFixed(4)}, ${delta.z.toFixed(4)})`;
            
            let axisStr = this.modalAxis ? ` [${this.modalAxis.toUpperCase()}]` : '';
            this.editor.viewportControls.setOperationStatus('TRANSLATE', `D: ${dLen} ${dVec}${axisStr}`);

            if (this.interactionMode === 'object') {
                const objects = this.selection.selectedObjects;
                if (!this.startPositions) return;

                for (let i = 0; i < objects.length; i++) {
                    objects[i].position.copy(this.startPositions[i]).add(delta);
                    objects[i].updateMatrixWorld(true);
                }
            } else if (this.interactionMode === 'edit') {
                 if (!this.oldPositions || !this.modalVertexIds) return;
                 // Use filtered modalVertexIds to ensure alignment with oldPositions
                 const newPositions = this.oldPositions.map(pos => pos.clone().add(delta));
                 this.vertexEditor.setVerticesWorldPositions(this.modalVertexIds, newPositions);
            }
        }

    } else if (this.mode === 'rotate') {
        const deltaX = this.modalCurrentX - this.modalStartX;
        let angle = deltaX * 0.01; // Sensitivity

        if (this.ctrlKey) {
            const snapRad = THREE.MathUtils.degToRad(5);
            angle = Math.round(angle / snapRad) * snapRad;
        }

        let axis;
        if (this.modalAxis === 'x') {
            axis = new THREE.Vector3(1, 0, 0);
        } else if (this.modalAxis === 'y') {
            axis = new THREE.Vector3(0, 1, 0);
        } else if (this.modalAxis === 'z') {
            axis = new THREE.Vector3(0, 0, 1);
        } else {
            // View rotation - project view direction onto plane perpendicular to view?
            // Or just rotate around camera direction
            axis = new THREE.Vector3();
            this.camera.getWorldDirection(axis);
        }

        const deltaQuat = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), angle);

        const deg = (angle * 180 / Math.PI).toFixed(2);
        let axisStr = this.modalAxis ? ` [${this.modalAxis.toUpperCase()}]` : '';
        this.editor.viewportControls.setOperationStatus('ROTATE', `Angle: ${deg}°${axisStr}`);

        if (this.interactionMode === 'object') {
             const objects = this.selection.selectedObjects;
             if (!this.startQuaternions) return;

             if (objects.length === 1) {
                 // Pre-multiply to rotate around global axis if axis is global
                 // But wait, if we rotate around GLOBAL axis, we should apply deltaQuat * quaternion
                 objects[0].quaternion.copy(deltaQuat).multiply(this.startQuaternions[0]);
                 objects[0].updateMatrixWorld(true);
             } else {
                 for (let i = 0; i < objects.length; i++) {
                     // Rotate orientation
                     objects[i].quaternion.copy(deltaQuat).multiply(this.startQuaternions[i]);
                     
                     // Rotate position around pivot
                     const relativePos = this.startPositions[i].clone().sub(this.startPivotPosition);
                     relativePos.applyQuaternion(deltaQuat);
                     objects[i].position.copy(this.startPivotPosition).add(relativePos);
                     
                     objects[i].updateMatrixWorld(true);
                 }
             }
        } else if (this.interactionMode === 'edit') {
            if (!this.oldPositions) return;
            const pivot = this.startPivotPosition.clone();
            const selectedVertexIds = Array.from(this.editSelection.selectedVertexIds);
            
            const newPositions = this.oldPositions.map(pos => {
                const local = pos.clone().sub(pivot);
                local.applyQuaternion(deltaQuat);
                return local.add(pivot);
            });
            
            this.vertexEditor.setVerticesWorldPositions(this.modalVertexIds, newPositions);
        }

    } else if (this.mode === 'scale') {
        const deltaX = this.modalCurrentX - this.modalStartX;
        let factor = 1 + (deltaX * 0.005); // Sensitivity
        
        if (this.numericInput !== null) {
            factor = this.numericInput;
        }

        let axisStr = this.modalAxis ? ` [${this.modalAxis.toUpperCase()}]` : '';
        this.editor.viewportControls.setOperationStatus('SCALE', `Factor: ${factor.toFixed(4)}${axisStr}`);

        // Direct Alignment Logic for Scale 0 + Axis
        if (this.numericInput === 0 && this.modalAxis) {
             let targetVal = null;
             if (this.modalAxis === 'x' && this.minBounds && isFinite(this.minBounds.x)) targetVal = this.minBounds.x;
             if (this.modalAxis === 'y' && this.minBounds && isFinite(this.minBounds.y)) targetVal = this.minBounds.y;
             if (this.modalAxis === 'z' && this.minBounds && isFinite(this.minBounds.z)) targetVal = this.minBounds.z;

             if (targetVal !== null) {
                 if (this.interactionMode === 'edit' && this.oldPositions) {
                     const newPositions = this.oldPositions.map(pos => {
                         const p = pos.clone();
                         if (this.modalAxis === 'x') p.x = targetVal;
                         if (this.modalAxis === 'y') p.y = targetVal;
                         if (this.modalAxis === 'z') p.z = targetVal;
                         return p;
                     });
                     this.vertexEditor.setVerticesWorldPositions(this.modalVertexIds, newPositions);
                     return; 
                 } else if (this.interactionMode === 'object') {
                     const objects = this.selection.selectedObjects;
                     for (let i = 0; i < objects.length; i++) {
                         // For objects, we align their Position? Or scale them?
                         // "Align vertices" implies position alignment for multiple objects usually.
                         // But standard scale 0 moves objects.
                         const p = this.startPositions[i].clone();
                         if (this.modalAxis === 'x') p.x = targetVal;
                         if (this.modalAxis === 'y') p.y = targetVal;
                         if (this.modalAxis === 'z') p.z = targetVal;
                         
                         objects[i].position.copy(p);
                         
                         // We should also flatten the object's own scale? 
                         // S Z 0 on an object flattens the object geometry too.
                         // Standard scaling does both. 
                         // If we just move position, the object keeps its thickness.
                         // To emulate Scale 0, we must also set Scale to 0 on that axis.
                         // BUT, applying World Scale to Object is complex if rotated.
                         // Let's stick to Standard Logic for Objects if it's complex, 
                         // or use the Pivot logic for Objects as it was working?
                         // User complained about VERTICES (Edit Mode).
                         // For Object mode, let's use the pivot logic which is equivalent but handles scale.
                         // Or, combine both: Set Position AND Set Scale.
                         
                         // Revert to pivot logic for Objects for safety/completeness, 
                         // but use Direct Logic for Edit Mode (Vertices) which is the primary request.
                     }
                     // Fallthrough to standard logic for Objects?
                     // No, let's implement the Pivot logic here for Objects to be consistent.
                 }
             }
        }

        // Standard Logic (Pivot Based)
        // Also used for Objects even if Scale 0, because we need to scale the object itself, not just move it.
        
        const pivot = this.startPivotPosition.clone();
        if (this.numericInput === 0 && this.modalAxis && this.minBounds) {
             if (this.modalAxis === 'x' && isFinite(this.minBounds.x)) pivot.x = this.minBounds.x;
             if (this.modalAxis === 'y' && isFinite(this.minBounds.y)) pivot.y = this.minBounds.y;
             if (this.modalAxis === 'z' && isFinite(this.minBounds.z)) pivot.z = this.minBounds.z;
        }

        // Determine scale vector based on axis constraint
        let scaleVector;
        if (this.modalAxis === 'x') { 
            scaleVector = new THREE.Vector3(factor, 1, 1);
        } else if (this.modalAxis === 'y') {
            scaleVector = new THREE.Vector3(1, factor, 1);
        } else if (this.modalAxis === 'z') {
            scaleVector = new THREE.Vector3(1, 1, factor);
        } else { // Uniform scaling
            scaleVector = new THREE.Vector3(factor, factor, factor);
        }
        
        if (this.interactionMode === 'object') {
             const objects = this.selection.selectedObjects;
             if (!this.startScales) return;
             
             if (objects.length === 1) {
                 this.applyWorldScaleToObject(objects[0], scaleVector, this.startScales[0]);
                 
                 const relativePos = this.startPositions[0].clone().sub(pivot);
                 relativePos.multiply(scaleVector);
                 objects[0].position.copy(pivot).add(relativePos);

                 objects[0].updateMatrixWorld(true);
             } else {
                 for (let i = 0; i < objects.length; i++) {
                     const { newScaleX, newScaleY, newScaleZ } = 
                         this.applyWorldScaleToObject(objects[i], scaleVector, this.startScales[i]);
                     
                     const relativePos = this.startPositions[i].clone().sub(pivot);
                     relativePos.multiply(scaleVector);
                     objects[i].position.copy(pivot).add(relativePos);

                     objects[i].updateMatrixWorld(true);
                 }
             }
        } else if (this.interactionMode === 'edit') {
            // We handled the "0" case above with Direct Alignment.
            // If we are here, it means numericInput is not 0 OR no axis selected.
            // So we use standard logic.
            if (!this.oldPositions) return;
            
            const selectedVertexIds = Array.from(this.editSelection.selectedVertexIds);
            
            const newPositions = this.oldPositions.map(pos => {
                const local = pos.clone().sub(pivot);
                local.multiply(scaleVector);
                return local.add(pivot);
            });
            
            this.vertexEditor.setVerticesWorldPositions(this.modalVertexIds, newPositions);

            // Force helper refresh if no modifiers (Fast Path doesn't update helpers)
            if (!this.editSelection.editedObject.userData.modifiers?.some(m => m.enabled)) {
                this.editor.editHelpers.refreshHelpers();
            }
        }
    }
  }

  onModalPointerDown(event) {
      // Left click (0) to confirm, Right click (2) to cancel
      if (event.button === 0) {
          this.confirmModal();
      } else if (event.button === 2) {
          this.cancelModal();
      }
  }

  onModalKeyDown(event) {
      if (this.mode === 'scale' && (event.key === '0' || event.code === 'Numpad0')) {
          this.numericInput = 0;
          this.updateModalTransform();
          if (this.interactionMode === 'edit' && this.vertexEditor) {
              this.vertexEditor.updateGeometryAndHelpers();
          }
          return;
      }
      if (event.key === 'Enter') {
          event.stopPropagation();
          this.confirmModal();
          return;
      }
      if (event.key === 'Control') {
          this.ctrlKey = true;
          this.updateModalTransform();
      }
      if (event.key === 'Escape') {
          event.stopPropagation();
          this.cancelModal();
      } else if (event.key.toLowerCase() === 'x') {
          event.stopPropagation();
          this.modalAxis = this.modalAxis === 'x' ? null : 'x'; // X -> X (Red)
          this.updateModalTransform();
      } else if (event.key.toLowerCase() === 'y') {
          event.stopPropagation();
          this.modalAxis = this.modalAxis === 'y' ? null : 'y'; // Y -> Y (Vertical/Green)
          this.updateModalTransform();
      } else if (event.key.toLowerCase() === 'z') {
          event.stopPropagation();
          this.modalAxis = this.modalAxis === 'z' ? null : 'z'; // Z -> Z (Depth/Blue)
          this.updateModalTransform();
      }
  }

  confirmModal() {
      // Reuse MouseUp Logic to commit
      const handle = this.transformControls.object;
      
      if (this.interactionMode === 'object') {
          const objects = this.selection.selectedObjects;
          if (this.mode === 'translate') {
              if (!this.startPositions) return;
              const newPositions = objects.map(obj => obj.getWorldPosition(new THREE.Vector3()));
              this.editor.execute(new SetPositionCommand(this.editor, objects, newPositions, this.startPositions));
          } else if (this.mode === 'rotate') {
              if (!this.startQuaternions) return;
              
              const newRotations = objects.map(obj => obj.rotation.clone());
              const startRotations = this.startQuaternions.map(q => new THREE.Euler().setFromQuaternion(q));
              
              if (objects.length === 1) {
                  this.editor.execute(new SetRotationCommand(this.editor, objects, newRotations, startRotations));
              } else {
                   const newPositions = objects.map(obj => obj.getWorldPosition(new THREE.Vector3()));
                   const startPositions = this.startPositions.map(p => p.clone());
                   
                   const posCmd = new SetPositionCommand(this.editor, objects, newPositions, startPositions);
                   const rotCmd = new SetRotationCommand(this.editor, objects, newRotations, startRotations);
                   
                   const multi = new MultiCommand(this.editor, 'Set Rotation Objects');
                   multi.add(posCmd);
                   multi.add(rotCmd);
                   this.editor.execute(multi);
              }
          } else if (this.mode === 'scale') {
               if (!this.startScales) return;
               const newScales = objects.map(obj => obj.scale.clone());
               const startScales = this.startScales.map(s => s.clone());
               
               if (objects.length === 1) {
                   this.editor.execute(new SetScaleCommand(this.editor, objects, newScales, startScales));
               } else {
                   const newPositions = objects.map(obj => obj.getWorldPosition(new THREE.Vector3()));
                   const startPositions = this.startPositions.map(p => p.clone());
                   
                   const posCmd = new SetPositionCommand(this.editor, objects, newPositions, startPositions);
                   const scaleCmd = new SetScaleCommand(this.editor, objects, newScales, startScales);
                   const multi = new MultiCommand(this.editor, 'Set Scale Objects');
                   multi.add(posCmd);
                   multi.add(scaleCmd);
                   this.editor.execute(multi);
               }
          }
      } else if (this.interactionMode === 'edit') {
           // For edit mode, SetVertexPositionCommand is already executed in onModalMove?
           // No, setVerticesWorldPositions updates the mesh but doesn't create a command history entry.
           // We need to create the final command here.
           const editedObject = this.editSelection.editedObject;
           // Use modalVertexIds to ensure consistency
           
           // Re-calculate final positions based on current state (which is already applied to mesh)
           const finalPositions = this.vertexEditor.getVertexPositions(this.modalVertexIds);
           this.editor.execute(new SetVertexPositionCommand(this.editor, editedObject, this.modalVertexIds, finalPositions, this.oldPositions));
           
           if (editedObject.userData.shading === 'auto') {
               ShadingUtils.applyShading(editedObject, 'auto');
           }
      }

      this.cleanupModal();
  }

  cancelModal() {
      // Revert to start state
      if (this.interactionMode === 'object') {
          const objects = this.selection.selectedObjects;
          if (this.startScales) {
              objects.forEach((obj, i) => {
                  obj.scale.copy(this.startScales[i]);
                  obj.position.copy(this.startPositions[i]);
                  obj.updateMatrixWorld(true);
              });
          }
      } else if (this.interactionMode === 'edit') {
          if (this.oldPositions && this.modalVertexIds) {
              this.vertexEditor.setVerticesWorldPositions(this.modalVertexIds, this.oldPositions);
          }
      }
      this.cleanupModal();
  }

  onModalKeyUp(event) {
      if (event.key === 'Control') {
          this.ctrlKey = false;
          this.updateModalTransform();
      }
  }

  cleanupModal() {
      this.editor.viewportControls.clearOperationStatus();
      this.controls.enabled = true;
      this.transformControls.visible = true;
      
      this.startPositions = null;
      this.startPivotPosition = null;
      this.startPivotScale = null;
      this.startScales = null;
      this.oldPositions = null;
      this.modalVertexIds = null;
      this.vertexEditor = null;
      this.minBounds = null;
      this.numericInput = null;
      
      this.isModal = false;
      this.ctrlKey = false;

      document.removeEventListener('pointermove', this._onModalPointerMove);
      document.removeEventListener('pointerdown', this._onModalPointerDown);
      document.removeEventListener('keydown', this._onModalKeyDown);
      document.removeEventListener('keyup', this._onModalKeyUp);
      document.removeEventListener('contextmenu', this._onModalPointerDown);
  }

  customizeGizmo() {
    const blenderRed = 0xff3352;
    const blenderGreen = 0x8bdc00;
    const blenderBlue = 0x2b8ef4;
    const gray = 0x808080;

    const helper = this.transformControls.getHelper();

    helper.traverse(child => {
      if (child.name === 'X') {
        // Assign Red to X (Horizontal)
        if (child.material) child.material.color.setHex(blenderRed);
        if (child.children) child.children.forEach(c => c.material?.color.setHex(blenderRed));
      } else if (child.name === 'Y') {
        // Assign Blue to Y (Vertical)
        if (child.material) child.material.color.setHex(blenderBlue); 
        if (child.children) child.children.forEach(c => c.material?.color.setHex(blenderBlue));
      } else if (child.name === 'Z') {
        // Assign Green to Z (Depth)
        if (child.material) child.material.color.setHex(blenderGreen); 
        if (child.children) child.children.forEach(c => c.material?.color.setHex(blenderGreen));
      } else if (child.name === 'XY' || child.name === 'YZ' || child.name === 'XZ') {
         if (child.material) {
             child.material.color.setHex(gray);
             child.material.opacity = 0.3;
         }
      }
    });
  }

  setupTransformListeners() {
    this.transformControls.addEventListener('mouseDown', () => {
      const handle = this.transformControls.object;
      if (!handle) return;

      this.startPivotPosition = handle.getWorldPosition(new THREE.Vector3());
      this.startPivotQuaternion = handle.getWorldQuaternion(new THREE.Quaternion());
      this.startPivotScale = handle.getWorldScale(new THREE.Vector3());

      if (this.interactionMode === 'object') {
        const objects = this.selection.selectedObjects;
        if (!objects || objects.length === 0) return;

        this.startPositions = objects.map(obj => obj.getWorldPosition(new THREE.Vector3()));
        this.startQuaternions = objects.map(obj => obj.getWorldQuaternion(new THREE.Quaternion()));
        this.startScales = objects.map(obj => obj.getWorldScale(new THREE.Vector3()));
      } else if (this.interactionMode === 'edit') {
        // Save old vertex positions
        const selectedVertexIds = Array.from(this.editSelection.selectedVertexIds);
        const editedObject = this.editSelection.editedObject;
        if (editedObject) {
          const vertexEditor = new VertexEditor(this.editor, editedObject);
          this.oldPositions = vertexEditor.getVertexPositions(selectedVertexIds);
        }
      }
    });

    this.transformControls.addEventListener('change', () => {
      const handle = this.transformControls.object;
      if (!handle) return;

      if (this.interactionMode === 'object' && this.transformControls.dragging)  {
        const objects = this.selection.selectedObjects;

        if (this.mode === 'translate') {
          if (!this.startPivotPosition || !this.startPositions) return;

          const currentPivotPosition = handle.getWorldPosition(new THREE.Vector3());
          const offset = new THREE.Vector3().subVectors(currentPivotPosition, this.startPivotPosition);

          for (let i = 0; i < objects.length; i++) {
            objects[i].position.copy(this.startPositions[i]).add(offset);
            objects[i].updateMatrixWorld(true);
          }
        } else if (this.mode === 'rotate') {
          if (!this.startPivotQuaternion || !this.startQuaternions) return;

          const currentPivotQuaternion = handle.getWorldQuaternion(new THREE.Quaternion());
          const deltaQuat = new THREE.Quaternion().copy(currentPivotQuaternion).multiply(this.startPivotQuaternion.clone().invert());

          if (objects.length === 1) {
            // Single Object
            objects[0].quaternion.copy(deltaQuat).multiply(this.startQuaternions[0]);
            objects[0].updateMatrixWorld(true);
          } else {
            // Multiple Objects
            for (let i = 0; i < objects.length; i++) {
              const offset = this.startPositions[i].clone().sub(this.startPivotPosition);
              offset.applyQuaternion(deltaQuat);

              objects[i].position.copy(this.startPivotPosition).add(offset);
              objects[i].quaternion.copy(deltaQuat).multiply(this.startQuaternions[i]);

              objects[i].updateMatrixWorld(true);
            }
          }
        } else if (this.mode === 'scale') {
          if (!this.startPivotScale || !this.startScales) return;

          const currentPivotScale = handle.getWorldScale(new THREE.Vector3());
          const scaleFactor = new THREE.Vector3(
            currentPivotScale.x / this.startPivotScale.x,
            currentPivotScale.y / this.startPivotScale.y,
            currentPivotScale.z / this.startPivotScale.z
          );

          if (objects.length === 1) {
            this.applyWorldScaleToObject(objects[0], scaleFactor, this.startScales[0]);

            objects[0].updateMatrixWorld(true);
          } else {
            for (let i = 0; i < objects.length; i++) {
              const { newScaleX, newScaleY, newScaleZ } =
                this.applyWorldScaleToObject(objects[i], scaleFactor, this.startScales[i]);

              // Scale position offset relative to pivot
              const offset = this.startPositions[i].clone().sub(this.startPivotPosition);
              offset.multiply(new THREE.Vector3(newScaleX, newScaleY, newScaleZ));
              objects[i].position.copy(this.startPivotPosition).add(offset);

              objects[i].updateMatrixWorld(true);
            }
          }
        }
      }

      if (this.interactionMode === 'edit' && this.transformControls.dragging) {
        const selectedVertexIds = Array.from(this.editSelection.selectedVertexIds);
        if (!selectedVertexIds || selectedVertexIds.length === 0) return;
        if (!this.startPivotPosition || !this.oldPositions) return;

        if (!this.vertexEditor) {
          this.vertexEditor = new VertexEditor(this.editor, this.editSelection.editedObject);
        }

        if (this.mode === 'translate') {
          const currentPivotPosition = handle.getWorldPosition(new THREE.Vector3());
          const offset = new THREE.Vector3().subVectors(currentPivotPosition, this.startPivotPosition);

          const newPositions = this.oldPositions.map(pos => pos.clone().add(offset));
          this.vertexEditor.setVerticesWorldPositions(selectedVertexIds, newPositions);
        }

        if (this.mode === 'rotate') {
          const pivot = this.startPivotPosition.clone();
          const currentPivotQuaternion = handle.getWorldQuaternion(new THREE.Quaternion());
          const deltaQuat = currentPivotQuaternion.clone().multiply(this.startPivotQuaternion.clone().invert());

          const newPositions = this.oldPositions.map(pos => {
            const local = pos.clone().sub(pivot);
            local.applyQuaternion(deltaQuat);
            return local.add(pivot);
          });

          this.vertexEditor.setVerticesWorldPositions(selectedVertexIds, newPositions);
        }

        if (this.mode === 'scale') {
          const pivot = this.startPivotPosition.clone();
          const currentScale = handle.getWorldScale(new THREE.Vector3());
          const scaleFactor = new THREE.Vector3(
            currentScale.x / this.startPivotScale.x,
            currentScale.y / this.startPivotScale.y,
            currentScale.z / this.startPivotScale.z
          );

          const newPositions = this.oldPositions.map(pos => {
            const local = pos.clone().sub(pivot);
            local.multiply(scaleFactor);
            return local.add(pivot);
          });

          this.vertexEditor.setVerticesWorldPositions(selectedVertexIds, newPositions);
        }
      }

      if (this.transformControls.dragging) {
        this.signals.refreshSidebarObject.dispatch();
      }
    });

    this.transformControls.addEventListener('mouseUp', () => {
      const handle = this.transformControls.object;
      if (!handle) return;

      if (this.interactionMode === 'object') {
        const objects = this.selection.selectedObjects;

        if (this.mode === 'translate') {
          if (!this.startPositions) return;

          const newPositions = objects.map(obj => obj.getWorldPosition(new THREE.Vector3()));

          const currentPivotPosition = handle.getWorldPosition(new THREE.Vector3());
          if (!currentPivotPosition.equals(this.startPivotPosition)) {
            this.editor.execute(new SetPositionCommand(this.editor, objects, newPositions, this.startPositions));
          }

          this.startPositions = null;
          this.startPivotPosition = null;
        } else if (this.mode === 'rotate') {
          if (!this.startQuaternions) return;

          const newRotations = objects.map(obj => obj.rotation.clone());
          const startRotations = this.startQuaternions.map(q => new THREE.Euler().setFromQuaternion(q));

          const currentPivotQuaternion = handle.getWorldQuaternion(new THREE.Quaternion());
          if (currentPivotQuaternion.equals(this.startPivotQuaternion)) return;

          if (objects.length === 1) {
            // Single Object
            this.editor.execute(new SetRotationCommand(this.editor, objects, newRotations, startRotations));
          } else {
            // Multiple Objects
            const newPositions = objects.map(obj => obj.getWorldPosition(new THREE.Vector3()));
            const startPositions = this.startPositions.map(p => p.clone());

            const posCmd = new SetPositionCommand(this.editor, objects, newPositions, startPositions);
            const rotCmd = new SetRotationCommand(this.editor, objects, newRotations, startRotations);

            const multi = new MultiCommand(this.editor, 'Set Rotation Objects');
            multi.add(posCmd);
            multi.add(rotCmd);

            this.editor.execute(multi);
          }

          this.startPivotQuaternion = null;
          this.startPivotPosition = null;
          this.startQuaternions = null;
          this.startPositions = null;
        } else if (this.mode === 'scale') {
          if (!this.startScales) return;

          const newScales = objects.map(obj => obj.scale.clone());
          const startScales = this.startScales.map(s => s.clone());

          const currentPivotScale = handle.getWorldScale(new THREE.Vector3());
          if (currentPivotScale.equals(this.startPivotScale));

          if (objects.length === 1) {
            // Single Object
            this.editor.execute(new SetScaleCommand(this.editor, objects, newScales, startScales));
          } else {
            // Multiple Objects
            const newPositions = objects.map(obj => obj.getWorldPosition(new THREE.Vector3()));
            const startPositions = this.startPositions.map(p => p.clone());

            const posCmd = new SetPositionCommand(this.editor, objects, newPositions, startPositions);
            const scaleCmd = new SetScaleCommand(this.editor, objects, newScales, startScales);

            const multi = new MultiCommand(this.editor, 'Set Scale Objects');
            multi.add(posCmd);
            multi.add(scaleCmd);

            this.editor.execute(multi);
          }

          this.startPivotPosition = null;
          this.startPivotScale = null;
          this.startPositions = null;
          this.startScales = null;
        }
      } else if (this.interactionMode === 'edit') {
        const editedObject = this.editSelection.editedObject;
        const selectedVertexIds = Array.from(this.editSelection.selectedVertexIds);
        const selectedEdgeIds = Array.from(this.editSelection.selectedEdgeIds);
        const selectedFaceIds = Array.from(this.editSelection.selectedFaceIds);

        if (this.mode === 'translate') {
          if (!this.startPivotPosition) return;
          if (editedObject.userData.shading === 'auto') {
            ShadingUtils.applyShading(editedObject, 'auto');
          }
          
          const currentPivotPosition = handle.getWorldPosition(new THREE.Vector3());
          const offset = new THREE.Vector3().subVectors(currentPivotPosition, this.startPivotPosition);

          if (offset.equals(new THREE.Vector3(0, 0, 0))) return;
          
          const newPositions = this.oldPositions.map(pos => pos.clone().add(offset));

          this.editor.execute(new SetVertexPositionCommand(this.editor, editedObject, selectedVertexIds, newPositions, this.oldPositions));

          if (this.editSelection.subSelectionMode === 'vertex') {
            this.editSelection.selectVertices(selectedVertexIds);
          } else if (this.editSelection.subSelectionMode === 'edge') {
            this.editSelection.selectEdges(selectedEdgeIds);
          } else if (this.editSelection.subSelectionMode === 'face') {
            this.editSelection.selectFaces(selectedFaceIds);
          }
        }
        else if (this.mode === 'rotate') {
          if (!this.startPivotQuaternion) return;
          const currentPivotQuaternion = handle.getWorldQuaternion(new THREE.Quaternion());
          const deltaQuat = currentPivotQuaternion.clone().multiply(this.startPivotQuaternion.clone().invert());
          const pivot = this.startPivotPosition.clone();

          if (currentPivotQuaternion.equals(this.startPivotQuaternion)) return;

          const newPositions = this.oldPositions.map(pos => {
            const local = pos.clone().sub(pivot);
            local.applyQuaternion(deltaQuat);
            return local.add(pivot);
          });

          this.editor.execute(new SetVertexPositionCommand(this.editor, editedObject, selectedVertexIds, newPositions, this.oldPositions));

          if (this.editSelection.subSelectionMode === 'vertex') {
            this.editSelection.selectVertices(selectedVertexIds);
          } else if (this.editSelection.subSelectionMode === 'edge') {
            this.editSelection.selectEdges(selectedEdgeIds);
          } else if (this.editSelection.subSelectionMode === 'face') {
            this.editSelection.selectFaces(selectedFaceIds);
          }
        }
        else if (this.mode === 'scale') {
          if (!this.startPivotScale) return;
          const pivot = this.startPivotPosition.clone();
          const currentScale = handle.getWorldScale(new THREE.Vector3());
          const scaleFactor = new THREE.Vector3(
            currentScale.x / this.startPivotScale.x,
            currentScale.y / this.startPivotScale.y,
            currentScale.z / this.startPivotScale.z
          );

          if (scaleFactor.equals(new THREE.Vector3(1, 1, 1))) return;

          const newPositions = this.oldPositions.map(pos => {
            const local = pos.clone().sub(pivot);
            local.multiply(scaleFactor);
            return local.add(pivot);
          });

          this.editor.execute(new SetVertexPositionCommand(this.editor, editedObject, selectedVertexIds, newPositions, this.oldPositions));

          if (this.editSelection.subSelectionMode === 'vertex') {
            this.editSelection.selectVertices(selectedVertexIds);
          } else if (this.editSelection.subSelectionMode === 'edge') {
            this.editSelection.selectEdges(selectedEdgeIds);
          } else if (this.editSelection.subSelectionMode === 'face') {
            this.editSelection.selectFaces(selectedFaceIds);
          }
        }

        if (editedObject.userData.shading === 'auto') {
          ShadingUtils.applyShading(editedObject, 'auto');
        }

        this.vertexEditor = null;
        this.oldPositions = null;
      }
    });
  }

  applyWorldScaleToObject(object, scaleFactor, startScale) {
    // Local axes in world space
    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(object.quaternion);
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
    const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(object.quaternion);

    // Compute local scales from world space scale
    const newScaleX = Math.sqrt(
      Math.pow(scaleFactor.x * localX.x, 2) +
      Math.pow(scaleFactor.y * localX.y, 2) +
      Math.pow(scaleFactor.z * localX.z, 2)
    );

    const newScaleY = Math.sqrt(
      Math.pow(scaleFactor.x * localY.x, 2) +
      Math.pow(scaleFactor.y * localY.y, 2) +
      Math.pow(scaleFactor.z * localY.z, 2)
    );

    const newScaleZ = Math.sqrt(
      Math.pow(scaleFactor.x * localZ.x, 2) +
      Math.pow(scaleFactor.y * localZ.y, 2) +
      Math.pow(scaleFactor.z * localZ.z, 2)
    );

    // Apply final scale
    object.scale.set(
      startScale.x * newScaleX,
      startScale.y * newScaleY,
      startScale.z * newScaleZ
    );

    return { newScaleX, newScaleY, newScaleZ };
  }

  enableFor(object) {
    if (!object) return;
    this.transformControls.attach(object);
    this.transformControls.visible = true;

    // Keep scale gizmo aligned to world axes
    if (this.transformControls.mode === 'scale') {
      this.selection.pivotHandle.rotation.set(0, 0, 0);
      this.editSelection.vertexHandle.rotation.set(0, 0, 0);
    }
  }

  disable() {
    this.transformControls.detach();
    this.transformControls.visible = false;
  }

  setEnabled(state) {
    this.transformControls.enabled = state;
  }

  isTransforming() {
    return this.transformControls.dragging;
  }

  get modeName() {
    return this.mode;
  }
}
