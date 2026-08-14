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

import { deleteCronJob, displayCommand, type CronJob, type CronLevel } from "../cron";

const _ = cockpit.gettext;

/**
 * Props for the {@link DeleteCronJobDialog} component.
 */
export interface DeleteCronJobDialogProps {
    /** which set of crontabs the job belongs to */
    level: CronLevel;
    /** the job to delete */
    job: CronJob;
    /** callback invoked when the dialog is closed */
    onClose: () => void;
    /** callback invoked after the job was successfully deleted */
    onDeleted: () => void;
}

/**
 * Confirmation dialog for deleting a cron job.
 *
 * Shows the job to be removed and offers a danger delete button. Failures
 * are reported inline.
 */
export const DeleteCronJobDialog = ({ level, job, onClose, onDeleted }: DeleteCronJobDialogProps) => {
    const [inProgress, setInProgress] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = () => {
        if (inProgress)
            return;

        setInProgress(true);
        deleteCronJob(level, job)
                .then(onDeleted)
                .catch(error => {
                    console.warn("Failed to delete cron job:", error);
                    setInProgress(false);
                    setError(_("Failed to delete the cron job"));
                });
    };

    const display = job.label || displayCommand(job.command);

    return (
        <Modal isOpen position="top" variant="small" onClose={onClose}>
            <ModalHeader title={cockpit.format(_("Delete cron job \"$0\"?"), display)} titleIconVariant="warning" />
            <ModalBody>
                {error !== null && <Alert variant="danger" isInline title={_("Failed to delete the cron job")} />}
                <p>{cockpit.format(_("The cron job \"$0\" will be permanently removed."), display)}</p>
            </ModalBody>
            <ModalFooter>
                <Button id="cron-delete-submit" variant="danger" isLoading={inProgress} isDisabled={inProgress} onClick={submit}>
                    {_("Delete")}
                </Button>
                <Button variant="link" isDisabled={inProgress} onClick={onClose}>
                    {_("Cancel")}
                </Button>
            </ModalFooter>
        </Modal>
    );
};
