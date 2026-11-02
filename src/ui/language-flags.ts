import snapshot from '../data/flags.json' with { type: 'json' };

const images = new Map(Object.entries(snapshot.flags));

export function languageFlag(code: string): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'language-flag';
  image.width = 16;
  image.height = 12;
  image.alt = '';
  image.src = images.get(code) ?? '';
  return image;
}
