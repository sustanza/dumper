import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main } from "./cli";

/**
 * Mocks child_process to prevent real Git operations. The mock simulates
 * cloning, branch-checkout, and populates a temporary directory with
 * certain markdown files. The tests verify that each file is preceded
 * by a markdown header referencing the file's path.
 */
vi.mock("node:child_process", () => {
  const realFs = require("fs");
  const realPath = require("path");
  return {
    execSync: vi.fn((command: string) => {
      if (command.includes("git clone")) {
        // Check for missing branch scenario
        if (command.includes("-b no-such-branch")) {
          throw new Error("Failed to clone branch 'no-such-branch'");
        }
        // Simulate creating a repo directory with two .md files
        const parts = command.trim().split(/\s+/);
        const cloneDir = parts[parts.length - 1];
        realFs.mkdirSync(cloneDir, { recursive: true });
        realFs.writeFileSync(
          realPath.join(cloneDir, "README.md"),
          "# Main Documentation\nContents here..."
        );
        realFs.mkdirSync(realPath.join(cloneDir, "docs"), { recursive: true });
        realFs.writeFileSync(
          realPath.join(cloneDir, "docs", "intro.md"),
          "# Intro Doc\nDetail about usage"
        );
        return Buffer.from("");
      }
      if (command.includes("git rev-parse HEAD")) {
        return Buffer.from("mockedSHA\n");
      }
      if (command.includes("git log -1 --format=%cd HEAD")) {
        return Buffer.from("mockedDate\n");
      }
      return Buffer.from("");
    }),
  };
});

/**
 * This test suite checks CLI usage, verifying that the aggregated output
 * includes a markdown header (e.g., '## README.md') before each file.
 */
describe("CLI usage", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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

  it("exits with error if no repo URL is provided", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "cli.ts"];

    await expect(main()).rejects.toThrow("process.exit was called.");
    expect(errorSpy).toHaveBeenCalledWith(
      "Error: No GitHub repository URL provided."
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    process.argv = originalArgv;
  });

  it("generates docs with default branch and no filter", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "cli.ts", "https://github.com/owner/repo.git"];

    await main();

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      "Metadata:",
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        sha: "mockedSHA",
        date: "mockedDate",
      })
    );

    // The second call to console.log should print "Output:\n" and the combined content
    const secondCall = logSpy.mock.calls[1];
    expect(secondCall[0]).toBe("Output:\n");
    const content = secondCall[1] as string;

    // Combined content should reference README.md and docs/intro.md
    expect(content).toContain("## README.md");
    expect(content).toContain("# Main Documentation");
    expect(content).toContain("## docs/intro.md");
    expect(content).toContain("# Intro Doc");

    process.argv = originalArgv;
  });

  it("filters out README if --include=docs/.*\\.md", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/owner/repo.git",
      "--include=docs/.*\\.md",
    ];

    await main();

    // Should still print the metadata
    expect(logSpy).toHaveBeenNthCalledWith(1, "Metadata:", expect.any(Object));

    // Output includes only the docs/intro.md file
    const secondCall = logSpy.mock.calls[1];
    const content = secondCall[1] as string;
    expect(content).not.toContain("## README.md");
    expect(content).toContain("## docs/intro.md");
    expect(content).toContain("# Intro Doc");

    process.argv = originalArgv;
  });

  it("accepts multiple includes via comma separation", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/owner/repo.git",
      "--include=docs/.*\\.md, examples/.*\\.md",
    ];

    await main();
    const secondCall = logSpy.mock.calls[1];
    const content = secondCall[1] as string;
    // Should include docs/intro.md, would also include examples/whatever.md if present
    expect(content).toContain("## docs/intro.md");
    process.argv = originalArgv;
  });

  it("clones specific branch if --branch is provided", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/owner/repo.git",
      "--branch=dev",
    ];

    await main();

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      "Metadata:",
      expect.objectContaining({ sha: "mockedSHA" })
    );

    const secondCall = logSpy.mock.calls[1];
    const content = secondCall[1] as string;
    expect(content).toContain("## README.md");
    expect(content).toContain("## docs/intro.md");

    process.argv = originalArgv;
  });

  it("exits with error when a branch does not exist", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/owner/repo.git",
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

  it("excludes matching file patterns if --exclude is provided", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/owner/repo.git",
      "--exclude=docs/.*\\.md",
    ];

    await main();

    const secondCall = logSpy.mock.calls[1];
    const content = secondCall[1] as string;
    expect(content).not.toContain("## docs/intro.md");

    process.argv = originalArgv;
  });

  it("excludes multiple file patterns if --exclude is comma-delimited", async () => {
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "cli.ts",
      "https://github.com/owner/repo.git",
      "--exclude=README\\.md, docs/.*\\.md",
    ];

    await main();
    const secondCall = logSpy.mock.calls[1];
    const content = secondCall[1] as string;
    // Should exclude both README.md and docs/intro.md
    expect(content).not.toContain("## README.md");
    expect(content).not.toContain("## docs/intro.md");

    process.argv = originalArgv;
  });
});
