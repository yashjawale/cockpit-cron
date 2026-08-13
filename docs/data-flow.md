# Data flow

This document describes how the module reads and writes crontabs and how the
individual operations keep the file consistent.

## Reading

All reads go through `crontab -l` (`crontabCommand(level, write=false)`),
which for system level becomes `crontab -l -u root` with
`superuser: "require"`. If no crontab exists yet (or `crontab` is not
installed), the read fails and is treated as an empty crontab.

Two views of the crontab are derived from the same raw content:

- `readCronJobs()` locates the managed region with `findManagedRegion()` and
  parses only the lines between the markers with `parseCrontab()`. If there
  is no region, the result is empty.
- `readImportableJobs()` parses everything outside of the region with
  `parseImportableJobs()`, which masks the region lines and reports the
  remaining cron jobs together with their original line numbers. This drives
  the import alert.

## Writing

Every write rebuilds the full crontab contents in memory and pipes them to
`crontab -` on stdin (`crontabCommand(level, write=true)`). The outside
content is never regenerated: each operation only splices the lines that
belong to the affected job.

| Operation | What it does |
| --- | --- |
| `addCronJob()` | inserts the new job (with optional `@label`) just before the `END` marker, or creates the whole region if none exists yet |
| `updateCronJob()` | rewrites the job line and its label in place, keeping the disabled/comment prefix and re-applying the logging wrapper if the job is logged |
| `deleteCronJob()` | removes the job line, its label, any skip markers and resume job, and one adjacent blank line |
| `setCronJobEnabled()` | comments or uncomments the job line in place |
| `setCronJobSkipUntil()` | replaces the job line with the skip markers, the commented job, and a resume job |
| `setCronJobLogging()` | wraps the command, adds the `@log` comment, and creates the log directory |

The annotation state of *other* jobs (labels, `@log`, `@skipuntil`/`@token`,
resume jobs) is never touched by an unrelated edit, because the edits are
surgical and line-based.

### Line numbers and stability

Parsed jobs carry their one-based `line` in the full file. Most operations
locate a job with `job.line - 1`; in-place edits (enable/disable, logging)
keep that line stable, which is what allows the UI's optimistic toggle to
work without a reload. Operations that have to tolerate shifted line numbers
(e.g. after skip markers were added or removed) match the job by content
instead, see `findJobLine()` in `cron.tsx`.

After any dialog-driven change (add, edit, delete, skip, prune) the UI bumps
a `reload` counter so the list and the import alert refetch and the parsed
line numbers are fresh again.

## Import flow

Importing moves existing, unmanaged jobs into the managed region:

1. `parseImportableJobs()` collects the jobs outside of the region.
2. For each job, `jobEntryIndexes()` gathers the lines that belong to it:
   the job line, its `@label`, and for a skipped job the `@skipuntil`/`@token`
   markers and the generated resume job.
3. Those lines are removed from the outside content and re-inserted between
   the delimiter markers, separated by blank lines (creating the region if
   the crontab had none).
4. Everything that is not a cron job - environment variables, comments,
   non-cron lines - stays in place.

After the write the import alert disappears because no importable jobs
remain, and the moved jobs appear in the list.
