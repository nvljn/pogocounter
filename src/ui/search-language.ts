import { SEARCH_LANGUAGES, searchLanguage } from '../lib/search-language.ts';
import { languageFlag } from './language-flags.ts';

export function setupSearchLanguage(onChange: () => void) {
  const select = document.querySelector<HTMLSelectElement>('#output-language')!;
  const badge = document.querySelector<HTMLElement>('#language-badge')!;
  const root = document.querySelector<HTMLElement>('.language-picker')!;
  const button = root.querySelector<HTMLButtonElement>('#language-button')!;
  const list = root.querySelector<HTMLElement>('#language-options')!;
  const flag = root.querySelector<HTMLElement>('#language-flag')!;
  let active = 0;
  let typed = '', lastTyped = 0;
  for (const language of SEARCH_LANGUAGES) {
    const option = document.createElement('option');
    option.value = language.code;
    option.textContent = `${language.badge} — ${language.name}`;
    option.lang = language.code;
    select.append(option);
    const item = document.createElement('div');
    item.id = `language-option-${language.code}`;
    item.dataset.language = language.code;
    item.className = 'language-option';
    item.setAttribute('role', 'option');
    const name = document.createElement('span');
    name.lang = language.code;
    name.textContent = language.name;
    const code = document.createElement('small');
    code.textContent = language.badge;
    item.append(languageFlag(language.code), name, code);
    item.addEventListener('pointerdown', event => event.preventDefault());
    item.addEventListener('pointermove', () => highlight(SEARCH_LANGUAGES.indexOf(language)));
    item.addEventListener('click', () => choose(language.code));
    list.append(item);
  }
  let saved = 'en';
  try { saved = localStorage.getItem('pogocounter-language') ?? 'en'; }
  catch { /* Language selection also works without browser storage. */ }
  select.value = SEARCH_LANGUAGES.some(language => language.code === saved) ? saved : 'en';
  function render() {
    const language = searchLanguage(select.value);
    badge.textContent = language.badge;
    flag.replaceChildren(languageFlag(language.code));
    button.title = `Search output: ${language.name}. Match your Pokémon GO game language.`;
    button.setAttribute('aria-label', `Search output language: ${language.badge} — ${language.name}`);
    for (const item of list.children) item.setAttribute('aria-selected', String((item as HTMLElement).dataset.language === language.code));
    document.querySelector('#search-output')!.setAttribute('lang', language.code);
  }
  function highlight(index: number) {
    active = index;
    for (const [i, item] of [...list.children].entries()) item.classList.toggle('active', i === index);
    button.setAttribute('aria-activedescendant', `language-option-${SEARCH_LANGUAGES[index]!.code}`);
    list.children[index]?.scrollIntoView({ block: 'nearest' });
  }
  function close() {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
  }
  function open() {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    highlight(SEARCH_LANGUAGES.findIndex(language => language.code === select.value));
  }
  function choose(code: string) {
    select.value = code;
    select.dispatchEvent(new Event('change'));
    close();
    button.focus({ preventScroll: true });
  }
  button.addEventListener('click', () => { if (list.hidden) open(); else close(); });
  button.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const wasClosed = list.hidden;
      if (wasClosed) open();
      const count = SEARCH_LANGUAGES.length;
      highlight(event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 :
        (active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (list.hidden) open(); else choose(SEARCH_LANGUAGES[active]!.code);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') close();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (Date.now() - lastTyped > 700) typed = '';
      typed += event.key.toLowerCase();
      lastTyped = Date.now();
      if (list.hidden) open();
      const match = SEARCH_LANGUAGES.findIndex(language => language.badge.toLowerCase().startsWith(typed) || language.name.toLowerCase().startsWith(typed));
      if (match >= 0) highlight(match);
    }
  });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target as Node)) close(); });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget as Node | null)) close(); });
  select.addEventListener('change', () => {
    render();
    try { localStorage.setItem('pogocounter-language', select.value); }
    catch { /* Keep the selection for this open tab. */ }
    onChange();
  });
  render();
  return { read: () => select.value };
}
