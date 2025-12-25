import { MergeByDistanceCommand } from "../commands/MergeByDistanceCommand.js";

export class MenubarMesh {
  constructor(editor, container) {
    this.editor = editor;
    this.container = container || document;
    this.init();
  }

  init() {
    const mergeBtn = this.container.querySelector('#menu-mesh-cleanup-merge');
    if (mergeBtn) {
      mergeBtn.addEventListener('click', () => {
        this.handleMergeByDistance();
      });
    }
  }

  handleMergeByDistance() {
    const object = this.editor.editSelection.editedObject;
    if (!object || !object.isMesh) {
      alert("Please enter Edit Mode on a mesh first.");
      return;
    }

    const defaultDistance = 0.001;

    // Execute the command first
    const cmd = new MergeByDistanceCommand(this.editor, object, defaultDistance);
    this.editor.execute(cmd);

    const updatePanel = (distance, removedCount) => {
        this.editor.signals.showOperatorPanel.dispatch(
          'Merge by Distance',
          {
            distance: { type: 'number', value: distance, label: 'Distance', step: 0.0001, min: 0 },
            info: { type: 'info', value: `Removed: ${removedCount} vertices`, label: 'Stats' }
          },
          (key, value) => {
            if (key === 'distance') {
               this.editor.undo();
               const newCmd = new MergeByDistanceCommand(this.editor, object, value);
               this.editor.execute(newCmd);
               // Re-render panel to show new stats (might lose focus, but needed for info update)
               updatePanel(value, newCmd.removedCount);
            }
          }
        );
    };

    updatePanel(defaultDistance, cmd.removedCount);
  }
}