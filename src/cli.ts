import { generateRepoDocs } from "./lib";

/**
 * CLI entry point for dumping documentation from a GitHub repo. It:
 * 1) Parses command-line arguments to obtain repository URL, branch, and filter.
 * 2) Invokes generateRepoDocs to clone, gather metadata, and aggregate markdown.
 * 3) Prints metadata and aggregated markdown output to console, or prints errors.
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Error: No GitHub repository URL provided.");
    console.error(
      "Usage: bun run cli.ts <github_url> [--branch=...] [--include=...] [--exclude=...]"
    );
    process.exit(1);
  }

  let repoUrl = "";
  let branch = "";
  let include: string[] = [];
  let exclude: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("--branch=")) {
      branch = arg.split("=")[1].trim();
    } else if (arg.startsWith("--include=")) {
      const raw = arg.split("=")[1].trim();
      include.push(...raw.split(",").map((str) => str.trim()));
    } else if (arg.startsWith("--exclude=")) {
      const raw = arg.split("=")[1].trim();
      exclude.push(...raw.split(",").map((str) => str.trim()));
    } else {
      repoUrl = arg;
    }
  }

  if (!repoUrl) {
    console.error("Error: No GitHub repository URL provided.");
    console.error(
      "Usage: bun run cli.ts <github_url> [--branch=...] [--include=...] [--exclude=...]"
    );
    process.exit(1);
  }

  try {
    const { output, metadata } = await generateRepoDocs(repoUrl, {
      include,
      branch,
      exclude,
    });

    console.log("Metadata:", metadata);
    console.log("Output:\n", output);
  } catch (err) {
    console.error("Failed to generate docs:", err);
    process.exit(1);
  }
}

// If this file is run directly, call main().
if (require.main === module) {
  main();
}
