/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import cockpit from 'cockpit';

import {
    BEGIN_MARKER,
    END_MARKER,
    findManagedRegion,
    parseCrontab,
    parseImportableJobs,
    type CronJob,
    type CronLevel,
} from "./cron-parser";

export type { CronJob, CronLevel } from "./cron-parser";

/**
 * The crontab command to read or write a crontab, including the level
 * specific arguments and options.
 */
interface CrontabCommand {
    /** arguments for reading or writing the crontab */
    args: string[];
    /** options for the spawn command */
    options?: { superuser?: "require" };
}

/**
 * Build the crontab command for reading or writing the crontab of the given
 * level. Writing reads the crontab contents from stdin, which is indicated
 * by a trailing "-" argument.
 *
 * @param level - which set of crontabs to operate on
 * @param write - whether to write the crontab instead of reading it
 */
function crontabCommand(level: CronLevel, write: boolean): CrontabCommand {
    if (level === "system") {
        if (write)
            return { args: ["crontab", "-u", "root", "-"], options: { superuser: "require" } };
        return { args: ["crontab", "-l", "-u", "root"], options: { superuser: "require" } };
    }

    const cmd: CrontabCommand = { args: write ? ["crontab", "-"] : ["crontab", "-l"] };
    return cmd;
}

/**
 * Read the raw contents of the crontab for the given level.
 *
 * @param level which set of crontabs to read
 * @returns a promise for the raw crontab contents, empty if the crontab does
 *     not exist yet
 * @throws if reading the crontab failed for any other reason, e.g. missing
 *     permissions, cron being denied for the user, or cron not being installed
 */
async function readCrontabContent(level: CronLevel): Promise<string> {
    const { args, options } = crontabCommand(level, false);
    try {
        return await cockpit.spawn(args, options);
    } catch (error) {
        // A user without a crontab gets "crontab: no crontab for <user>",
        // which is normal and means there are no jobs yet. Any other failure
        // is a real problem and is passed on, so that the UI can report it
        // instead of hiding it behind an empty job list.
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("no crontab"))
            return "";
        throw error;
    }
}

/**
 * Write the given raw contents to the crontab of the given level.
 *
 * @param level which set of crontabs to write
 * @param content the full crontab contents to write
 */
async function writeCrontabContent(level: CronLevel, content: string): Promise<void> {
    const { args, options } = crontabCommand(level, true);
    await cockpit.spawn(args, options).input(content);
}

/**
 * Read the cron jobs of the given level that are managed by this plugin, i.e.
 * the jobs between the delimiter markers. Jobs outside of the markers are not
 * reported here, see {@link readImportableJobs}.
 *
 * @param level which set of crontabs to read
 * @returns a promise for the list of managed jobs, empty if the crontab does
 *     not exist or has no managed region
 */
export async function readCronJobs(level: CronLevel): Promise<CronJob[]> {
    const content = await readCrontabContent(level);
    const file = level === "system" ? "root crontab" : "user crontab";
    const region = findManagedRegion(content.split("\n"));
    if (region === null)
        return [];
    return parseCrontab(content, file, region);
}

/**
 * Read the cron jobs of the given level that are not managed by this plugin,
 * i.e. found outside of the delimiter markers.
 *
 * @param level which set of crontabs to read
 * @returns a promise for the list of found importable jobs
 */
export async function readImportableJobs(level: CronLevel): Promise<CronJob[]> {
    const content = await readCrontabContent(level);
    const file = level === "system" ? "root crontab" : "user crontab";
    return parseImportableJobs(content, file, findManagedRegion(content.split("\n")));
}

/**
 * Append a new managed region, delimited by the begin and end markers, to the
 * given crontab lines, with the given job entry separated from the markers by
 * blank lines. A trailing empty line of the file is preserved.
 */
function appendManagedRegion(lines: string[], entry: string[]): void {
    const trailing = lines.length > 0 && lines[lines.length - 1] === "" ? lines.pop() : undefined;
    lines.push(BEGIN_MARKER, "", ...entry, "", END_MARKER);
    if (trailing !== undefined)
        lines.push("");
}

/**
 * Add a cron job to the crontab of the given level.
 *
 * Inserts the new job into the managed region between the delimiter markers,
 * creating the region if the crontab has none yet. Existing jobs outside of
 * the region are left untouched. Adding system level jobs requires
 * administrative access.
 *
 * @param level which set of crontabs to modify
 * @param schedule the schedule of the new job, either five fields or a
 *     "@period" keyword
 * @param command the command the new job runs
 */
