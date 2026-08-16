/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */

import React, { useState } from 'react';
import { Page, PageSection } from '@patternfly/react-core/dist/esm/components/Page';

import { AddCronJobDialog } from "./components/AddCronJobDialog";
import { CronJobsList } from "./components/CronJobsList";
import { CronJobsToolbar } from "./components/CronJobsToolbar";
import { DeleteCronJobDialog } from "./components/DeleteCronJobDialog";
import { ImportCronJobsAlert } from "./components/ImportCronJobsAlert";
import { PruneLogsDialog } from "./components/PruneLogsDialog";
import { SkipUntilDialog } from "./components/SkipUntilDialog";
import { ToggleLoggingDialog } from "./components/ToggleLoggingDialog";
import type { CronJob, CronLevel } from "./cron";

/** A job that was just changed, to highlight its row after a reload. */
interface HighlightedJob {
    /** stable job key, matching a row after the crontab was rewritten */
    key: string;
    /** counter that changes for every highlight, so repeated changes retrigger */
    tick: number;
}

/**
 * Top level application component of the Cron jobs module.
 */
export const Application = () => {
    const [level, setLevel] = useState<CronLevel>("system");
    const [filter, setFilter] = useState("");
    const [showDialog, setShowDialog] = useState(false);
    const [editJob, setEditJob] = useState<CronJob | null>(null);
    const [deleteJob, setDeleteJob] = useState<CronJob | null>(null);
    const [pruneJob, setPruneJob] = useState<CronJob | null>(null);
    const [loggingJob, setLoggingJob] = useState<{ job: CronJob, enabled: boolean } | null>(null);
    const [skipJob, setSkipJob] = useState<CronJob | null>(null);
    const [highlight, setHighlight] = useState<HighlightedJob | null>(null);
    const [reload, setReload] = useState(0);
    const [logRefresh, setLogRefresh] = useState(0);

    return (
        <Page className='pf-m-no-sidebar' isContentFilled>
            <ImportCronJobsAlert
                level={level}
                reload={reload}
                onImported={() => setReload(reload + 1)}
            />
            <PageSection className="cron-jobs-toolbar-section">
                <CronJobsToolbar
                    level={level}
                    onSelectLevel={setLevel}
                    filter={filter}
                    onFilterChange={setFilter}
                    onAddJob={() => setShowDialog(true)}
                />
            </PageSection>
            <PageSection className="cron-jobs-list-section">
                <CronJobsList
                    level={level}
                    filter={filter}
                    reload={reload}
                    logRefresh={logRefresh}
                    highlight={highlight}
                    onEdit={setEditJob}
                    onDelete={setDeleteJob}
                    onPruneLogs={setPruneJob}
                    onToggleLogging={(job, enabled) => setLoggingJob({ job, enabled })}
                    onSkip={setSkipJob}
                />
            </PageSection>
            {showDialog && (
                <AddCronJobDialog
                    level={level}
                    onClose={() => setShowDialog(false)}
                    onSaved={() => {
                        setShowDialog(false);
                        setReload(reload + 1);
                    }}
                />
            )}
            {editJob !== null && (
                <AddCronJobDialog
                    level={level}
                    job={editJob}
                    onClose={() => setEditJob(null)}
                    onSaved={() => {
                        setEditJob(null);
                        setReload(reload + 1);
                    }}
                />
            )}
            {deleteJob !== null && (
                <DeleteCronJobDialog
                    level={level}
                    job={deleteJob}
                    onClose={() => setDeleteJob(null)}
                    onDeleted={() => {
                        setDeleteJob(null);
                        setReload(reload + 1);
                    }}
                />
            )}
            {pruneJob !== null && (
                <PruneLogsDialog
                    level={level}
                    job={pruneJob}
                    onClose={() => setPruneJob(null)}
                    onPruned={() => {
                        setPruneJob(null);
                        setReload(reload + 1);
                        setLogRefresh(logRefresh + 1);
                    }}
                />
            )}
            {loggingJob !== null && (
                <ToggleLoggingDialog
                    level={level}
                    job={loggingJob.job}
                    enabled={loggingJob.enabled}
                    onClose={() => setLoggingJob(null)}
                    onChanged={() => {
                        setLoggingJob(null);
                        setReload(reload + 1);
                        setLogRefresh(logRefresh + 1);
                    }}
                />
            )}
            {skipJob !== null && (
                <SkipUntilDialog
                    level={level}
                    job={skipJob}
                    onClose={() => setSkipJob(null)}
                    onSaved={() => {
                        setSkipJob(null);
                        setHighlight({
                            key: `${skipJob.schedule} ${skipJob.command}`,
                            tick: (highlight?.tick ?? 0) + 1
                        });
                        setReload(reload + 1);
                    }}
                />
            )}
        </Page>
    );
};
