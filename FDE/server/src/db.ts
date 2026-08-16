import Database from "better-sqlite3";
import path from "node:path";
import { repositoryRoot } from "./config.js";

const configuredPath = process.env.KESTREL_DB_PATH ?? "data/kestrel_ops.db";
const dbPath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(repositoryRoot, configuredPath);

export const db = new Database(dbPath, { readonly: true, fileMustExist: true });
db.pragma("query_only = ON");
db.pragma("busy_timeout = 3000");

export function assertReadOnly(): void {
  const mode = db.pragma("query_only", { simple: true });
  if (mode !== 1) throw new Error("Analytics database is not query-only");
}
