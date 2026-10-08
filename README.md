# release-action

Shared release flow for ProConnect JavaScript/TypeScript repositories, built on
[release-it](https://github.com/release-it/release-it).

Each push to `main` runs the action. It picks its mode from the repository
state, not from the trigger:

- **Prepare**: the `package.json` version is already tagged. The action bumps
  the version, prepends a gitmoji-grouped section to `CHANGELOG.md`, deletes
  consumed `.release-it-changeset/*.md` files and opens or updates a signed
  pull request `🔖 release <version>` from branch `release-it/next`. Nothing
  happens when every commit since the latest tag is a release commit
  (`🔖`/`:bookmark:`).
- **Publish**: the `package.json` version has no tag yet, which means a release
  pull request was just merged. The action tags that exact version, pushes the
  tag, runs your release-it hooks and creates the GitHub release with the
  version's `CHANGELOG.md` section as notes. Nothing is regenerated.

The action ships release-it, `@csmith/release-it-calver-plugin` and its own
changelog plugin. Consumers install nothing.

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

- `fetch-depth: 0` gives the action every tag and commit since the latest
  release.
- `persist-credentials: false` keeps the token out of `.git/config`. The action
  puts the token into `origin`'s URL only while Publish pushes the tag, then
  restores the URL.
- `issues: write` is only needed when `github.comments.submit` is enabled in
  your release-it config.
- `concurrency` stops two pushes from preparing or publishing at the same time.
- Pin the action by commit SHA. There is no moving major tag.

## Inputs

| Name           | Default               | Description                                                                         |
| -------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `dry-run`      | `false`               | Prepare writes the files and prints the diff, no PR. Publish logs the version only. |
| `github-token` | `${{ github.token }}` | Pushes the tag, creates the GitHub release, opens the release PR.                   |

## Outputs

| Name        | Description                                      |
| ----------- | ------------------------------------------------ |
| `published` | `"true"` when a version was tagged and released. |
| `version`   | Version prepared or published.                   |

## Consumer configuration

The action reads your release-it configuration (`package.json` `release-it`
block or `.release-it.json`). It overrides only what each mode needs: Prepare
never commits, tags, pushes or creates a release, and skips your `git`,
`github` and `gitlab` hooks; Publish never commits.

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

Semver repositories need no plugin entry: the bump follows the commits since
the latest tag (`💥` major, `✨` minor, anything else patch). Set
`git.tagName` (for example `v${version}`) and `git.tagMatch` when the
repository also carries other tags, such as package tags.

The action does not run Prettier. Add an `after:bump` hook if you format
`CHANGELOG.md`.

## Changesets

Describe a user-facing change in a plain Markdown file in
`.release-it-changeset/`, without frontmatter:

```bash
echo "Ajout de la recherche avancée" > .release-it-changeset/$(date +%s)-search.md
```

Prepare lists every file under a `### Changements` heading at the top of the
version section, then deletes the files in the release pull request.

## Gitmoji mapping

Commits are grouped by the emoji that starts their subject, in this order.
Release commits (`🔖`/`:bookmark:`) are left out.

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

Change the mapping with a pull request to this repository.

## Development

```bash
bun install
bun run test
bun run lint:type-check
bun run lint:format
```

`src/main.test.ts` runs the action in dry-run against throwaway git
repositories.

## License

MIT
