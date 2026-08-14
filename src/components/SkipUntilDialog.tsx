/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useState } from 'react';
import { ActionGroup } from "@patternfly/react-core/dist/esm/components/Form/ActionGroup";
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DatePicker } from "@patternfly/react-core/dist/esm/components/DatePicker";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText";
import { Modal, ModalBody, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import cockpit from 'cockpit';

import { setCronJobSkipUntil, displayCommand, type CronJob, type CronLevel } from "../cron";

const _ = cockpit.gettext;

/** Format a date as the "YYYY-MM-DD" value used by the date picker. */
function formatDate(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Format a date as the "HH:MM" value used by the time input. */
function formatTime(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Props for the {@link SkipUntilDialog} component.
 */
export interface SkipUntilDialogProps {
    /** which set of crontabs the job belongs to */
    level: CronLevel;
    /** the job to skip or resume */
    job: CronJob;
    /** callback invoked when the dialog is closed */
    onClose: () => void;
    /** callback invoked after the skip state was successfully saved */
    onSaved: () => void;
}

/**
 * Dialog for skipping a cron job until a chosen date and time, or resuming a
 * skipped job immediately.
 *
 * A skipped job stops running until the selected time, after which it is
 * re-enabled again. The dialog validates that the chosen time is in the
 * future and offers a resume action for jobs that are currently skipped.
 */
export const SkipUntilDialog = ({ level, job, onClose, onSaved }: SkipUntilDialogProps) => {
    const [skipDate, setSkipDate] = useState(() => {
        if (job.skipUntil)
            return job.skipUntil.split("T")[0];
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return formatDate(tomorrow);
    });
    const [skipTime, setSkipTime] = useState(() => {
        if (job.skipUntil) {
            // a hand-edited timestamp may carry seconds; only the hours and
            // minutes are used, so drop anything after them
            const parts = (job.skipUntil.split("T")[1] ?? "").split(":");
            return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0] ?? "";
        }
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return formatTime(tomorrow);
    });
    const [inProgress, setInProgress] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isSkipped = job.skipUntil !== undefined;

    /**
     * The next occurrence of the given month, day, and time at or after now,
     * skipping years in which the date does not exist, such as February 29 in
     * a non-leap year.
     *
     * @param month - the month, one based
     * @param day - the day of month
     * @param hour - the hour
     * @param minute - the minute
     */
    const nextOccurrence = (month: number, day: number, hour: number, minute: number): Date => {
        const now = Date.now();
        let year = new Date().getFullYear();
        while (true) {
            const candidate = new Date(year, month - 1, day, hour, minute);
            if (candidate.getFullYear() === year &&
                    candidate.getMonth() === month - 1 &&
                    candidate.getDate() === day &&
                    candidate.getTime() > now)
                return candidate;
            year++;
        }
    };

    /**
     * Parse the skip date and time fields into a well formed date, or null
     * when they are malformed or an impossible date such as February 31.
     */
    const parseSkipDateTime = (): { chosen: Date, month: number, day: number, hour: number, minute: number } | null => {
        const dateMatch = skipDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const timeMatch = skipTime.match(/^(\d{2}):(\d{2})$/);
        if (!dateMatch || !timeMatch)
            return null;

        const [, year, month, day] = dateMatch.map(Number);
        const hour = Number(timeMatch[1]);
        const minute = Number(timeMatch[2]);
        if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59)
            return null;

        // reject impossible dates such as February 31 by round-tripping them
        const chosen = new Date(year, month - 1, day, hour, minute);
        if (chosen.getFullYear() !== year ||
                chosen.getMonth() !== month - 1 ||
                chosen.getDate() !== day)
            return null;

        return { chosen, month, day, hour, minute };
    };

    /**
     * Whether the chosen date and time can be honored by a cron schedule.
     * A resume job is a plain five field schedule without a year, so it fires
     * on the next occurrence of the chosen month and day. Only a date that is
     * that next occurrence is accepted; any other date would resume the job
     * at the wrong time.
     */
    const isDateTimeValid = () => {
        const parsed = parseSkipDateTime();
        if (parsed === null)
            return false;
        return parsed.chosen.getTime() === nextOccurrence(parsed.month, parsed.day, parsed.hour, parsed.minute).getTime();
    };

    /** Whether the date is well formed but not the next occurrence, for a hint. */
    const isTooFarAhead = () => {
        const parsed = parseSkipDateTime();
        if (parsed === null)
            return false;
        return parsed.chosen.getTime() !== nextOccurrence(parsed.month, parsed.day, parsed.hour, parsed.minute).getTime();
    };

    const submit = () => {
        if (inProgress || !isDateTimeValid())
            return;

        setInProgress(true);
        setCronJobSkipUntil(level, job, `${skipDate}T${skipTime}`)
                .then(onSaved)
                .catch(() => {
                    console.warn("Failed to skip the cron job");
                    setInProgress(false);
                    setError(_("Failed to skip the cron job"));
                });
    };

    const resume = () => {
        if (inProgress)
            return;

        setInProgress(true);
        setCronJobSkipUntil(level, job, null)
                .then(onSaved)
                .catch(() => {
                    console.warn("Failed to resume the cron job");
                    setInProgress(false);
                    setError(_("Failed to resume the cron job"));
                });
    };

    const display = job.label || displayCommand(job.command);

    return (
        <Modal isOpen position="top" variant="small" onClose={onClose}>
            <ModalHeader title={isSkipped ? _("Edit skip") : _("Skip cron job")} />
            <ModalBody>
                {error !== null && <Alert variant="danger" isInline title={error} />}
                <p className="cron-skip-description">{cockpit.format(_("The cron job \"$0\" will not run until the chosen date and time."), display)}</p>
                <Form isHorizontal onSubmit={e => { e.preventDefault(); submit() }}>
                    <FormGroup label={_("Skip until date")} fieldId="cron-skip-date">
                        <DatePicker
                            value={skipDate}
                            appendTo={document.body}
                            inputProps={{ id: "cron-skip-date", "aria-label": _("Skip until date") }}
                            onChange={(_event, value) => {
                                setSkipDate(value);
                                setError(null);
                            }}
                        />
                        {isTooFarAhead() && (
                            <HelperText>
                                <HelperTextItem variant="warning">
                                    {_("The date must be within the next occurrence of the chosen month and day.")}
                                </HelperTextItem>
                            </HelperText>
                        )}
                    </FormGroup>
                    <FormGroup label={_("Skip until time")} fieldId="cron-skip-time">
                        <TextInput
                            id="cron-skip-time"
                            aria-label={_("Skip until time")}
                            placeholder={_("e.g. 12:00")}
                            value={skipTime}
                            onChange={(_event, value) => {
                                setSkipTime(value);
                                setError(null);
                            }}
                        />
                    </FormGroup>
                    <ActionGroup>
                        <Button
                            id="cron-skip-submit"
                            variant="primary"
                            type="submit"
                            isDisabled={inProgress || !isDateTimeValid()}
                            isLoading={inProgress}
                        >
                            {_("Skip until")}
                        </Button>
                        {isSkipped && (
                            <Button id="cron-skip-resume" variant="secondary" isDisabled={inProgress} onClick={resume}>
                                {_("Resume now")}
                            </Button>
                        )}
                        <Button variant="link" isDisabled={inProgress} onClick={onClose}>
                            {_("Cancel")}
                        </Button>
                    </ActionGroup>
                </Form>
            </ModalBody>
        </Modal>
    );
};
