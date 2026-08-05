/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useEffect, useState } from 'react';

import cockpit from 'cockpit';

import { ListingTable, type ListingTableRowProps } from "cockpit-components-table.jsx";
import { readCronJobs, type CronJob, type CronLevel } from "../cron";

const _ = cockpit.gettext;

/**
 * Props for the {@link CronJobsTable} component.
 */
export interface CronJobsTableProps {
    /** which set of cron jobs to display */
    level: CronLevel;
    /** free text filter applied to the displayed jobs */
    filter: string;
}

/**
 * Table of cron jobs for a given level.
 *
 * The jobs are read from the system whenever the level changes and rendered
 * in a listing table with a loading and an empty state.
 */
export const CronJobsTable = ({ level, filter }: CronJobsTableProps) => {
    const [jobs, setJobs] = useState<CronJob[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        readCronJobs(level).then(result => {
            if (!cancelled) {
                setJobs(result);
                setLoading(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [level]);

    const filteredJobs = filter
        ? jobs.filter(job =>
            job.command.toLowerCase().includes(filter.toLowerCase()) ||
            job.schedule.toLowerCase().includes(filter.toLowerCase()) ||
            job.file.toLowerCase().includes(filter.toLowerCase()))
        : jobs;

    const rows: ListingTableRowProps[] = filteredJobs.map(job => ({
        columns: [
            {
                title: job.command
            },
            {
                title: job.schedule
            }
        ],
        props: {
            key: job.id
        }
    }));

    const emptyCaption = filter
        ? _("No jobs match the filter")
        : (level === "system" ? _("No system cron jobs") : _("No user cron jobs"));

    return (
        <ListingTable
            columns={[
                {
                    title: _("Job")
                },
                {
                    title: _("Schedule")
                }
            ]}
            rows={rows}
            loading={loading ? _("Loading cron jobs...") : ""}
            emptyCaption={emptyCaption}
        />
    );
};
