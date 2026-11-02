import type { Pokemon } from '../src/data/schema.ts';
import { validatePokemon } from '../src/data/schema.ts';
import type { Movesets } from '../src/data/moves.ts';
import { validateMovesets } from '../src/data/moves.ts';
import { normalizePokemon } from './normalize.ts';

/** mega_pokemon.form is a transformation variant (Normal/X/Y), not the base form. */
export function normalizeTransformations(input: unknown, basePokemon: Pokemon[]) {
  if (!Array.isArray(input) || !input.length) throw new Error('Mega/Primal data is empty or invalid.');
  const byKey = new Map(basePokemon.map(pokemon => [pokemon.key, pokemon]));
  const movesetSources: Record<string, string> = {};
  const rows = input.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid Mega/Primal record.');
    const row = item as Record<string, unknown>;
    const { pokemon_id: id, pokemon_name: name, mega_name: label, form: variant } = row;
    if (!Number.isSafeInteger(id) || typeof name !== 'string' || !name.trim()) throw new Error('Invalid transformation identity.');
    let form: string;
    if (variant === 'Normal' && label === `Primal ${name}`) form = 'Primal';
    else if (variant === 'Normal' && label === `Mega ${name}`) form = 'Mega';
    else if ((variant === 'X' || variant === 'Y') && label === `Mega ${name} ${variant}`) form = `Mega_${variant}`;
    else throw new Error(`Unknown Mega/Primal variant: ${String(label)} / ${String(variant)}.`);
    const baseKey = `${id}:Normal`;
    if (byKey.get(baseKey)?.name !== name) throw new Error(`Missing or conflicting transformation base: ${baseKey}.`);
    const key = `${id}:${form}`;
    if (byKey.has(key)) throw new Error(`Transformation conflicts with an existing form: ${key}.`);
    movesetSources[key] = baseKey;
    return { pokemon_id: id, pokemon_name: name, form, type: row.type };
  });
  const transformed = normalizePokemon(rows);
  const pokemon = validatePokemon([...basePokemon, ...transformed].sort((a, b) =>
    a.id - b.id || Number(b.form === 'Normal') - Number(a.form === 'Normal') || a.form.localeCompare(b.form, 'en')));
  return { pokemon, movesetSources };
}

/** Explicit temporary-evolution links only; unrelated alternate forms never inherit moves. */
export function attachTransformationMovesets(input: Movesets, sources: Record<string, string>, pokemon: Pokemon[]): Movesets {
  const result: Movesets = { ...input };
  for (const [key, sourceKey] of Object.entries(sources)) {
    if (result[key]) continue; // Prefer a directly supplied form-specific pool when available.
    const base = input[sourceKey];
    if (!base || base.sourceKey) throw new Error(`Missing direct base moveset for ${key}: ${sourceKey}.`);
    result[key] = { fast: base.fast.map(move => ({ ...move })), charged: base.charged.map(move => ({ ...move })), sourceKey };
  }
  return validateMovesets(result, pokemon);
}
