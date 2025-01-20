import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

/**
 * Information about a repository.
 */
interface RepoInfo {
  owner: string;
  repo: string;
}

/**
 * Metadata about a repository, including commit SHA and date.
 */
interface RepoMetadata extends RepoInfo {
  sha: string;
  date: string;
}

/**
 * Options for generating repository documentation.
 */
interface GenerateRepoDocsOptions {
  include?: string | string[];
  branch?: string;
  exclude?: string | string[];
}

/**
 * Return type for the generateRepoDocs function.
 */
interface GenerateRepoDocsReturn {
  output: string;
  metadata: RepoMetadata;
}

/**
 * Generates documentation for a given repository, returning:
 * 1) Aggregated Markdown, with each file preceded by a header
 *    showing its relative path.
 * 2) Metadata including commit SHA and date.
 *
 * @param {string} repoUrl - The URL of the repository.
 * @param {GenerateRepoDocsOptions} [options={}] - Filtering and branching options.
 * @returns {Promise<GenerateRepoDocsReturn>} - The generated documentation and metadata.
 */
export async function generateRepoDocs(
  repoUrl: string,
  options: GenerateRepoDocsOptions = {}
): Promise<GenerateRepoDocsReturn> {
  const includePatterns = Array.isArray(options.include)
    ? options.include
    : options.include
    ? [options.include]
    : [];
  const includeRegexes = includePatterns.map((pat) => new RegExp(pat));

  const excludePatterns = Array.isArray(options.exclude)
    ? options.exclude
    : options.exclude
    ? [options.exclude]
    : [];
  const excludeRegexes = excludePatterns.map((pat) => new RegExp(pat));

  const { branch } = options;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoInfo = getRepoInfo(repoUrl);

  const tmpDir = await cloneRepo(repoUrl, branch);

  try {
    const { sha, date } = getRepoMetadata(tmpDir);
    const mdFiles = await findMarkdownFiles(
      tmpDir,
      includeRegexes,
      excludeRegexes
    );
    const output = await processFiles(mdFiles, tmpDir, repoInfo);
    await cleanup(tmpDir);

    return {
      output,
      metadata: { ...repoInfo, sha, date },
    };
  } catch (err) {
    await cleanup(tmpDir);
    throw err;
  }
}

/**
 * Clones a repository to a new temporary directory. Depth=1 is used for a lightweight clone.
 *
 * @param {string} url - The URL of the repository.
 * @param {string} [branch] - The branch to clone.
 * @returns {Promise<string>} - The path to the cloned repository directory.
 */
async function cloneRepo(url: string, branch?: string): Promise<string> {
  const randomName = "dumper-" + randomBytes(8).toString("hex");
  const directory = path.join(tmpdir(), randomName);

  const branchArg = branch ? `-b ${branch}` : "";
  execSync(`git clone --depth=1 ${branchArg} ${url} ${directory}`, {
    stdio: "inherit",
  });

  return directory;
}

/**
 * Extracts the GitHub username and repository name from a URL.
 *
 * @param {string} repoUrl - The URL of the repository.
 * @returns {RepoInfo} - The owner and repository name.
 * @throws {Error} - If the URL format is invalid.
 */
export function getRepoInfo(repoUrl: string): RepoInfo {
  const { pathname } = new URL(repoUrl);
  let cleaned = pathname.replace(/^\/+/, "");
  cleaned = cleaned.replace(/(\.git)?\/?$/, "");
  const [owner, repo] = cleaned.split("/");
  if (!owner || !repo) {
    throw new Error(`Could not parse owner/repo from URL: ${repoUrl}`);
  }
  return { owner, repo };
}

/**
 * Gets the latest commit SHA and date from a cloned repository directory.
 *
 * @param {string} tmpDir - The local path to the cloned repository.
 * @returns {{ sha: string; date: string }} - The commit SHA and date.
 */
function getRepoMetadata(tmpDir: string): { sha: string; date: string } {
  const sha = execSync(`git rev-parse HEAD`, { cwd: tmpDir }).toString().trim();
  const date = execSync(`git log -1 --format=%cd HEAD`, { cwd: tmpDir })
    .toString()
    .trim();

  return { sha, date };
}

/**
 * Recursively finds markdown files in a directory, optionally filtered by a RegExp.
 *
 * @param {string} dir - Directory to search.
 * @param {RegExp[]} includeRegexes - An array of regexes for filtering file paths.
 * @param {RegExp[]} excludeRegexes - An array of regexes for excluding file paths.
 * @returns {Promise<string[]>} - A list of matching file paths.
 */
async function findMarkdownFiles(
  dir: string,
  includeRegexes: RegExp[],
  excludeRegexes: RegExp[]
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (
          ((includeRegexes.length > 0 &&
            includeRegexes.some((rx) => rx.test(fullPath))) ||
            (includeRegexes.length === 0 &&
              fullPath.toLowerCase().endsWith(".md"))) &&
          !excludeRegexes.some((ex) => ex.test(fullPath))
        ) {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Combines the content of all markdown files, placing a markdown header
 * before each file showing its path relative to the repository root.
 *
 * @param {string[]} files - List of markdown file paths.
 * @param {string} baseDir - The base directory of the repository clone.
 * @param {RepoInfo} repoInfo - The repository owner and name.
 * @returns {Promise<string>} - The combined markdown content.
 */
async function processFiles(
  files: string[],
  baseDir: string,
  repoInfo: RepoInfo
): Promise<string> {
  let combinedOutput = `# Documentation for ${repoInfo.owner}/${repoInfo.repo}\n`;

  for (const filePath of files) {
    const relativePath = path.relative(baseDir, filePath);
    const content = await fs.readFile(filePath, "utf8");
    combinedOutput += `\n## ${relativePath}\n\n${content}\n`;
  }

  return combinedOutput.trim();
}

/**
 * Removes the temporary directory for a cloned repository.
 *
 * @param {string} dir - The temporary directory path.
 */
async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