export async function addCronJob(
    level: CronLevel,
    schedule: string,
    command: string,
    label?: string
): Promise<void> {
    const content = await readCrontabContent(level);
    const lines = content.split("\n");
    const entry = label ? [`# @label ${label}`, `${schedule} ${command}`] : [`${schedule} ${command}`];

    const region = findManagedRegion(lines);
    if (region !== null)
        lines.splice(region.end, 0, ...entry, "");
    else
        appendManagedRegion(lines, entry);

    await writeCrontabContent(level, lines.join("\n"));
}

/**
 * Import the cron jobs of the given level that live outside of the managed
 * region into it, moving their job and label lines between the delimiter
 * markers.
 *
 * Everything that is not a cron job stays in place, so manually maintained
 * crontab entries are preserved. Importing system level jobs requires
 * administrative access.
 *
 * @param level which set of crontabs to modify
 */
export async function importCronJobs(level: CronLevel): Promise<void> {
    const content = await readCrontabContent(level);
    const lines = content.split("\n");
    const file = level === "system" ? "root crontab" : "user crontab";

    const region = findManagedRegion(lines);
    const importable = parseImportableJobs(content, file, region);
    if (importable.length === 0)
        return;

    // the lines that belong to the importable jobs, including their labels,
    // skip markers and generated resume jobs
    const move = new Set<number>();
    importable.forEach(job => {
        jobEntryIndexes(lines, job).forEach(index => move.add(index));
    });

    // the lines that stay outside of the managed region
    const outside = lines.filter((_, index) => !move.has(index));

    // the job entry lines moved into the region, separated by blank lines
    const block: string[] = [];
    importable.forEach((job, jobIndex) => {
        jobEntryIndexes(lines, job).forEach(index => block.push(lines[index]));
        if (jobIndex < importable.length - 1)
            block.push("");
    });

    const outsideRegion = findManagedRegion(outside);
    if (outsideRegion !== null)
        outside.splice(outsideRegion.end, 0, ...block, "");
    else
        appendManagedRegion(outside, block);

    await writeCrontabContent(level, outside.join("\n"));
}

/**
 * Whether a crontab content has been parsed from a leading hash comment.
 */
function isCommented(line: string): boolean {
    return line.trim().startsWith("#");
}

/**
 * Whether a crontab line is one of the skip markers that sit above a skipped
 * job, i.e. its "@skipuntil" or "@token" comment.
 */
function isSkipMarker(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith("# @skipuntil ") || trimmed.startsWith("# @token ");
}

/**
 * The index at which a comment line above the given job line belongs, i.e.
 * directly above the job or, for a skipped job, above its skip markers, so
 * that the generated resume job keeps finding the job line right after the
 * "@token" marker.
 *
 * @param lines - the crontab lines
 * @param jobIndex - the zero based index of the job line
 * @returns the zero based index at which to insert the comment
 */
function commentInsertIndex(lines: string[], jobIndex: number): number {
    let insertAt = jobIndex;
    while (insertAt > 0 && isSkipMarker(lines[insertAt - 1]))
        insertAt--;
    return insertAt;
}

/**
 * The zero based line indexes of the given job's entry, i.e. its job line,
 * its label comment, and for a skipped job its skip markers and generated
 * resume job.
 *
 * @param lines - the crontab lines
 * @param job - the job to look up
 * @returns the line indexes of the job entry, in ascending order
 */
function jobEntryIndexes(lines: string[], job: CronJob): number[] {
    const indexes: number[] = [];

    const jobIndex = jobLineIndex(lines, job);
    if (jobIndex !== -1)
        indexes.push(jobIndex);
    const labelIndex = findLabelLine(lines, job, jobIndex);
    if (labelIndex !== -1)
        indexes.push(labelIndex);
    const logIndex = findLogLine(lines, job, jobIndex);
    if (logIndex !== -1)
        indexes.push(logIndex);

    if (job.skipToken !== undefined) {
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed === `# @token ${job.skipToken}`) {
                indexes.push(i);
                if (lines[i - 1]?.trim().startsWith("# @skipuntil "))
                    indexes.push(i - 1);
            }
            if (trimmed === `# @resume ${job.skipToken}`) {
                indexes.push(i);
                if (i + 1 < lines.length)
                    indexes.push(i + 1);
            }
        }
    }

    return indexes.sort((a, b) => a - b);
}

