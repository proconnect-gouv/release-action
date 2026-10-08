import { $ } from "bun";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Plugin } from "release-it";

const CHANGELOG_PATH = "CHANGELOG.md";
const CHANGESET_DIR = ".release-it-changeset";
const RELEASE_EMOJI = ["🔖", ":bookmark:"];

const GITMOJI_GROUPS: Record<string, { emoji: string[]; label: string }> = {
  added: {
    emoji: ["✨", ":sparkles:", "🎉", ":tada:", "➕", ":heavy_plus_sign:"],
    label: "Ajouté",
  },
  changed: {
    emoji: [
      "♻️",
      ":recycle:",
      "🔧",
      ":wrench:",
      "🎨",
      ":art:",
      "⚡",
      ":zap:",
      "🚚",
      ":truck:",
      "💄",
      ":lipstick:",
      "🏗️",
      ":building_construction:",
    ],
    label: "Modifié",
  },
  fixed: {
    emoji: ["🐛", ":bug:", "🚑", ":ambulance:", "🔒", ":lock:"],
    label: "Corrigé",
  },
  removed: {
    emoji: ["🔥", ":fire:", "➖", ":heavy_minus_sign:", "🗑️", ":wastebasket:"],
    label: "Supprimé",
  },
  dependencies: {
    emoji: [
      "⬆️",
      ":arrow_up:",
      "⬇️",
      ":arrow_down:",
      "📌",
      ":pushpin:",
      ":arrow_upper_right:",
    ],
    label: "Dépendances",
  },
  documentation: {
    emoji: ["📝", ":memo:", "📚", ":books:", "✍️", ":writing_hand:"],
    label: "Documentation",
  },
  ci: {
    emoji: ["👷", ":construction_worker:", "💚", ":green_heart:"],
    label: "CI/CD",
  },
  misc: {
    emoji: [],
    label: "Divers",
  },
};

export interface Changeset {
  content: string;
  id: string;
}

export interface Commit {
  emoji: string | undefined;
  group: string;
  hash: string;
  short_hash: string;
  subject: string;
}

export interface GroupedCommits {
  commits: Commit[];
  label: string;
}

interface Unreleased {
  changesets: Changeset[];
  commits: Commit[];
  latest_tag: string | null;
}

export function extract_emoji(subject: string) {
  return subject.match(
    /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?|:[a-z_]+:)/u,
  )?.[1];
}

export function get_group_for_emoji(emoji: string | undefined) {
  const entry = Object.entries(GITMOJI_GROUPS).find(
    ([, group]) => emoji && group.emoji.includes(emoji),
  );
  return entry?.[0] ?? "misc";
}

export function is_release_commit(subject: string) {
  return RELEASE_EMOJI.includes(extract_emoji(subject) ?? "");
}

export function parse_commit(line: string): Commit {
  const [hash = "", short_hash = "", subject = ""] = line.split("\x1f");
  const emoji = extract_emoji(subject);
  return {
    emoji,
    group: get_group_for_emoji(emoji),
    hash,
    short_hash,
    subject,
  };
}

export function parse_changeset(id: string, content: string) {
  const trimmed = content.trim();
  return trimmed ? ({ content: trimmed, id } satisfies Changeset) : null;
}

export function group_commits(commits: Commit[]): GroupedCommits[] {
  return Object.entries(GITMOJI_GROUPS)
    .map(([name, { label }]) => ({
      commits: commits.filter((commit) => commit.group === name),
      label,
    }))
    .filter((group) => group.commits.length > 0);
}

export function get_increment(commits: Commit[]) {
  const emoji = commits.map((commit) => commit.emoji);
  if (emoji.includes("💥") || emoji.includes(":boom:")) return "major";
  if (emoji.includes("✨") || emoji.includes(":sparkles:")) return "minor";
  return "patch";
}

export function render_body({
  changesets,
  grouped,
}: {
  changesets: Changeset[];
  grouped: GroupedCommits[];
}) {
  const sections = grouped.map((group) =>
    [
      `### ${group.label}`,
      "",
      ...group.commits.map(
        (commit) => `- ${commit.subject} (${commit.short_hash})`,
      ),
    ].join("\n"),
  );
  if (changesets.length > 0) {
    sections.unshift(
      [
        "### Changements",
        "",
        ...changesets.map((changeset) => `- ${changeset.content}`),
      ].join("\n"),
    );
  }
  return sections.join("\n\n");
}

