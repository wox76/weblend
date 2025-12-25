import * as THREE from 'three';

export default class CameraManager {
  constructor(editor) {
    this.editor = editor;

    this.camera = this.createDefaultCamera();
    this.cameras = {[this.camera.uuid]: this.camera};
  }

  createDefaultCamera({
    fov = 50,
    aspect = window.innerWidth / window.innerHeight,
    near = 0.1,
    far = 1000,
    initialPosition = new THREE.Vector3(5, 2, -3)
  } = {}) {
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.name = 'CAMERA';
    camera.isDefault = true;
    camera.position.copy(initialPosition);
    camera.lookAt(new THREE.Vector3());
    return camera;
  }

  updateAspect(newAspect) {
    if (this.camera.isOrthographicCamera) {
      const frustumSize = 2;

      this.camera.left = (-frustumSize * newAspect) / 2;
      this.camera.right = (frustumSize * newAspect) / 2;
      this.camera.top = frustumSize / 2;
      this.camera.bottom = -frustumSize / 2;
    } else {
      this.camera.aspect = newAspect;
    }

    this.camera.updateProjectionMatrix();
  }

  setCamera(newCamera) {
    const oldUuid = this.camera.uuid;
    const newUuid = newCamera.uuid;

    this.camera.copy(newCamera);
    this.camera.uuid = newUuid;

    delete this.cameras?.[oldUuid];
    this.cameras = this.cameras || {};
    this.cameras[newUuid] = this.camera;
  }

  resetCamera() {
    const defaultCam = this.createDefaultCamera();
    this.setCamera(defaultCam);
  }

  toggleOrthographic() {
    const oldCam = this.camera;
    const aspect = window.innerWidth / (window.innerHeight); // Approximation or use renderer size
    
    let newCam;
    if (oldCam.isPerspectiveCamera) {
        const height = 10; // Default view size
        const width = height * aspect;
        newCam = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, oldCam.near, oldCam.far);
        newCam.position.copy(oldCam.position);
        newCam.quaternion.copy(oldCam.quaternion);
        newCam.zoom = 1; // 
        // Try to match view size
        // Distance to target? Orbit controls target.
        // This is tricky without knowing target.
    } else {
        newCam = new THREE.PerspectiveCamera(50, aspect, oldCam.near, oldCam.far);
        newCam.position.copy(oldCam.position);
        newCam.quaternion.copy(oldCam.quaternion);
    }
    
    newCam.isDefault = true;
    this.camera = newCam;
    this.editor.signals.viewportCameraChanged.dispatch(this.camera);
  }
}