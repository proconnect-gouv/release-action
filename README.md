# release-action

> 🚀 Automate versioning and package publishing
>
> 🤝 Shared release flow for ProConnect JS/TS repos. Built on
> [release-it](https://github.com/release-it/release-it).

🧩 Three subactions, one job each, split like
[changesets/action](https://changesets.dev/guide/automating#trusted-publishing).
Mode from repo state, not trigger:

- 🔎 **`select-mode`**: read-only. `package.json` version not tagged:
  `publish` (release PR just merged). Only release commits
  (`🔖`/`:bookmark:`) since latest tag: `none`. Else: `version`.
- 📝 **`version`**: bump version, prepend gitmoji section to `CHANGELOG.md`,
  delete consumed `.release-it-changeset/*.md`, open or update signed PR
  `🔖 release <version>` from `release-it/next`.
- 🚀 **`publish`**: tag that exact version, push tag, run your release-it
  hooks, create GitHub release with version's `CHANGELOG.md` section as notes.
  Nothing regenerated.

📦 Action ships release-it, `@csmith/release-it-calver-plugin` and own
changelog plugin. Consumer installs nothing.

## ⚙️ Usage

```yaml
name: 🔖 Release

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}

jobs:
  select-mode:
    name: 🔎 Select mode
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      mode: ${{ steps.select-mode.outputs.mode }}
    steps:
      - name: 📥 Checkout
        uses: actions/checkout@<sha> # vX.Y.Z
        with:
          fetch-depth: 0
          persist-credentials: false
      - name: 🔎 Select mode
        id: select-mode
        uses: proconnect-gouv/release-action/select-mode@<sha> # vX.Y.Z

  version:
    name: 📝 Open release PR
    if: needs.select-mode.outputs.mode == 'version'
    needs: select-mode
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: 📥 Checkout
        uses: actions/checkout@<sha> # vX.Y.Z
        with:
          fetch-depth: 0
          persist-credentials: false
      - name: 📝 Version
        uses: proconnect-gouv/release-action/version@<sha> # vX.Y.Z

  publish:
    name: 🚀 Publish
    if: needs.select-mode.outputs.mode == 'publish'
    needs: select-mode
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: 📥 Checkout
        uses: actions/checkout@<sha> # vX.Y.Z
        with:
          fetch-depth: 0
          persist-credentials: false
      - name: 🚀 Publish
        uses: proconnect-gouv/release-action/publish@<sha> # vX.Y.Z
```

- 🔐 Least privilege per job: `select-mode` read-only, `version` PR write,
  `publish` contents write. Add an
  [environment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
  with required reviewers on `publish` to gate releases.
- 📜 `fetch-depth: 0`: every tag and commit since latest release.
- 🙈 `persist-credentials: false`: token stay out of `.git/config`. Token in
  `origin` URL only while `publish` push tag, URL restored after.
- 💬 `publish` with `github.comments.submit`: add `issues: write` and
  `pull-requests: write`.
- 🚦 `concurrency`: no two pushes version or publish at once.
- 🤖 Settings > Actions > General: allow GitHub Actions to create pull
  requests.
- 📌 Pin by commit SHA. No moving major tag.

## 🎛️ Inputs and outputs

`select-mode`: no input. Output `mode`: `version`, `publish` or `none`.

`version` and `publish` inputs:

| Name           | Default               | Description                                                        |
| -------------- | --------------------- | ------------------------------------------------------------------ |
| `dry-run`      | `false`               | `version`: write files, print diff, no PR. `publish`: log version. |
| `github-token` | `${{ github.token }}` | `version`: open release PR. `publish`: push tag, create release.   |

Outputs:

| Subaction | Name        | Description                              |
| --------- | ----------- | ---------------------------------------- |
| `version` | `pr-number` | Release PR created or updated.           |
| `version` | `version`   | Version in release PR.                   |
| `publish` | `published` | `"true"` when version tagged + released. |
| `publish` | `version`   | Version published.                       |

## 🛠️ Consumer configuration

Action read your release-it config (`package.json` `release-it` block or
`.release-it.json`). Override only what subaction need. `version`: no commit,
tag, push or release; skip `git`, `github`, `gitlab` hooks. `publish`: no
commit.

📅 CalVer example (hyyypertool):

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

🔢 Semver: no plugin entry. Bump from commits since latest tag: `💥` major,
`✨` minor, else patch. Repo has other tags (package tags)? Set `git.tagName`
(e.g. `v${version}`) and `git.tagMatch`.

💅 No Prettier run. Action run without your `node_modules`, so Prettier hook
can't load your plugins. Prettier check in CI? Add `CHANGELOG.md` to
`.prettierignore`.

## 🗒️ Changesets

One plain Markdown file per user-facing change in `.release-it-changeset/`,
no frontmatter:

```bash
echo "Ajout de la recherche avancée" > .release-it-changeset/$(date +%s)-search.md
```

🧹 `version` list every file under `### Changements` at top of version
section, delete files in release PR.

## 😀 Gitmoji mapping

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

🙋 Change mapping: PR to this repo.

## 🧑‍💻 Development

```bash
bun install
bun run test
bun run lint
```

🧪 `src/main.test.ts` run action in dry-run against throwaway git repos.

## ⚖️ License

MIT
