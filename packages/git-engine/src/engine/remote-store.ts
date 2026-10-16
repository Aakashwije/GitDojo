import git from "isomorphic-git";
import { hasErrorCode } from "../filesystem/fs-errors";
import { type GitContext } from "./context";
import { type GitRemoteInfo } from "./git-engine";

/**
 * GitDojo's remotes are simulated, so nothing ever leaves the browser. A remote is:
 *
 * - a normal `[remote "<name>"]` entry in `.git/config` (so `git remote -v` works as usual), and
 * - the branches its pretend server has, kept in `.git/GITDOJO_REMOTES.json`.
 *
 * The server shares the workspace's object database: commits pushed "to the server" are already
 * stored locally, and commits "only on the server" are stored but reachable from no local ref.
 * That is invisible to the learner, because only refs decide what history Git shows: until a
 * `git fetch` moves `origin/main`, nothing in the repository reaches the server's new commits.
 */
interface RemoteStoreRecord {
  /** Remote name → its branches on the server (branch name → commit). */
  remotes: Record<string, { branches: Record<string, string> }>;
}

const STORE_FILE = "GITDOJO_REMOTES.json";

/** The URL scheme makes the simulation boundary obvious in every `git remote -v` and fetch. */
export function simulatedRemoteUrl(name: string): string {
  return `gitdojo://simulated/${name}.git`;
}

function storePath(ctx: GitContext): string {
  return `${ctx.dir}/.git/${STORE_FILE}`;
}

async function readStore(ctx: GitContext): Promise<RemoteStoreRecord> {
  try {
    const raw = await ctx.fs.promises.readFile(storePath(ctx), { encoding: "utf8" });
    const parsed = JSON.parse(
      typeof raw === "string" ? raw : new TextDecoder().decode(raw),
    ) as RemoteStoreRecord;
    return { remotes: parsed.remotes };
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return { remotes: {} };
    throw error;
  }
}

async function writeStore(ctx: GitContext, store: RemoteStoreRecord): Promise<void> {
  await ctx.fs.promises.writeFile(storePath(ctx), JSON.stringify(store), "utf8");
}

/** Every configured remote with its server's branches, sorted by name. */
export async function readRemotes(ctx: GitContext): Promise<GitRemoteInfo[]> {
  const [configured, store] = await Promise.all([
    git.listRemotes({ fs: ctx.fs, dir: ctx.dir }),
    readStore(ctx),
  ]);
  return configured
    .map(({ remote, url }) => ({
      name: remote,
      url,
      branches: Object.entries(store.remotes[remote]?.branches ?? {})
        .map(([name, oid]) => ({ name, oid }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function findRemote(ctx: GitContext, name: string): Promise<GitRemoteInfo | null> {
  return (await readRemotes(ctx)).find((remote) => remote.name === name) ?? null;
}

/** Creates a simulated remote, with no branches yet. */
export async function addSimulatedRemote(ctx: GitContext, name: string, url: string) {
  await git.addRemote({ fs: ctx.fs, dir: ctx.dir, remote: name, url, force: true });
  const store = await readStore(ctx);
  store.remotes[name] ??= { branches: {} };
  await writeStore(ctx, store);
}

/** Moves (or creates) a branch on the simulated server. */
export async function writeRemoteBranch(
  ctx: GitContext,
  remote: string,
  branch: string,
  oid: string,
): Promise<void> {
  const store = await readStore(ctx);
  const entry = (store.remotes[remote] ??= { branches: {} });
  entry.branches[branch] = oid;
  await writeStore(ctx, store);
}
