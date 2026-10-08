import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const main_ts = join(import.meta.dir, "main.ts");
const calver = { "@csmith/release-it-calver-plugin": { cycle: "month" } };
const now = new Date();
const current_calver = `${now.getFullYear()}.${now.getMonth() + 1}.0`;
const fixtures: string[] = [];

afterAll(async () => {
  await Promise.all(
    fixtures.flatMap((dir) => [
      rm(dir, { force: true, recursive: true }),
      rm(`${dir}.out`, { force: true }),
    ]),
  );
});

async function fixture(package_json: { release_it: object; version: string }) {
  const dir = await mkdtemp(join(tmpdir(), "release-action-smoke-"));
  fixtures.push(dir);
  await Bun.write(
    join(dir, "package.json"),
    JSON.stringify({
      name: "fixture",
      "release-it": package_json.release_it,
      version: package_json.version,
    }),
  );
  await $`git init -q -b main`.cwd(dir);
  await $`git config user.email smoke@example.com && git config user.name smoke`.cwd(
    dir,
  );
  await $`git config commit.gpgsign false && git config tag.gpgsign false`.cwd(
    dir,
  );
  await commit(dir, "🎉 init");
  return dir;
}

async function commit(dir: string, subject: string) {
  await $`git add -A && git commit -q --allow-empty -m ${subject}`.cwd(dir);
}

async function run_action(
  dir: string,
  command: "publish" | "select-mode" | "version",
) {
  await rm(`${dir}.out`, { force: true });
  await $`bun ${main_ts} ${command}`
    .cwd(dir)
    .env({ ...process.env, GITHUB_OUTPUT: `${dir}.out`, INPUT_DRY_RUN: "true" })
    .quiet();
  const lines = (await Bun.file(`${dir}.out`).text()).trim().split("\n");
  return Object.fromEntries(
    lines.map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ]),
  );
}

async function git_state(dir: string) {
  return $`git rev-parse HEAD && git tag --list`.cwd(dir).text();
}

describe("main (dry-run)", () => {
  test("CalVer version", async () => {
    const dir = await fixture({
      release_it: { plugins: calver },
      version: "2026.1.0",
    });
    await $`git tag 2026.1.0`.cwd(dir);
    await commit(dir, "🐛 fix thing");
    await Bun.write(join(dir, ".release-it-changeset/a.md"), "Hello change\n");
    await commit(dir, "✨ add thing");
    const before = await git_state(dir);

    expect(await run_action(dir, "select-mode")).toEqual({ mode: "version" });
    expect(await run_action(dir, "version")).toMatchObject({
      version: current_calver,
    });
    expect((await Bun.file(join(dir, "package.json")).json()).version).toBe(
      current_calver,
    );
    const changelog = await Bun.file(join(dir, "CHANGELOG.md")).text();
    expect(
      changelog.split("\n").filter((line) => /^(### |- Hello)/.test(line)),
    ).toEqual([
      "### Changements",
      "- Hello change",
      "### Ajouté",
      "### Corrigé",
    ]);
    expect(await readdir(join(dir, ".release-it-changeset"))).toEqual([]);
    expect(await git_state(dir)).toBe(before);
  });

  test("Semver bump", async () => {
    const dir = await fixture({
      release_it: { git: { tagName: "v${version}" } },
      version: "1.0.0",
    });
    await $`git tag v1.0.0`.cwd(dir);
    await commit(dir, "💥 break api");

    expect((await run_action(dir, "version")).version).toBe("2.0.0");
  });

  test("Package tags ignored", async () => {
    const dir = await fixture({
      release_it: {
        git: { tagMatch: "[0-9]*.[0-9]*.[0-9]*" },
        plugins: calver,
      },
      version: "2026.1.0",
    });
    await $`git tag 2026.1.0`.cwd(dir);
    await commit(dir, "✨ add thing");
    await $`git tag ${"@scope/pkg@9.9.9"}`.cwd(dir);
    await commit(dir, "🐛 fix thing");

    expect(await run_action(dir, "select-mode")).toEqual({ mode: "version" });
    await run_action(dir, "version");
    expect(await Bun.file(join(dir, "CHANGELOG.md")).text()).toContain(
      "✨ add thing",
    );
  });

  test("Nothing to release", async () => {
    const dir = await fixture({
      release_it: { plugins: calver },
      version: "2026.1.0",
    });
    await $`git tag 2026.1.0`.cwd(dir);
    await commit(dir, "🔖 release 2026.1.0");

    expect(await run_action(dir, "select-mode")).toEqual({ mode: "none" });
    expect(await $`git status --porcelain`.cwd(dir).text()).toBe("");
  });

  test("Publish", async () => {
    const dir = await fixture({
      release_it: { plugins: calver },
      version: "2026.1.0",
    });
    await $`git tag 2026.1.0`.cwd(dir);
    await Bun.write(
      join(dir, "package.json"),
      JSON.stringify({
        name: "fixture",
        "release-it": { plugins: calver },
        version: "2026.2.0",
      }),
    );
    await Bun.write(
      join(dir, "CHANGELOG.md"),
      "# Changelog\n\n## 2026.2.0 (2026-02-01)\n\n### Ajouté\n\n- ✨ add thing (abc1234)\n",
    );
    await commit(dir, "🔖 release 2026.2.0");

    expect(await run_action(dir, "select-mode")).toEqual({ mode: "publish" });
    expect(await run_action(dir, "publish")).toEqual({
      published: "false",
      version: "2026.2.0",
    });
    expect(await $`git tag --list`.cwd(dir).text()).toBe("2026.1.0\n");
  });
});
