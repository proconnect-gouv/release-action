# Changelog

## [1.1.1](https://github.com/proconnect-gouv/release-action/compare/v1.1.0...v1.1.1) (2026-10-08)

### Corrigé

- 🐛 keep GitHub release comments working with linked changelog ([#7](https://github.com/proconnect-gouv/release-action/issues/7)) ([f24341c](https://github.com/proconnect-gouv/release-action/commit/f24341c2fbdc0c3f16529678b5d2f6d89e5f0d0f))

## [1.1.0](https://github.com/proconnect-gouv/release-action/compare/v1.0.0...v1.1.0) (2026-10-08)

### Ajouté

- ✨ link PR references and commits in changelog ([#4](https://github.com/proconnect-gouv/release-action/issues/4)) ([7782687](https://github.com/proconnect-gouv/release-action/commit/7782687ecd2187cb20a24c457bcb2249cbc83ada))
- ✨ group ↗️ commits under Dépendances ([#2](https://github.com/proconnect-gouv/release-action/issues/2)) ([d71fb22](https://github.com/proconnect-gouv/release-action/commit/d71fb22a486d2d956c1c76248bd17a7a59739301))

### Modifié

- 💄 use ([hash](url)) commit links in changelog ([#5](https://github.com/proconnect-gouv/release-action/issues/5)) ([bf8e9f7](https://github.com/proconnect-gouv/release-action/commit/bf8e9f79020b23b28fd48453faca456d96968e53))

### CI/CD

- 👷 name CI workflow, job and steps with emoji ([#6](https://github.com/proconnect-gouv/release-action/issues/6)) ([fe0ff89](https://github.com/proconnect-gouv/release-action/commit/fe0ff898d687b43c8f62216cabc7f579e6cfe2c2))

## 1.0.0 (2026-10-08)

### Changements

- Import the gitmoji changelog and changeset release-it plugins from [hyyypertool](https://github.com/proconnect-gouv/hyyypertool) at commit [`eb32e45`](https://github.com/proconnect-gouv/hyyypertool/commit/eb32e4565857cb77d23b5937472d01df4153f134), merged into one plugin and relicensed from GPL-3.0 to MIT by their author.
- Three composite subactions, one job each: `select-mode` picks the mode from the repository state, `version` opens a signed release pull request, `publish` tags the merged version and creates the GitHub release.
