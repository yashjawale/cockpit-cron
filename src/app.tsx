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
import type { CronLevel } from "./cron";

/**
 * Top level application component of the Cron jobs module.
 */
export const Application = () => {
    const [level, setLevel] = useState<CronLevel>("system");
    const [filter, setFilter] = useState("");
    const [showDialog, setShowDialog] = useState(false);
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
                    <CronJobsList level={level} filter={filter} reload={reload} />
                </CardBody>
            </Card>
            {showDialog && (
                <AddCronJobDialog
                    level={level}
                    onClose={() => setShowDialog(false)}
                    onAdded={() => {
                        setShowDialog(false);
                        setReload(reload + 1);
                    }}
                />
            )}
        </Page>
    );
};
