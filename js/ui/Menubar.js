import { MenubarFile } from './Menubar.File.js';
import { MenubarEdit } from './Menubar.Edit.js';
import { MenubarRender } from './Menubar.Render.js';
import { MenubarAdd } from './Menubar.Add.js';
import { MenubarView } from './Menubar.View.js';
import { MenubarHelp } from './Menubar.Help.js';

export default class Menubar {
  constructor( editor ) {
    this.uiLoader = editor.uiLoader;
    this.load(editor);
  }

  load(editor) {
    this.uiLoader.loadComponent('#menu-container', 'components/menu-bar.html', (container) => {
      new MenubarFile(editor);
      new MenubarEdit(editor);
      new MenubarRender(editor);

      const menuLogo = container.querySelector('.menu-logo');
      if (menuLogo) {
        menuLogo.style.cursor = 'pointer'; // Indicate it's clickable
        menuLogo.addEventListener('click', () => {
          editor.splashScreen.show();
        });
      }
    });
  }
}