/**
 * Find the line a job was parsed from, regardless of whether it is commented
 * out or had its skip markers removed. Falls back to matching by content, so
 * it also finds jobs whose line numbers shifted since the last parse.
 *
 * @param lines - the crontab lines
 * @param job - the job to look up
 * @returns the zero based index of the job line, or -1 if it was not found
 */
function findJobLine(lines: string[], job: CronJob): number {
    const target = `${job.schedule} ${job.command}`;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].replace(/^#+\s*/, "") === target)
            return i;
    }
    return -1;
}

/**
 * The zero based index of the line a job was parsed from. Uses the job's
 * unique line number, so that it targets the exact job even when another job
 * has the same schedule and command. Falls back to a content search only if
 * the line number is out of date.
 *
 * @param lines - the crontab lines
 * @param job - the job to look up
 * @returns the zero based index of the job line, or -1 if it was not found
 */
function jobLineIndex(lines: string[], job: CronJob): number {
    const target = `${job.schedule} ${job.command}`;
    const index = job.line - 1;
    if (index >= 0 && index < lines.length && lines[index].replace(/^#+\s*/, "") === target)
        return index;
    return findJobLine(lines, job);
}

/**
 * Find the "@label" comment directly above a job line, skipping over any
 * skip markers in between.
 *
 * @param lines - the crontab lines
 * @param job - the job to look up
 * @param jobIndex - the zero based index of the job line
 * @returns the zero based index of the label comment, or -1 if there is none
 */
function findLabelLine(lines: string[], job: CronJob, jobIndex: number): number {
    for (let i = jobIndex - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed === `# @label ${job.label}`)
            return i;
        if (trimmed.startsWith("# @skipuntil ") || trimmed.startsWith("# @token "))
            continue;
        break;
    }
    return -1;
}

/**
 * Find the "@log" comment directly above a job line, skipping over any skip
 * markers in between, so that the log comment is removed or moved together
 * with the job.
 *
 * @param lines - the crontab lines
 * @param job - the job to look up
 * @param jobIndex - the zero based index of the job line
 * @returns the zero based index of the log comment, or -1 if there is none
 */
function findLogLine(lines: string[], job: CronJob, jobIndex: number): number {
    if (job.logFile === undefined)
        return -1;
    for (let i = jobIndex - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed === `# @log ${job.logFile}`)
            return i;
        if (trimmed.startsWith("# @skipuntil ") || trimmed.startsWith("# @token "))
            continue;
        break;
    }
    return -1;
}

/**
 * Remove the skip state of a job: its "@skipuntil" and "@token" markers, the
 * generated resume job with its marker, and the comment that disables the job.
 *
 * @param lines - the crontab lines
 * @param job - the skipped job
 * @returns how many lines were removed above the job, so that callers can
 *     adjust the job's position in the lines
 */
function removeSkipState(lines: string[], job: CronJob): number {
    const token = job.skipToken;
    if (token === undefined)
        return 0;

    let removedAbove = 0;
    const remove = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === `# @token ${token}`) {
            remove.add(i);
            removedAbove++;
            if (lines[i - 1]?.trim().startsWith("# @skipuntil ")) {
                remove.add(i - 1);
                removedAbove++;
            }
        }
        if (trimmed === `# @resume ${token}`) {
            remove.add(i);
            if (i + 1 < lines.length)
                remove.add(i + 1);
        }
    }

    [...remove].sort((a, b) => b - a).forEach(i => lines.splice(i, 1));

    // the job shifted up by the removed marker lines that sat above it
    const jobIndex = job.line - 1 - removedAbove;
    if (jobIndex >= 0 && jobIndex < lines.length && isCommented(lines[jobIndex]))
        lines[jobIndex] = lines[jobIndex].replace(/^#+\s*/, "");
    return removedAbove;
}

/**
 * Delete a cron job from the crontab of the given level.
 *
 * Removes the line the job was parsed from, its label comment, and any skip
 * state including the generated resume job. One adjacent blank line that
 * separated the job entry is dropped as well. Deleting system level jobs
 * requires administrative access.
 *
 * @param level which set of crontabs to modify
 * @param job the job to remove
 */
