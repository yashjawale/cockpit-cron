/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import cockpit from 'cockpit';

import { parseCrontab, type CronJob, type CronLevel } from "./cron-parser";

export type { CronJob, CronLevel } from "./cron-parser";

/**
 * Read the cron jobs of the root user via the crontab command.
 *
 * Requires administrative access, as root's crontab can only be read with
 * root privileges.
 *
 * @returns a promise for the list of system cron jobs, empty if root has no
 *     crontab or crontab is not installed
 */
async function readSystemJobs(): Promise<CronJob[]> {
    try {
        const content = await cockpit.spawn(["crontab", "-l", "-u", "root"], { superuser: "require" });
        return parseCrontab(content, "root crontab");
    } catch {
        // root has no crontab (or crontab is not installed)
        return [];
    }
}

/**
 * Read the cron jobs of the current user via the crontab command.
 *
 * @returns a promise for the list of user cron jobs, empty if the user has no
 *     crontab or crontab is not installed
 */
async function readUserJobs(): Promise<CronJob[]> {
    try {
        const content = await cockpit.spawn(["crontab", "-l"]);
        return parseCrontab(content, "user crontab");
    } catch {
        // the current user has no crontab (or crontab is not installed)
        return [];
    }
}

/**
 * Read all cron jobs for the given level.
 *
 * @param level - which set of crontabs to read
 * @returns a promise for the list of found jobs
 */
export function readCronJobs(level: CronLevel): Promise<CronJob[]> {
    return level === "system" ? readSystemJobs() : readUserJobs();
}
