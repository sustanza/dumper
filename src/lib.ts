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
  filter?: string;
  branch?: string;
}

/**
 * Return type for the generateRepoDocs function.
 */
interface GenerateRepoDocsReturn {
  output: string;
  metadata: RepoMetadata;
}

/**
 * Generates documentation for a given repository.
 *
 * @param {string} repoUrl - The URL of the repository.
 * @param {GenerateRepoDocsOptions} [options={}] - Options for generating documentation.
 * @returns {Promise<GenerateRepoDocsReturn>} - The generated documentation and metadata.
 */
export async function generateRepoDocs(
  repoUrl: string,
  options: GenerateRepoDocsOptions = {}
): Promise<GenerateRepoDocsReturn> {
  const filterRegex = options.filter ? new RegExp(options.filter) : null;
  const { branch } = options;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoInfo = getRepoInfo(repoUrl);

  // Pass the branch along
  const tmpDir = await cloneRepo(repoUrl, __dirname, branch);

  try {
    const { sha, date } = getRepoMetadata(tmpDir);
    const mdFiles = await findMarkdownFiles(tmpDir, filterRegex);
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
 * Clones a repository to a temporary directory.
 *
 * @param {string} url - The URL of the repository.
 * @param {string} baseDir - The base directory for cloning.
 * @param {string} [branch] - The branch to clone.
 * @returns {Promise<string>} - The path to the cloned repository.
 * @throws {Error} - If the repository cannot be cloned.
 */
async function cloneRepo(
  url: string,
  baseDir: string,
  branch?: string
): Promise<string> {
  const randomName = "dumper-" + randomBytes(8).toString("hex");
  const tmpDir = path.join(tmpdir(), randomName);

  // If a branch is specified, add `-b branchName`
  const branchArg = branch ? `-b ${branch}` : "";
  try {
    execSync(`git clone --depth=1 ${branchArg} ${url} ${tmpDir}`, {
      stdio: "inherit",
    });
  } catch (err: any) {
    throw new Error(
      `Failed to clone branch '${branch || "default"}': ${err.message}`
    );
  }

  return tmpDir;
}

/**
 * Extracts the GitHub username and repository name from a URL.
 *
 * @param {string} repoUrl - The URL of the repository.
 * @returns {RepoInfo} - The owner and repository name.
 * @throws {Error} - If the URL cannot be parsed.
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
 * @param {string} tmpDir - The path to the cloned repository.
 * @returns {{ sha: string; date: string }} - The commit SHA and date.
 */
function getRepoMetadata(tmpDir: string): { sha: string; date: string } {
  // Grab the latest commit SHA
  const sha = execSync(`git rev-parse HEAD`, { cwd: tmpDir }).toString().trim();

  // Grab the date of the latest commit
  const date = execSync(`git log -1 --format=%cd HEAD`, { cwd: tmpDir })
    .toString()
    .trim();

  return { sha, date };
}

/**
 * Recursively finds all .md files in a directory (or any filter pattern).
 *
 * @param {string} dir - The directory to search.
 * @param {RegExp | null} filterRegex - A regex to filter files.
 * @returns {Promise<string[]>} - A list of matching file paths.
 */
async function findMarkdownFiles(
  dir: string,
  filterRegex: RegExp | null
): Promise<string[]> {
  const results: string[] = [];

  // A simple recursive function to walk the directory structure
  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Recurse into subdirectory
        await walk(fullPath);
      } else {
        // Check if it's a .md file (or pass the filterRegex)
        if (
          (filterRegex && filterRegex.test(fullPath)) ||
          (!filterRegex && fullPath.toLowerCase().endsWith(".md"))
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
 * Processes the markdown files and combines their content.
 *
 * @param {string[]} files - The list of markdown files.
 * @param {string} baseDir - The base directory of the repository.
 * @param {RepoInfo} repoInfo - Information about the repository.
 * @returns {Promise<string>} - The combined content of the markdown files.
 */
async function processFiles(
  files: string[],
  baseDir: string,
  repoInfo: RepoInfo
): Promise<string> {
  let combinedOutput = `# Documentation for ${repoInfo.owner}/${repoInfo.repo}\n\n`;

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    const relativePath = path.relative(baseDir, file);
    combinedOutput += `\n\n---\n**${relativePath}**:\n\n${content}\n`;
  }

  return combinedOutput;
}

/**
 * Removes the cloned repository's temporary directory.
 *
 * @param {string} dir - The path to the temporary directory.
 * @returns {Promise<void>}
 */
async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
