export class MenubarHelp {
  constructor(editor) {
    this.init();
  }

  init() {
    const sourceBtn = document.querySelector('.sourcecode');
    if (sourceBtn) {
      sourceBtn.addEventListener('click', () => {
        window.open('https://github.com/wox76/weblend', '_blank');
      });
    }

    const aboutBtn = document.querySelector('.about');
    if (aboutBtn) {
      aboutBtn.addEventListener('click', () => {
        window.open('https://www.linkedin.com/in/andrea-rotondo-b677a34/', '_blank');
      });
    }

    const reportBtn = document.querySelector('.report');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        alert('Coming soon!');
      });
    }

    const patreonBtn = document.querySelector('.patreon');
    if (patreonBtn) {
      patreonBtn.addEventListener('click', () => {
        alert('Coming soon!');
      });
    }
  }
}
