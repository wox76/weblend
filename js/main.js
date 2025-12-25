import Editor from './Editor.js';

async function main() {
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
  }

  try {
    const editor = new Editor();
    await editor.init();
  } catch (error) {
    console.error('Failed to initialize editor:', error);
    // indexedDB.deleteDatabase('weblend-storage');
  }
}

main();