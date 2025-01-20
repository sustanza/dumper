import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

/**
 * 1) Mock "child_process" BEFORE importing the code that uses it.
 */
vi.mock("child_process", () => {
  const realFs = require("fs");
  const realPath = require("path");

  return {
    execSync: vi.fn((command: string) => {
      // 1. "git rev-parse HEAD"
      if (command.includes("rev-parse")) {
        return "mockedSHA";
      }
      // 2. "git log -1 --format=%cd"
      if (command.includes("git log -1")) {
        return "mockedDate";
      }
      // 3. "git checkout dev"
      if (command.includes("git checkout")) {
        return "";
      }
      // 4. "git clone ..."
      if (command.includes("git clone")) {
        // If the branch is clearly invalid, simulate an error
        if (command.includes("no-such-branch")) {
          throw new Error("Could not find branch 'no-such-branch'");
        }

        // Otherwise do a normal clone
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

    // If your code calls spawnSync(...), mock that too
    spawnSync: vi.fn((command: string) => {
      if (command.includes("git")) {
        return { stdout: "spawnSync mock success", stderr: "", status: 0 };
      }
      return { stdout: "", stderr: "", status: 0 };
    }),
  };
});

import { generateRepoDocs, getRepoInfo } from "./lib";

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

describe("getRepoInfo", () => {
  it("should throw for invalid URL", () => {
    expect(() => getRepoInfo("bad-url")).toThrowError();
  });

  it("should throw if owner or repo cannot be parsed", () => {
    expect(() => getRepoInfo("https://github.com/invalid-url")).toThrowError(
      "Could not parse owner/repo from URL: https://github.com/invalid-url"
    );
  });
});

describe("getRepoInfo - additional checks", () => {
  it("should parse .git suffix", () => {
    const info = getRepoInfo("https://github.com/testuser/testrepo.git");
    expect(info.owner).toBe("testuser");
    expect(info.repo).toBe("testrepo");
  });

  it("should handle trailing slash", () => {
    const info = getRepoInfo("https://github.com/testuser/testrepo/");
    expect(info.owner).toBe("testuser");
    expect(info.repo).toBe("testrepo");
  });
});

describe("generateRepoDocs", () => {
  it("should return correct metadata and output", async () => {
    const result = await generateRepoDocs(
      "https://github.com/username/repo.git"
    );
    expect(result.metadata.owner).toBe("username");
    expect(result.metadata.sha).toBe("mockedSHA");
    expect(result.metadata.date).toBe("mockedDate");
    expect(result.output).toContain("# Documentation");
  });
});

describe("generateRepoDocs - advanced scenarios", () => {
  it("should handle include option", async () => {
    const result = await generateRepoDocs(
      "https://github.com/username/repo.git",
      {
        include: "docs/.*\\.md",
      }
    );
    expect(result.output).toContain("# docs/intro");
  });

  it("should handle specified branch", async () => {
    await expect(
      generateRepoDocs("https://github.com/username/repo.git", {
        branch: "dev",
      })
    ).resolves.toHaveProperty("metadata.sha", "mockedSHA");
  });

  it("should throw on inaccessible branch", async () => {
    // Now that our mock throws for "no-such-branch", this test will pass
    await expect(
      generateRepoDocs("https://github.com/username/repo.git", {
        branch: "no-such-branch",
      })
    ).rejects.toThrow();
  });
});

describe("generateRepoDocs - exclude functionality", () => {
  it("should exclude matching files", async () => {
    const result = await generateRepoDocs(
      "https://github.com/username/repo.git",
      {
        exclude: "docs/.*\\.md",
      }
    );
    // "docs/intro.md" should not appear in the output
    expect(result.output).not.toContain("## docs/intro.md");
  });
});
