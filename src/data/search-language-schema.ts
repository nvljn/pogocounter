import { TYPES } from './schema.ts';
import type { PokemonType } from './schema.ts';

export interface SearchLanguage {
  code: string;
  badge: string;
  name: string;
  types: Record<PokemonType, string>;
  keywords: Record<'cp' | 'hp' | 'shadow' | 'defender' | 'dynamax' | 'gigantamax', string>;
}

export function validateSearchLanguages(value: unknown): SearchLanguage[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Missing search languages.');
  const codes = new Set<string>();
  return value.map(item => {
    const language = item as SearchLanguage;
    if (!language || typeof language.code !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language.code) ||
      codes.has(language.code) || typeof language.name !== 'string' || !language.name ||
      typeof language.badge !== 'string' || !/^[A-Z]{3}$/.test(language.badge)) throw new Error('Invalid search language.');
    codes.add(language.code);
    const types = TYPES.map(type => language.types?.[type]);
    const keywords = ['cp', 'hp', 'shadow', 'defender', 'dynamax', 'gigantamax'] as const;
    if (new Set(types).size !== TYPES.length || [...types, ...keywords.map(key => language.keywords?.[key])]
      .some(term => typeof term !== 'string' || !term || term !== term.trim() || /[!@,;&|():\s\d\p{Co}\p{Cc}]/u.test(term.replaceAll(' ', '')))) {
      throw new Error(`Incomplete or unsafe search terms: ${language.code}`);
    }
    return language;
  });
}
