export function setupTheme(): void {
  const root = document.documentElement;
  const button = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!;

  function render() {
    const light = root.dataset.theme === 'light';
    button.setAttribute('aria-pressed', String(light));
    button.title = light ? 'Switch to dark mode' : 'Switch to light mode';
    meta.content = light ? '#f6f7f9' : '#111113';
  }

  button.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('pogocounter-theme', root.dataset.theme); }
    catch { /* The toggle still works when browser storage is unavailable. */ }
    render();
  });
  render(); // The small head script restores the preference before the first paint.
}
