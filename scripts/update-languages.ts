import { writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TYPES } from '../src/data/schema.ts';
import { validateSearchLanguages } from '../src/data/search-language-schema.ts';

const locales = [
  ['en', 'ENG', 'English', 'English/en-us'], ['de', 'GER', 'Deutsch', 'German/de-de'],
  ['fr', 'FRA', 'Français', 'French/fr-fr'], ['es', 'ESP', 'Español', 'Spanish/es-es'],
  ['es-MX', 'LAT', 'Español (Latinoamérica)', 'Latin American Spanish/es-mx'],
  ['it', 'ITA', 'Italiano', 'Italian/it-it'], ['pt-BR', 'POR', 'Português (Brasil)', 'Brazilian Portuguese/pt-br'],
  ['ja', 'JPN', '日本語', 'Japanese/ja-jp'], ['ko', 'KOR', '한국어', 'Korean/ko-kr'],
  ['zh-TW', 'ZHT', '繁體中文', 'Traditional Chinese/zh-tw'], ['hi', 'HIN', 'हिन्दी', 'Hindi/hi-in'],
  ['id', 'IND', 'Bahasa Indonesia', 'Indonesian/id-id'], ['ru', 'RUS', 'Русский', 'Russian/ru-ru'],
  ['th', 'THA', 'ไทย', 'Thai/th-th'], ['tr', 'TUR', 'Türkçe', 'Turkish/tr-tr'],
] as const;
const keys = { cp: 'general_cp', hp: 'general_hp', shadow: 'filter_key_shadow',
  defender: 'filter_key_defender', dynamax: 'filter_key_bread', gigantamax: 'filter_key_dough' };
// The extracted Japanese defender text is a description; use the explicitly documented search alias.
const overrides = { ja: { defender: { term: '防衛',
  source: 'https://niantic.helpshift.com/hc/ja/6-pokemon-go/faq/1486-searching-filtering-your-pokemon-inventory/' } } };
const target = new URL('../src/data/search-languages.json', import.meta.url);
const temporary = new URL('../src/data/search-languages.json.tmp', import.meta.url);
async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
try {
  const { sha } = JSON.parse(await download('https://api.github.com/repos/sora10pls/holoholo-text/commits/main'));
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid source revision.');
  const sources: Record<string, { url: string; sha256: string }> = {};
  const languages = [];
  // Keep downloads bounded; only 24 required terms per language are saved.
  for (let offset = 0; offset < locales.length; offset += 3) {
    const batch = await Promise.all(locales.slice(offset, offset + 3).map(async ([code, badge, name, file]) => {
      const path = file.split('/').map(encodeURIComponent).join('/');
      const url = `https://raw.githubusercontent.com/sora10pls/holoholo-text/${sha}/Release/${path}_raw.json`;
      const source = await download(url);
      sources[code] = { url, sha256: createHash('sha256').update(source).digest('hex') };
      const { data } = JSON.parse(source) as { data: unknown };
      if (!Array.isArray(data) || data.length % 2 || !data.every(value => typeof value === 'string')) {
        throw new Error(`${code}: invalid game text structure`);
      }
      const entries = new Map<string, string>(Array.from({ length: data.length / 2 }, (_, i) => [data[i * 2]!, data[i * 2 + 1]!]));
      function term(key: string) {
        const text = entries.get(key);
        if (!text) throw new Error(`${code}: missing ${key}`);
        return text.toLowerCase();
      }
      return { code, badge, name, types: Object.fromEntries(TYPES.map(type => [type, term(`pokemon_type_${type.toLowerCase()}`)])),
        keywords: Object.fromEntries(Object.entries(keys).map(([key, resource]) => [key,
          code === 'ja' && key === 'defender' ? overrides.ja.defender.term : term(resource)])) };
    }));
    languages.push(...batch);
  }
  validateSearchLanguages(languages);
  await writeFile(temporary, JSON.stringify({ metadata: { source: 'Pokémon GO game text extracted by sora10pls/holoholo-text',
    updatedAt: new Date().toISOString(), revision: sha, sources, overrides }, languages }, null, 2) + '\n');
  await rename(temporary, target);
  console.log(`Saved ${languages.length} validated search languages; source revision ${sha}.`);
} catch (error) {
  await rm(temporary, { force: true });
  console.error(error);
  process.exitCode = 1;
}
