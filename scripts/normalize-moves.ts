import { isPokemonType } from '../src/data/schema.ts';
import type { Pokemon, PokemonType } from '../src/data/schema.ts';
import { validateMovesets } from '../src/data/moves.ts';
import type { BossMove, Movesets } from '../src/data/moves.ts';

function rows(input: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(input) || !input.length || input.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error(`${label}: expected a non-empty record array.`);
  }
  return input as Record<string, unknown>[];
}

// Only move names/types are retained. PvP power and timing never enter raid calculations.
export function moveCatalog(...sources: unknown[]): Map<string, PokemonType[]> {
  const catalog = new Map<string, PokemonType[]>();
  for (const source of sources) for (const row of rows(source, 'Move catalog')) {
    if (typeof row.name !== 'string' || !row.name.trim() || !isPokemonType(row.type) ||
        !Number.isSafeInteger(row.move_id) || Number(row.move_id) <= 0) throw new Error('Invalid move catalog record.');
    const types = catalog.get(row.name) ?? [];
    if (!types.includes(row.type)) types.push(row.type);
    catalog.set(row.name, types);
  }
  return catalog;
}

export function normalizeMovesets(
  input: unknown, pokemon: Pokemon[], fastCatalog: Map<string, PokemonType[]>, chargedCatalog: Map<string, PokemonType[]>,
): Movesets {
  const result: Movesets = {};
  const byKey = new Map(pokemon.map(p => [p.key, p]));
  for (const row of rows(input, 'Pokémon movesets')) {
    if (!Number.isSafeInteger(row.pokemon_id) || typeof row.form !== 'string' || !row.form.trim()) {
      throw new Error('Invalid Pokémon moveset identity.');
    }
    const key = `${row.pokemon_id}:${row.form}`;
    const species = byKey.get(key);
    if (!species || species.name !== row.pokemon_name) throw new Error(`Moveset has an unknown identity: ${key}.`);
    function slot(kind: 'fast' | 'charged', catalog: Map<string, PokemonType[]>): BossMove[] {
      const regular = row[`${kind}_moves`];
      const elite = row[`elite_${kind}_moves`];
      if (![regular, elite].every(list => Array.isArray(list) && list.every(name => typeof name === 'string' && !!name.trim()))) {
        throw new Error(`Invalid ${kind} move list for ${key}.`);
      }
      const standard = regular as string[];
      return [...new Set([...standard, ...elite as string[]])].map(name => {
        const types = catalog.get(name);
        let issue: string | null = null;
        if (!types?.length) issue = 'Move type is missing from the source catalogs.';
        else if (types.length !== 1) issue = `Source catalogs disagree on type: ${types.join(' / ')}.`;
        else if (name === 'Hidden Power') issue = 'Hidden Power varies by Pokémon; its actual type is unknown.';
        return { name, type: issue ? null : types![0]!, issue, legacy: !standard.includes(name) };
      }).sort((a, b) => Number(a.legacy) - Number(b.legacy) || a.name.localeCompare(b.name, 'en'));
    }
    const entry = { fast: slot('fast', fastCatalog), charged: slot('charged', chargedCatalog) };
    if (result[key] && JSON.stringify(result[key]) !== JSON.stringify(entry)) throw new Error(`Conflicting movesets for ${key}.`);
    result[key] = entry;
  }
  return validateMovesets(result, pokemon);
}
