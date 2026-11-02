import type { Pokemon } from '../data/schema.ts';
import { previewUrl } from './preview-images.ts';

export function setupPokemonPreview() {
  const slot = document.querySelector<HTMLElement>('#boss-preview')!;
  let request = 0;
  let currentUrl: string | undefined;
  // The first selected image can load before this visit's worker takes control.
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (currentUrl) void fetch(currentUrl).catch(() => undefined);
  });
  return {
    async show(pokemon: Pokemon) {
      const token = ++request;
      currentUrl = undefined;
      const initial = document.createElement('span');
      initial.className = 'preview-initial';
      initial.textContent = pokemon.name.slice(0, 1);
      slot.replaceChildren(initial);
      const url = await previewUrl(pokemon.key);
      if (token !== request || !url) return;
      const image = new Image(128, 128);
      image.alt = '';
      image.decoding = 'async';
      image.onload = () => { if (token === request) slot.replaceChildren(image); };
      // Keep the reserved initial if an uncached/offline image cannot be loaded.
      image.onerror = () => {};
      currentUrl = url;
      image.src = currentUrl;
    },
  };
}
