export const TYPES = [
  'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying',
  'Ghost', 'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water',
] as const;

export type PokemonType = typeof TYPES[number];
export type EffectivenessMatrix = Record<PokemonType, Record<PokemonType, number>>;

export interface Pokemon {
  key: string;
  id: number;
  name: string;
  form: string;
  types: PokemonType[];
}

export function isPokemonType(value: unknown): value is PokemonType {
  return typeof value === 'string' && TYPES.includes(value as PokemonType);
}

function object(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

export function validateTypes(value: unknown, context = 'Pokémon'): PokemonType[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2 ||
      !value.every(isPokemonType) || new Set(value).size !== value.length) {
    throw new Error(`${context}: expected one or two distinct, recognized Pokémon GO types.`);
  }
  return [...value];
}

export function validateMatrix(value: unknown): EffectivenessMatrix {
  const input = object(value, 'Effectiveness matrix');
  if (Object.keys(input).length !== TYPES.length || !Object.keys(input).every(isPokemonType)) {
    throw new Error('Effectiveness matrix: expected all 18 attacking types.');
  }
  const result = {} as EffectivenessMatrix;
  for (const attack of TYPES) {
    const row = object(input[attack], `Effectiveness matrix / ${attack}`);
    if (Object.keys(row).length !== TYPES.length || !Object.keys(row).every(isPokemonType)) {
      throw new Error(`Effectiveness matrix / ${attack}: expected all 18 defending types.`);
    }
    result[attack] = {} as Record<PokemonType, number>;
    for (const defense of TYPES) {
      const multiplier = row[defense];
      // Reject main-series values, zero/immunities, strings, NaN and unexpected GO multipliers.
      if (typeof multiplier !== 'number' || ![0.390625, 0.625, 1, 1.6].includes(multiplier)) {
        throw new Error(`Effectiveness matrix / ${attack} → ${defense}: invalid GO multiplier.`);
      }
      result[attack][defense] = multiplier;
    }
  }
  return result;
}

export function validatePokemon(value: unknown): Pokemon[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Pokémon data is empty or invalid.');
  const seen = new Set<string>();
  const labels = new Set<string>();
  const names = new Map<number, string>();
  return value.map((item, index) => {
    const row = object(item, `Pokémon record ${index}`);
    const { key, id, name, form } = row;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 ||
        typeof name !== 'string' || !name.trim() || name !== name.trim() ||
        typeof form !== 'string' || !form.trim() || form !== form.trim() ||
        key !== `${id}:${form}`) {
      throw new Error(`Pokémon record ${index}: invalid ID, name, form or key.`);
    }
    const label = `${name} / ${form.replaceAll('_', ' ')}`.toLowerCase();
    if (seen.has(key) || labels.has(label)) throw new Error(`Duplicate or ambiguous Pokémon: ${key}.`);
    if (names.has(id) && names.get(id) !== name) throw new Error(`Conflicting names for Pokémon #${id}.`);
    seen.add(key);
    labels.add(label);
    names.set(id, name);
    return { key, id, name, form, types: validateTypes(row.types, key) };
  });
}
