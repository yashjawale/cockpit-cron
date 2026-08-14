/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useEffect, useState } from 'react';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { PageSection } from '@patternfly/react-core/dist/esm/components/Page';

import cockpit from 'cockpit';

import { importCronJobs, readImportableJobs, type CronJob, type CronLevel } from "../cron";

const _ = cockpit.gettext;

/**
 * Props for the {@link ImportCronJobsAlert} component.
 */
export interface ImportCronJobsAlertProps {
    /** which set of cron jobs to look at */
    level: CronLevel;
    /** a counter that triggers a reload of the importable jobs when incremented */
    reload: number;
    /** callback invoked after the importable jobs were moved into the managed region */
    onImported: () => void;
}

/**
 * Alert at the top of the page offering to import cron jobs that exist
 * outside of the managed region of the crontab.
 *
 * The alert is hidden when no such jobs exist and offers a button to move all
 * of them between the delimiter markers.
 */
export const ImportCronJobsAlert = ({ level, reload, onImported }: ImportCronJobsAlertProps) => {
    const [importable, setImportable] = useState<CronJob[]>([]);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        let cancelled = false;

        setImportable([]);
        setImporting(false);
        readImportableJobs(level)
                .then(result => {
                    if (!cancelled)
                        setImportable(result);
                })
                .catch(error => {
                    if (!cancelled) {
                        setImportable([]);
                        console.warn("Failed to read importable cron jobs:", error);
                    }
                });

        return () => {
            cancelled = true;
        };
    }, [level, reload]);

    if (importable.length === 0)
        return null;

    const importJobs = () => {
        setImporting(true);
        importCronJobs(level)
                .then(onImported)
                .catch(error => {
                    console.warn("Failed to import cron jobs:", error);
                    setImporting(false);
                });
    };

    return (
        <PageSection hasBodyWrapper={false}>
            <Alert
                id="cron-import-alert"
                isInline
                variant="info"
                title={cockpit.format(cockpit.ngettext(
                    _("$0 cron job is not managed by this plugin"),
                    _("$0 cron jobs are not managed by this plugin"),
                    importable.length
                ), importable.length)}
            >
                {_("Existing cron jobs outside of the managed section are left untouched. Import them to manage them from this page.")}
                <div className="cron-import-actions">
                    <Button id="cron-import-jobs" variant="primary" isLoading={importing} isDisabled={importing} onClick={importJobs}>
                        {_("Import jobs")}
                    </Button>
                </div>
            </Alert>
        </PageSection>
    );
};
