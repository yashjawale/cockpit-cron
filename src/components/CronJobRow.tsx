/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useEffect, useState } from 'react';
import { Badge } from "@patternfly/react-core/dist/esm/components/Badge";
import { Dropdown, DropdownItem, DropdownList } from "@patternfly/react-core/dist/esm/components/Dropdown";
import {
    DataListAction,
    DataListCell,
    DataListItem,
    DataListItemCells,
    DataListItemRow,
    DataListText,
} from "@patternfly/react-core/dist/esm/components/DataList";
import { MenuToggle } from "@patternfly/react-core/dist/esm/components/MenuToggle";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch";
import { EllipsisVIcon } from '@patternfly/react-icons/dist/esm/icons/ellipsis-v-icon';

import cockpit from 'cockpit';

import type { CronJob } from "../cron";

const _ = cockpit.gettext;

/** Format an ISO timestamp for display, e.g. "Aug 10, 2026, 12:00 PM". */
function formatSkipUntil(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return iso;
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Props for the {@link CronJobRow} component.
 */
export interface CronJobRowProps {
    /** the cron job to display */
    job: CronJob;
    /** callback invoked when the user wants to edit the job */
    onEdit: (job: CronJob) => void;
    /** callback invoked when the user wants to delete the job */
    onDelete: (job: CronJob) => void;
    /** callback invoked when the user wants to skip the job until a date */
    onSkip: (job: CronJob) => void;
    /** callback invoked when the user toggles the enabled state of the job */
    onToggleEnabled: (job: CronJob, enabled: boolean) => void;
    /** whether this row was just changed from outside and should be highlighted */
    highlight: boolean;
    /** a counter that changes each time a job is highlighted, to retrigger the effect */
    highlightTick: number;
}

/**
 * A single cron job rendered as a row of a data list.
 *
 * The row shows an enable switch, the job title followed by its schedule, and
 * a kebab menu with edit, skip, and delete actions. A skipped job carries an
 * outline label below the title that shows until when it is paused.
 */
export const CronJobRow = ({ job, onEdit, onDelete, onSkip, onToggleEnabled, highlight, highlightTick }: CronJobRowProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [flash, setFlash] = useState(false);
    const [highlightActive, setHighlightActive] = useState(false);

    // highlight the row briefly after the enabled state changes
    useEffect(() => {
        if (!flash)
            return;
        const timer = setTimeout(() => setFlash(false), 4000);
        return () => clearTimeout(timer);
    }, [flash]);

    // highlight the row briefly after an external change, e.g. skipping it
    useEffect(() => {
        if (!highlight)
            return;
        setHighlightActive(true);
        const timer = setTimeout(() => setHighlightActive(false), 4000);
        return () => clearTimeout(timer);
    }, [highlight, highlightTick]);

    return (
        <DataListItem className={flash || highlightActive ? "ct-new-item" : ""} aria-labelledby={`cron-job-${job.id}`}>
            <DataListItemRow>
                <DataListItemCells
            dataListCells={[
                <DataListCell key='switch' isFilled={false}>
                    <Switch
                            id={`cron-job-toggle-${job.id}`}
                            aria-label={_("Enable job")}
                            isChecked={job.enabled}
                            onChange={(_event, enabled) => {
                                setFlash(true);
                                onToggleEnabled(job, enabled);
                            }}
                    />
                </DataListCell>,
                <DataListCell key="job" id={`cron-job-${job.id}`}>
                    <div className="cron-job-main">
                        <div className="cron-job-title">
                            <DataListText className={job.enabled ? "" : "cron-job-disabled"}>{job.label || job.command}</DataListText>
                        </div>
                        {job.skipUntil !== undefined && (
                            <Badge isDisabled>
                                {cockpit.format(_("Skipped until $0"), formatSkipUntil(job.skipUntil))}
                            </Badge>
                        )}
                    </div>
                </DataListCell>,
                <DataListCell key="schedule" className={`cron-monospace ${job.enabled ? "" : "cron-job-disabled"}`}>{job.schedule}</DataListCell>
            ]}
                />
                <DataListAction
                    id={`cron-job-actions-${job.id}`}
                    aria-labelledby={`cron-job-${job.id}`}
                    aria-label={_("Job actions")}
                >
                    <Dropdown
                        isOpen={isOpen}
                        onOpenChange={setIsOpen}
                        toggle={toggleRef => (
                            <MenuToggle
                                ref={toggleRef}
                                id={`cron-job-menu-${job.id}`}
                                variant="plain"
                                isExpanded={isOpen}
                                aria-label={_("Job actions")}
                                onClick={() => setIsOpen(!isOpen)}
                            >
                                <EllipsisVIcon />
                            </MenuToggle>
                        )}
                    >
                        <DropdownList>
                            <DropdownItem onClick={() => onEdit(job)}>
                                {_("Edit")}
                            </DropdownItem>
                            <DropdownItem onClick={() => onSkip(job)}>
                                {_("Skip until...")}
                            </DropdownItem>
                            <DropdownItem isDanger onClick={() => onDelete(job)}>
                                {_("Delete")}
                            </DropdownItem>
                        </DropdownList>
                    </Dropdown>
                </DataListAction>
            </DataListItemRow>
        </DataListItem>
    );
};
