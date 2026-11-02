# PoGO Counter Search String Builder

![PoGO Counter Search String Builder preview](docs/preview.png)

Pick a boss, set attack/resistance and inventory filters, choose your game's language, then copy the result into Pokémon GO's storage search.

## Run locally

Requires Node.js 22.18+; Node.js 24 recommended.

```sh
npm ci
npm run dev
```

Production build and local preview:

```sh
npm run build
npm run preview
```

## Host on GitHub Pages

Set **Settings → Pages → Source → GitHub Actions**, then push to `main`. The included workflow builds and deploys automatically. For another branch, edit `.github/workflows/pages.yml`.

Other static hosts: upload the contents of `dist/`. Use HTTPS. No backend required.

Offline use works after the first successful online cache. Recently viewed thumbnails are cached; unseen images need a connection. No installation required.

## Update the data

| Command | Updates |
| --- | --- |
| `npm run update-data` | Pokémon, forms, moves and type chart |
| `npm run update-previews` | Thumbnails |
| `npm run update-languages` | Translated search keywords |
| `npm run update-flags` | Language flags |
| `npm run update-type-icons` | Type icons |

Run the relevant commands, commit changed files in `src/data/` and `public/`, then push. Deployment uses those files; data updates are manual.

## Limits

- Filters moves and typing; doesn't rank raid damage.
- Boss move pools may differ from actual raid moves. Mega/Primal forms use regular-species move pools.
- Checks regular attacks, including either charged slot. Max Moves and Mega bonus attacks aren't supported. Unresolved move types are flagged.

Search syntax assumes `!` → `,` (OR) → `&` (AND) precedence, without parentheses. Verify mixed clauses, locked second charged slots, localized keywords and `!<fire` (not weak to Fire) in-game; automated checks can't verify the game's parser.

## Data and artwork

- Data: [PoGoAPI](https://pogoapi.net/documentation/) and [Pokémon GO API](https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex/mega.json).
- Artwork: [PokéAPI](https://github.com/PokeAPI/sprites) and [PokeMiners](https://github.com/PokeMiners/pogo_assets).
- Translations: [sora10pls](https://github.com/sora10pls/holoholo-text/tree/main/Release). Flags: [flag-icons](https://github.com/lipis/flag-icons). Type icons: [duiker101](https://github.com/duiker101/pokemon-type-svg-icons).

Source dates/hashes are stored with the data; notices are in `public/licenses/`. Unofficial fan tool; Pokémon artwork belongs to its respective rights holders.
