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
 * Find the "@label" comment directly above a job line, skipping over any
 * skip markers in between.
 *
 * @param lines - the crontab lines
 * @param job - the job to look up
 * @returns the zero based index of the label comment, or -1 if there is none
 */
function findLabelLine(lines: string[], job: CronJob): number {
    const jobIndex = findJobLine(lines, job);
    if (jobIndex === -1)
        return -1;

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
 * Remove the skip state of a job: its "@skipuntil" and "@token" markers, the
 * generated resume job with its marker, and the comment that disables the job.
 *
 * @param lines - the crontab lines
 * @param job - the skipped job
 * @returns the lines without the skip state
 */
function removeSkipState(lines: string[], job: CronJob): string[] {
    const token = job.skipToken;
    if (token === undefined)
        return lines;

    const remove = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === `# @token ${token}`) {
            remove.add(i);
            if (lines[i - 1]?.trim().startsWith("# @skipuntil "))
                remove.add(i - 1);
        }
        if (trimmed === `# @resume ${token}`) {
            remove.add(i);
            if (i + 1 < lines.length)
                remove.add(i + 1);
        }
    }

    [...remove].sort((a, b) => b - a).forEach(i => lines.splice(i, 1));

    const jobIndex = findJobLine(lines, job);
    if (jobIndex !== -1 && isCommented(lines[jobIndex]))
        lines[jobIndex] = lines[jobIndex].replace(/^#+\s*/, "");
    return lines;
}

/**
 * Delete a cron job from the crontab of the given level.
 *
 * Removes the line the job was parsed from, its label comment, and any skip
 * state including the generated resume job. Deleting system level jobs
 * requires administrative access.
 *
 * @param level which set of crontabs to modify
 * @param job the job to remove
 */
export async function deleteCronJob(level: CronLevel, job: CronJob): Promise<void> {
    const content = await readCrontabContent(level);
    const lines = content.split("\n");

    const remove = new Set<number>();
    const jobIndex = findJobLine(lines, job);
    if (jobIndex !== -1)
        remove.add(jobIndex);
    const labelIndex = findLabelLine(lines, job);
    if (labelIndex !== -1)
        remove.add(labelIndex);

    // remove a present skip state and its resume job
    if (job.skipToken !== undefined) {
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed === `# @token ${job.skipToken}`) {
                remove.add(i);
                if (lines[i - 1]?.trim().startsWith("# @skipuntil "))
                    remove.add(i - 1);
            }
            if (trimmed === `# @resume ${job.skipToken}`) {
                remove.add(i);
                if (i + 1 < lines.length)
                    remove.add(i + 1);
            }
        }
    }

    [...remove].sort((a, b) => b - a).forEach(i => lines.splice(i, 1));
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
 * Generate a short unique token linking a skipped job to its resume job.
 */
function newSkipToken(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36);
    return timestamp + random.slice(2, 8);
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
    let lines = content.split("\n");

    // a changed skip replaces any existing skip state
    if (job.skipToken !== undefined)
        lines = removeSkipState(lines, job);

    if (until !== null) {
        const jobIndex = findJobLine(lines, job);
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
