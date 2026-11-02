import type { BossMove, BossMoves } from '../data/moves.ts';
import type { DefenseOptions, DefenseRequirement } from '../lib/defense.ts';
import { typeBadge } from './render.ts';

export function setupDefenseControls(onChange: () => void) {
  const root = document.querySelector<HTMLElement>('#defense-panel')!;
  const enabled = root.querySelector<HTMLInputElement>('#enable-defense')!;
  const fields = root.querySelector<HTMLFieldSetElement>('#defense-fields')!;
  const requirement = root.querySelector<HTMLFieldSetElement>('#defense-requirement')!;
  const warning = root.querySelector<HTMLElement>('#moves-warning')!;
  let moves: BossMoves | undefined;
  const selected = { fast: new Set<string>(), charged: new Set<string>() };

  function available(kind: 'fast' | 'charged'): BossMove[] {
    return moves?.[kind] ?? [];
  }

  function refreshState() {
    fields.disabled = !enabled.checked;
    requirement.disabled = !enabled.checked;
    root.classList.toggle('defense-disabled', !enabled.checked);
    const issues = [...available('fast'), ...available('charged')].filter(move =>
      move.issue && (selected.fast.has(move.name) || selected.charged.has(move.name)));
    warning.hidden = !enabled.checked || !issues.length;
    warning.textContent = issues.map(move => `${move.name}: ${move.issue}`).join(' ');
  }

  function render() {
    for (const kind of ['fast', 'charged'] as const) {
      const container = root.querySelector(`#boss-${kind}-moves`)!;
      const entries = available(kind);
      container.replaceChildren(...entries.map(move => {
        const label = document.createElement('label');
        label.className = 'move-option';
        const description = document.createElement('span');
        description.className = 'move-description';
        const name = document.createElement('span');
        name.textContent = move.name;
        description.append(name);
        if (move.type) description.append(typeBadge(move.type));
        else {
          const unknown = document.createElement('span');
          unknown.className = 'unknown-type';
          unknown.textContent = 'Unknown type';
          description.append(unknown);
          label.title = move.issue ?? 'Unknown move type';
        }
        if (move.legacy) {
          const legacyBadge = document.createElement('small');
          legacyBadge.className = 'legacy-badge';
          legacyBadge.textContent = 'Legacy';
          description.append(legacyBadge);
        }
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.move = move.name;
        checkbox.dataset.slot = kind;
        checkbox.checked = selected[kind].has(move.name);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selected[kind].add(move.name);
          else selected[kind].delete(move.name);
        });
        label.append(description, checkbox);
        return label;
      }));
      for (const button of root.querySelectorAll<HTMLButtonElement>(`button[data-move-group="${kind}"]`)) {
        button.disabled = !entries.length;
      }
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'field-hint';
        empty.textContent = `No ${kind} moves available for this form.`;
        container.append(empty);
      }
    }
    refreshState();
  }

  root.addEventListener('change', () => {
    refreshState();
    onChange();
  });
  root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-move-group]');
    if (!button || !enabled.checked) return;
    const kind = button.dataset.moveGroup as 'fast' | 'charged';
    selected[kind] = new Set(button.dataset.selection === 'all' ? available(kind).map(move => move.name) : []);
    render();
    onChange();
  });

  const info = root.querySelector<HTMLButtonElement>('#defense-info')!;
  const help = root.querySelector<HTMLElement>('#defense-help')!;
  let pinned = false;
  function showHelp(show: boolean) { info.setAttribute('aria-expanded', String(show)); help.hidden = !show; }
  function closeHelp() { pinned = false; showHelp(false); }
  info.addEventListener('click', () => { pinned = !pinned; showHelp(pinned); });
  info.addEventListener('focus', () => showHelp(true));
  info.addEventListener('mouseenter', () => showHelp(true));
  info.parentElement!.addEventListener('mouseleave', () => { if (!pinned && document.activeElement !== info) showHelp(false); });
  info.addEventListener('blur', closeHelp);
  document.addEventListener('pointerdown', event => { if (!info.parentElement!.contains(event.target as Node)) closeHelp(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeHelp(); });

  return {
    read(): DefenseOptions {
      return { mode: 'selected', fast: enabled.checked && selected.fast.size > 0,
        charged: enabled.checked && selected.charged.size > 0,
        selectedFast: [...selected.fast], selectedCharged: [...selected.charged], includeLegacy: true };
    },
    requirement(): DefenseRequirement {
      return root.querySelector<HTMLInputElement>('input[name="resistance"]:checked')!.value as DefenseRequirement;
    },
    isEnabled() { return enabled.checked; },
    setBoss(next: BossMoves | undefined) {
      moves = next;
      root.querySelector<HTMLElement>('#moves-source-note')!.textContent = next?.sourceKey
        ? "Moves use the regular form's learnable pool; verify the raid's moves."
        : 'These learnable move pools may differ from the current raid.';
      selected.fast.clear();
      selected.charged.clear();
      render();
    },
    reset() {
      enabled.checked = false;
      root.querySelector<HTMLInputElement>('input[name="resistance"][value="not-weak"]')!.checked = true;
      selected.fast.clear();
      selected.charged.clear();
      render();
    },
  };
}
