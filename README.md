# Dumper

Dumper is a simple CLI tool for cloning a GitHub repository, finding Markdown files, and aggregating them into a single output. It also returns metadata (latest commit SHA and date) for easy reference. The CLI can optionally filter which Markdown files it processes and check out a specific branch—all without external dependencies.

The inspiration for writing this tool is to provide a simple way to gather context from repositories for usage with Large Language Models (LLMs).

## Table of Contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [Usage](#usage)
   - [Basic Usage](#basic-usage)
   - [Including Files](#including-files)
   - [Checking Out a Specific Branch](#checking-out-a-specific-branch)
   - [Excluding Files](#excluding-files)

---

## Features

- Clone any public GitHub repo to a local temp directory.
- Optionally specify a branch to clone (defaults to the repo’s default branch).
- Recursively detect all Markdown files or only those matching a specified RegExp filter (e.g., `docs/.*\.md`).
- Aggregate file contents into a single output string.
- Returns commit metadata (latest commit SHA, commit date, etc.).
- No external libraries required; just Bun and Git installed locally.

---

## Requirements

- Git must be installed on your system (for `git clone` commands to work).
- Bun (recommended version: v1.0+).
- A Mac, Linux, or Windows environment that can run Git commands from the shell.

---

## Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/sustanza/dumper.git
   ```

2. Install dependencies (if any, though the current example has none beyond the built-in libraries):

   ```bash
   cd dumper
   bun install
   ```

3. You can now run the CLI directly or compile it (see below).

---

## Usage

We have a simple command-line interface (`cli.ts`) that wraps the core library (`lib.ts`). By default, it clones a GitHub repository, searches for Markdown files (.md), and outputs the combined contents along with metadata.

### Basic Usage

To run the CLI (assuming you have Bun installed):

```bash
bun run src/cli.ts <GitHub_URL>
```

Example:

```bash
bun run src/cli.ts https://github.com/{repo}
```

Output:

- Metadata: A JSON-like output with username, repo, latest commit SHA, commit date.
- Output: The combined Markdown contents from the repository.

### Including Files

If you want to limit which Markdown files are processed, you can supply one or more regex patterns via the `--include` option, separated by commas. For example:

```bash
bun run src/cli.ts https://github.com/{repo} --include="docs/.*\.md, examples/.*\.md"
```

This will recursively search for `.md` files inside the `docs/` and `examples/` folders. If you need a more specific pattern, just adjust the RegExp accordingly.

### Checking Out a Specific Branch

If you want to clone a branch other than the default (e.g., `{branch}`), you must:

1. Provide a valid clone URL (e.g., `https://github.com/{repo}.git`, not the web `/tree/<branch>` URL).
2. Add `--branch=<branchName>`:

   ```bash
   bun run src/cli.ts https://github.com/{repo}.git --branch={branch}
   ```

Combine it with a filter if desired:

```bash
bun run src/cli.ts https://github.com/{repo}.git --branch={branch} --filter="docs/.*\.md"
```

### Excluding Files

If you want to skip certain files, pass an `--exclude` option with one or more RegExp patterns, separated by commas. For example:

```bash
bun run src/cli.ts https://github.com/{repo} --exclude="node_modules, test/.*\\.md"
```

You can specify multiple patterns in one argument or via multiple `--exclude` arguments, and any matching files will be excluded from the output.

### Example Usage

To clone a specific branch and filter Markdown files then dump it into a file, you can use the following command:

```bash
bun run src/cli.ts https://github.com/{username}/{repo}.git --branch={branch} --filter="docs/.*\.md" > dump.md
```
