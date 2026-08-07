/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useState } from 'react';
import { ActionGroup } from "@patternfly/react-core/dist/esm/components/Form/ActionGroup";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import cockpit from 'cockpit';

import { addCronJob, updateCronJob, type CronJob, type CronLevel } from "../cron";
import { isValidSchedule } from "../cron-parser";

const _ = cockpit.gettext;

/** Common schedule presets offered in the dialog. */
const SCHEDULE_PRESETS = [
    "@hourly",
    "@daily",
    "@weekly",
    "@monthly",
    "@reboot"
] as const;

/**
 * Props for the {@link AddCronJobDialog} component.
 */
export interface AddCronJobDialogProps {
    /** which set of crontabs the job belongs to */
    level: CronLevel;
    /** the job to edit, or undefined to add a new job */
    job?: CronJob;
    /** callback invoked when the dialog is closed */
    onClose: () => void;
    /** callback invoked after the job was successfully saved */
    onSaved: () => void;
}

/**
 * Dialog for adding a new cron job to the crontab of the current level, or
 * editing an existing one.
 *
 * Lets the user pick a schedule from common presets or enter a custom
 * schedule, and enter the command to run.
 */
export const AddCronJobDialog = ({ level, job, onClose, onSaved }: AddCronJobDialogProps) => {
    const [customSchedule, setCustomSchedule] = useState(
        job !== undefined && !(SCHEDULE_PRESETS as readonly string[]).includes(job.schedule));
    const [schedule, setSchedule] = useState<string>(job?.schedule ?? SCHEDULE_PRESETS[1]);
    const [command, setCommand] = useState(job?.command ?? "");
    const [error, setError] = useState<string | null>(null);

    const isEditing = job !== undefined;
    const isScheduleValid = isValidSchedule(schedule);
    const isValid = isScheduleValid && command.trim() !== "";

    const submit = () => {
        if (!isValid)
            return;

        const save = isEditing
            ? updateCronJob(level, job!, schedule.trim(), command.trim())
            : addCronJob(level, schedule.trim(), command.trim());

        save
                .then(onSaved)
                .catch(error => {
                    console.warn("Failed to save cron job:", error);
                    setError(isEditing ? _("Failed to save the cron job") : _("Failed to add the cron job"));
                });
    };

    return (
        <Modal isOpen onClose={onClose} variant="small">
            <ModalHeader title={isEditing ? _("Edit cron job") : _("Add cron job")} />
            <ModalBody>
                <Form isHorizontal onSubmit={e => { e.preventDefault(); submit() }}>
                    <FormGroup label={_("Schedule")} fieldId="cron-schedule" isRequired>
                        <FormSelect
                            id="cron-schedule"
                            aria-label={_("Schedule")}
                            value={customSchedule ? "custom" : schedule}
                            onChange={(_event, value) => {
                                if (value === "custom") {
                                    setCustomSchedule(true);
                                    setSchedule("");
                                } else {
                                    setCustomSchedule(false);
                                    setSchedule(value);
                                }
                                setError(null);
                            }}
                        >
                            {SCHEDULE_PRESETS.map(preset => (
                                <FormSelectOption key={preset} value={preset} label={preset} />
                            ))}
                            <FormSelectOption value="custom" label={_("Custom schedule...")} />
                        </FormSelect>
                        {customSchedule && (
                            <div className="cron-custom-schedule">
                                <TextInput
                                    id="cron-schedule-custom"
                                    aria-label={_("Custom schedule")}
                                    placeholder={_("e.g. 0 4 * * 1")}
                                    value={schedule}
                                    onChange={(_event, value) => setSchedule(value)}
                                />
                            </div>
                        )}
                    </FormGroup>
                    <FormGroup label={_("Command")} fieldId="cron-command" isRequired>
                        <TextInput
                            id="cron-command"
                            aria-label={_("Command")}
                            placeholder={_("e.g. /usr/bin/uptime")}
                            value={command}
                            onChange={(_event, value) => setCommand(value)}
                        />
                    </FormGroup>
                    <ActionGroup>
                        <Button id="cron-add-submit" variant="primary" type="submit" isDisabled={!isValid}>
                            {isEditing ? _("Save") : _("Add job")}
                        </Button>
                        <Button variant="link" onClick={onClose}>
                            {_("Cancel")}
                        </Button>
                    </ActionGroup>
                </Form>
            </ModalBody>
            {error !== null && <ModalFooter>{error}</ModalFooter>}
        </Modal>
    );
};
