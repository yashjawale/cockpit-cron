/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */

import React, { useState } from 'react';
import { Card, CardBody } from "@patternfly/react-core/dist/esm/components/Card";
import { Page } from '@patternfly/react-core/dist/esm/components/Page';

import { AddCronJobDialog } from "./components/AddCronJobDialog";
import { CronJobsList } from "./components/CronJobsList";
import { CronJobsToolbar } from "./components/CronJobsToolbar";
import { DeleteCronJobDialog } from "./components/DeleteCronJobDialog";
import type { CronJob, CronLevel } from "./cron";

/**
 * Top level application component of the Cron jobs module.
 */
export const Application = () => {
    const [level, setLevel] = useState<CronLevel>("system");
    const [filter, setFilter] = useState("");
    const [showDialog, setShowDialog] = useState(false);
    const [editJob, setEditJob] = useState<CronJob | null>(null);
    const [deleteJob, setDeleteJob] = useState<CronJob | null>(null);
    const [reload, setReload] = useState(0);

    return (
        <Page className='pf-m-no-sidebar'>
            <Card>
                <CardBody>
                    <CronJobsToolbar
                        level={level}
                        onSelectLevel={setLevel}
                        filter={filter}
                        onFilterChange={setFilter}
                        onAddJob={() => setShowDialog(true)}
                    />
                    <CronJobsList
                        level={level}
                        filter={filter}
                        reload={reload}
                        onEdit={setEditJob}
                        onDelete={setDeleteJob}
                    />
                </CardBody>
            </Card>
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
        </Page>
    );
};
