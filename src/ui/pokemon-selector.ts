import type { Pokemon } from '../data/schema.ts';
import { previewUrl } from './preview-images.ts';

export function formName(form: string): string {
  return form.replaceAll('_', ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

export function pokemonLabel(pokemon: Pokemon, showForm = true): string {
  return showForm ? `${pokemon.name} · ${formName(pokemon.form)}` : pokemon.name;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function setupPokemonSelector(
  pokemon: Pokemon[], initial: Pokemon, onSelect: (pokemon: Pokemon) => void,
): void {
  const root = document.querySelector<HTMLElement>('#boss-picker')!;
  const input = root.querySelector<HTMLInputElement>('#boss-search')!;
  const dropdown = root.querySelector<HTMLElement>('#boss-dropdown')!;
  const list = root.querySelector<HTMLElement>('#boss-options')!;
  const status = root.querySelector<HTMLElement>('#search-status')!;
  const clear = root.querySelector<HTMLButtonElement>('#clear-search')!;
  const field = root.querySelector<HTMLElement>('.boss-search-field')!;
  const selectedForm = root.querySelector<HTMLElement>('#boss-form')!;
  const formCounts = new Map<number, number>();
  for (const entry of pokemon) formCounts.set(entry.id, (formCounts.get(entry.id) ?? 0) + 1);
  const label = (entry: Pokemon) => pokemonLabel(entry, formCounts.get(entry.id)! > 1);
  const index = [...pokemon].sort((a, b) => a.name.localeCompare(b.name, 'en') ||
    Number(b.form === 'Normal') - Number(a.form === 'Normal') || a.form.localeCompare(b.form, 'en'))
    .map(p => ({ pokemon: p, text: normalize(`${p.name} ${p.form} ${p.id}`) }));
  let selected = initial;
  let matches: Pokemon[] = [];
  let active = -1;
  let thumbnailTimer: ReturnType<typeof setTimeout> | undefined;
  const pendingThumbnails = new Set<HTMLElement>();
  const startedThumbnails = new WeakSet<HTMLElement>();
  const thumbnails = new IntersectionObserver(entries => {
    if (dropdown.hidden) return;
    for (const entry of entries) {
      const slot = entry.target as HTMLElement;
      if (!list.contains(slot)) continue;
      if (entry.isIntersecting) pendingThumbnails.add(slot);
      else pendingThumbnails.delete(slot);
    }
    clearTimeout(thumbnailTimer);
    // Text filters immediately; a brief image-only delay avoids requests for transient queries.
    thumbnailTimer = setTimeout(() => {
      for (const slot of pendingThumbnails) {
        thumbnails.unobserve(slot);
        void loadThumbnail(slot);
      }
      pendingThumbnails.clear();
    }, 80);
  }, { root: list, rootMargin: '64px 0px', threshold: 0.01 });

  async function loadThumbnail(slot: HTMLElement) {
    if (startedThumbnails.has(slot)) return;
    startedThumbnails.add(slot);
    const url = await previewUrl(slot.dataset.key!);
    if (!url) return;
    if (!slot.isConnected || !list.contains(slot) || dropdown.hidden) {
      startedThumbnails.delete(slot);
      return;
    }
    const image = new Image(32, 32);
    image.alt = '';
    image.decoding = 'async';
    image.onload = () => {
      if (slot.isConnected && list.contains(slot)) slot.replaceChildren(image);
    };
    image.onerror = () => {}; // Unavailable artwork keeps its initial; selection stays usable.
    image.src = url;
  }

  function stopThumbnails() {
    thumbnails.disconnect();
    clearTimeout(thumbnailTimer);
    pendingThumbnails.clear();
  }
  input.value = label(initial);
  selectedForm.hidden = formCounts.get(initial.id)! < 2;

  function close() {
    stopThumbnails();
    input.value = label(selected);
    root.classList.remove('is-querying');
    selectedForm.hidden = formCounts.get(selected.id)! < 2;
    dropdown.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function choose(pokemon: Pokemon) {
    selected = pokemon;
    input.value = label(pokemon);
    close();
    onSelect(pokemon);
  }

  function highlight(next: number) {
    active = next;
    for (const [i, option] of [...list.children].entries()) {
      option.classList.toggle('active', i === active);
    }
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `boss-option-${active}`);
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function createOption(p: Pokemon): HTMLElement {
    const option = document.createElement('div');
    option.className = 'boss-option';
    option.dataset.pokemonKey = p.key;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(p.key === selected.key));
    const name = document.createElement('span');
    name.className = 'boss-option-name';
    name.textContent = label(p);
    const types = document.createElement('small');
    types.textContent = p.types.join(' / ');
    const text = document.createElement('div');
    text.className = 'boss-option-text';
    text.append(name, types);
    const thumbnail = document.createElement('div');
    thumbnail.className = 'boss-option-preview';
    thumbnail.dataset.key = p.key;
    thumbnail.setAttribute('aria-hidden', 'true');
    const initial = document.createElement('div');
    initial.className = 'preview-initial';
    initial.textContent = p.name.slice(0, 1);
    thumbnail.append(initial);
    option.append(thumbnail, text);
    option.addEventListener('pointerdown', event => event.preventDefault());
    option.addEventListener('click', () => choose(p));
    return option;
  }

  function open(showAll = false) {
    const wasClosed = dropdown.hidden;
    root.classList.toggle('is-querying', input.value !== label(selected));
    const query = showAll ? '' : normalize(input.value);
    const words = query.split(' ').filter(Boolean);
    const found = index.filter(entry => words.every(word => entry.text.includes(word)));
    const next = found.slice(0, 60).map(entry => entry.pokemon);
    const changed = next.length !== matches.length || next.some((entry, i) => entry.key !== matches[i]?.key);
    const message = found.length === 0 ? 'No Pokémon found. Try a name or form.' :
      found.length > 60 ? `Showing 60 of ${found.length.toLocaleString('en')} forms. Keep typing to narrow.` :
      `${found.length} ${found.length === 1 ? 'form' : 'forms'} found`;
    if (status.textContent !== message) status.textContent = message;
    // Continuing a query such as "girat" → "giratina" leaves the DOM, images, scroll and loading timers intact.
    if (!changed && !wasClosed) return;
    const activeKey = matches[active]?.key;
    if (changed) {
      const rows = new Map([...list.children].map(node => [(node as HTMLElement).dataset.pokemonKey!, node as HTMLElement]));
      const wanted = new Set(next.map(entry => entry.key));
      for (const [key, row] of rows) if (!wanted.has(key)) {
        const slot = row.querySelector<HTMLElement>('.boss-option-preview')!;
        thumbnails.unobserve(slot);
        pendingThumbnails.delete(slot);
        row.remove();
      }
      for (const [i, entry] of next.entries()) {
        const row = rows.get(entry.key) ?? createOption(entry);
        row.id = `boss-option-${i}`;
        // Matching rows retain their image elements, including downloads already in progress.
        if (list.children[i] !== row) list.insertBefore(row, list.children[i] ?? null);
      }
      matches = next;
      list.scrollTop = 0;
    }
    for (const row of list.children) row.setAttribute('aria-selected', String((row as HTMLElement).dataset.pokemonKey === selected.key));
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(wasClosed ? -1 : matches.findIndex(entry => entry.key === activeKey));
    for (const slot of list.querySelectorAll<HTMLElement>('.boss-option-preview')) {
      if (!startedThumbnails.has(slot)) thumbnails.observe(slot);
    }
  }

  input.addEventListener('focus', () => { input.select(); open(input.value === label(selected)); });
  input.addEventListener('click', () => {
    if (input.value === label(selected)) input.select();
    if (dropdown.hidden) open(input.value === label(selected));
  });
  input.addEventListener('input', () => open());
  field.addEventListener('click', event => {
    if (event.target === input || clear.contains(event.target as Node)) return;
    input.focus();
    input.select();
    if (dropdown.hidden) open(input.value === label(selected));
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (dropdown.hidden) open(input.value === label(selected));
      if (matches.length) highlight(event.key === 'ArrowDown' ? (active + 1) % matches.length :
        active <= 0 ? matches.length - 1 : active - 1);
    } else if (event.key === 'Enter' && !dropdown.hidden) {
      event.preventDefault();
      const choice = matches[active >= 0 ? active : 0];
      if (choice) choose(choice);
    } else if (event.key === 'Escape') {
      input.value = label(selected);
      close();
    } else if (event.key === 'Tab') close();
  });
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget as Node | null)) {
      input.value = label(selected);
      close();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!root.contains(event.target as Node)) {
      input.value = label(selected);
      close();
    }
  });
  clear.addEventListener('click', () => { input.focus(); input.value = ''; open(); });
}
