#!/usr/bin/env bun
import { generateRepoDocs } from "./lib.js";

/**
 * Parses command-line arguments to extract the repository URL, filter, and branch options.
 *
 * @param {string[]} argv - The command-line arguments.
 * @returns {{ repoUrl?: string; filter?: string; branch?: string }} An object containing the parsed arguments.
 */
function parseArgs(argv: string[]): {
  repoUrl?: string;
  filter?: string;
  branch?: string;
} {
  const args: { repoUrl?: string; filter?: string; branch?: string } = {};

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--filter=")) {
      args.filter = arg.replace("--filter=", "");
    } else if (arg.startsWith("--branch=")) {
      args.branch = arg.replace("--branch=", "");
    } else if (!args.repoUrl) {
      // The first non-flag argument is the repo URL
      args.repoUrl = arg;
    }
  }

  return args;
}

/**
 * Main function to run the CLI. It parses arguments, generates repository documentation, and outputs the results.
 */
export async function main() {
  const { repoUrl, filter, branch } = parseArgs(process.argv);

  if (!repoUrl) {
    console.error("Error: No GitHub repository URL provided.");
    console.error(
      "Usage: bun run cli.ts <github_url> [--filter=regex] [--branch=branchName]"
    );
    process.exit(1);
  }

  try {
    const result = await generateRepoDocs(repoUrl, { filter, branch });
    console.log("Metadata:", result.metadata);
    console.log("Output:\n", result.output);
  } catch (error) {
    console.error("Failed to generate docs:", error);
    process.exit(1);
  }
}

// Only auto-run main() if not imported (i.e., if running as a script).
if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
