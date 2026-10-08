import { $ } from "bun";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ReleaseActionPlugin, {
  extract_emoji,
  get_group_for_emoji,
  get_increment,
  group_commits,
  insert_version_section,
  is_release_commit,
  parse_changeset,
  parse_commit,
  read_version_section,
  render_body,
  render_commit,
  render_header,
  type Commit,
} from "./plugin.ts";

const commit = (subject: string, hash = "abc"): Commit =>
  parse_commit([hash, hash, subject].join("\x1f"));

describe("extract_emoji", () => {
  test.each([
    ["✨ Add new feature", "✨"],
    [":sparkles: Add new feature", ":sparkles:"],
    ["🐛 Fix login issue", "🐛"],
    [":arrow_upper_right: [patch](deps): bump lodash", ":arrow_upper_right:"],
    ["↗️ [patch](deps): bump lodash", "↗️"],
    ["♻️ Refactor", "♻️"],
    ["chore: update deps", undefined],
    ["", undefined],
  ])("%p → %p", (subject, emoji) => {
    expect(extract_emoji(subject)).toBe(emoji);
  });
});

describe("get_group_for_emoji", () => {
  test.each([
    ["✨", "added"],
    [":sparkles:", "added"],
    ["🐛", "fixed"],
    ["♻️", "changed"],
    [":arrow_upper_right:", "dependencies"],
    ["↗️", "dependencies"],
    [undefined, "misc"],
    ["🦄", "misc"],
  ])("%p → %p", (emoji, group) => {
    expect(get_group_for_emoji(emoji)).toBe(group);
  });
});

describe("is_release_commit", () => {
  test.each([
    ["🔖 release 2026.1.0", true],
    [":bookmark: release 2026.1.0", true],
    ["✨ add thing", false],
    ["release 2026.1.0", false],
  ])("%p → %p", (subject, expected) => {
    expect(is_release_commit(subject)).toBe(expected);
  });
});

describe("parse_commit", () => {
  test("keeps pipes in the subject", () => {
    expect(commit("🐛 fix a | b").subject).toBe("🐛 fix a | b");
  });
});

describe("parse_changeset", () => {
  test("keeps multiline content", () => {
    const content = `Ajout de la fonctionnalité de recherche

Cette fonctionnalité permet aux utilisateurs de rechercher rapidement.`;
    expect(parse_changeset("search", content)).toEqual({
      content,
      id: "search",
    });
  });

  test("trims whitespace", () => {
    expect(
      parse_changeset("trimmed", "\n\n  Description avec espaces\n\n"),
    ).toEqual({
      content: "Description avec espaces",
      id: "trimmed",
    });
  });

  test("keeps special characters", () => {
    expect(
      parse_changeset(
        "special",
        "Amélioration de l'interface utilisateur (UI)",
      ),
    ).toEqual({
      content: "Amélioration de l'interface utilisateur (UI)",
      id: "special",
    });
  });

  test.each(["", "\n\n  "])("returns null for blank content %p", (content) => {
    expect(parse_changeset("empty", content)).toBeNull();
  });
});

describe("group_commits", () => {
  test("groups commits in display order", () => {
    const grouped = group_commits([
      commit("🐛 Fix", "a"),
      commit("✨ Feature", "b"),
      commit("✨ Another feature", "c"),
    ]);
    expect(
      grouped.map(({ commits, label }) => [label, commits.map((c) => c.hash)]),
    ).toEqual([
      ["Ajouté", ["b", "c"]],
      ["Corrigé", ["a"]],
    ]);
  });
});

describe("get_increment", () => {
  test.each([
    [["💥 break api"], "major"],
    [[":boom: break api"], "major"],
    [["✨ add thing"], "minor"],
    [[":sparkles: add thing"], "minor"],
    [["🐛 fix thing"], "patch"],
    [["🐛 fix thing", "✨ add thing", "💥 break api"], "major"],
    [["🐛 fix thing", "✨ add thing"], "minor"],
  ])("%p → %p", (subjects, increment) => {
    expect(get_increment(subjects.map((subject) => commit(subject)))).toBe(
      increment,
    );
  });
});

describe("render_body", () => {
  test("puts changesets before commit groups", () => {
    expect(
      render_body({
        changesets: [{ content: "Hello change", id: "a" }],
        grouped: group_commits([
          commit("🐛 fix thing", "f1"),
          commit("✨ add thing", "a1"),
        ]),
        repository_url: null,
      }),
    ).toBe(
      [
        "### Changements",
        "",
        "- Hello change",
        "",
        "### Ajouté",
        "",
        "- ✨ add thing (a1)",
        "",
        "### Corrigé",
        "",
        "- 🐛 fix thing (f1)",
      ].join("\n"),
    );
  });
});

describe("render_commit", () => {
  const repository_url = "https://github.com/proconnect-gouv/hyyypertool";
  const squashed = parse_commit(
    [
      "2e684e21c0ffee2e684e21c0ffee2e684e21c0ff",
      "2e684e21",
      "♻️ release through proconnect-gouv/release-action (#1857)",
    ].join("\x1f"),
  );

  test("links PR references and the commit", () => {
    expect(render_commit(squashed, repository_url)).toBe(
      `- ♻️ release through proconnect-gouv/release-action ([#1857](${repository_url}/issues/1857)) ([2e684e2](${repository_url}/commit/2e684e21c0ffee2e684e21c0ffee2e684e21c0ff))`,
    );
  });

  test.each(["fix a#1 b", "see abc#12", "&#123;"])(
    "leaves %p unlinked",
    (subject) => {
      expect(render_commit(commit(subject), repository_url)).toStartWith(
        `- ${subject} ([`,
      );
    },
  );

  test("plain text without a repository URL", () => {
    expect(render_commit(squashed, null)).toBe(
      "- ♻️ release through proconnect-gouv/release-action (#1857) (2e684e21)",
    );
  });
});

