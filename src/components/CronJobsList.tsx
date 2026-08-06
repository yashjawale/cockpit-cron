/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useEffect, useState } from 'react';
import { DataList } from "@patternfly/react-core/dist/esm/components/DataList";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState";

import cockpit from 'cockpit';

import { readCronJobs, type CronJob, type CronLevel } from "../cron";
import { CronJobRow } from "./CronJobRow";

const _ = cockpit.gettext;

/**
 * Props for the {@link CronJobsList} component.
 */
export interface CronJobsListProps {
    /** which set of cron jobs to display */
    level: CronLevel;
    /** free text filter applied to the displayed jobs */
    filter: string;
}

/**
 * List of cron jobs for a given level.
 *
 * The jobs are read from the system whenever the level changes and rendered
 * as expandable rows with a loading and an empty state.
 */
export const CronJobsList = ({ level, filter }: CronJobsListProps) => {
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

    const emptyCaption = filter
        ? _("No jobs match the filter")
        : (level === "system" ? _("No system cron jobs") : _("No user cron jobs"));

    if (loading)
        return <EmptyState><EmptyStateBody>{_("Loading cron jobs...")}</EmptyStateBody></EmptyState>;

    if (filteredJobs.length === 0)
        return (
            <EmptyState>
                <EmptyStateBody><div>{emptyCaption}</div></EmptyStateBody>
            </EmptyState>
        );

    return (
        <DataList aria-label={_("Cron jobs")}>
            {filteredJobs.map(job => <CronJobRow key={job.id} job={job} />)}
        </DataList>
    );
};
