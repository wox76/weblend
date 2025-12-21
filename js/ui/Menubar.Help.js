export class MenubarHelp {
  constructor(editor) {
    this.init();
  }

  init() {
    const sourceBtn = document.querySelector('.sourcecode');
    if (sourceBtn) {
      sourceBtn.addEventListener('click', () => {
    option.classList.add('menu-item');
    option.innerHTML = 'Help';

    const menu = new UI.UIPanel();
    menu.setClass('submenu');
    option.appendChild(menu.dom);

    // Source Code
    const source = new UI.UIRow();
    source.setClass('submenu-item');
    source.setTextContent('Source Code');
    source.onClick(function () {
      window.open('https://github.com/sengchor/weblend', '_blank');
    });
    menu.add(source);
      });
    }

    const aboutBtn = document.querySelector('.about');
    if (aboutBtn) {
      aboutBtn.addEventListener('click', () => {
        window.open('https://www.youtube.com/@jourverse', '_blank');
      });
    }

    const reportBtn = document.querySelector('.report');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        window.open('https://discord.com/invite/FEkhTyggYq', '_blank');
      });
    }

    const patreonBtn = document.querySelector('.patreon');
    if (patreonBtn) {
      patreonBtn.addEventListener('click', () => {
        window.open('https://www.patreon.com/c/jourverse', '_blank');
      });
    }
  }
}