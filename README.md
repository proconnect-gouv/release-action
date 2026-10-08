# release-action

Shared release flow for ProConnect JS/TS repos. Built on
[release-it](https://github.com/release-it/release-it).

Run on every push to `main`. Mode from repo state, not trigger:

- **Prepare**: `package.json` version already tagged. Bump version, prepend
  gitmoji section to `CHANGELOG.md`, delete consumed
  `.release-it-changeset/*.md`, open or update signed PR
  `🔖 release <version>` from `release-it/next`. Only release commits
  (`🔖`/`:bookmark:`) since latest tag: do nothing.
- **Publish**: `package.json` version not tagged, so release PR just merged.
  Tag that exact version, push tag, run your release-it hooks, create GitHub
  release with version's `CHANGELOG.md` section as notes. Nothing regenerated.

Action ships release-it, `@csmith/release-it-calver-plugin` and own changelog
plugin. Consumer installs nothing.

## Usage

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@<sha> # vX.Y.Z
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: proconnect-gouv/release-action@<sha> # vX.Y.Z
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

- `fetch-depth: 0`: every tag and commit since latest release.
- `persist-credentials: false`: token stay out of `.git/config`. Token in
  `origin` URL only while Publish push tag, URL restored after.
- `issues: write`: only with `github.comments.submit`.
- `concurrency`: no two pushes prepare or publish at once.
- Pin by commit SHA. No moving major tag.

## Inputs

| Name           | Default               | Description                                                    |
| -------------- | --------------------- | -------------------------------------------------------------- |
| `dry-run`      | `false`               | Prepare: write files, print diff, no PR. Publish: log version. |
| `github-token` | `${{ github.token }}` | Push tag, create GitHub release, open release PR.              |

## Outputs

| Name        | Description                              |
| ----------- | ---------------------------------------- |
| `published` | `"true"` when version tagged + released. |
| `version`   | Version prepared or published.           |

## Consumer configuration

Action read your release-it config (`package.json` `release-it` block or
`.release-it.json`). Override only what mode need. Prepare: no commit, tag,
push or release; skip `git`, `github`, `gitlab` hooks. Publish: no commit.

CalVer example (hyyypertool):

```json
{
  "release-it": {
    "github": { "release": true },
    "hooks": {
      "after:git:release": "git switch -c release/${version} && git push origin release/${version}"
    },
    "npm": { "publish": false },
    "plugins": {
      "@csmith/release-it-calver-plugin": { "cycle": "month" }
    }
  }
}
```

Semver: no plugin entry. Bump from commits since latest tag: `💥` major, `✨`
minor, else patch. Repo has other tags (package tags)? Set `git.tagName`
(e.g. `v${version}`) and `git.tagMatch`.

No Prettier run. Action run without your `node_modules`, so Prettier hook
can't load your plugins. Prettier check in CI? Add `CHANGELOG.md` to
`.prettierignore`.

## Changesets

One plain Markdown file per user-facing change in `.release-it-changeset/`,
no frontmatter:

```bash
echo "Ajout de la recherche avancée" > .release-it-changeset/$(date +%s)-search.md
```

Prepare list every file under `### Changements` at top of version section,
delete files in release PR.

## Gitmoji mapping

Commits grouped by subject's leading emoji, this order. Release commits
(`🔖`/`:bookmark:`) left out.

| Section       | Emoji                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| Ajouté        | ✨ 🎉 ➕ (`:sparkles:` `:tada:` `:heavy_plus_sign:`)                                                           |
| Modifié       | ♻️ 🔧 🎨 ⚡ 🚚 💄 🏗️ (`:recycle:` `:wrench:` `:art:` `:zap:` `:truck:` `:lipstick:` `:building_construction:`) |
| Corrigé       | 🐛 🚑 🔒 (`:bug:` `:ambulance:` `:lock:`)                                                                      |
| Supprimé      | 🔥 ➖ 🗑️ (`:fire:` `:heavy_minus_sign:` `:wastebasket:`)                                                       |
| Dépendances   | ⬆️ ⬇️ 📌 (`:arrow_up:` `:arrow_down:` `:pushpin:` `:arrow_upper_right:`)                                       |
| Documentation | 📝 📚 ✍️ (`:memo:` `:books:` `:writing_hand:`)                                                                 |
| CI/CD         | 👷 💚 (`:construction_worker:` `:green_heart:`)                                                                |
| Divers        | anything else                                                                                                  |

Change mapping: PR to this repo.

## Development

```bash
bun install
bun run test
bun run lint
```

`src/main.test.ts` run action in dry-run against throwaway git repos.

## License

MIT