describe("render_header", () => {
  test("without compare link", () => {
    setSystemTime(new Date("2222-11-11T00:00:00.000Z"));
    expect(
      render_header({
        latest_tag: null,
        repository_url: null,
        tag_name: "1.0.0",
        version: "1.0.0",
      }),
    ).toBe("## 1.0.0 (2222-11-11)");
    setSystemTime();
  });

  test("compare link uses tag names", () => {
    setSystemTime(new Date("2222-11-11T00:00:00.000Z"));
    expect(
      render_header({
        latest_tag: "v1.0.0",
        repository_url: "https://github.com/proconnect-gouv/release-action",
        tag_name: "v1.1.0",
        version: "1.1.0",
      }),
    ).toBe(
      "## [1.1.0](https://github.com/proconnect-gouv/release-action/compare/v1.0.0...v1.1.0) (2222-11-11)",
    );
    setSystemTime();
  });
});

describe("insert_version_section", () => {
  test("creates the changelog when empty", () => {
    expect(insert_version_section("", "## 1.0.0\n\nContent")).toBe(
      "# Changelog\n\n## 1.0.0\n\nContent\n",
    );
  });

  test("inserts before the previous version", () => {
    expect(
      insert_version_section(
        "# Changelog\n\n## 0.1.0\n\nOld content\n",
        "## 1.0.0\n\nNew content",
      ),
    ).toBe(
      "# Changelog\n\n## 1.0.0\n\nNew content\n\n## 0.1.0\n\nOld content\n",
    );
  });

  test("appends after the title when no version exists", () => {
    expect(
      insert_version_section("# Changelog\n", "## 1.0.0\n\nNew content"),
    ).toBe("# Changelog\n\n## 1.0.0\n\nNew content\n");
  });
});

describe("read_version_section", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [1.1.0](https://example.com/compare/v1.0.0...v1.1.0) (2026-10-09)",
    "",
    "### Ajouté",
    "",
    "- ✨ add thing (a1)",
    "",
    "## 1.0.0 (2026-10-08)",
    "",
    "### Changements",
    "",
    "- Import",
    "",
  ].join("\n");

  test.each([
    ["1.1.0", "### Ajouté\n\n- ✨ add thing (a1)"],
    ["1.0.0", "### Changements\n\n- Import"],
    ["1.0", ""],
    ["2.0.0", ""],
  ])("%p", (version, section) => {
    expect(read_version_section(changelog, version)).toBe(section);
  });
});

describe("ReleaseActionPlugin", () => {
  const cwd = process.cwd();
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "release-action-"));
    process.chdir(repo);
    await $`git init -q -b main`.quiet();
    await $`git config user.email t@t && git config user.name t && git config commit.gpgsign false`;
    for (const subject of ["🎉 init", "✨ add thing", "🔖 release 1.0.1"]) {
      await $`git commit -q --allow-empty -m ${subject}`;
      if (subject === "🎉 init") await $`git tag 1.0.0`;
    }
    await $`mkdir .release-it-changeset`;
    await writeFile(".release-it-changeset/a.md", "Hello change\n");
  });

  afterEach(async () => {
    process.chdir(cwd);
    await rm(repo, { force: true, recursive: true });
  });

  const plugin = ({ isDryRun = false, isIncrement = true } = {}) => {
    const context: Record<string, string> = {
      latestTag: "1.0.0",
      tagTemplate: "${version}",
    };
    return new ReleaseActionPlugin({
      container: {
        config: {
          getContext: (path: string) => context[path],
          isDryRun,
          isIncrement,
        },
        log: { log() {} },
      },
    });
  };

  test("getChangelog excludes release commits", async () => {
    expect(await plugin().getChangelog("1.0.0")).toMatch(
      /^### Changements\n\n- Hello change\n\n### Ajouté\n\n- ✨ add thing \(\w+\)$/,
    );
  });

  test("bump writes the changelog and deletes changesets", async () => {
    await plugin().bump("1.1.0");
    expect(await Bun.file("CHANGELOG.md").text()).toMatch(
      /^# Changelog\n\n## 1\.1\.0 \(\d{4}-\d{2}-\d{2}\)\n\n### Changements\n\n- Hello change\n\n### Ajouté\n/,
    );
    expect(await readdir(".release-it-changeset")).toEqual([]);
  });

  test("bump writes nothing under dry-run", async () => {
    await plugin({ isDryRun: true }).bump("1.1.0");
    expect(await Bun.file("CHANGELOG.md").exists()).toBe(false);
    expect(await readdir(".release-it-changeset")).toEqual(["a.md"]);
  });

  test("publish reads the version section back and writes nothing", async () => {
    await writeFile(
      "CHANGELOG.md",
      "# Changelog\n\n## 1.1.0 (2026-10-08)\n\n### Ajouté\n\n- ✨ add thing (a1)\n",
    );
    const publish = plugin({ isIncrement: false });
    await publish.bump("1.1.0");
    expect(await publish.getChangelog("1.1.0")).toBe(
      "### Ajouté\n\n- ✨ add thing (a1)",
    );
    expect(await readdir(".release-it-changeset")).toEqual(["a.md"]);
  });
});
