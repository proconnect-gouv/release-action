import { $ } from "bun";
import { appendFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import runTasks, { Config } from "release-it";
import { is_release_commit, read_version_section } from "./plugin.ts";
import { select_stale_branches } from "./prune_branches.ts";

const dry_run = process.env.INPUT_DRY_RUN === "true";
const plugins = { [join(import.meta.dir, "plugin.ts")]: {} };

async function load_config() {
  const config = new Config({ ci: true });
  await config.init();
  return config.options;
}

async function read_package_version() {
  const { version } = await Bun.file("package.json").json();
  if (typeof version !== "string") {
    throw new Error("package.json has no version");
  }
  return version;
}

async function set_outputs(outputs: Record<string, string>) {
  await appendFile(
    process.env.GITHUB_OUTPUT ?? "/dev/stdout",
    Object.entries(outputs)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
  );
}

async function select_mode() {
  const version = await read_package_version();
  const { git } = await load_config();
  const tag_match = (git.tagMatch ?? git.tagName ?? "${version}").replaceAll(
    "${version}",
    "*",
  );
  const latest_tag =
    (
      await $`git describe --tags --abbrev=0 --match=${tag_match}`
        .nothrow()
        .quiet()
        .text()
    ).trim() || null;
  const tag_name = (
    git.tagName ?? (latest_tag?.startsWith("v") ? "v${version}" : "${version}")
  ).replaceAll("${version}", version);

  if ((await $`git tag --list ${tag_name}`.text()).trim() === "") {
    console.log(`Tag ${tag_name} does not exist: publish ${version}.`);
    return set_outputs({ mode: "publish" });
  }

  const range = latest_tag ? `${latest_tag}..HEAD` : "HEAD";
  const subjects = (await $`git log ${range} --no-merges --format=%s`.text())
    .split("\n")
    .filter(Boolean);
  if (subjects.every(is_release_commit)) {
    console.log(`Nothing to release since ${latest_tag}.`);
    return set_outputs({ mode: "none" });
  }
  return set_outputs({ mode: "version" });
}

async function version() {
  const { hooks } = await load_config();
  const result = await runTasks({
    ci: true,
    git: { commit: false, push: false, requireUpstream: false, tag: false },
    github: { release: false },
    hooks: Object.fromEntries(
      Object.keys(hooks)
        .filter((name) => /:(git|github|gitlab):/.test(name))
        .map((name) => [name, ""]),
    ),
    npm: { publish: false },
    plugins,
  });
  const body_path = join(
    process.env.RUNNER_TEMP ?? tmpdir(),
    "release-action-body.md",
  );
  await writeFile(body_path, result.changelog);
  if (dry_run) await $`git add --intent-to-add . && git diff`;
  await set_outputs({ body_path, version: result.version });
}

async function publish() {
  const version = await read_package_version();
  if (dry_run) {
    console.log(`Dry run: would tag and release ${version}.`);
    return set_outputs({ published: "false", version });
  }

  await with_authenticated_origin(async () => {
    await $`git config user.name ${"github-actions[bot]"}`;
    await $`git config user.email ${"41898282+github-actions[bot]@users.noreply.github.com"}`;
    await runTasks({
      ci: true,
      git: { commit: false },
      github: {
        releaseNotes: async () =>
          read_version_section(await Bun.file("CHANGELOG.md").text(), version),
      },
      increment: false,
      plugins,
    });
  });
  await set_outputs({ published: "true", version });
}

async function prune_branches() {
  const refs =
    await $`git for-each-ref refs/remotes/origin/release/ --format=${"%(refname:lstrip=3)%09%(committerdate:unix)%09%(objectname)"}`.text();
  const branches = await Promise.all(
    refs
      .split("\n")
      .filter(Boolean)
      .map(async (line) => {
        const [name = "", committed_at = "", sha = ""] = line.split("\t");
        const tags = await $`git tag --points-at ${sha}`.text();
        return {
          committed_at: new Date(Number(committed_at) * 1000),
          name,
          tagged: tags.trim() !== "",
        };
      }),
  );
  const stale = select_stale_branches({ branches, now: new Date() });
  console.log(
    stale.length === 0
      ? "No release branch to delete."
      : `${dry_run ? "Would delete" : "Deleting"} ${stale.length} release branches:\n${stale.join("\n")}`,
  );
  if (!dry_run && stale.length > 0) {
    await with_authenticated_origin(() => $`git push origin --delete ${stale}`);
  }
  await set_outputs({ branches: stale.join(",") });
}

async function with_authenticated_origin(task: () => Promise<unknown>) {
  const token = process.env.INPUT_GITHUB_TOKEN;
  if (!token) throw new Error("Input github-token is required.");
  const origin = (await $`git remote get-url origin`.text()).trim();
  const authenticated = new URL(
    `${process.env.GITHUB_REPOSITORY}.git`,
    `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/`,
  );
  authenticated.username = "x-access-token";
  authenticated.password = token;
  process.env.GITHUB_TOKEN = token;
  await $`git remote set-url origin ${authenticated.href}`;
  try {
    await task();
  } finally {
    await $`git remote set-url origin ${origin}`;
  }
}

const commands: Record<string, () => Promise<void>> = {
  "prune-branches": prune_branches,
  publish,
  "select-mode": select_mode,
  version,
};
const command = commands[process.argv[2] ?? ""];
if (!command) {
  throw new Error(
    `Usage: main.ts <${Object.keys(commands).join("|")}>, got "${process.argv[2]}".`,
  );
}
await command();