export function render_header({
  latest_tag,
  repository_url,
  tag_name,
  version,
}: {
  latest_tag: string | null;
  repository_url: string | null;
  tag_name: string;
  version: string;
}) {
  const date = new Date().toISOString().split("T")[0];
  return repository_url && latest_tag
    ? `## [${version}](${repository_url}/compare/${latest_tag}...${tag_name}) (${date})`
    : `## ${version} (${date})`;
}

export function insert_version_section(changelog: string, section: string) {
  if (!changelog.trim()) return `# Changelog\n\n${section}\n`;
  const lines = changelog.split("\n");
  const first_version = lines.findIndex((line) => line.startsWith("## "));
  lines.splice(
    first_version === -1 ? lines.length : first_version,
    0,
    section,
    "",
  );
  return lines.join("\n");
}

export function read_version_section(changelog: string, version: string) {
  const lines = changelog.split("\n");
  const header = lines.findIndex(
    (line) =>
      line.startsWith(`## ${version} `) || line.startsWith(`## [${version}]`),
  );
  if (header === -1) return "";
  const rest = lines.slice(header + 1);
  const next = rest.findIndex((line) => line.startsWith("## "));
  return rest
    .slice(0, next === -1 ? rest.length : next)
    .join("\n")
    .trim();
}

async function read_text(path: string) {
  return readFile(path, "utf-8").catch(() => "");
}

async function read_changesets() {
  const files = await readdir(CHANGESET_DIR).catch(() => []);
  const changesets = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .sort()
      .map(async (file) =>
        parse_changeset(
          file.slice(0, -".md".length),
          await read_text(join(CHANGESET_DIR, file)),
        ),
      ),
  );
  return changesets.filter((changeset) => changeset !== null);
}

async function read_commits(latest_tag: string | null) {
  const range = latest_tag ? `${latest_tag}..HEAD` : "HEAD";
  const log =
    await $`git log ${range} --no-merges --pretty=format:%H%x1f%h%x1f%s`.text();
  return log
    .split("\n")
    .filter(Boolean)
    .map(parse_commit)
    .filter((commit) => !is_release_commit(commit.subject));
}

export default class ReleaseActionPlugin extends Plugin {
  #unreleased: Promise<Unreleased> | undefined;

  unreleased() {
    this.#unreleased ??= (async () => {
      const latest_tag = this.context_string("latestTag");
      return {
        changesets: await read_changesets(),
        commits: await read_commits(latest_tag),
        latest_tag,
      };
    })();
    return this.#unreleased;
  }

  context_string(path: string) {
    const value = this.config.getContext(path);
    return typeof value === "string" && value ? value : null;
  }

  repository_url() {
    const host = this.context_string("repo.host");
    const repository = this.context_string("repo.repository");
    return host && repository ? `https://${host}/${repository}` : null;
  }

  override async getChangelog(latest_version: string) {
    if (!this.config.isIncrement) {
      return read_version_section(
        await read_text(CHANGELOG_PATH),
        latest_version,
      );
    }
    const { changesets, commits } = await this.unreleased();
    return render_body({ changesets, grouped: group_commits(commits) });
  }

  override async getIncrement() {
    const { commits } = await this.unreleased();
    return get_increment(commits);
  }

  override async bump(version: string) {
    if (!this.config.isIncrement) return;
    const { changesets, commits, latest_tag } = await this.unreleased();
    const body = render_body({ changesets, grouped: group_commits(commits) });
    if (!body) return;
    const tag_name = (
      this.context_string("tagTemplate") ?? "${version}"
    ).replaceAll("${version}", version);
    const header = render_header({
      latest_tag,
      repository_url: this.repository_url(),
      tag_name,
      version,
    });
    if (this.config.isDryRun) {
      this.log.log(
        `Dry run: skip writing ${CHANGELOG_PATH} and deleting ${changesets.length} changesets.`,
      );
      return;
    }
    await writeFile(
      CHANGELOG_PATH,
      insert_version_section(
        await read_text(CHANGELOG_PATH),
        `${header}\n\n${body}`,
      ),
    );
    await Promise.all(
      changesets.map((changeset) =>
        unlink(join(CHANGESET_DIR, `${changeset.id}.md`)),
      ),
    );
  }
}
