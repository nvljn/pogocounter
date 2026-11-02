import { isPokemonType, TYPES, validateTypes } from '../data/schema.ts';
import type { EffectivenessMatrix, PokemonType } from '../data/schema.ts';

export type FilterMode = 'any' | 'not-resisted' | 'super-effective' | 'double-super-effective';

export function damageMultiplier(
  attack: PokemonType, defense: readonly PokemonType[], matrix: EffectivenessMatrix,
): number {
  if (!isPokemonType(attack)) throw new Error(`Unknown attacking type: ${attack}`);
  const types = validateTypes(defense, 'Boss typing');
  return types.reduce((total, type) => {
    const multiplier = matrix?.[attack]?.[type];
    if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error(`Missing or invalid effectiveness: ${attack} → ${type}.`);
    }
    return total * multiplier;
  }, 1);
}

export function matchingAttackTypes(
  defense: readonly PokemonType[], mode: FilterMode, matrix: EffectivenessMatrix,
): PokemonType[] {
  if (!['any', 'not-resisted', 'super-effective', 'double-super-effective'].includes(mode)) throw new Error('Unknown attack filter.');
  return TYPES.filter(type => {
    const multiplier = damageMultiplier(type, defense, matrix);
    if (mode === 'double-super-effective') return Math.abs(multiplier - 2.56) < 1e-12;
    return mode === 'any' || (mode === 'not-resisted' ? multiplier >= 1 : multiplier > 1);
  });
}