export async function deleteCronJob(level: CronLevel, job: CronJob): Promise<void> {
    const content = await readCrontabContent(level);
    const lines = content.split("\n");

    const remove = new Set<number>(jobEntryIndexes(lines, job));

    // also drop one adjacent blank line that separated the job entry
    if (remove.size > 0) {
        const top = Math.min(...remove);
        const bottom = Math.max(...remove);
        if (lines[bottom + 1]?.trim() === "")
            remove.add(bottom + 1);
        else if (lines[top - 1]?.trim() === "")
            remove.add(top - 1);
    }

    [...remove].sort((a, b) => b - a).forEach(i => lines.splice(i, 1));
    await writeCrontabContent(level, lines.join("\n"));
}

/**
 * Enable or disable a cron job in the crontab of the given level.
 *
 * A disabled job is stored as a commented out line. Modifying system level
 * jobs requires administrative access.
 *
 * @param level which set of crontabs to modify
 * @param job the job to enable or disable
 * @param enabled whether the job should be enabled
 */
export async function setCronJobEnabled(level: CronLevel, job: CronJob, enabled: boolean): Promise<void> {
    const content = await readCrontabContent(level);
    const lines = content.split("\n");
    const jobIndex = job.line - 1;
    const line = lines[jobIndex];
    if (enabled)
        lines[jobIndex] = line.replace(/^#+\s*/, "");
    else if (!isCommented(line))
        lines[jobIndex] = `# ${line}`;
    await writeCrontabContent(level, lines.join("\n"));
}

/**
 * Update a cron job in the crontab of the given level.
 *
 * Replaces the line the job is found from with a new schedule, command, and
 * optional label, keeping the job disabled if it was disabled. Modifying
 * system level jobs requires administrative access.
 *
 * @param level which set of crontabs to modify
 * @param job the job to update
 * @param schedule the new schedule, either five fields or a "@period" keyword
 * @param command the new command the job runs
 * @param label the new display label, or empty to remove it
 */
export async function updateCronJob(
    level: CronLevel,
    job: CronJob,
    schedule: string,
    command: string,
    label?: string
): Promise<void> {
    const content = await readCrontabContent(level);
    const lines = content.split("\n");
    const jobIndex = job.line - 1;

    // drop a previously present label comment, which sits above the job
    if (job.labelLine !== undefined)
        lines.splice(job.labelLine - 1, 1);
    // removing the label above shifts the job line up by one
    const shiftedJobIndex = job.labelLine !== undefined ? jobIndex - 1 : jobIndex;

    // rewrite the job line, keeping any comment prefix that disables it and
    // re-applying the logging wrapper if the job is logged
    const storedCommand = job.logFile !== undefined ? loggingCommand(command, job.logFile) : command;
    lines[shiftedJobIndex] = (isCommented(lines[shiftedJobIndex]) ? "# " : "") + `${schedule} ${storedCommand}`;

    // insert the new label comment above the job, or above any skip markers
    // of a skipped job so that the resume job keeps working
    if (label && label.trim() !== "") {
        lines.splice(commentInsertIndex(lines, shiftedJobIndex), 0, `# @label ${label.trim()}`);
    }

    await writeCrontabContent(level, lines.join("\n"));
}

/**
 * A single run of a cron job, as found in its log file.
 */
export interface CronRun {
    /** unique id for react keys */
    id: string;
    /** ISO timestamp of when the run started */
    timestamp: string;
    /** the raw output the run produced */
    output: string;
}

/**
 * Generate a short unique token identifying a job's log file.
 */
function newLogToken(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36);
    return timestamp + random.slice(2, 8);
}

/**
 * Generate a short unique token linking a skipped job to its resume job.
 */
function newSkipToken(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36);
    return timestamp + random.slice(2, 8);
}

/**
 * Escape a command so that it can be embedded into a single quoted shell
 * argument of a wrapping "sh -c" invocation.
 *
 * @param command the command to escape
 */
