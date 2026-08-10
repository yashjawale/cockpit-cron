/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useState } from 'react';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal";

import cockpit from 'cockpit';

import { pruneCronJobLog, type CronJob, type CronLevel } from "../cron";

const _ = cockpit.gettext;

/**
 * Props for the {@link PruneLogsDialog} component.
 */
export interface PruneLogsDialogProps {
    /** which set of crontabs the job belongs to */
    level: CronLevel;
    /** the job whose log file to prune */
    job: CronJob;
    /** callback invoked when the dialog is closed */
    onClose: () => void;
    /** callback invoked after the log was successfully pruned */
    onPruned: () => void;
}

/**
 * Confirmation dialog for deleting the log file of a cron job.
 *
 * Shows the job whose log is about to be removed and offers a danger delete
 * button. Failures are reported inline.
 */
export const PruneLogsDialog = ({ level, job, onClose, onPruned }: PruneLogsDialogProps) => {
    const [inProgress, setInProgress] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = () => {
        if (inProgress)
            return;

        setInProgress(true);
        pruneCronJobLog(level, job)
                .then(onPruned)
                .catch(error => {
                    console.warn("Failed to prune cron job logs:", error);
                    setInProgress(false);
                    setError(_("Failed to prune the cron job logs"));
                });
    };

    const display = job.label || job.command;

    return (
        <Modal isOpen position="top" variant="small" onClose={onClose}>
            <ModalHeader title={cockpit.format(_("Prune logs of \"$0\"?"), display)} titleIconVariant="warning" />
            <ModalBody>
                {error !== null && <Alert variant="danger" isInline title={_("Failed to prune the cron job logs")} />}
                <p>{cockpit.format(_("The log file of the cron job \"$0\" will be permanently removed."), display)}</p>
            </ModalBody>
            <ModalFooter>
                <Button id="cron-prune-submit" variant="danger" isLoading={inProgress} isDisabled={inProgress} onClick={submit}>
                    {_("Prune logs")}
                </Button>
                <Button variant="link" isDisabled={inProgress} onClick={onClose}>
                    {_("Cancel")}
                </Button>
            </ModalFooter>
        </Modal>
    );
};
