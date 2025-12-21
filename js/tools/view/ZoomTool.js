export class ZoomTool {
  constructor(editor) {
    this.editor = editor;
    this.controls = editor.controlsManager.instance;
    this.canvas = editor.renderer.domElement;
    this.isDragging = false;
    this.startMouseY = 0;
    this.zoomSpeed = 0.005; // Adjust as needed

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  enable() {
    this.canvas.style.cursor = 'zoom-in';
    this.canvas.addEventListener('mousedown', this.onMouseDown);
  }

  disable() {
    this.canvas.style.cursor = '';
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.isDragging = false;
  }

  onMouseDown(event) {
    if (event.button === 0) { // Left click
      this.isDragging = true;
      this.startMouseY = event.clientY;
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
    }
  }

  onMouseMove(event) {
    if (!this.isDragging) return;

    const deltaY = event.clientY - this.startMouseY;
    const zoomFactor = 1 + deltaY * this.zoomSpeed;

    // Apply zoom
    if (deltaY > 0) { // Zoom out
        this.controls.dollyOut(zoomFactor);
    } else { // Zoom in
        this.controls.dollyIn(zoomFactor);
    }
    
    this.startMouseY = event.clientY;
    this.controls.update();
  }

  onMouseUp() {
    this.isDragging = false;
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  }
}