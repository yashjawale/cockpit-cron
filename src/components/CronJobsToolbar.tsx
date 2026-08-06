/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { PlusIcon } from '@patternfly/react-icons/dist/esm/icons/plus-icon';
import { SearchInput } from "@patternfly/react-core/dist/esm/components/SearchInput";
import { Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem } from "@patternfly/react-core/dist/esm/components/Toolbar";

import cockpit from 'cockpit';

import type { CronLevel } from "../cron";
import { LevelSwitcher } from "./LevelSwitcher";

const _ = cockpit.gettext;

/**
 * Props for the {@link CronJobsToolbar} component.
 */
export interface CronJobsToolbarProps {
    /** the currently selected level */
    level: CronLevel;
    /** callback invoked when the user selects a level */
    onSelectLevel: (level: CronLevel) => void;
    /** the current job filter text */
    filter: string;
    /** callback invoked when the job filter changes */
    onFilterChange: (filter: string) => void;
    /** callback invoked when the user wants to add a job */
    onAddJob: () => void;
}

/**
 * Toolbar with a job filter search box on the left and the add job button and
 * system/user level switcher aligned to the right.
 */
export const CronJobsToolbar = ({ level, onSelectLevel, filter, onFilterChange, onAddJob }: CronJobsToolbarProps) => {
    return (
        <Toolbar className="cron-jobs-toolbar">
            <ToolbarContent>
                <ToolbarItem align={{ default: 'alignStart' }}>
                    <Button id="cron-add-job" variant="primary" icon={<PlusIcon />} onClick={onAddJob}>
                        {_("Add job")}
                    </Button>
                </ToolbarItem>
                <ToolbarGroup align={{ default: 'alignEnd' }}>
                    <SearchInput
                        placeholder={_("Filter jobs")}
                        searchInputId="cron-jobs-filter"
                        value={filter}
                        onChange={(_event, value) => onFilterChange(value)}
                        onClear={() => onFilterChange("")}
                    />
                    <LevelSwitcher level={level} onSelect={onSelectLevel} />
                </ToolbarGroup>
            </ToolbarContent>
        </Toolbar>
    );
};
