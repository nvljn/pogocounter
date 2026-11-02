export function setupOutputPreview(output: HTMLTextAreaElement) {
  const field = document.querySelector<HTMLElement>('#output-field')!;
  const toggle = document.querySelector<HTMLButtonElement>('#output-preview')!;
  const text = document.querySelector<HTMLElement>('#output-preview-text')!;
  const mobile = matchMedia('(max-width: 800px)');

  function expand(expanded: boolean) {
    field.classList.toggle('is-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Hide full search string' : 'Show full search string');
  }
  toggle.addEventListener('click', () => expand(toggle.getAttribute('aria-expanded') !== 'true'));
  field.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      expand(false);
      toggle.focus({ preventScroll: true });
    }
  });
  document.addEventListener('pointerdown', event => {
    if (mobile.matches && !field.contains(event.target as Node)) expand(false);
  });
  field.addEventListener('focusout', event => {
    if (mobile.matches && !field.contains(event.relatedTarget as Node | null)) expand(false);
  });
  mobile.addEventListener('change', () => expand(false));
  return {
    refresh(emptyMessage = output.placeholder) {
      text.textContent = output.value || emptyMessage;
      text.lang = output.lang;
      toggle.disabled = !output.value;
      if (toggle.disabled) expand(false);
    },
    revealForCopy() {
      if (mobile.matches) expand(true);
    },
  };
}
