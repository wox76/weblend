export class NumberDragger {
  constructor(editor) {
    this.editor = editor;
    this.isDragging = false;
    this.dragStartX = 0;
    this.startValue = 0;
    this.currentInput = null;
    this.dragThreshold = 3;

    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);
    
    this.init();
  }

  init() {
    document.addEventListener('mousedown', this._onMouseDown);
  }

  onMouseDown(event) {
    if (event.target.tagName !== 'INPUT' || event.target.type !== 'number') return;
    
    this.currentInput = event.target;
    this.dragStartX = event.clientX;
    this.startValue = parseFloat(this.currentInput.value) || 0;
    this.isDragging = false;
    
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }
  
  onMouseMove(event) {
      if (!this.currentInput) return;
      
      const dx = event.clientX - this.dragStartX;
      
      if (!this.isDragging && Math.abs(dx) > this.dragThreshold) {
          this.isDragging = true;
          this.currentInput.blur(); 
          document.body.style.cursor = 'ew-resize';
      }
      
      if (this.isDragging) {
          event.preventDefault(); 
          
          let multiplier = 1;
          if (event.shiftKey) multiplier = 0.1;
          if (event.ctrlKey) multiplier = 10;
          
          let step = parseFloat(this.currentInput.step);
          if (isNaN(step) || step === 0) step = 0.1; // Default step if not defined
          
          // Adjust sensitivity: 10 pixels = 1 full step (scaled by multiplier)
          // Or 1 pixel = 1 step?
          // Blender is pixel-perfect. 1px = 1 'unit' of movement.
          // Let's try 1px = 1 step * multiplier.
          
          const delta = dx * step * multiplier;
          
          let newValue = this.startValue + delta;
          
          // Determine precision based on step
          const stepString = step.toString();
          let precision = 0;
          if (stepString.includes('.')) {
              precision = stepString.split('.')[1].length;
          } else {
              // If step is integer (e.g. 1), precision is 0?
              // But drag might introduce decimals if multiplier is 0.1 (Shift).
              // So if Shift is held, we need more precision.
              if (event.shiftKey) precision = 2; // Arbitrary
          }
          
          // If we are using shift, we definitely want more precision than the step might imply if step is integer
          if (event.shiftKey && precision === 0) precision = 2;

          // Round to avoid floating point errors like 1.00000000001
          const factor = Math.pow(10, precision);
          newValue = Math.round(newValue * factor) / factor;
          
          this.currentInput.value = newValue;
          this.currentInput.dispatchEvent(new Event('change', { bubbles: true }));
          this.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
  }
  
  onMouseUp(event) {
      if (this.currentInput) {
          if (!this.isDragging) {
              this.currentInput.focus();
          }
      }
      
      this.currentInput = null;
      this.isDragging = false;
      document.body.style.cursor = '';
      
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('mouseup', this._onMouseUp);
  }
}
