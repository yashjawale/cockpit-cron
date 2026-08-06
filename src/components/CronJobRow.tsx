/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React from 'react';
import {
    DataListCell,
    DataListItem,
    DataListItemCells,
    DataListItemRow,
    DataListText,
} from "@patternfly/react-core/dist/esm/components/DataList";

import type { CronJob } from "../cron";

/**
 * Props for the {@link CronJobRow} component.
 */
export interface CronJobRowProps {
    /** the cron job to display */
    job: CronJob;
}

/**
 * A single cron job rendered as a row of a data list.
 *
 * The row shows the job command followed by its schedule.
 */
export const CronJobRow = ({ job }: CronJobRowProps) => {
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
            </DataListItemRow>
        </DataListItem>
    );
};
