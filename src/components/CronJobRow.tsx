/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useState } from 'react';
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
import { EllipsisVIcon } from '@patternfly/react-icons/dist/esm/icons/ellipsis-v-icon';

import cockpit from 'cockpit';

import type { CronJob } from "../cron";

const _ = cockpit.gettext;

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
}

/**
 * A single cron job rendered as a row of a data list.
 *
 * The row shows the job command followed by its schedule, and a kebab menu
 * with edit and delete actions.
 */
export const CronJobRow = ({ job, onEdit, onDelete }: CronJobRowProps) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <DataListItem aria-labelledby={`cron-job-${job.id}`}>
            <DataListItemRow>
                <DataListItemCells
                    dataListCells={[
                        <DataListCell key="command" id={`cron-job-${job.id}`}>
                            <DataListText>{job.command}</DataListText>
                        </DataListCell>,
                        <DataListCell key="schedule">{job.schedule}</DataListCell>
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
