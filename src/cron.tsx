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
 * given crontab lines, keeping a trailing empty line if present.
 */
function appendManagedRegion(lines: string[], managedLines: string[]): void {
    const trailing = lines.length > 0 && lines[lines.length - 1] === "" ? lines.pop() : undefined;
    lines.push(BEGIN_MARKER, ...managedLines, END_MARKER);
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
    const jobLine = `${schedule} ${command}`;
    const managedLines = label ? [`# @label ${label}`, jobLine] : [jobLine];

    const region = findManagedRegion(lines);
    if (region !== null)
        lines.splice(region.end, 0, ...managedLines);
    else
        appendManagedRegion(lines, managedLines);

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

    const importable = parseImportableJobs(content, file, findManagedRegion(lines));
    if (importable.length === 0)
        return;

    // the job and label lines to move into the managed region
    const move = new Set<number>();
    importable.forEach(job => {
        move.add(job.line - 1);
        if (job.labelLine !== undefined)
            move.add(job.labelLine - 1);
    });

    // split the file into the lines that stay outside and the lines that are
    // moved into the managed region, preserving their relative order
    const outside = lines.filter((_, index) => !move.has(index));
    const imported = lines.filter((_, index) => move.has(index));

    const region = findManagedRegion(outside);
    if (region !== null)
        outside.splice(region.end, 0, ...imported);
    else
        appendManagedRegion(outside, imported);

    await writeCrontabContent(level, outside.join("\n"));
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
