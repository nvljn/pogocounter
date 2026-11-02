import { isPokemonType } from './schema.ts';
import type { Pokemon, PokemonType } from './schema.ts';

export interface BossMove {
  name: string;
  type: PokemonType | null;
  issue: string | null;
  legacy: boolean;
}

export interface BossMoves {
  fast: BossMove[];
  charged: BossMove[];
  sourceKey?: string;
}

export type Movesets = Record<string, BossMoves>;

export function validateMovesets(input: unknown, pokemon: Pokemon[]): Movesets {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Missing boss movesets.');
  const source = input as Record<string, unknown>;
  const keys = new Set(pokemon.map(p => p.key));
  const byKey = new Map(pokemon.map(p => [p.key, p]));
  const result: Movesets = {};
  for (const [key, value] of Object.entries(source)) {
    if (!keys.has(key) || !value || typeof value !== 'object') throw new Error(`Invalid moveset: ${key}.`);
    const moves = value as Record<string, unknown>;
    const output = {} as BossMoves;
    if (moves.sourceKey !== undefined) {
      const base = typeof moves.sourceKey === 'string' ? byKey.get(moves.sourceKey) : undefined;
      const target = byKey.get(key)!;
      if (!base || base.id !== target.id || base.form !== 'Normal' || !/^Mega(?:_[XY])?$|^Primal$/.test(target.form)) {
        throw new Error(`Invalid transformation moveset source: ${key}.`);
      }
      output.sourceKey = base.key;
    }
    for (const slot of ['fast', 'charged'] as const) {
      if (!Array.isArray(moves[slot])) throw new Error(`Invalid ${slot} moves for ${key}.`);
      const names = new Set<string>();
      output[slot] = moves[slot].map((item: unknown) => {
        if (!item || typeof item !== 'object') throw new Error(`Invalid move for ${key}.`);
        const move = item as Record<string, unknown>;
        if (typeof move.name !== 'string' || !move.name.trim() || move.name !== move.name.trim() ||
            names.has(move.name) || typeof move.legacy !== 'boolean' ||
            !(move.type === null || isPokemonType(move.type)) ||
            !(move.issue === null || typeof move.issue === 'string' && !!move.issue.trim()) ||
            (move.type === null && !move.issue)) throw new Error(`Invalid or duplicate move for ${key}.`);
        names.add(move.name);
        return { name: move.name, type: move.type, issue: move.issue, legacy: move.legacy } as BossMove;
      });
    }
    result[key] = output;
  }
  for (const [key, moves] of Object.entries(result)) {
    if (!moves.sourceKey) continue;
    const base = result[moves.sourceKey];
    if (!base || base.sourceKey || ['fast', 'charged'].some(slot =>
      JSON.stringify(moves[slot as 'fast' | 'charged']) !== JSON.stringify(base[slot as 'fast' | 'charged']))) {
      throw new Error(`Transformation moves do not match their declared source: ${key}.`);
    }
  }
  // Only explicitly sourced temporary evolutions may share a base pool.
  if (!Object.keys(result).length) throw new Error('Boss movesets are empty.');
  return result;
}
