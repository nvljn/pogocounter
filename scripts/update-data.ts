import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizePokemon } from './normalize.ts';
import { validateMatrix } from '../src/data/schema.ts';
import { moveCatalog, normalizeMovesets } from './normalize-moves.ts';
import { normalizeTransformations, attachTransformationMovesets } from './normalize-transformations.ts';
import { supplementMegas } from './normalize-mega-supplement.ts';

const sources = {
  pokemon: 'https://pogoapi.net/api/v1/pokemon_types.json',
  effectiveness: 'https://pogoapi.net/api/v1/type_effectiveness.json',
  movesets: 'https://pogoapi.net/api/v1/current_pokemon_moves.json',
  fastMoves: 'https://pogoapi.net/api/v1/fast_moves.json',
  chargedMoves: 'https://pogoapi.net/api/v1/charged_moves.json',
  pvpFastMoves: 'https://pogoapi.net/api/v1/pvp_fast_moves.json',
  pvpChargedMoves: 'https://pogoapi.net/api/v1/pvp_charged_moves.json',
  megaPokemon: 'https://pogoapi.net/api/v1/mega_pokemon.json',
  megaSupplement: 'https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex/mega.json',
};

async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const text = await response.text();
  return { data: JSON.parse(text) as unknown, sha256: createHash('sha256').update(text).digest('hex') };
}

const directory = new URL('../src/data/', import.meta.url);
const target = new URL('dataset.json', directory);
const temporary = new URL('dataset.json.tmp', directory);

try {
  const [pokemonSource, matrixSource, movesSource, fastSource, chargedSource, pvpFastSource, pvpChargedSource, megaSource, supplementSource] =
    await Promise.all(Object.values(sources).map(download));
  if (!pokemonSource || !matrixSource || !movesSource || !fastSource || !chargedSource || !pvpFastSource || !pvpChargedSource || !megaSource || !supplementSource) {
    throw new Error('Incomplete data downloads.');
  }
  const primary = normalizeTransformations(megaSource.data, normalizePokemon(pokemonSource.data));
  const supplement = supplementMegas(supplementSource.data, primary.pokemon, primary.movesetSources);
  const { pokemon, movesetSources } = supplement;
  const effectiveness = validateMatrix(matrixSource.data);
  const regularMoves = normalizeMovesets(movesSource.data, pokemon,
    moveCatalog(fastSource.data, pvpFastSource.data), moveCatalog(chargedSource.data, pvpChargedSource.data));
  const movesets = attachTransformationMovesets({ ...regularMoves, ...supplement.movesets }, movesetSources, pokemon);
  const moveIssues = Object.entries(movesets).flatMap(([key, set]) =>
    [...set.fast, ...set.charged].filter(move => move.issue).map(move => ({ key, move: move.name, issue: move.issue })));
  const dataset = {
    metadata: {
      source: 'PoGoAPI + Pokémon GO API',
      documentation: 'https://pogoapi.net/documentation/',
      downloadedAt: new Date().toISOString(),
      sources,
      sha256: Object.fromEntries(Object.keys(sources).map((key, index) => [key,
        [pokemonSource, matrixSource, movesSource, fastSource, chargedSource, pvpFastSource, pvpChargedSource, megaSource, supplementSource][index]!.sha256])),
      supplement: { source: 'Pokémon GO API', documentation: 'https://pokemon-go-api.github.io/pokemon-go-api/',
        transformationKeys: supplement.addedKeys, movesetKeys: supplement.movesetKeys },
      pokemonCount: pokemon.length,
      transformationCount: Object.keys(movesetSources).length,
      matrixCells: 18 * 18,
      movesetCount: Object.keys(movesets).length,
      moveIssues,
    },
    pokemon,
    effectiveness,
    movesets,
  };
  // Validate every download before replacing the single snapshot. Failed updates preserve prior data.
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify(dataset)}\n`, 'utf8');
  await rename(temporary, target);
  console.log(`Saved ${pokemon.length} Pokémon/forms and all 324 effectiveness values; ${supplement.addedKeys.length} supplemental Mega forms.`);
  console.log(`Downloaded: ${dataset.metadata.downloadedAt}`);
  console.log(`Movesets: ${Object.keys(movesets).length}; unresolved move references: ${moveIssues.length} (preserved with explanations).`);
} catch (error) {
  await rm(temporary, { force: true });
  console.error('Data update failed. The previous dataset was preserved.', error);
  process.exitCode = 1;
}
