import snapshot from '../data/search-languages.json' with { type: 'json' };
import { validateSearchLanguages } from '../data/search-language-schema.ts';
import type { PokemonType } from '../data/schema.ts';

export const SEARCH_LANGUAGES = validateSearchLanguages(snapshot.languages);
const byCode = new Map(SEARCH_LANGUAGES.map(language => [language.code, language]));
const canonicalTypes = new Map(Object.keys(SEARCH_LANGUAGES[0]!.types).map(type => [type.toLowerCase(), type as PokemonType]));

export function searchLanguage(code: string) {
  const language = byCode.get(code);
  if (!language) throw new Error(`Unsupported search language: ${code}`);
  return language;
}

/** Translate whole literals, preserving operators and move slots. Never replace substrings. */
export function localizeClause(clause: string, code = 'en'): string {
  const language = searchLanguage(code);
  if (code === 'en') return clause;
  return clause.split(',').map(literal => {
    const negative = literal.startsWith('!') ? '!' : '';
    const term = literal.slice(negative.length);
    const slot = /^(@[123]|<)([a-z]+)$/.exec(term);
    const type = canonicalTypes.get(slot ? slot[2]! : term);
    if (type) return `${negative}${slot?.[1] ?? ''}${language.types[type]}`;
    const range = /^(cp|hp)(\d+-)$/.exec(term);
    if (range) return `${negative}${language.keywords[range[1] as 'cp' | 'hp']}${range[2]}`;
    if (Object.hasOwn(language.keywords, term)) return negative + language.keywords[term as keyof typeof language.keywords];
    throw new Error(`Unrecognized search term for translation: ${term}`);
  }).join(',');
}

export function localizedLength(clauses: readonly string[], code = 'en'): number {
  return clauses.map(clause => localizeClause(clause, code)).join('&').length;
}
