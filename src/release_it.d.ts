declare module "release-it" {
  type Options = Record<string, unknown>;

  export class Config {
    constructor(options?: Options);
    get isDryRun(): boolean;
    get isIncrement(): boolean;
    get options(): Options & {
      git: { tagMatch: string | null; tagName: string | null };
      hooks: Record<string, unknown>;
    };
    getContext(path?: string): unknown;
    init(): Promise<void>;
  }

  export class Plugin {
    static isEnabled(options?: unknown): boolean | Promise<boolean>;
    config: Config;
    log: {
      info(message: string): void;
      log(message: string): void;
      warn(message: string): void;
    };
    options: Readonly<Options>;
    constructor(options?: {
      container?: unknown;
      namespace?: string;
      options?: Options;
    });
    bump(version: string): unknown;
    getChangelog(latest_version: string): unknown;
    getIncrement(increment_base: unknown): unknown;
    init(): unknown;
  }

  export default function runTasks(
    options?: Options,
    container?: { config?: Config },
  ): Promise<{
    changelog: string;
    latestVersion: string;
    name: string;
    version: string;
  }>;
}
