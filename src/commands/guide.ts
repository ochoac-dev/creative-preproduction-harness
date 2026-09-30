import type { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { GuideCancelledError, runGuide, type ExecuteGuideCommand } from "../guidance/guide.js";

export function registerGuideCommand(program: Command, execute: ExecuteGuideCommand): void {
  program.command("guide").description("Draft or import documents and follow the workflow interactively")
    .option("--root <path>","website repository",".")
    .action(async (options) => {
      const interactive = Boolean(stdin.isTTY && stdout.isTTY);
      if (!interactive) { await runGuide(options.root,{isInteractive:false,ask:async()=>"",write:text=>{stdout.write(text);}},execute); return; }
      const terminal = createInterface({input:stdin,output:stdout});
      const abort = new AbortController();
      terminal.on("SIGINT",()=>abort.abort());
      terminal.on("close",()=>abort.abort());
      try {
        await runGuide(options.root,{
          isInteractive:true,write:text=>{stdout.write(text);},
          ask:async prompt=>{
            if (abort.signal.aborted) throw new GuideCancelledError();
            return terminal.question(prompt,{signal:abort.signal});
          }
        },execute);
      } finally { terminal.close(); }
    });
}
