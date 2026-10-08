import { describe, expect, test } from "bun:test";
import { select_stale_branches, type ReleaseBranch } from "./prune_branches.ts";

const now = new Date("2026-10-08T00:00:00Z");
const branch = (
  name: string,
  committed_at: string,
  tagged = true,
): ReleaseBranch => ({ committed_at: new Date(committed_at), name, tagged });

describe("select_stale_branches", () => {
  test("deletes tagged branches older than six months", () => {
    expect(
      select_stale_branches({
        branches: [
          branch("release/2026.10.0", "2026-10-01"),
          branch("release/2026.9.0", "2026-09-01"),
          branch("release/2026.8.0", "2026-08-01"),
          branch("release/2026.7.0", "2026-07-01"),
          branch("release/2026.6.0", "2026-06-01"),
          branch("release/2026.5.0", "2026-05-01"),
          branch("release/2026.3.0", "2026-03-01"),
          branch("release/2025.12.0", "2025-12-01"),
        ],
        now,
      }),
    ).toEqual(["release/2026.3.0", "release/2025.12.0"]);
  });

  test("always keeps the five most recent branches, however old", () => {
    expect(
      select_stale_branches({
        branches: [
          branch("release/2024.6.0", "2024-06-01"),
          branch("release/2024.5.0", "2024-05-01"),
          branch("release/2024.4.0", "2024-04-01"),
          branch("release/2024.3.0", "2024-03-01"),
          branch("release/2024.2.0", "2024-02-01"),
          branch("release/2024.1.0", "2024-01-01"),
        ],
        now,
      }),
    ).toEqual(["release/2024.1.0"]);
  });

  test("keeps branches with commits no tag points at", () => {
    expect(
      select_stale_branches({
        branches: [
          ...["10", "9", "8", "7", "6"].map((month) =>
            branch(
              `release/2026.${month}.0`,
              `2026-${month.padStart(2, "0")}-01`,
            ),
          ),
          branch("release/2025.1.0", "2025-01-01", false),
          branch("release/2025.1.1", "2025-01-02"),
        ],
        now,
      }),
    ).toEqual(["release/2025.1.1"]);
  });
});
