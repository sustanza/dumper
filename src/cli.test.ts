import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main } from "./cli";
import { generateRepoDocs } from "./lib";

/**
 * This test suite covers the CLI behavior. It mocks out child_process
 * to avoid running real Git commands. The CLI’s behavior regarding
 * repository cloning, filtering Markdown files, and switching branches
 * is verified here.
 */
vi.mock("child_process", () => {
  const realFs = require("fs");
  const realPath = require("path");

  return {
    /**
     * Mocks synchronous child_process execution, creating a temporary
     * directory structure with Markdown files. It returns fake commit
     * data and simulates a missing branch by throwing an error.
     */
    execSync: vi.fn((command: string) => {
      if (command.includes("rev-parse")) {
        return "mockedSHA";
      }
      if (command.includes("git log -1")) {
        return "mockedDate";
      }
      if (command.includes("git checkout")) {
        return "";
      }
      if (command.includes("git clone")) {
        if (command.includes("no-such-branch")) {
          throw new Error("Could not find branch 'no-such-branch'");
        }
        const parts = command.trim().split(/\s+/);
        const cloneDir = parts[parts.length - 1];
        realFs.mkdirSync(cloneDir, { recursive: true });
        realFs.writeFileSync(
          realPath.join(cloneDir, "README.md"),
          "# Documentation\nSome content here"
        );
        realFs.mkdirSync(realPath.join(cloneDir, "docs"), { recursive: true });
        realFs.writeFileSync(
          realPath.join(cloneDir, "docs", "intro.md"),
          "# docs/intro\nsome doc content"
        );
        return "";
      }
      return "";
    }),
    spawnSync: vi.fn(() => ({ stdout: "", stderr: "", status: 0 })),
  };
});

/**
 * This block spies on console and process.exit, ensuring we can detect
 * logs and handle exit scenarios without truly exiting the process.
 */
describe("CLI (cli.ts)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    /**
     * Vitest expects a mock signature like (this: unknown, ...args: unknown[]) => unknown.
     * Node/Bun definitions for process.exit can differ (e.g. (code?: string|number|null|undefined) => never).
     * Casting to a broader interface avoids a type conflict without using `any`.
     */
    const typedProcess = process as unknown as {
      exit(this: unknown, ...args: unknown[]): unknown;
    };

    exitSpy = vi
      .spyOn(typedProcess, "exit")
      .mockImplementation(function (this: unknown, ..._args: unknown[]): never {
        throw new Error("process.exit was called.");
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Verifies that the CLI errors and exits if no arguments are provided.
   */
  it("should error and exit if no arguments are provided", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "cli.ts"];

    await expect(main()).rejects.toThrow("process.exit was called.");
    expect(errorSpy).toHaveBeenCalledWith(
      "Error: No GitHub repository URL provided."
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: bun run cli.ts <github_url>")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    process.argv = originalArgv;
  });

  /**
   * Verifies basic usage with a valid GitHub repo, ensuring metadata and
   * aggregated Markdown content are logged correctly.
   */
  it("should handle a basic usage call", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "cli.ts", "https://github.com/username/repo.git"];

    await main();

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      "Metadata:",
      expect.objectContaining({
        owner: "username",
        repo: "repo",
        sha: "mockedSHA",
        date: "mockedDate",
      })
    );
    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      "Output:\n",
      expect.stringContaining("# Documentation\nSome content here")
    );
    expect(exitSpy).not.toHaveBeenCalled();

    process.argv = originalArgv;
  });

  /**
   * Verifies that the --filter argument correctly limits which Markdown
   * files are included in the final output.
   */
  it("should respect --filter argument", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/username/repo.git",
      "--filter=docs/.*\\.md",
    ];

    await main();

    expect(logSpy).toHaveBeenNthCalledWith(1, "Metadata:", expect.any(Object));
    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      "Output:\n",
      expect.stringContaining("# docs/intro\nsome doc content")
    );
    expect(exitSpy).not.toHaveBeenCalled();

    process.argv = originalArgv;
  });

  /**
   * Verifies that the CLI accepts a --branch argument and attempts to
   * check out that branch upon cloning.
   */
  it("should respect --branch argument", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/username/repo.git",
      "--branch=dev",
    ];

    await main();

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      "Metadata:",
      expect.objectContaining({ sha: "mockedSHA" })
    );
    expect(logSpy).toHaveBeenNthCalledWith(2, "Output:\n", expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();

    process.argv = originalArgv;
  });

  /**
   * Verifies that the CLI exits with an error when specifying a branch
   * that does not exist in the repository.
   */
  it("should error and exit if branch is inaccessible", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/username/repo.git",
      "--branch=no-such-branch",
    ];

    await expect(main()).rejects.toThrow("process.exit was called.");

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to generate docs:",
      expect.any(Error)
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    process.argv = originalArgv;
  });
});
