# Architecture

Cockpit Cron is a [Cockpit](https://cockpit-project.org/) module for managing
cron jobs. It is served by the Cockpit bridge under the `/cron` URL and
consists of a React/PatternFly single-page application that reads and writes
the crontab files of the current user (`crontab -l`) or of root
(`crontab -u root`).

## Layers

The module is split into three layers, which keeps the non-trivial parsing
logic free of any Cockpit dependency and therefore easily unit-testable.

### User interface

| File | Responsibility |
| --- | --- |
| `src/index.tsx` | entry point, mounts `Application` into `#app` |
| `src/app.tsx` | top level component; owns the selected level, the filter, and all open dialogs; coordinates reloads |
| `src/components/CronJobsToolbar.tsx` | "Add job" button, job filter, system/user level switcher |
| `src/components/CronJobsList.tsx` | loads the jobs for the current level and renders them as a data list |
| `src/components/CronJobRow.tsx` | a single job row: enable switch, title/schedule, kebab menu with the per-job actions |
| `src/components/AddCronJobDialog.tsx` | add and edit dialog with schedule presets and custom schedule validation |
| `src/components/DeleteCronJobDialog.tsx` | delete confirmation dialog |
| `src/components/ImportCronJobsAlert.tsx` | alert at the top of the page offering to import unmanaged jobs |
| `src/components/SkipUntilDialog.tsx` | "skip until" dialog and resume action |
| `src/components/CronJobLogs.tsx` | expandable log viewer for jobs with logging enabled |
| `src/components/PruneLogsDialog.tsx` | confirmation dialog for deleting a job's log file |
| `src/components/LevelSwitcher.tsx` | system/user level switcher buttons |

All UI state is local to `Application` and its children; there is no central
store. A `reload` counter is bumped after every write so that the list and the
import alert refetch the crontab.

### Service layer

`src/cron.tsx` contains every operation the UI can trigger. It reads the raw
crontab contents with `crontab -l`, manipulates them as an array of lines, and
writes them back by feeding the result to `crontab -` on stdin. All spawning
goes through `cockpit.spawn()`; system-level operations request
`superuser: "require"` so Cockpit prompts for administrative access.

The exported operations are `readCronJobs`, `readImportableJobs`,
`addCronJob`, `updateCronJob`, `deleteCronJob`, `setCronJobEnabled`,
`setCronJobSkipUntil`, `setCronJobLogging`, `pruneCronJobLog`, and
`readCronJobLogs`. The list and data model live in `cron-parser.ts`, see
below.

### Parsing layer

`src/cron-parser.ts` is a pure module (no `cockpit` import) that contains the
data model and all crontab text handling:

- the `CronLevel`, `CronJob` and `ManagedRegion` types;
- the delimiter markers and `findManagedRegion()`;
- `parseCrontab()`, a region-aware parser that turns crontab lines into
  `CronJob` objects, including labels, log files and skip state;
- `parseImportableJobs()`, which finds cron jobs outside of the managed
  region for the import feature;
- `isValidSchedule()`, the schedule validation used by the add/edit dialog.

## Data model

A `CronJob` describes one job as found in a crontab: its `schedule` (five
fields or a `@period` keyword), its `command`, whether it is `enabled`, an
optional `label`, the one-based `line` it was parsed from, and - depending on
the enabled features - a `logFile`, a `skipUntil` timestamp and a `skipToken`.
Line numbers always refer to the full crontab file and are used to locate a
job for in-place edits.

`CronLevel` selects between the current user's crontab (`user`) and root's
crontab (`system`).

## Key design decisions

### The managed region

To avoid clobbering manually maintained crontabs, the plugin only owns the
lines between the `# BEGIN COCKPIT-CRON` and `# END COCKPIT-CRON` markers.
Everything outside of that region is never rewritten, so hand-written jobs,
environment variables and comments survive any operation. `readCronJobs()`
returns only the jobs inside the region; jobs outside of it are reported
separately by `readImportableJobs()` and offered for import through an alert.
See [crontab-format.md](crontab-format.md) for the exact on-disk layout.

### Surgical edits instead of region rebuilds

The skip-until and logging features store state *inside* the managed region:
annotation comments (`@skipuntil`, `@token`, `@log`) and a generated resume
job that re-enables a skipped job at its end time. Rewriting the region from
the parsed jobs would drop all of that, so every write is done as a surgical,
line-based edit that touches only the lines belonging to the affected job
(plus its label, markers, resume job, and one surrounding blank line for
readability). This preserves the other jobs' annotation state and keeps
line numbers stable for the optimistic UI toggles.

### Content-based lookup

Because markers can be added or removed, a job's line number can shift between
parses. Operations that must find a job by content (`findJobLine()`) match the
reconstructed `schedule command` line, also accepting a commented-out prefix,
which makes them robust to such shifts.

### Logging and skip-until are "cron-native"

Both features encode their state as ordinary cron constructs:

- logging wraps the command so output is appended to a per-job log file, with
  a marker line per run (see `loggingCommand()` / `unwrapLoggingCommand()`);
- skip-until comments the job out and adds a resume job that, when cron runs
  it, strips the skip markers and re-enables the job (see `resumeCommand()`).

This means the state survives even if the Cockpit module is not running; cron
itself performs the resumption.
