export class PanTool {
  constructor(editor) {
    this.editor = editor;
    this.controls = editor.controlsManager.instance;
    this.canvas = editor.renderer.domElement;
    this.isDragging = false;
    this.startMouseX = 0;
    this.startMouseY = 0;

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  enable() {
    this.canvas.style.cursor = 'grab';
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
      this.startMouseX = event.clientX;
      this.startMouseY = event.clientY;
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
      this.canvas.style.cursor = 'grabbing';
    }
  }

  onMouseMove(event) {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.startMouseX;
    const deltaY = event.clientY - this.startMouseY;

    // Pan based on mouse movement
    // These values might need tuning
    this.controls.pan(deltaX * 0.1, -deltaY * 0.1);

    this.startMouseX = event.clientX;
    this.startMouseY = event.clientY;
    this.controls.update();
  }

  onMouseUp() {
    this.isDragging = false;
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.style.cursor = 'grab';
  }
}