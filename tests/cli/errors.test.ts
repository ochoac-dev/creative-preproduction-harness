import { expect, it } from "vitest";
import * as cli from "../../src/cli.js";

it("explains how to initialize a missing project without a stack trace", () => {
  const error = Object.assign(new Error("ENOENT"), { code: "ENOENT", path: "/demo/.creative-preproduction/manifest.json" });
  expect(cli.formatCliError(error)).toContain("init");
  expect(cli.formatCliError(error)).not.toMatch(/\n\s+at /);
});
it("suggests doctor for a locked workspace", () => {
  expect(cli.formatCliError(new Error("Another writer is updating /demo/manifest.json. Retry after it completes."))).toContain("doctor");
});
it("preserves stack information only for debug output", () => {
  const error = new Error("Oops");
  expect(cli.formatCliError(error, true)).toContain(error.stack);
  expect(cli.formatCliError(error)).toBe("Error: Oops\n");
});
