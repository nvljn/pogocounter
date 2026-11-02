interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function setupPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const status = document.querySelector<HTMLElement>('#offline-status')!;
  const install = document.querySelector<HTMLButtonElement>('#install-button')!;
  const update = document.querySelector<HTMLButtonElement>('#update-app')!;
  let prompt: InstallPrompt | undefined;
  let reloadRequested = false;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event as InstallPrompt;
    install.hidden = false;
  });
  window.addEventListener('appinstalled', () => { install.hidden = true; prompt = undefined; });
  install.addEventListener('click', async () => {
    if (!prompt) return;
    const pending = prompt;
    prompt = undefined;
    install.hidden = true;
    try { await pending.prompt(); await pending.userChoice; }
    catch { status.textContent = 'Use your browser’s menu to install this app.'; }
  });

  status.hidden = false;
  status.textContent = 'Preparing offline access…';
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) window.location.reload();
  });
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
    .then(async registration => {
      function offerUpdate() {
        if (registration.waiting && navigator.serviceWorker.controller) update.hidden = false;
      }
      offerUpdate();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', offerUpdate);
      });
      update.addEventListener('click', () => {
        if (!registration.waiting) return;
        reloadRequested = true;
        registration.waiting.postMessage('SKIP_WAITING');
      });
      await navigator.serviceWorker.ready;
      status.textContent = 'Ready for offline use';
    })
    .catch(() => { status.textContent = 'Offline setup unavailable. This open tab still works.'; });
}
