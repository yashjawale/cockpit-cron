# Crontab file format

The plugin reads and writes ordinary crontab files (via `crontab -l` /
`crontab -`) and therefore must be compatible with the `cron` daemon. All
additional state is encoded as comment lines that cron ignores, and as
regular cron jobs where behaviour is needed.

## The managed region

Everything the plugin creates lives between two marker comments:

```
# BEGIN COCKPIT-CRON

<managed jobs>

# END COCKPIT-CRON
```

- The markers are recognized by `findManagedRegion()`; the first `BEGIN` and
  the first `END` after it delimit the region.
- Only the lines between the markers are ever modified. Any content outside
  of the region (manual jobs, `SHELL=`/`PATH=` assignments, comments) is
  preserved verbatim by every operation.
- For readability, the region is laid out with blank lines: one after the
  `BEGIN` marker, one after every job, and one before the `END` marker. The
  parser skips blank lines, so they do not affect the job list.
- A crontab without markers has no managed region: `readCronJobs()` reports
  no jobs, and all cron jobs in it are offered for import.

## A job entry

A job is stored as its schedule followed by its command on a single line:

```
0 4 * * 1 /usr/bin/backup
```

Optionally preceded by a display label comment, which is used as the row
title in the UI:

```
# @label Daily backup
0 4 * * 1 /usr/bin/backup
```

The label comment must sit directly above the job line. The `@log`,
`@skipuntil`, and `@token` comments that annotate a job likewise only apply
to the job directly below them; blank lines between a comment and its job
break the association, and `parseCrontab()` drops any pending annotation
state on blank lines.

### Disabled jobs

A disabled job is a commented-out job line:

```
# 0 4 * * 1 /usr/bin/backup
```

Toggling the enable switch comments or uncomments the job line in place.

## Environment variables

Environment variable assignments such as `SHELL=/bin/sh` are neither parsed
as jobs nor modified. They are preserved wherever they appear.

## Logging

When logging is enabled for a job, a `@log` comment above the job records the
log file path, and the command is wrapped so that all output is appended to
that file, each run prefixed with a marker line:

```
# @log /home/admin/.cache/cockpit-cron/abc123.log
0 4 * * 1 /bin/sh -c 'echo "=== run $(date -Iseconds) ==="; /usr/bin/backup' >> /home/admin/.cache/cockpit-cron/abc123.log 2>&1
```

- Log files live in `~/.cache/cockpit-cron` for user jobs and
  `/var/log/cockpit-cron` for system jobs.
- `loggingCommand()` / `unwrapLoggingCommand()` perform the wrapping in both
  directions. `date -Iseconds` is used instead of a `%`-format so that cron
  does not convert `%` characters into newlines.
- The log file belongs to the job: disabling logging or deleting the job
  removes the `@log` comment and deletes the log file.

## Special characters in commands

Cron treats a `%` in a command specially: an unescaped `%` is converted into
a newline, and everything after the first unescaped `%` is fed to the
command's standard input instead of being executed. The module therefore
escapes `%` as `\%` when storing a command and undoes that escaping for
display:

```
0 4 * * 1 /bin/echo 100\% loaded
```

- `escapePercent()` / `unescapePercent()` perform the escaping in both
  directions; an already escaped `\%` is left alone, so editing a command
  round-trips.
- The escaped form is what is stored in the crontab and what the parser
  reports as the job command; `displayCommand()` undoes the escaping (and the
  logging wrapper) for the UI.
- A `%` in a label comment is not an issue, because cron ignores comment
  lines entirely.

## Skip until

Skipping a job until a timestamp comments the job out and adds a resume job
plus the markers that link them:

```
# @skipuntil 2030-01-02T12:00
# @token abc123
# 0 4 * * 1 /usr/bin/backup
# @resume abc123
30 6 2 1 * sh -c 'crontab -l | ...'
```

- `@skipuntil` records the timestamp, `@token` links the job to its resume
  job, and `@resume` marks the generated resume job, which is hidden from the
  list.
- A `@label` or `@log` comment of a skipped job sits above the skip markers
  (i.e. above `@skipuntil`), so that the generated resume job still finds the
  commented-out job line right after its `@token` marker.
- The timestamp is the wall clock the user picked in the browser. The resume
  job's schedule is computed by converting that instant into the server's own
  timezone (`date -d @<epoch>`), so the job resumes at the intended moment
  even when the browser and the server use different timezones.
- Because the resume job is a plain five field schedule without a year, it
  fires on the next occurrence of the chosen month and day. The dialog
  therefore only accepts a date that *is* the next occurrence of its month
  and day (e.g. skipping until February 29 works, skipping until a date two
  years out does not), and shows a hint for dates it cannot honor.
- The resume job runs at the exact minute the skip ends and rewrites the
  crontab itself: it strips the skip markers and its own lines and
  uncomments the job, so the job runs again from then on. This works even
  when the Cockpit module is not running.
- Resuming manually from the UI does the same cleanup through
  `removeSkipState()`.

## Duplicate jobs

A crontab can hold several jobs with the same schedule and command. Each one
is parsed into a separate job with a unique `id` (`file:line`) and `line`, so
the UI shows them as distinct rows. Logging and skip until locate a job
differently in such cases:

- **Logging** edits the job line directly by its parsed `line`, so enabling or
  disabling logging always affects the exact job the user acted on, even when
  another job has the same schedule and command.
- **Skip until** re-locates the job by its content (schedule + command) because
  the skip markers shift line numbers. When two jobs are identical, that
  lookup matches the first one, so skipping or resuming the second duplicate
  affects the first. The row highlight for a skip change uses the same
  schedule + command key and therefore marks both rows.

## Schedule parsing

Schedules are validated and parsed with `isValidSchedule()` /
`parseSchedule()`, mirroring what cron accepts. In addition to plain numbers,
wildcards, steps, and numeric ranges, the day-of-week field accepts ranges of
day names such as `mon-fri` (also reversed or with a step), which cron allows.
Month name ranges such as `jan-mar` are not accepted by cron and therefore not
recognized either.

## Summary of annotation comments

| Comment | Meaning |
| --- | --- |
| `# @label <text>` | display label of the following job |
| `# @log <path>` | output of the following job is logged to `<path>` |
| `# @skipuntil <iso>` | the following job is skipped until the timestamp |
| `# @token <token>` | links the skipped job to its resume job |
| `# @resume <token>` | marks a generated resume job, hidden from the list |

The annotation comments are parsed leniently and may be written with several
leading `#` characters (e.g. `## @label backup`). The write path locates and
removes them the same way, so deleting a job, moving it on import, or
resuming a skipped job always takes its annotation comments along, regardless
of how many hashes they were written with.
