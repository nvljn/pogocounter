import { TYPES } from '../data/schema.ts';
import type { EffectivenessMatrix, PokemonType } from '../data/schema.ts';
import { damageMultiplier } from '../lib/effectiveness.ts';

function typeIcon(type: PokemonType): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('type-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('viewBox', '0 0 512 512');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `${import.meta.env.BASE_URL}type-icons.svg#type-${type.toLowerCase()}`);
  svg.append(use);
  return svg;
}

export function typeBadge(type: PokemonType): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `type-badge type-${type.toLowerCase()}`;
  badge.append(typeIcon(type), document.createTextNode(type));
  return badge;
}

export function setupMatchupToggle(): void {
  const card = document.querySelector<HTMLElement>('.matchup-card')!;
  const toggle = document.querySelector<HTMLButtonElement>('#matchup-toggle')!;
  const mobile = matchMedia('(max-width: 800px)');
  function expand(expanded: boolean) {
    card.classList.toggle('is-collapsed', !expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Show only super-effective types' : 'Show neutral and resisted types');
  }
  toggle.addEventListener('click', () => expand(toggle.getAttribute('aria-expanded') !== 'true'));
  mobile.addEventListener('change', () => expand(!mobile.matches));
  expand(!mobile.matches);
}

export function renderMatchups(defense: PokemonType[], matrix: EffectivenessMatrix): void {
  const matchups = TYPES.map(type => ({ type, multiplier: damageMultiplier(type, defense, matrix) }))
    .sort((a, b) => b.multiplier - a.multiplier || a.type.localeCompare(b.type, 'en'));
  const groups = [
    { label: 'Super effective', className: 'effective', entries: matchups.filter(m => m.multiplier > 1) },
    { label: 'Neutral', className: 'neutral', entries: matchups.filter(m => m.multiplier === 1) },
    { label: 'Resisted', className: 'resisted', entries: matchups.filter(m => m.multiplier < 1)
      .sort((a, b) => a.multiplier - b.multiplier || a.type.localeCompare(b.type, 'en')) },
  ];
  document.querySelector('#matchup-groups')!.replaceChildren(...groups.map(group => {
    const section = document.createElement('div');
    section.className = `matchup-group ${group.className}`;
    const title = document.createElement('h3');
    title.textContent = group.label;
    const list = document.createElement('div');
    list.className = 'matchup-types';
    for (const entry of group.entries) {
      const chip = document.createElement('span');
      chip.className = 'matchup-chip';
      if (Math.abs(entry.multiplier - 2.56) < 1e-12) {
        chip.classList.add('double-effective');
        chip.title = 'Double super effective';
      } else if (entry.multiplier <= 0.390625 + 1e-12) {
        chip.classList.add('double-resisted');
        chip.title = entry.multiplier < 0.390625 - 1e-12 ? 'Triple resisted' : 'Double resisted';
      }
      const type = document.createElement('span');
      type.className = 'matchup-type';
      type.append(typeIcon(entry.type), document.createTextNode(entry.type));
      const value = document.createElement('span');
      value.className = 'multiplier';
      value.textContent = `${Number(entry.multiplier.toFixed(2))}×`;
      value.title = `${Number(entry.multiplier.toFixed(12))}× damage`;
      chip.append(type, value);
      list.append(chip);
    }
    if (!group.entries.length) list.textContent = 'None';
    section.append(title, list);
    return section;
  }));
}
