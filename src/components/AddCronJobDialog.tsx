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

import { addCronJob, type CronLevel } from "../cron";
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
    /** which set of crontabs the new job is added to */
    level: CronLevel;
    /** callback invoked when the dialog is closed */
    onClose: () => void;
    /** callback invoked after the job was successfully added */
    onAdded: () => void;
}

/**
 * Dialog for adding a new cron job to the crontab of the current level.
 *
 * Lets the user pick a schedule from common presets or enter a custom
 * schedule, and enter the command to run.
 */
export const AddCronJobDialog = ({ level, onClose, onAdded }: AddCronJobDialogProps) => {
    const [schedule, setSchedule] = useState<string>(SCHEDULE_PRESETS[1]);
    const [customSchedule, setCustomSchedule] = useState(false);
    const [command, setCommand] = useState("");
    const [error, setError] = useState<string | null>(null);

    const isScheduleValid = isValidSchedule(schedule);
    const isValid = isScheduleValid && command.trim() !== "";

    const submit = () => {
        if (!isValid)
            return;

        addCronJob(level, schedule.trim(), command.trim())
                .then(onAdded)
                .catch(error => {
                    console.warn("Failed to add cron job:", error);
                    setError(_("Failed to add the cron job"));
                });
    };

    return (
        <Modal isOpen onClose={onClose} variant="small">
            <ModalHeader title={_("Add cron job")} />
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
                            {_("Add job")}
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
