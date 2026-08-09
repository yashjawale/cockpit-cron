/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import cockpit from 'cockpit';

import { parseCrontab, type CronJob, type CronLevel } from "./cron-parser";

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
 *     not exist or crontab is not installed
 */
async function readCrontabContent(level: CronLevel): Promise<string> {
    const { args, options } = crontabCommand(level, false);
    try {
        return await cockpit.spawn(args, options);
    } catch {
        // no crontab exists yet (or crontab is not installed)
        return "";
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
 * Read the cron jobs of the given level.
 *
 * @param level which set of crontabs to read
 * @returns a promise for the list of found jobs, empty if the crontab does not
 *     exist or crontab is not installed
 */
export async function readCronJobs(level: CronLevel): Promise<CronJob[]> {
    const content = await readCrontabContent(level);
    const file = level === "system" ? "root crontab" : "user crontab";
    return parseCrontab(content, file);
}

/**
 * Add a cron job to the crontab of the given level.
 *
 * Appends a new job line to the crontab. Adding system level jobs requires
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
    const jobLine = `${schedule} ${command}`;
    const block = label ? `# @label ${label}\n${jobLine}` : jobLine;
    const newLine = content ? `\n${block}` : block;
    await writeCrontabContent(level, content + newLine + "\n");
}

/**
 * Whether a crontab content has been parsed from a leading hash comment.
 */
function isCommented(line: string): boolean {
    return line.trim().startsWith("#");
}

/**
 * Delete a cron job from the crontab of the given level.
 *
 * Removes the line the job was parsed from. Deleting system level jobs
 * requires administrative access.
 *
 * @param level which set of crontabs to modify
 * @param job the job to remove
 */
export async function deleteCronJob(level: CronLevel, job: CronJob): Promise<void> {
    const content = await readCrontabContent(level);
    const lines = content.split("\n");
    // remove the job line and any label comment above it
    lines.splice(job.line - 1, 1);
    if (job.labelLine !== undefined)
        lines.splice(job.labelLine - 1, 1);
    await writeCrontabContent(level, lines.join("\n"));
}

/**
 * Update a cron job in the crontab of the given level.
 *
 * Replaces the line the job is found from with a new schedule, command, and
 * optional label. Modifying system level jobs requires administrative
 * access.
 *
 * @param level which set of crontabs to modify
 * @param job the job to update
 * @param schedule the new schedule, either five fields or a "@period" keyword
 * @param command the new command the job runs
 * @param label the new display label, or empty to remove it
 */
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

    // rewrite the job line, keeping any comment prefix that disables it
    lines[shiftedJobIndex] = (isCommented(lines[shiftedJobIndex]) ? "# " : "") + `${schedule} ${command}`;

    // insert the new label comment directly above the job
    if (label && label.trim() !== "") {
        lines.splice(shiftedJobIndex, 0, `# @label ${label.trim()}`);
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
        lines.splice(jobIndex, 0, `# @log ${logFile}`);
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
