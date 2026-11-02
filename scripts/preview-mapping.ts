import type { Pokemon } from '../src/data/schema.ts';

export interface ArtworkForm { species: number; pokemon: number; form: string; default: boolean }

// GO and PokéAPI use different names for these verified forms. Keep aliases species-specific.
const formAliases: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  128: { 'paldea-aqua': 'paldea-aqua-breed', 'paldea-blaze': 'paldea-blaze-breed', 'paldea-combat': 'paldea-combat-breed' },
  421: { sunny: 'sunshine' },
  422: { 'east-sea': 'east', 'west-sea': 'west' },
  423: { 'east-sea': 'east', 'west-sea': 'west' },
  718: { 'ten-percent': '10', 'fifty-percent': '50', 'complete-ten-percent': '10-power-construct', 'complete-fifty-percent': '50-power-construct' },
  741: { pompom: 'pom-pom' },
  744: { dusk: 'own-tempo' },
  800: { 'dawn-wings': 'dawn', 'dusk-mane': 'dusk' },
  801: { 'original-color': 'original' },
  862: { galar: 'normal' },
  863: { galar: 'normal' },
  865: { galar: 'normal' },
  866: { galar: 'normal' },
  867: { galar: 'normal' },
  888: { hero: 'normal', 'crowned-sword': 'crowned' },
  889: { hero: 'normal', 'crowned-shield': 'crowned' },
  898: { 'ice-rider': 'ice', 'shadow-rider': 'shadow' },
  931: { blue: 'blue-plumage', green: 'green-plumage', white: 'white-plumage', yellow: 'yellow-plumage' },
  982: { two: 'two-segment', three: 'three-segment' },
  999: { 'coin-a1': 'roaming' },
  1007: { apex: 'apex-build' },
  1008: { ultimate: 'ultimate-mode' },
};

export function csvRows(text: string): Record<string, string>[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  if (!header) throw new Error('Missing artwork catalog header.');
  const fields = header.split(',');
  return lines.map(line => {
    const values = line.split(',');
    if (values.length !== fields.length) throw new Error('Unexpected artwork catalog structure.');
    return Object.fromEntries(fields.map((field, index) => [field, values[index]!]));
  });
}

export function artworkCatalog(pokemonCsv: string, formsCsv: string): ArtworkForm[] {
  const species = new Map(csvRows(pokemonCsv).map(row => [Number(row.id), Number(row.species_id)]));
  const forms = csvRows(formsCsv).map(row => ({ species: species.get(Number(row.pokemon_id))!,
    pokemon: Number(row.pokemon_id), form: row.form_identifier!, default: row.is_default === '1' }));
  if (forms.length < 1000 || forms.some(row => !Number.isSafeInteger(row.species) || row.species < 1 ||
    !Number.isSafeInteger(row.pokemon) || row.pokemon < 1 || typeof row.form !== 'string')) {
    throw new Error('Incomplete or invalid artwork form catalog.');
  }
  return forms;
}

export function previewSource(pokemon: Pokemon, forms: readonly ArtworkForm[], files: ReadonlySet<string>): string | undefined {
  const form = pokemon.form.toLowerCase().replaceAll('_', '-')
    .replace(/^galarian/, 'galar').replace(/^hisuian/, 'hisui').replace(/^paldean/, 'paldea')
    .replace(/^exclamation-point$/, 'exclamation').replace(/^question-mark$/, 'question').replace(/^pokeball$/, 'poke-ball');
  if (form === 'female' && files.has(`female/${pokemon.id}.png`)) return `female/${pokemon.id}.png`;
  const artworkForm = formAliases[pokemon.id]?.[form] ?? form;
  const candidates = forms.filter(row => row.species === pokemon.id &&
    (artworkForm === 'normal' ? row.pokemon === pokemon.id && row.default : row.form === artworkForm));
  const matches = new Set<string>();
  for (const candidate of candidates) {
    // Cosmetic forms often share a Pokémon ID. Only its default form may use the bare ID image.
    const paths = [`${candidate.pokemon}-${candidate.form}.png`,
      // Scatterbug/Spewpa patterns affect their future Vivillon, not their own appearance.
      ...(candidate.default || [664, 665].includes(pokemon.id) ? [`${candidate.pokemon}.png`] : [])];
    const match = paths.find(path => files.has(path));
    if (match) matches.add(match);
  }
  // A catalog ambiguity must not choose an arbitrary alternate form.
  return matches.size === 1 ? [...matches][0] : undefined;
}

/** Exact GO form identifiers, never a fuzzy costume-name or shiny-image fallback. */
export function goPreviewSource(pokemon: Pokemon, files: ReadonlySet<string>): string | undefined {
  const identifier = pokemon.form === 'Normal' ? '' : `.f${pokemon.form.toUpperCase()}`;
  const path = `Images/Pokemon/Addressable Assets/pm${pokemon.id}${identifier}.icon.png`;
  return files.has(path) ? path : undefined;
}
