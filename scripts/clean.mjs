import { lstat, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Resolve from this script, never the caller's current directory or user input.
const output = fileURLToPath(new URL("../dist", import.meta.url));
try {
  const stat = await lstat(output);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("Refusing to clean dist: expected an ordinary build-output directory.");
  }
  await rm(output, { recursive: true, force: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
