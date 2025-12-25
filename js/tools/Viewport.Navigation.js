import * as THREE from 'three';

export default class ViewportNavigation {
  constructor(editor) {
    this.editor = editor;
    this.uiLoader = editor.uiLoader;
    this.controls = editor.controlsManager;
    this.cameraManager = editor.cameraManager;
    this.renderer = editor.renderer;
    
    this.isDragging = false;
    this.startY = 0;
    this.startX = 0;
    this.activeAction = null;

    this.load();
  }

  load() {
    // Append to navigation-bar-container
    this.uiLoader.loadComponent('#navigation-bar-container', 'components/navigation-bar.html', (container) => {
      this.navBar = container.querySelector('#navigation-bar');
      this.setupEvents();
      this.updatePosition();
    });
    
    // Listen for resize to update position relative to sidebar
    window.addEventListener('resize', this.updatePosition.bind(this));
  }

  setupEvents() {
    const zoomBtn = this.navBar.querySelector('#nav-zoom');
    const panBtn = this.navBar.querySelector('#nav-pan');
    const cameraBtn = this.navBar.querySelector('#nav-camera');
    const orthoBtn = this.navBar.querySelector('#nav-ortho');

    // Zoom
    this.setupDrag(zoomBtn, 'zoom');
    // Pan
    this.setupDrag(panBtn, 'pan');

    // Click actions
    cameraBtn.addEventListener('click', () => {
      console.log('Camera toggle not implemented yet');
    });

    orthoBtn.addEventListener('click', () => {
      this.toggleProjection();
    });
  }

  setupDrag(element, action) {
    const start = (e) => {
      e.preventDefault();
      this.isDragging = true;
      this.activeAction = action;
      this.startY = e.clientY || e.touches[0].clientY;
      this.startX = e.clientX || e.touches[0].clientX;
      
      document.addEventListener('mousemove', move);
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('mouseup', end);
      document.addEventListener('touchend', end);
    };

    const move = (e) => {
      if (!this.isDragging) return;
      const clientY = e.clientY || e.touches[0].clientY;
      const clientX = e.clientX || e.touches[0].clientX;
      
      const deltaY = clientY - this.startY;
      const deltaX = clientX - this.startX;

      this.startY = clientY;
      this.startX = clientX;

      if (this.activeAction === 'zoom') {
        this.handleZoom(deltaY);
      } else if (this.activeAction === 'pan') {
        this.handlePan(deltaX, deltaY);
      }
    };

    const end = () => {
      this.isDragging = false;
      this.activeAction = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('mouseup', end);
      document.removeEventListener('touchend', end);
    };

    element.addEventListener('mousedown', start);
    element.addEventListener('touchstart', start, { passive: false });
  }

  handleZoom(deltaY) {
    const controls = this.controls.instance; 
    const camera = controls.camera;
    
    if (camera.isPerspectiveCamera) {
        // Zoom
        const eye = new THREE.Vector3().subVectors(camera.position, controls.target);
        
        // Blender-like: Drag down (positive deltaY) -> Zoom OUT. Drag up -> Zoom IN.
        // Scale factor. 
        const factor = 1 + Math.abs(deltaY) * 0.01;
        const scale = deltaY > 0 ? factor : (1 / factor);

        eye.multiplyScalar(scale);
        camera.position.copy(controls.target).add(eye);
        camera.lookAt(controls.target);
    } else {
        // Ortho Zoom
        // Drag down -> Zoom Out (decrease zoom value? No, increase frustum size, so decrease zoom)
        // Zoom value: higher is zoomed in.
        // So Drag Down (deltaY > 0) -> Decrease Zoom.
        const zoomScale = 1 + Math.abs(deltaY) * 0.01;
        if (deltaY > 0) {
            camera.zoom /= zoomScale;
        } else {
            camera.zoom *= zoomScale;
        }
        camera.updateProjectionMatrix();
    }
  }

  handlePan(deltaX, deltaY) {
    const controls = this.controls.instance;
    const camera = controls.camera;
    const element = this.renderer.domElement;

    const offset = new THREE.Vector3();
    const eye = new THREE.Vector3().subVectors(camera.position, controls.target);
    const eyeLength = eye.length();

    // Calculate pan movement
    // Need camera Up and Right vectors
    const cameraUp = camera.up.clone().normalize();
    const eyeDirection = eye.clone().normalize();
    const right = new THREE.Vector3().crossVectors(cameraUp, eyeDirection).normalize();
    
    // Adjust cameraUp to be orthogonal to eye direction for panning plane
    const orthogonalUp = new THREE.Vector3().crossVectors(eyeDirection, right).normalize();

    // Scale factor (approximate)
    const panSpeed = 2.0;
    const panX = -deltaX * eyeLength * panSpeed / element.clientHeight;
    const panY = deltaY * eyeLength * panSpeed / element.clientHeight;

    offset.addScaledVector(right, panX);
    offset.addScaledVector(orthogonalUp, panY);

    camera.position.add(offset);
    controls.target.add(offset);
    camera.lookAt(controls.target);
  }

  toggleProjection() {
    this.cameraManager.toggleOrthographic();
  }

  updatePosition() {
    if (!this.navBar) return;
    // Align with ViewHelper: Right edge = window width - sidebar width.
    const sidebar = document.getElementById('right-panel-container');
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 325;
    const canvas = this.renderer.domElement;
    
    // ViewHelper top is 80px. Height 128px.
    // Nav bar top = 80 + 128 + 10 = 218px.
    this.navBar.style.top = '218px';
    this.navBar.style.right = `${sidebarWidth + 10}px`; // 10px padding from sidebar
  }
}