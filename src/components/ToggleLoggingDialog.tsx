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

import { displayCommand, setCronJobLogging, type CronJob, type CronLevel } from "../cron";

const _ = cockpit.gettext;

/**
 * Props for the {@link ToggleLoggingDialog} component.
 */
export interface ToggleLoggingDialogProps {
    /** which set of crontabs the job belongs to */
    level: CronLevel;
    /** the job to enable or disable logging for */
    job: CronJob;
    /** whether logging should be enabled or disabled */
    enabled: boolean;
    /** callback invoked when the dialog is closed */
    onClose: () => void;
    /** callback invoked after the logging state was successfully changed */
    onChanged: () => void;
}

/**
 * Confirmation dialog for enabling or disabling logging of a cron job.
 *
 * Explains what enabling or disabling logging does, in particular that
 * disabling deletes the job's log file, and offers a confirm button. Failures
 * are reported inline.
 */
export const ToggleLoggingDialog = ({ level, job, enabled, onClose, onChanged }: ToggleLoggingDialogProps) => {
    const [inProgress, setInProgress] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = () => {
        if (inProgress)
            return;

        setInProgress(true);
        setCronJobLogging(level, job, enabled)
                .then(onChanged)
                .catch(error => {
                    console.warn("Failed to change cron job logging:", error);
                    setInProgress(false);
                    setError(_("Failed to change the cron job logging"));
                });
    };

    const display = job.label || displayCommand(job.command);

    return (
        <Modal isOpen position="top" variant="small" onClose={onClose}>
            <ModalHeader
                title={enabled
                    ? cockpit.format(_("Enable logging for \"$0\"?"), display)
                    : cockpit.format(_("Disable logging for \"$0\"?"), display)}
                titleIconVariant={enabled ? "info" : "warning"}
            />
            <ModalBody>
                {error !== null && <Alert variant="danger" isInline title={_("Failed to change the cron job logging")} />}
                {enabled
                    ? <p>{cockpit.format(_("The output of the cron job \"$0\" will be recorded in a log file."), display)}</p>
                    : <p>{cockpit.format(_("The output of the cron job \"$0\" will no longer be logged, and its log file will be deleted."), display)}</p>}
            </ModalBody>
            <ModalFooter>
                <Button id="cron-logging-submit" variant={enabled ? "primary" : "danger"} isLoading={inProgress} isDisabled={inProgress} onClick={submit}>
                    {enabled ? _("Enable logging") : _("Disable logging")}
                </Button>
                <Button variant="link" isDisabled={inProgress} onClick={onClose}>
                    {_("Cancel")}
                </Button>
            </ModalFooter>
        </Modal>
    );
};
