import { isPokemonType, TYPES } from '../data/schema.ts';
import type { PokemonType } from '../data/schema.ts';
import { localizeClause, localizedLength, searchLanguage } from './search-language.ts';

function normalized(types: readonly PokemonType[] | null): PokemonType[] | null {
  if (types === null) return null; // Explicitly unrestricted; never confuse an empty match set with Any.
  if (!types.length) throw new Error('No attack types match this filter. No search string can be generated.');
  if (!types.every(isPokemonType)) throw new Error('Cannot generate a search for an unknown attack type.');
  return TYPES.filter(type => types.includes(type));
}

function shortest(first: string[], second: string[], language: string): string[] {
  return localizedLength(second, language) < localizedLength(first, language) ? second : first;
}

function moveClauses(fast: readonly PokemonType[] | null, charged: readonly PokemonType[] | null, language: string): string[] {
  const fastTypes = normalized(fast);
  const chargedTypes = normalized(charged);
  const result: string[] = [];
  if (fastTypes && fastTypes.length < TYPES.length) {
    const allow = [fastTypes.map(type => `@1${type.toLowerCase()}`).join(',')];
    // Exactly one indexed type in the mandatory fast slot: a short blocklist is equivalent.
    const exclude = TYPES.filter(type => !fastTypes.includes(type)).map(type => `!@1${type.toLowerCase()}`);
    result.push(...shortest(allow, exclude, language));
  }
  if (chargedTypes && chargedTypes.length < TYPES.length) {
    const second = chargedTypes.map(type => `@2${type.toLowerCase()}`);
    const third = chargedTypes.map(type => `@3${type.toLowerCase()}`);
    const allow = [[...second, ...third].join(',')];
    // Slot 2 is mandatory; slot 3 may be locked. (slot2 ∉ blocked) OR slot3 ∈ allowed
    // distributes to these OR groups. Negating both slots directly would reject a
    // good charged move paired with a bad one, or mishandle a locked second slot.
    const mixed = TYPES.filter(type => !chargedTypes.includes(type))
      .map(type => [`!@2${type.toLowerCase()}`, ...third].join(','));
    result.push(...shortest(allow, mixed, language));
  }
  return result;
}

function simplifyClauses(input: readonly string[]): string[] {
  const unique = new Map<string, string[]>();
  for (const clause of input) {
    const terms = [...new Set(clause.split(','))];
    if (terms.some(term => !term)) throw new Error('Empty search term.');
    if (terms.some(term => terms.includes(term.startsWith('!') ? term.slice(1) : `!${term}`))) continue;
    const key = [...terms].sort().join(',');
    if (!unique.has(key)) unique.set(key, terms);
  }
  const clauses = [...unique.values()];
  // A & (A OR B) = A. This works for any inventory/move/type literals without
  // assuming a relationship between Pokémon typing and their moves.
  return clauses.filter((terms, index) => !clauses.some((other, otherIndex) =>
    otherIndex !== index && other.length < terms.length && other.every(term => terms.includes(term))))
    .map(terms => terms.join(','));
}

/**
 * GO evaluates comma OR groups before ampersand AND, unlike conventional Boolean precedence.
 * Positive lists need two clauses; shorter complements may use multiple AND clauses.
 * The charged requirement is satisfied by EITHER charged slot, not necessarily both.
 * See README for source links and the manual in-game verification checklist.
 */
export function generateSearchString(
  fastTypes: readonly PokemonType[] | null,
  chargedTypes: readonly PokemonType[] | null,
  additionalClauses: readonly string[] = [],
  language = 'en',
): string {
  searchLanguage(language);
  if (additionalClauses.some(part => !part || /[&()\s]/.test(part))) throw new Error('Invalid additional search clause.');
  return simplifyClauses([...moveClauses(fastTypes, chargedTypes, language), ...additionalClauses])
    .map(clause => localizeClause(clause, language)).join('&');
}
