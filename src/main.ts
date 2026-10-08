import { $ } from "bun";
import { appendFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import runTasks, { Config } from "release-it";
import { is_release_commit } from "./plugin.ts";

const dry_run = process.env.INPUT_DRY_RUN === "true";
const plugins = { [join(import.meta.dir, "plugin.ts")]: {} };

const { version } = await Bun.file("package.json").json();
if (typeof version !== "string") throw new Error("package.json has no version");

await $`git config user.name ${"github-actions[bot]"}`;
await $`git config user.email ${"41898282+github-actions[bot]@users.noreply.github.com"}`;

const config = new Config({ ci: true });
await config.init();
const { git, hooks } = config.options;

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
const is_tagged = (await $`git tag --list ${tag_name}`.text()).trim() !== "";

let outputs: Record<string, string>;

if (!is_tagged) {
  console.log(`Tag ${tag_name} does not exist: publish ${version}.`);
  if (!dry_run) {
    const token = process.env.INPUT_GITHUB_TOKEN;
    if (!token) throw new Error("Input github-token is required to publish.");
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
      await runTasks({
        ci: true,
        git: { commit: false },
        increment: false,
        plugins,
      });
    } finally {
      await $`git remote set-url origin ${origin}`;
    }
  }
  outputs = { mode: "publish", published: String(!dry_run), version };
} else {
  const range = latest_tag ? `${latest_tag}..HEAD` : "HEAD";
  const subjects = (await $`git log ${range} --no-merges --format=%s`.text())
    .split("\n")
    .filter(Boolean);
  if (subjects.every(is_release_commit)) {
    console.log(`Nothing to release since ${latest_tag}.`);
    outputs = { mode: "skip", published: "false", version };
  } else {
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
    outputs = {
      body_path,
      mode: "prepare",
      published: "false",
      version: result.version,
    };
  }
}

await appendFile(
  process.env.GITHUB_OUTPUT ?? "/dev/stdout",
  Object.entries(outputs)
    .map(([name, value]) => `${name}=${value}\n`)
    .join(""),
);
