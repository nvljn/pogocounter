export interface InventoryFilters {
  minCp: string;
  minHp: string;
  max: 'any' | 'only' | 'exclude';
  shadow: 'any' | 'only' | 'exclude';
}

export function inventoryClauses(filters: InventoryFilters): string[] {
  const clauses: string[] = [];
  for (const [prefix, input] of [['cp', filters.minCp], ['hp', filters.minHp]]) {
    if (typeof input !== 'string') throw new Error('Invalid minimum CP or HP.');
    if (!input.trim()) continue;
    if (!/^\d+$/.test(input) || !Number.isSafeInteger(Number(input)) || Number(input) < 1 || Number(input) > 99999) {
      throw new Error('Minimum CP and HP must be whole numbers from 1 to 99,999.');
    }
    clauses.push(`${prefix}${Number(input)}-`);
  }
  if (!['any', 'only', 'exclude'].includes(filters.max)) throw new Error('Unknown Dynamax / Gigantamax filter.');
  if (!['any', 'only', 'exclude'].includes(filters.shadow)) throw new Error('Unknown Shadow filter.');
  if (filters.max === 'only') clauses.push('dynamax,gigantamax');
  if (filters.max === 'exclude') clauses.push('!dynamax', '!gigantamax');
  if (filters.shadow !== 'any') clauses.push(filters.shadow === 'only' ? 'shadow' : '!shadow');
  return clauses;
}