function escapeSh(command: string): string {
    return command.replace(/'/g, "'\\''");
}

/**
 * Undo the escaping done by {@link escapeSh}.
 *
 * @param command the escaped command
 */
function unescapeSh(command: string): string {
    return command.replace(/'\\''/g, "'");
}

/**
 * The shell fragment that prefixes each run in a log file with a marker line
 * carrying an ISO timestamp, e.g. "=== run 2026-08-09T10:00:00+00:00 ===".
 * Uses "date -Iseconds" so that no "%" characters end up in the crontab,
 * which cron would otherwise convert into newlines.
 */
const LOG_RUN_MARKER = 'echo "=== run $(date -Iseconds) ==="';

/**
 * Wrap a cron job command so that all of its output is appended to the given
 * log file, with a marker line identifying each individual run.
 *
 * @param command the original command
 * @param logFile the path of the log file
 * @returns the wrapped command to store in the crontab
 */
export function loggingCommand(command: string, logFile: string): string {
    return `/bin/sh -c '${LOG_RUN_MARKER}; ${escapeSh(command)}' >> ${logFile} 2>&1`;
}

/**
 * Extract the original command from a command that was wrapped by
 * {@link loggingCommand}, or return the command unchanged if it was not
 * wrapped.
 *
 * @param command the command as stored in the crontab
 * @returns the original command
 */
export function unwrapLoggingCommand(command: string): string {
    const match = command.match(/^\/bin\/sh -c 'echo "=== run \$\(date -Iseconds\) ==="; (.+)' >> \S+ 2>&1$/);
    if (match === null)
        return command;
    return unescapeSh(match[1]);
}

/**
 * The directory that holds the log files of cron jobs for the given level.
 *
 * @param level which set of crontabs the jobs belong to
 */
async function logDirectory(level: CronLevel): Promise<string> {
    if (level === "system")
        return "/var/log/cockpit-cron";
    const user = await cockpit.user();
    return `${user.home}/.cache/cockpit-cron`;
}

/**
 * The spawn options for touching files of the given level. System level log
 * files live under /var/log and require administrative access.
 *
 * @param level which set of crontabs the jobs belong to
 */
function logSpawnOptions(level: CronLevel): { superuser?: "require" } {
    return level === "system" ? { superuser: "require" } : {};
}

/**
 * Enable or disable logging of a cron job's output into a log file.
 *
 * Enabling wraps the job's command so that its output is appended to a log
 * file, with a marker line identifying each run, and stores the file path in
 * a "@log" comment above the job. Disabling removes the comment and restores
 * the original command. Modifying system level jobs requires administrative
 * access.
 *
 * @param level which set of crontabs to modify
 * @param job the job to enable or disable logging for
 * @param enabled whether logging should be enabled
 */
export async function setCronJobLogging(level: CronLevel, job: CronJob, enabled: boolean): Promise<void> {
    const content = await readCrontabContent(level);
    const lines = content.split("\n");
    const jobIndex = job.line - 1;
    const commentPrefix = isCommented(lines[jobIndex]) ? "# " : "";

    if (enabled) {
        const token = newLogToken();
        const dir = await logDirectory(level);
        const logFile = `${dir}/${token}.log`;
        await cockpit.spawn(["mkdir", "-p", dir], logSpawnOptions(level));
        lines[jobIndex] = commentPrefix + `${job.schedule} ${loggingCommand(job.command, logFile)}`;
        // keep the "@log" comment above any skip markers of a skipped job
        lines.splice(commentInsertIndex(lines, jobIndex), 0, `# @log ${logFile}`);
    } else {
        // drop the "@log" comment above the job, which shifts the job up by one
        let removed = 0;
        if (job.logFile !== undefined) {
            const logComment = `# @log ${job.logFile}`;
            for (let i = jobIndex - 1; i >= 0; i--) {
                if (lines[i].trim() === logComment) {
                    lines.splice(i, 1);
                    removed = 1;
                    break;
                }
            }
        }
        lines[jobIndex - removed] = commentPrefix + `${job.schedule} ${unwrapLoggingCommand(job.command)}`;
    }

    await writeCrontabContent(level, lines.join("\n"));
}

/**
 * The cron schedule fields pointing at the exact minute a skip until
 * timestamp ends, so that the generated resume job runs then.
 *
 * @param until - the skip until timestamp in "YYYY-MM-DDTHH:MM" format
 * @returns five cron schedule fields
 */
function skipUntilSchedule(until: string): string {
    const match = until.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (match === null)
        throw new Error(`invalid skip until timestamp: ${until}`);
    const [, , month, day, hour, minute] = match;
    return `${Number(minute)} ${Number(hour)} ${Number(day)} ${Number(month)} *`;
}

/**
 * The command of the generated resume job for the given token. It re-enables
 * the skipped job it belongs to and removes itself, its markers, and the
 * skip markers from the crontab, so that the job runs again from then on.
 *
 * @param token - the token linking the resume job to its skipped job
 */
function resumeCommand(token: string): string {
    // the shell expression stripping a "# " comment prefix, built in two parts
    // so that the literal "${" is not written in a single string
    const stripComment = "\"$" + "{line#\\# }\"";

    const script =
        "crontab -l | while IFS= read -r line; do case \"$line\" in " +
        `"# @resume ${token}"*) continue ;; ` +
        `"# @token ${token}"*) held=; skip=1; continue ;; ` +
        "\"# @token \"*) [ -n \"$held\" ] && printf \"\\%s\\n\" \"$held\"; held=; printf \"\\%s\\n\" \"$line\"; continue ;; " +
        "\"# @skipuntil\"*) held=\"$line\"; continue ;; " +
        `*${token}*) continue ;; ` +
        "*) if [ \"$skip\" = 1 ]; then skip=; printf \"\\%s\\n\" " + stripComment + "; elif [ -n \"$held\" ]; then printf \"\\%s\\n\" \"$held\"; held=; printf \"\\%s\\n\" \"$line\"; else printf \"\\%s\\n\" \"$line\"; fi ;; " +
        "esac; done | crontab -";
    return `sh -c '${script}'`;
}

/**
 * Skip a cron job until the given timestamp, or resume it when no timestamp
 * is given.
 *
 * A skipped job is commented out so that cron does not run it, and a
 * supplementary resume job is added that re-enables it at the chosen time.
 * Resuming removes the skip markers and the resume job. Modifying system
 * level jobs requires administrative access.
 *
 * @param level which set of crontabs to modify
 * @param job the job to skip or resume
 * @param until the "YYYY-MM-DDTHH:MM" timestamp until which to skip the job,
 *     or null to resume it immediately
 */
export async function setCronJobSkipUntil(level: CronLevel, job: CronJob, until: string | null): Promise<void> {
    const content = await readCrontabContent(level);
    const lines = content.split("\n");

    // a changed skip replaces any existing skip state, which shifts the job up
    let jobIndex = job.line - 1;
    if (job.skipToken !== undefined)
        jobIndex -= removeSkipState(lines, job);

    if (until !== null) {
        if (jobIndex < 0 || jobIndex >= lines.length || lines[jobIndex].replace(/^#+\s*/, "") !== `${job.schedule} ${job.command}`)
            jobIndex = jobLineIndex(lines, job);
        if (jobIndex === -1)
            throw new Error(`cron job not found: ${job.command}`);

        const token = newSkipToken();
        const resumeSchedule = skipUntilSchedule(until);
        // comment the job out only if it is not disabled already
        const disabledJobLine = isCommented(lines[jobIndex]) ? lines[jobIndex] : `# ${lines[jobIndex]}`;
        const block = [
            `# @skipuntil ${until}`,
            `# @token ${token}`,
            disabledJobLine,
            `# @resume ${token}`,
            `${resumeSchedule} ${resumeCommand(token)}`
        ];
        lines.splice(jobIndex, 1, ...block);
    }

    await writeCrontabContent(level, lines.join("\n"));
}

/**
 * Delete the log file of a cron job.
 *
 * @param level which set of crontabs the job belongs to
 * @param job the job whose log file to delete
 */
export async function pruneCronJobLog(level: CronLevel, job: CronJob): Promise<void> {
    if (job.logFile === undefined)
        return;
    await cockpit.spawn(["rm", "-f", job.logFile], logSpawnOptions(level));
}

/**
 * Parse the contents of a cron job's log file into individual runs.
 *
 * A run starts at a marker line of the form "=== run <iso timestamp> ==="
 * that was written by the wrapped command.
 *
 * @param content the raw log file contents
 * @returns the list of runs found in the log
 */
export function parseCronLog(content: string): CronRun[] {
    const runs: CronRun[] = [];
    let current: CronRun | null = null;

    content.split("\n").forEach((line, index) => {
        const match = line.match(/^=== run (.+) ===$/);
        if (match) {
            current = {
                id: `run-${index}`,
                timestamp: match[1].trim(),
                output: ""
            };
            runs.push(current);
        } else if (current) {
            current.output += line + "\n";
        }
    });

    return runs;
}

/**
 * Read the log file of a cron job and parse it into individual runs.
 *
 * @param level which set of crontabs the job belongs to
 * @param job the job whose log file to read
 * @returns the list of runs found in the log, empty if there is no log
 */
export async function readCronJobLogs(level: CronLevel, job: CronJob): Promise<CronRun[]> {
    if (job.logFile === undefined)
        return [];

    let content: string;
    try {
        content = await cockpit.spawn(["cat", job.logFile], logSpawnOptions(level));
    } catch {
        // the log file does not exist yet or is not readable
        return [];
    }

    return parseCronLog(content);
}
