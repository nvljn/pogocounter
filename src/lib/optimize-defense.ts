import { TYPES } from '../data/schema.ts';
import type { EffectivenessMatrix, PokemonType } from '../data/schema.ts';
import { localizeClause, localizedLength } from './search-language.ts';

// All possible one/two-type Pokémon, including combinations absent from today's dataset.
const typings = TYPES.flatMap((_, first) => [
  { mask: 1 << first, types: [first] },
  ...TYPES.slice(first + 1).map((_, offset) => ({
    mask: (1 << first) | (1 << (first + offset + 1)), types: [first, first + offset + 1],
  })),
]);
const universe = (1n << BigInt(typings.length)) - 1n;
const allTypes = (1 << TYPES.length) - 1;
const cache = new Map<string, string[]>();

interface Candidate {
  text: string;
  rejected: bigint;
  cost: number;
}

function bitCount(value: bigint): number {
  let count = 0;
  for (; value; value &= value - 1n) count++;
  return count;
}

function typeNames(mask: number): string[] {
  return TYPES.filter((_, index) => mask & (1 << index)).map(type => type.toLowerCase());
}

function shorter(first: readonly string[], second: readonly string[], language: string): string[] {
  return [...(localizedLength(second, language) < localizedLength(first, language) ? second : first)];
}

/**
 * Keep a short cover of the rejected typings, not a general-purpose Boolean solver.
 * Every candidate must accept ALL safe typings. A weighted greedy cover and a
 * redundancy pass shorten the query; the original remains the upper bound.
 */
export function optimizeDefenseClauses(
  attacks: readonly PokemonType[], matrix: EffectivenessMatrix, original: readonly string[],
  language = 'en',
  resistOnly = false,
): string[] {
  const allowed = typings.map(({ types }) => attacks.every(attack => {
    const multiplier = types.reduce((total, index) => total * matrix[attack][TYPES[index]!], 1);
    return resistOnly ? multiplier < 1 : multiplier <= 1;
  }));
  const safe = allowed.reduce((mask, good, index) => good ? mask | (1n << BigInt(index)) : mask, 0n);
  if (safe === universe) return [];
  if (safe === 0n) return shorter(original, ['bug', '!bug'], language); // Explicit contradiction, never an empty unrestricted search.
  const cacheKey = `${language}:${safe}`;
  const saved = cache.get(cacheKey);
  if (saved) return shorter(original, saved, language);
  const unsafe = universe ^ safe;
  const candidates = new Map<string, Candidate>();

  function addCandidate(text: string, rejected: bigint) {
    if (!text || candidates.has(text) || !rejected || (rejected & safe)) return;
    candidates.set(text, { text, rejected, cost: localizeClause(text, language).length + 1 });
  }

  function add(positive: number, negative = 0) {
    const text = [...typeNames(negative).map(type => `!${type}`), ...typeNames(positive)].join(',');
    if (!text || candidates.has(text)) return;
    let rejected = 0n;
    for (const [index, typing] of typings.entries()) {
      const matches = !!(typing.mask & positive) || (typing.mask & negative) !== negative;
      if (!matches) rejected |= 1n << BigInt(index);
    }
    addCandidate(text, rejected);
  }

  // GO's !<type excludes net weaknesses, retaining neutralized dual types.
  // Also safe in Resist mode, but neutral typings still need other clauses.
  for (const attack of new Set(attacks)) {
    const rejected = typings.reduce((mask, { types }, index) =>
      types.reduce((damage, type) => damage * matrix[attack][TYPES[type]!], 1) > 1
        ? mask | (1n << BigInt(index)) : mask, 0n);
    addCandidate(`!<${attack.toLowerCase()}`, rejected);
  }

  const safeSingles = typings.reduce((mask, typing, index) =>
    typing.types.length === 1 && allowed[index] ? mask | typing.mask : mask, 0);
  const partners = Array<number>(TYPES.length).fill(0);
  for (const [index, typing] of typings.entries()) {
    if (typing.types.length !== 2) continue;
    const [first, second] = typing.types as [number, number];
    if (allowed[index]) {
      partners[first]! |= 1 << second;
      partners[second]! |= 1 << first;
    } else add(0, typing.mask); // !typeA,!typeB excludes only this unsafe pair.
  }
  for (let index = 0; index < TYPES.length; index++) {
    if (!(safeSingles & (1 << index))) add(partners[index]!, 1 << index);
  }

  // A positive type list must contain every safe singleton and intersect every
  // safe pair. Enumerate minimal such lists via maximal cliques in the complement
  // of the safe-pair graph (18 vertices, at most 729 results).
  const optional = allTypes ^ safeSingles;
  const compatible = partners.map((neighbors, index) => optional & ~neighbors & ~(1 << index));
  function positiveLists(chosen: number, remaining: number, excluded: number): void {
    if (!(remaining | excluded)) { add(allTypes ^ chosen); return; }
    const pivot = (remaining | excluded) & -(remaining | excluded);
    const pivotIndex = 31 - Math.clz32(pivot);
    let branch = remaining & ~compatible[pivotIndex]!;
    while (branch) {
      const bit = branch & -branch;
      const index = 31 - Math.clz32(bit);
      positiveLists(chosen | bit, remaining & compatible[index]!, excluded & compatible[index]!);
      remaining &= ~bit;
      excluded |= bit;
      branch &= ~bit;
    }
  }
  positiveLists(0, optional, 0);

  // Never discard a cheaper original clause just because another encoding exists.
  for (const text of original) {
    let positive = 0, negative = 0;
    for (const term of text.split(',')) {
      const negated = term.startsWith('!');
      const index = TYPES.findIndex(type => type.toLowerCase() === (negated ? term.slice(1) : term));
      if (index < 0) throw new Error('Unknown type in defensive search clause.');
      if (negated) negative |= 1 << index;
      else positive |= 1 << index;
    }
    add(positive, negative);
  }

  let uncovered = unsafe;
  const chosen: Candidate[] = [];
  const pool = [...candidates.values()];
  while (uncovered) {
    let best: Candidate | undefined, bestCount = 0;
    for (const candidate of pool) {
      const count = bitCount(candidate.rejected & uncovered);
      if (!count) continue;
      if (!best || count * best.cost > bestCount * candidate.cost ||
          count * best.cost === bestCount * candidate.cost && candidate.cost < best.cost) {
        best = candidate;
        bestCount = count;
      }
    }
    if (!best) return [...original];
    chosen.push(best);
    uncovered &= ~best.rejected;
  }
  // Remove any clauses made redundant by later choices, starting with the expensive ones.
  chosen.sort((a, b) => b.cost - a.cost || a.text.localeCompare(b.text, 'en'));
  for (let index = 0; index < chosen.length;) {
    const without = chosen.reduce((mask, candidate, other) => other === index ? mask : mask | candidate.rejected, 0n);
    if (without === unsafe) chosen.splice(index, 1);
    else index++;
  }
  // Runtime proof over the complete type domain; retain the original on any mismatch.
  const rejected = chosen.reduce((mask, candidate) => mask | candidate.rejected, 0n);
  const result = rejected === unsafe ? shorter(original,
    chosen.sort((a, b) => a.cost - b.cost || a.text.localeCompare(b.text, 'en')).map(candidate => candidate.text), language) : [...original];
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, result);
  return [...result];
}
