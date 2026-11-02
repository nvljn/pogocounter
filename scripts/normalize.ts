import { validatePokemon, validateTypes } from '../src/data/schema.ts';
import type { Pokemon } from '../src/data/schema.ts';

// PoGoAPI's actual schema uses pokemon_id, pokemon_name, form, and type (singular).
export function normalizePokemon(input: unknown): Pokemon[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error('PoGoAPI Pokémon data is empty or invalid.');
  const records = new Map<string, Pokemon>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid PoGoAPI record.');
    const row = item as Record<string, unknown>;
    const { pokemon_id: id, pokemon_name: name, form } = row;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 ||
        typeof name !== 'string' || !name.trim() || typeof form !== 'string' || !form.trim()) {
      throw new Error('PoGoAPI record has a missing or invalid ID, name or form.');
    }
    const key = `${id}:${form.trim()}`;
    const pokemon = { key, id, name: name.trim(), form: form.trim(), types: validateTypes(row.type, key) };
    const existing = records.get(key);
    if (existing) {
      if (existing.name !== pokemon.name ||
          [...existing.types].sort().join() !== [...pokemon.types].sort().join()) {
        throw new Error(`Conflicting PoGoAPI records for ${key}.`);
      }
      continue; // Only exact identity/typing duplicates are collapsed; named forms are retained.
    }
    records.set(key, pokemon);
  }
  return validatePokemon([...records.values()].sort((a, b) =>
    a.id - b.id || Number(b.form === 'Normal') - Number(a.form === 'Normal') || a.form.localeCompare(b.form, 'en')));
}
