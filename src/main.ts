import './style.css';
import datasetUrl from './data/dataset.json?url';
import type snapshot from './data/dataset.json';
import { validateMatrix, validatePokemon } from './data/schema.ts';
import { matchingAttackTypes } from './lib/effectiveness.ts';
import { generateSearchString } from './lib/search-string.ts';
import { formName, setupPokemonSelector } from './ui/pokemon-selector.ts';
import { renderMatchups, setupMatchupToggle, typeBadge } from './ui/render.ts';
import { validateMovesets } from './data/moves.ts';
import { defensiveAttackTypes, defensiveClauses } from './lib/defense.ts';
import { inventoryClauses } from './lib/inventory.ts';
import type { InventoryFilters } from './lib/inventory.ts';
import { setupDefenseControls } from './ui/defense-controls.ts';
import { setupPwa } from './ui/pwa.ts';
import { setupAttackControls } from './ui/attack-controls.ts';
import { setupTheme } from './ui/theme.ts';
import { setupSearchLanguage } from './ui/search-language.ts';
import { setupPokemonPreview } from './ui/pokemon-preview.ts';
import { setupOutputPreview } from './ui/output-preview.ts';

setupTheme();

async function start() {
  const response = await fetch(datasetUrl);
  if (!response.ok) throw new Error(`Local dataset: HTTP ${response.status}.`);
  const dataset = await response.json() as typeof snapshot;
  const pokemon = validatePokemon(dataset.pokemon);
  const matrix = validateMatrix(dataset.effectiveness);
  const movesets = validateMovesets(dataset.movesets, pokemon);
  const initial = pokemon.find(p => p.id === 781 && p.form === 'Normal');
  if (!initial) throw new Error('The local dataset is missing the default boss, Dhelmise.');
  let selected = initial;
  const output = document.querySelector<HTMLTextAreaElement>('#search-output')!;
  const outputPreview = setupOutputPreview(output);
  setupMatchupToggle();
  const copyButton = document.querySelector<HTMLButtonElement>('#copy-button')!;
  const copyStatus = document.querySelector<HTMLElement>('#copy-status')!;
  const generationError = document.querySelector<HTMLElement>('#generation-error')!;
  const defenseStatus = document.querySelector<HTMLElement>('#defense-status')!;
  const defense = setupDefenseControls(update);
  const attacks = setupAttackControls(update);
  const cp = document.querySelector<HTMLInputElement>('#min-cp')!;
  const hp = document.querySelector<HTMLInputElement>('#min-hp')!;
  const max = document.querySelector<HTMLSelectElement>('#max-filter')!;
  const maxHint = document.querySelector<HTMLElement>('#max-filter-hint')!;
  const shadow = document.querySelector<HTMLSelectElement>('#shadow-filter')!;
  const language = setupSearchLanguage(update);
  const preview = setupPokemonPreview();

  function update() {
    maxHint.hidden = max.value !== 'only';
    const fast = attacks.read('fast');
    const charged = attacks.read('charged');
    copyStatus.textContent = '';
    generationError.hidden = true;
    defenseStatus.hidden = true;
    try {
      const fastTypes = matchingAttackTypes(selected.types, fast, matrix);
      const chargedTypes = matchingAttackTypes(selected.types, charged, matrix);
      if (!fastTypes.length) throw new Error(`No fast attack type is double super effective (2.56×) against ${selected.name}.`);
      if (!chargedTypes.length) throw new Error(`No charged attack type is double super effective (2.56×) against ${selected.name}.`);
      const defenseTypes = defensiveAttackTypes(movesets[selected.key], defense.read());
      const inventory = inventoryClauses({ minCp: cp.value, minHp: hp.value,
        max: max.value as InventoryFilters['max'], shadow: shadow.value as InventoryFilters['shadow'] });
      output.value = generateSearchString(fast === 'any' ? null : fastTypes, charged === 'any' ? null : chargedTypes,
        [...defensiveClauses(defenseTypes, matrix, language.read(), defense.requirement()), ...inventory], language.read());
      copyButton.disabled = output.value === '';
      if (defenseTypes.length) {
        defenseStatus.textContent = `${defense.requirement() === 'resist' ? 'Resist' : 'Avoid weaknesses to'}: ${defenseTypes.join(', ')}. Only selected moves checked.`;
        defenseStatus.hidden = false;
      } else if (defense.isEnabled()) {
        defenseStatus.textContent = 'Defense enabled. Select boss moves to apply it; no defensive restrictions yet.';
        defenseStatus.hidden = false;
      }
      document.querySelector('#character-count')!.textContent = `${output.value.length} characters`;
    } catch (error) {
      output.value = '';
      copyButton.disabled = true;
      generationError.textContent = error instanceof Error ? error.message : 'Could not generate a search string.';
      generationError.hidden = false;
      document.querySelector('#character-count')!.textContent = '';
    } finally {
      outputPreview.refresh(generationError.hidden ? output.placeholder : 'Adjust your filters to generate a search.');
    }
  }

  function renderBoss() {
    void preview.show(selected);
    document.querySelector('#boss-number')!.textContent = `#${String(selected.id).padStart(3, '0')}`;
    document.querySelector('#boss-name')!.textContent = selected.name;
    document.querySelector('#boss-form')!.textContent = `${formName(selected.form)} form`;
    document.querySelector('#boss-types')!.replaceChildren(...selected.types.map(typeBadge));
    renderMatchups(selected.types, matrix);
    attacks.setDoubleEffectiveAvailable(matchingAttackTypes(selected.types, 'double-super-effective', matrix).length > 0);
    defense.setBoss(movesets[selected.key]);
    update();
  }

  setupPokemonSelector(pokemon, initial, choice => { selected = choice; renderBoss(); });
  document.querySelector('#inventory-controls')!.addEventListener('input', update);
  document.querySelector('#inventory-controls')!.addEventListener('change', update);
  document.querySelector('#reset-filters')!.addEventListener('click', () => {
    attacks.reset();
    cp.value = '';
    hp.value = '';
    max.value = 'any';
    shadow.value = 'any';
    defense.reset();
    update();
  });
  copyButton.addEventListener('click', async () => {
    const text = output.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (output.value === text) copyStatus.textContent = 'Copied.';
    } catch {
      // Keeps copying usable on browsers that deny Clipboard API access.
      if (output.value !== text) return;
      outputPreview.revealForCopy();
      output.focus();
      output.select();
      try {
        copyStatus.textContent = document.execCommand('copy') ? 'Copied.' :
          'Copy isn’t available here. The search is selected; copy it manually.';
      } catch {
        copyStatus.textContent = 'Copy isn’t available here. The search is selected; copy it manually.';
      }
    }
  });
  const credit = document.querySelector('#data-credit')!;
  const source = document.createElement('a');
  source.href = dataset.metadata.documentation;
  source.textContent = 'PoGoAPI';
  source.target = '_blank';
  source.rel = 'noreferrer';
  const supplementalSource = document.createElement('a');
  supplementalSource.href = dataset.metadata.supplement.documentation;
  supplementalSource.textContent = 'GO API';
  supplementalSource.title = 'Pokémon GO API: supplemental Mega forms and move pools';
  supplementalSource.target = '_blank';
  supplementalSource.rel = 'noreferrer';
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Zagreb',
  }).format(new Date(dataset.metadata.downloadedAt));
  credit.replaceChildren('Data: ', source, ' + ', supplementalSource, ` · Downloaded ${date} · ${pokemon.length.toLocaleString('en')} forms`);
  renderBoss();
  document.querySelector<HTMLElement>('#builder')!.hidden = false;
  document.querySelector<HTMLElement>('#loading-data')!.hidden = true;
  setupPwa();
}

start().catch(error => {
  document.querySelector<HTMLElement>('#loading-data')!.hidden = true;
  const message = document.querySelector<HTMLElement>('#fatal-error')!;
  message.textContent = 'The local Pokémon data could not be loaded. Refresh the page or ask the maintainer to update the dataset.';
  message.hidden = false;
  console.error(error);
});
