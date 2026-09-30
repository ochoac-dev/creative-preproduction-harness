# Workspace recovery

Start with `npm run cli -- doctor --root ./website`. This inspection does not replay journals, save a manifest, or release a lock. Add `--recover-lock` only to request recovery of a recorded, provably dead local process. A live PID, another hostname, incomplete metadata, or a changed lock identity prevents recovery.

## Legacy empty locks and uncertain recovery markers

Older releases could leave an empty `.creative-preproduction/manifest.json.lock`. There is no owner to verify, so automatic recovery deliberately refuses it. A `.creative-preproduction/manifest.json.lock.recovery` file can likewise remain after an interrupted recovery.

1. Stop all harness commands using this project, including commands on other hosts if the directory is shared. Establish that no writer or recovery process is still running. If that cannot be established, leave the lock in place.
2. Back up the entire `.creative-preproduction/` directory, including private files, the manifest, lock files, and any asset transaction journal. Keep this backup private.
3. Inspect the lock or recovery marker and the circumstances of the interruption. Preserve a copy of the specific stale file before manually removing only that confirmed abandoned lock or marker. Do not remove the manifest, private workspace, or transaction journals, and do not remove anything merely because it is old.
4. Run `doctor` again. Once the workspace is unlocked, run `status` and `validate`. Normal project access can replay an outstanding asset transaction; report any remaining diagnostics before continuing work.

For missing or unsafe files, restore a separate regular file inside the project and outside private storage, or register a new artifact revision at a distinct path. Symlinked files/parents and hardlinks to private bytes cannot be used as project-visible evidence. Existing records receive diagnostics; recovery does not silently rewrite them or replace their approvals.
