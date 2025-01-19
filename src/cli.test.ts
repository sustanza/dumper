import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main } from "./cli";
import { generateRepoDocs } from "./lib";

// --------------------------------------------------------------
// 1) Mock child_process, so no real 'git' commands are run
// --------------------------------------------------------------
vi.mock("child_process", () => {
  const realFs = require("fs");
  const realPath = require("path");

  return {
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
        // Otherwise, create some dummy markdown
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

// --------------------------------------------------------------
// 2) Spy on console.log / console.error / process.exit in each test
// --------------------------------------------------------------
describe("CLI (cli.ts)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      throw new Error("process.exit was called.");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------
  // Test: no arguments => show help + exit(1)
  // --------------------------------------------------------------
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

  // --------------------------------------------------------------
  // Test: basic usage => logs metadata + logs docs
  // --------------------------------------------------------------
  it("should handle a basic usage call", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "cli.ts", "https://github.com/username/repo.git"];

    await main(); // This should NOT throw

    // *** Check first console.log call => "Metadata:", {owner, repo, ...}
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

    // *** Check second console.log call => "Output:\n", <big string with docs>
    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      "Output:\n",
      expect.stringContaining("# Documentation\nSome content here")
    );

    // Should not exit on success
    expect(exitSpy).not.toHaveBeenCalled();
    process.argv = originalArgv;
  });

  // --------------------------------------------------------------
  // Test: filter => logs only docs/intro.md
  // --------------------------------------------------------------
  it("should respect --filter argument", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/username/repo.git",
      "--filter=docs/.*\\.md",
    ];

    await main();

    // *** First call is "Metadata:", ...
    expect(logSpy).toHaveBeenNthCalledWith(1, "Metadata:", expect.any(Object));

    // *** Second call is "Output:\n", the aggregator with only docs/intro.md
    // ADDED: Check the second argument of the second call for your docs text
    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      "Output:\n",
      expect.stringContaining("# docs/intro\nsome doc content")
    );

    expect(exitSpy).not.toHaveBeenCalled();
    process.argv = originalArgv;
  });

  // --------------------------------------------------------------
  // Test: branch => pass the branch in calls
  // --------------------------------------------------------------
  it("should respect --branch argument", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/username/repo.git",
      "--branch=dev",
    ];

    await main();

    // The first console.log with "Metadata:", ...
    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      "Metadata:",
      expect.objectContaining({ sha: "mockedSHA" })
    );
    // The second console.log with aggregated docs
    expect(logSpy).toHaveBeenNthCalledWith(2, "Output:\n", expect.any(String));

    expect(exitSpy).not.toHaveBeenCalled();
    process.argv = originalArgv;
  });

  // --------------------------------------------------------------
  // Test: invalid branch => fails + calls process.exit
  // --------------------------------------------------------------
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
