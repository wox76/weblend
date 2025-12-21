export default class UIComponentsLoader {
  constructor() {}

  async loadComponent(selector, url, onLoaded, retries = 5) {
    // getElementById requires selector to be an ID (without #)
    const id = selector.startsWith('#') ? selector.substring(1) : selector;
    let container = document.getElementById(id);

    if (!container) {
      if (retries > 0) {
        // console.warn(`Container ${selector} not found, retrying... (${retries})`); // Mute warning for cleaner log
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.loadComponent(selector, url, onLoaded, retries - 1);
      }
      console.error(`ERROR: No container found for selector: ${selector} after multiple retries.`); // Use error to make it clear
      return;
    }

    try {
      const response = await fetch(url + '?t=' + Date.now());
      const html = await response.text();
      container.innerHTML = html;

      if (typeof onLoaded === 'function') {
        onLoaded(container);
      }
    } catch (error) {
      console.error(`Failed to load component from ${url}`, error);
    }
  }
}
