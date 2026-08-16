import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));

// `sourceDirectory` is server/src in development and server/dist after build.
// In both cases the repository root is two levels above it.
export const repositoryRoot = path.resolve(sourceDirectory, "../..");

dotenv.config({ path: path.join(repositoryRoot, ".env"), quiet: true });
