export class MenubarRender {
  constructor(editor) {
    const container = document.querySelector('.menu-bar');
    const renderBtn = container.querySelector('.render-image');

    if (renderBtn) {
      renderBtn.addEventListener('click', () => {
        editor.signals.renderImage.dispatch();
      });
    }
    
    // Optional: Add keyboard shortcut listener here or in KeyHandler
    // For now, just the menu click.
  }
}
