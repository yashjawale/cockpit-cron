/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React from 'react';
import { ToggleGroup, ToggleGroupItem } from "@patternfly/react-core/dist/esm/components/ToggleGroup";
import { ServerIcon, UserIcon } from '@patternfly/react-icons';

import cockpit from 'cockpit';

import type { CronLevel } from "../cron";

const _ = cockpit.gettext;

/**
 * Props for the {@link LevelSwitcher} component.
 */
export interface LevelSwitcherProps {
    /** the currently selected level */
    level: CronLevel;
    /** callback invoked when the user selects a level */
    onSelect: (level: CronLevel) => void;
}

/**
 * Toggle group that switches between system level and user level cron jobs.
 */
export const LevelSwitcher = ({ level, onSelect }: LevelSwitcherProps) => {
    return (
        <ToggleGroup aria-label={_("Cron job level")}>
            <ToggleGroupItem
                text={_("System")}
                icon={<ServerIcon />}
                buttonId="cron-level-system"
                isSelected={level === "system"}
                onChange={() => onSelect("system")}
            />
            <ToggleGroupItem
                text={_("User")}
                icon={<UserIcon />}
                buttonId="cron-level-user"
                isSelected={level === "user"}
                onChange={() => onSelect("user")}
            />
        </ToggleGroup>
    );
};
