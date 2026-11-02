import { TYPES, validateTypes } from '../src/data/schema.ts';
import type { Pokemon, PokemonType } from '../src/data/schema.ts';
import { validateMovesets } from '../src/data/moves.ts';
import type { BossMove, BossMoves, Movesets } from '../src/data/moves.ts';
import { normalizeTransformations } from './normalize-transformations.ts';

function object(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid supplemental ${context}.`);
  return value as Record<string, unknown>;
}

function sourceType(value: unknown): PokemonType {
  const type = object(value, 'type').type;
  const known = TYPES.find(candidate => type === `POKEMON_TYPE_${candidate.toUpperCase()}`);
  if (!known) throw new Error(`Unknown supplemental GO type: ${String(type)}.`);
  return known;
}

function sourceTypes(row: Record<string, unknown>): PokemonType[] {
  return validateTypes([sourceType(row.primaryType), ...(row.secondaryType === null ? [] : [sourceType(row.secondaryType)])]);
}

function sameTypes(first: readonly PokemonType[], second: readonly PokemonType[]): boolean {
  return [...first].sort().join() === [...second].sort().join();
}

// This feed nests regular move pools on the parent record. Retain names/types only.
function sourceMoves(row: Record<string, unknown>): BossMoves {
  function slot(regularKey: string, eliteKey: string): BossMove[] {
    const moves = new Map<string, BossMove>();
    for (const [field, legacy] of [[regularKey, false], [eliteKey, true]] as const) {
      // The source serializes an empty map as [], populated maps as objects.
      const value = row[field];
      const pool = Array.isArray(value) && value.length === 0 ? {} : object(value, `${field} pool`);
      for (const [id, value] of Object.entries(pool)) {
        const move = object(value, 'move');
        const name = object(move.names, 'move names').English;
        if (move.id !== id || !/^[A-Z0-9_]+$/.test(id) || typeof name !== 'string' || !name.trim() || name !== name.trim()) {
          throw new Error('Invalid supplemental move identity.');
        }
        if (id.startsWith('VM_') || id.endsWith('_PLUS') || name.endsWith('+')) throw new Error('Mega bonus attacks are not supported.');
        const type = sourceType(move.type);
        const issue = name === 'Hidden Power' ? 'Hidden Power varies by Pokémon; its actual type is unknown.' : null;
        const candidate = { name, type: issue ? null : type, issue, legacy };
        const prior = moves.get(name);
        if (prior && (prior.type !== candidate.type || prior.issue !== candidate.issue)) throw new Error(`Conflicting supplemental move: ${name}.`);
        if (!prior) moves.set(name, candidate); // Regular wins when also listed as elite.
      }
    }
    return [...moves.values()].sort((a, b) => Number(a.legacy) - Number(b.legacy) || a.name.localeCompare(b.name, 'en'));
  }
  return { fast: slot('quickMoves', 'eliteQuickMoves'), charged: slot('cinematicMoves', 'eliteCinematicMoves') };
}

/** Fill missing GO transformations; compare overlaps instead of silently replacing PoGoAPI typings. */
export function supplementMegas(input: unknown, existing: Pokemon[], existingSources: Record<string, string>) {
  if (!Array.isArray(input) || !input.length) throw new Error('Supplemental Mega data is empty or invalid.');
  const byKey = new Map(existing.map(pokemon => [pokemon.key, pokemon]));
  const additions = new Map<string, { pokemon_id: number; pokemon_name: string; mega_name: string; form: string; type: PokemonType[] }>();
  const movesets: Movesets = {};
  for (const item of input) {
    const row = object(item, 'Pokémon record');
    const { id, dexNr } = row;
    const name = object(row.names, 'Pokémon names').English;
    if (typeof id !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(id) || row.formId !== id ||
        typeof dexNr !== 'number' || !Number.isSafeInteger(dexNr) || dexNr < 1) throw new Error('Invalid supplemental base identity.');
    const baseKey = `${dexNr}:Normal`;
    const base = byKey.get(baseKey);
    if (!base || base.name !== name || !sameTypes(base.types, sourceTypes(row))) throw new Error(`Conflicting supplemental base: ${baseKey}.`);
    const transformations = Object.entries(object(row.megaEvolutions, 'transformations'));
    if (!transformations.length) throw new Error('Empty supplemental transformation list.');
    let hasAddition = false;
    for (const [sourceId, value] of transformations) {
      const form = object(value, 'transformation');
      if (form.id !== sourceId || !sourceId.startsWith(`${id}_`)) throw new Error('Conflicting supplemental transformation identity.');
      const suffix = sourceId.slice(id.length + 1);
      if (!['MEGA', 'MEGA_X', 'MEGA_Y', 'PRIMAL'].includes(suffix)) throw new Error(`Unknown supplemental transformation: ${sourceId}.`);
      const normalized = suffix === 'PRIMAL' ? 'Primal' : suffix.replace('MEGA', 'Mega');
      const key = `${dexNr}:${normalized}`;
      const types = sourceTypes(form);
      const label = object(form.names, 'transformation names').English;
      const expectedLabel = `${suffix === 'PRIMAL' ? 'Primal' : 'Mega'} ${name}${suffix.endsWith('_X') ? ' X' : suffix.endsWith('_Y') ? ' Y' : ''}`;
      if (label !== expectedLabel) throw new Error(`Conflicting supplemental transformation name: ${sourceId}.`);
      const prior = byKey.get(key);
      if (prior) {
        if (prior.name !== name || !sameTypes(prior.types, types)) throw new Error(`Conflicting supplemental typing: ${key}.`);
        continue;
      }
      hasAddition = true;
      const candidate = { pokemon_id: dexNr, pokemon_name: base.name, mega_name: expectedLabel,
        form: suffix.endsWith('_X') ? 'X' : suffix.endsWith('_Y') ? 'Y' : 'Normal', type: types };
      const repeated = additions.get(key);
      if (repeated && !sameTypes(repeated.type, types)) throw new Error(`Conflicting duplicate supplemental form: ${key}.`);
      additions.set(key, candidate);
    }
    if (hasAddition) {
      const pool = sourceMoves(row);
      if (movesets[baseKey] && JSON.stringify(movesets[baseKey]) !== JSON.stringify(pool)) throw new Error(`Conflicting supplemental movesets: ${baseKey}.`);
      movesets[baseKey] = pool;
    }
  }
  const result = additions.size ? normalizeTransformations([...additions.values()], existing) : { pokemon: existing, movesetSources: {} };
  return { pokemon: result.pokemon, movesetSources: { ...existingSources, ...result.movesetSources },
    movesets: Object.keys(movesets).length ? validateMovesets(movesets, result.pokemon) : {},
    addedKeys: [...additions.keys()].sort(), movesetKeys: Object.keys(movesets).sort() };
}
