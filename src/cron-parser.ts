/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

/**
 * The scope of cron jobs to operate on. System level refers to the crontab of
 * the root user, user level refers to the crontab of the current user.
 */
export type CronLevel = "system" | "user";

/**
 * A single cron job as found in a crontab.
 */
export interface CronJob {
    /** unique id for react keys */
    id: string;
    /** crontab file this job was found in */
    file: string;
    /** raw schedule, either five fields or a "@period" keyword */
    schedule: string;
    /** the command to run */
    command: string;
    /** whether the job is enabled (a commented out job is disabled) */
    enabled: boolean;
}

/** Matches cron keywords such as "@daily" or "@reboot". */
const AT_KEYWORD_RE = /^@(?:reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)$/;

/** Matches the abbreviated month names used in the month field. */
const MONTH_NAMES_RE = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i;

/** Matches the abbreviated weekday names used in the day of week field. */
const DAY_NAMES_RE = /^(?:sun|mon|tue|wed|thu|fri|sat)$/i;

/** Valid range of values for each of the five schedule fields. */
const TIME_FIELDS = {
    minute: [0, 59],
    hour: [0, 23],
    day: [1, 31],
    month: [1, 12],
    weekday: [0, 7]
} as const;

/** One of the five schedule fields of a cron job. */
type TimeField = keyof typeof TIME_FIELDS;

/**
 * Check whether a numeric string falls within the given inclusive range.
 *
 * @param value - the value to check
 * @param range - the inclusive lower and upper bound
 */
function inRange(value: string, range: readonly [number, number]): boolean {
    const number = Number(value);
    return Number.isInteger(number) && number >= range[0] && number <= range[1];
}

/**
 * Check whether a single entry of a schedule field is a valid cron value.
 *
 * Accepts wildcards, step values, ranges and plain numbers, as well as
 * month and weekday names where applicable.
 *
 * @param item - a single entry, that is one element of a comma separated list
 * @param field - which schedule field the entry belongs to
 */
function isValidTimeItem(item: string, field: TimeField): boolean {
    if (item === "*" || item === "?")
        return true;
    if (field === "month" && MONTH_NAMES_RE.test(item))
        return true;
    if (field === "weekday" && DAY_NAMES_RE.test(item))
        return true;

    const range = TIME_FIELDS[field];

    let value = item;
    const stepIndex = item.indexOf("/");
    if (stepIndex >= 0) {
        const step = item.slice(stepIndex + 1);
        if (!/^\d+$/.test(step))
            return false;
        value = item.slice(0, stepIndex);
    }

    if (value === "*")
        return true;

    const rangeIndex = value.indexOf("-");
    if (rangeIndex >= 0) {
        const [from, to] = value.split("-");
        return inRange(from, range) && inRange(to, range);
    }

    return inRange(value, range);
}

/**
 * Check whether a whole schedule field, including comma separated lists of
 * entries, only contains valid cron values.
 *
 * @param value - the raw schedule field
 * @param field - which schedule field the value belongs to
 */
function isValidTimeField(value: string, field: TimeField): boolean {
    return value.split(",").every(item => isValidTimeItem(item, field));
}

/**
 * A schedule that was successfully parsed out of a crontab line.
 */
interface ParsedSchedule {
    /** the raw schedule, either five fields or a "@period" keyword */
    schedule: string;
    /** index of the first token that follows the schedule */
    offset: number;
}

/**
 * Try to parse the beginning of a crontab line as a schedule.
 *
 * @param tokens - whitespace separated tokens of the crontab line
 * @returns the parsed schedule, or null if the tokens do not start with a
 *     valid cron schedule
 */
function parseSchedule(tokens: string[]): ParsedSchedule | null {
    if (tokens.length > 0 && AT_KEYWORD_RE.test(tokens[0]))
        return { schedule: tokens[0], offset: 1 };

    if (tokens.length >= 6 &&
            isValidTimeField(tokens[0], "minute") &&
            isValidTimeField(tokens[1], "hour") &&
            isValidTimeField(tokens[2], "day") &&
            isValidTimeField(tokens[3], "month") &&
            isValidTimeField(tokens[4], "weekday"))
        return { schedule: tokens.slice(0, 5).join(" "), offset: 5 };

    return null;
}

/**
 * Check whether a string is a valid cron schedule, either five schedule
 * fields or a "@period" keyword such as "@daily".
 *
 * @param schedule - the schedule expression to validate
 * @returns true if the schedule is valid
 */
export function isValidSchedule(schedule: string): boolean {
    const tokens = schedule.trim().split(/\s+/);
    if (tokens.length === 1 && AT_KEYWORD_RE.test(tokens[0]))
        return true;
    return tokens.length === 5 &&
        isValidTimeField(tokens[0], "minute") &&
        isValidTimeField(tokens[1], "hour") &&
        isValidTimeField(tokens[2], "day") &&
        isValidTimeField(tokens[3], "month") &&
        isValidTimeField(tokens[4], "weekday");
}

/**
 * Parse the contents of a crontab file into a list of cron jobs.
 *
 * Blank lines, comments that do not look like a job, and environment variable
 * assignments are skipped. A commented out job line is reported as a disabled
 * job.
 *
 * @param content - raw crontab file contents
 * @param file - path of the crontab file, used for job ids
 * @returns the list of jobs found in the crontab
 */
export function parseCrontab(content: string, file: string): CronJob[] {
    const jobs: CronJob[] = [];

    content.split("\n").forEach((rawLine, index) => {
        let line = rawLine.trim();
        if (!line)
            return;

        let enabled = true;
        if (line.startsWith("#")) {
            enabled = false;
            line = line.replace(/^#+\s*/, "");
            if (!line)
                return;
        }

        // skip environment variable assignments such as "SHELL=/bin/sh"
        if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
            return;

        const tokens = line.split(/\s+/);
        const parsed = parseSchedule(tokens);
        if (parsed === null)
            return;

        const command = tokens.slice(parsed.offset).join(" ");
        if (!command)
            return;

        jobs.push({
            id: `${file}:${index + 1}`,
            file,
            schedule: parsed.schedule,
            command,
            enabled
        });
    });

    return jobs;
}
