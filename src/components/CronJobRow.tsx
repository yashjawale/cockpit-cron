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
    DataListContent,
    DataListItem,
    DataListItemCells,
    DataListItemRow,
    DataListText,
} from "@patternfly/react-core/dist/esm/components/DataList";
import { MenuToggle } from "@patternfly/react-core/dist/esm/components/MenuToggle";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch";
import { EllipsisVIcon } from '@patternfly/react-icons/dist/esm/icons/ellipsis-v-icon';
import { ListIcon } from '@patternfly/react-icons/dist/esm/icons/list-icon';

import cockpit from 'cockpit';

import { unwrapLoggingCommand, type CronJob, type CronLevel } from "../cron";
import { CronJobLogs } from "./CronJobLogs";

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
    /** which set of crontabs the job belongs to */
    level: CronLevel;
    /** the cron job to display */
    job: CronJob;
    /** callback invoked when the user wants to edit the job */
    onEdit: (job: CronJob) => void;
    /** callback invoked when the user wants to delete the job */
    onDelete: (job: CronJob) => void;
    /** callback invoked when the user toggles logging for the job */
    onToggleLogging: (job: CronJob, enabled: boolean) => void;
    /** callback invoked when the user wants to prune the job's logs */
    onPruneLogs: (job: CronJob) => void;
    /** a counter that triggers a reload of the expanded logs when incremented */
    logRefresh: number;
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
 * a kebab menu with edit, skip, logging, and delete actions. A skipped job
 * carries a label below the title that shows until when it is paused, and a
 * logged job shows a logs button that expands the row into a run log viewer.
 */
export const CronJobRow = ({ level, job, onEdit, onDelete, onToggleLogging, onPruneLogs, logRefresh, onSkip, onToggleEnabled, highlight, highlightTick }: CronJobRowProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
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

    const display = job.label || (job.logFile !== undefined ? unwrapLoggingCommand(job.command) : job.command);

    return (
        <DataListItem isExpanded={isExpanded} className={flash || highlightActive ? "ct-new-item" : ""} aria-labelledby={`cron-job-${job.id}`}>
            <DataListItemRow>
                <DataListItemCells
                    dataListCells={[
                        <DataListCell key="switch" isFilled={false}>
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
                        <DataListCell key="job" id={`cron-job-${job.id}`} className="cron-job-label-cell">
                            <div className="cron-job-main">
                                <div className="cron-job-title">
                                    <DataListText className={job.enabled ? "" : "cron-job-disabled"}>{display}</DataListText>
                                </div>
                                {job.skipUntil !== undefined && (
                                    <Badge isDisabled>
                                        {cockpit.format(_("Skipped until $0"), formatSkipUntil(job.skipUntil))}
                                    </Badge>
                                )}
                            </div>
                        </DataListCell>,
                        <DataListCell key="schedule" className={`cron-job-schedule-cell cron-monospace ${job.enabled ? "" : "cron-job-disabled"}`}>{job.schedule}</DataListCell>
                    ]}
                />
                <DataListAction
                    id={`cron-job-actions-${job.id}`}
                    className="cron-job-actions"
                    aria-labelledby={`cron-job-${job.id}`}
                    aria-label={_("Job actions")}
                >
                    {job.logFile !== undefined && (
                        <MenuToggle
                            id={`cron-job-logs-${job.id}`}
                            className={`cron-job-logs-toggle${isExpanded ? " cron-job-logs-toggle-expanded" : ""}`}
                            variant="plain"
                            isExpanded={isExpanded}
                            aria-label={_("View logs")}
                            aria-expanded={isExpanded}
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            <ListIcon />
                        </MenuToggle>
                    )}
                    <Dropdown
                        isOpen={isOpen}
                        onOpenChange={setIsOpen}
                        popperProps={{ preventOverflow: true }}
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
                            {job.logFile !== undefined
                                ? (
                                    <>
                                        <DropdownItem onClick={() => onToggleLogging(job, false)}>
                                            {_("Disable logging")}
                                        </DropdownItem>
                                        <DropdownItem onClick={() => onPruneLogs(job)}>
                                            {_("Prune logs")}
                                        </DropdownItem>
                                    </>
                                )
                                : (
                                    <DropdownItem onClick={() => onToggleLogging(job, true)}>
                                        {_("Enable logging")}
                                    </DropdownItem>
                                )}
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
            {job.logFile !== undefined && (
                <DataListContent id={`cron-job-logs-content-${job.id}`} aria-label={_("Job logs")} isHidden={!isExpanded} hasNoPadding>
                    {isExpanded && <CronJobLogs level={level} job={job} refresh={logRefresh} />}
                </DataListContent>
            )}
        </DataListItem>
    );
};
