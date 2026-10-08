export const KEEP_LATEST = 5;
export const MAX_AGE_DAYS = 183;

export interface ReleaseBranch {
  committed_at: Date;
  name: string;
  tagged: boolean;
}

export function select_stale_branches({
  branches,
  now,
}: {
  branches: ReleaseBranch[];
  now: Date;
}) {
  const cutoff = now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return branches
    .toSorted((a, b) => b.committed_at.getTime() - a.committed_at.getTime())
    .slice(KEEP_LATEST)
    .filter((branch) => branch.tagged && branch.committed_at.getTime() < cutoff)
    .map((branch) => branch.name);
}
