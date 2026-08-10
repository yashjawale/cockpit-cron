/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useEffect, useState } from 'react';
import { DataList } from "@patternfly/react-core/dist/esm/components/DataList";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState";

import cockpit from 'cockpit';

import { readCronJobs, setCronJobEnabled, setCronJobSkipUntil, type CronJob, type CronLevel } from "../cron";
import { CronJobRow } from "./CronJobRow";

const _ = cockpit.gettext;

/**
 * A stable identifier of a job, independent of its line in the crontab, so
 * that a job can be recognized again after its skip markers shifted the lines.
 */
function jobKey(job: CronJob): string {
    return `${job.schedule} ${job.command}`;
}

/**
 * Props for the {@link CronJobsList} component.
 */
export interface CronJobsListProps {
    /** which set of cron jobs to display */
    level: CronLevel;
    /** free text filter applied to the displayed jobs */
    filter: string;
    /** a counter that triggers a reload of the jobs when incremented */
    reload: number;
    /** the job that was just changed from outside, to highlight its row */
    highlight: { key: string, tick: number } | null;
    /** callback invoked when the user wants to edit a job */
    onEdit: (job: CronJob) => void;
    /** callback invoked when the user wants to delete a job */
    onDelete: (job: CronJob) => void;
    /** callback invoked when the user wants to skip a job until a date */
    onSkip: (job: CronJob) => void;
}

/**
 * List of cron jobs for a given level.
 *
 * The jobs are read from the system whenever the level changes and rendered
 * as rows with a loading and an empty state.
 */
export const CronJobsList = ({ level, filter, reload, highlight, onEdit, onDelete, onSkip }: CronJobsListProps) => {
    const [jobs, setJobs] = useState<CronJob[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        readCronJobs(level)
                .then(result => {
                    if (!cancelled) {
                        setJobs(result);
                        setLoading(false);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setJobs([]);
                        setLoading(false);
                    }
                });

        return () => {
            cancelled = true;
        };
    }, [level, reload]);

    // toggle the enabled state optimistically and persist it in the background
    const toggleEnabled = (job: CronJob, enabled: boolean) => {
        // enabling a skipped job resumes it and clears its skip state
        if (job.skipUntil !== undefined) {
            if (enabled) {
                setJobs(current => current.map(candidate => {
                    if (candidate.id !== job.id)
                        return candidate;
                    const resumed = { ...candidate, enabled: true };
                    delete resumed.skipUntil;
                    delete resumed.skipToken;
                    return resumed;
                }));

                setCronJobSkipUntil(level, job, null)
                        .catch(() => {
                            // revert the optimistic update on failure
                            setJobs(current => current.map(
                                candidate => candidate.id === job.id ? { ...candidate, enabled: false } : candidate));
                        });
            }
            return;
        }

        setJobs(current => current.map(
            candidate => candidate.id === job.id ? { ...candidate, enabled } : candidate));

        setCronJobEnabled(level, job, enabled)
                .catch(() => {
                    // revert the optimistic update on failure
                    setJobs(current => current.map(
                        candidate => candidate.id === job.id ? { ...candidate, enabled: !enabled } : candidate));
                });
    };

    const filteredJobs = filter
        ? jobs.filter(job =>
            job.command.toLowerCase().includes(filter.toLowerCase()) ||
            job.schedule.toLowerCase().includes(filter.toLowerCase()) ||
            job.file.toLowerCase().includes(filter.toLowerCase()))
        : jobs;

    const emptyCaption = filter
        ? _("No jobs match the filter")
        : (level === "system" ? _("No system cron jobs") : _("No user cron jobs"));

    return (
        loading
            ? <EmptyState><EmptyStateBody>{_("Loading cron jobs...")}</EmptyStateBody></EmptyState>
            : filteredJobs.length === 0
                ? <EmptyState><EmptyStateBody><div>{emptyCaption}</div></EmptyStateBody></EmptyState>
                : (
                    <DataList aria-label={_("Cron jobs")}>
                        {filteredJobs.map(job => (
                            <CronJobRow
                                key={job.id}
                                job={job}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onSkip={onSkip}
                                onToggleEnabled={toggleEnabled}
                                highlight={highlight !== null && jobKey(job) === highlight.key}
                                highlightTick={highlight?.tick ?? 0}
                            />
                        ))}
                    </DataList>
                )
    );
};
