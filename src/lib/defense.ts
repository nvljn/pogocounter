import { TYPES } from '../data/schema.ts';
import type { EffectivenessMatrix, PokemonType } from '../data/schema.ts';
import type { BossMove, BossMoves } from '../data/moves.ts';
import { optimizeDefenseClauses } from './optimize-defense.ts';

export type DefenseMode = 'conservative' | 'selected';
export type DefenseRequirement = 'not-weak' | 'resist';

export interface DefenseOptions {
  mode: DefenseMode;
  fast: boolean;
  charged: boolean;
  selectedFast: string[];
  selectedCharged: string[];
  includeLegacy: boolean;
}

export function defensiveAttackTypes(moves: BossMoves | undefined, options: DefenseOptions): PokemonType[] {
  if (!['conservative', 'selected'].includes(options.mode)) throw new Error('Unknown defensive mode.');
  if (!options.fast && !options.charged) return [];
  if (!moves) throw new Error('No moveset is available for this form. Turn off defense filtering to continue.');
  const considered: BossMove[] = [];
  for (const kind of ['fast', 'charged'] as const) {
    if (!options[kind]) continue;
    const available = moves[kind].filter(move => options.includeLegacy || !move.legacy);
    const selected = kind === 'fast' ? options.selectedFast : options.selectedCharged;
    if (selected.some(name => !available.some(move => move.name === name))) throw new Error(`Unknown selected ${kind} move.`);
    const chosen = options.mode === 'conservative' ? available : available.filter(move => selected.includes(move.name));
    if (!chosen.length) throw new Error(`Choose at least one boss ${kind} attack, or turn off that defense filter.`);
    for (const move of chosen) {
      if (!move.type || move.issue) throw new Error(`${move.name}: ${move.issue ?? 'unknown move type'} Choose selected-moves mode and omit it, or turn off this defense filter.`);
    }
    considered.push(...chosen);
  }
  return TYPES.filter(type => considered.some(move => move.type === type));
}

/** Exact for one/two defensive types and the validated GO matrix.
 * A weakness (1.6) is neutralized by any resistance (≤0.625).
 * Not weak uses: NOT weak type OR at least one resistance type.
 * Resist requires a resisting type and excludes pairs that neutralize it.
 * Unlike species-ID exclusions this also handles regional/alternate forms correctly.
 */
export function defensiveClauses(
  attacks: readonly PokemonType[], matrix: EffectivenessMatrix, language = 'en', requirement: DefenseRequirement = 'not-weak',
): string[] {
  if (!['not-weak', 'resist'].includes(requirement)) throw new Error('Unknown resistance requirement.');
  const clauses = new Set<string>();
  for (const attack of [...new Set(attacks)].sort()) {
    if (!TYPES.includes(attack) || !matrix[attack]) throw new Error('Unknown defensive attack type.');
    const row = matrix[attack];
    if (TYPES.some(type => ![0.390625, 0.625, 1, 1.6].includes(row[type]))) {
      throw new Error(`Missing or invalid defensive effectiveness for ${attack}.`);
    }
    const resistances = TYPES.filter(type => row[type] < 1);
    if (requirement === 'resist') {
      if (!resistances.length) { clauses.add('bug'); clauses.add('!bug'); continue; }
      // At least one body type must resist. Reject pairs whose weakness cancels that resistance.
      clauses.add(resistances.map(type => type.toLowerCase()).join(','));
      for (const weak of TYPES.filter(type => row[type] > 1)) {
        for (const resistance of resistances.filter(type => row[type] * row[weak] >= 1)) {
          clauses.add(`!${weak.toLowerCase()},!${resistance.toLowerCase()}`);
        }
      }
      continue;
    }
    for (const weak of TYPES.filter(type => row[type] > 1)) {
      // Fail closed if a future matrix no longer satisfies the cancellation rule.
      if (row[weak] !== 1.6 || resistances.some(type => row[weak] * row[type] > 1)) {
        throw new Error('This effectiveness matrix cannot be represented by the defense generator.');
      }
      clauses.add([`!${weak.toLowerCase()}`, ...resistances.map(type => type.toLowerCase())].join(','));
    }
  }
  return optimizeDefenseClauses(attacks, matrix, [...clauses], language, requirement === 'resist');
}
