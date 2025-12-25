export class OrthographicTool {
  constructor(editor) {
    this.editor = editor;
    this.button = null; // Reference to the toolbar button
  }

  enable() {
    // This tool is activated by a click, not a drag.
    // No specific canvas event listeners needed for 'enable' state for this type of tool.
    // The button will be managed by the toolbar to show active state.
  }

  disable() {
    // No specific canvas event listeners to remove.
  }

  activate() {
    // This is called when the button is clicked
    this.editor.cameraManager.toggleOrthographic();
  }
}