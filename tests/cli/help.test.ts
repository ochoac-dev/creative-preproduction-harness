import { describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli.js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { isDirectExecution } from "../../src/cli.js";

describe("CLI help", () => {
  it("identifies the harness without promising creative scores", () => {
    const help = createProgram().helpInformation();
    expect(help).toContain("creative preproduction");
    expect(help.toLowerCase()).not.toContain("score");
  });

  it("exposes collaboration record commands", () => {
    const program = createProgram();
    const commandHelp = (name: string) => program.commands.find((command) => command.name() === name)?.helpInformation() ?? "";
    const subcommandHelp = (parent: string, child: string) => program.commands
      .find((command) => command.name() === parent)
      ?.commands.find((command) => command.name() === child)
      ?.helpInformation() ?? "";

    expect(commandHelp("participant")).toContain("add");
    expect(commandHelp("participant")).toContain("own");
    expect(commandHelp("asset")).toContain("add");
    expect(commandHelp("asset")).toContain("update");
    expect(commandHelp("feedback")).toContain("import");
    expect(commandHelp("feedback")).toContain("resolve");
    for (const command of ["questions", "explore-private", "promote", "review"]) {
      expect(program.helpInformation()).toContain(command);
    }
    expect(commandHelp("questions")).toContain("Usage: creative-preproduction questions");
    for (const [help, options] of [
      [subcommandHelp("participant", "add"), ["--id <slug>", "--name <name>", "--role <role>"]],
      [subcommandHelp("participant", "own"), ["--area <area>", "--participant <id>"]],
      [subcommandHelp("asset", "add"), ["--id <slug>", "--title <title>", "--source <description>", "--role <description>", "--modification <policy>", "--rights <status>", "--path <path>", "--responsive <guidance>", "--accessibility <intent>", "--creator <name>", "--owner <participant-id>", "--provider <scope>", "--allow <treatment>", "--prohibit <treatment>"]],
      [subcommandHelp("asset", "update"), ["--id <slug>", "--rights <status>", "--provider <scope>", "--path <path>"]],
      [subcommandHelp("feedback", "import"), ["--id <slug>", "--file <path>", "--message <text>", "--source <description>", "--class <classification>", "--interpretation <text>", "--target-kind <kind>", "--target-id <id>", "--target-version <number>", "--author <name>"]],
      [subcommandHelp("feedback", "resolve"), ["--id <slug>", "--resolution <text>", "--artifact <id>"]],
      [commandHelp("explore-private"), ["--id <slug>", "--title <title>", "--question <text>", "--rationale <text>", "--asset <id>", "--assumption <text>", "--note <text>"]],
      [commandHelp("promote"), ["--artifact <id>", "--version <number>", "--path <project-relative-path>", "--rationale <text>"]],
      [commandHelp("review"), ["--artifact <id>", "--version <number>", "--tier <tier>", "--decision <decision>", "--reviewer <name>", "--reviewer-id <participant-id>", "--reason <text>"]],
      [commandHelp("questions"), []]
    ] as const) {
      for (const option of [...options, "--root <path>", "--help"]) {
        expect(help).toContain(option);
      }
    }
  });
});

describe("CLI entrypoint detection", () => {
  const executablePath = resolve("dist/src/cli.js");
  const moduleUrl = pathToFileURL(executablePath).href;

  it("recognizes a Windows-form executable path", () => {
    expect(isDirectExecution(moduleUrl, executablePath)).toBe(true);
  });

  it("recognizes a POSIX-form executable path", () => {
    const posixPath = executablePath.replaceAll("\\", "/");
    expect(isDirectExecution(moduleUrl, posixPath)).toBe(true);
  });
});
