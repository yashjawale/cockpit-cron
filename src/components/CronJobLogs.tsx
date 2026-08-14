/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2024 Red Hat, Inc.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert";
import { CalendarMonth } from "@patternfly/react-core/dist/esm/components/CalendarMonth";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Menu, MenuContent, MenuItem, MenuList } from "@patternfly/react-core/dist/esm/components/Menu";

import cockpit from 'cockpit';

import { readCronJobLogs, type CronJob, type CronLevel, type CronRun } from "../cron";

const _ = cockpit.gettext;

/** Format a date as the local "YYYY-MM-DD" key used to group runs by day. */
function dayKey(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Format a run timestamp for display, e.g. "10:00:00". */
function formatRunTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return iso;
    return date.toLocaleTimeString();
}

/**
 * Props for the {@link CronJobLogs} component.
 */
export interface CronJobLogsProps {
    /** which set of crontabs the job belongs to */
    level: CronLevel;
    /** the cron job whose logs to display */
    job: CronJob;
    /** a counter that triggers a reload of the log when incremented */
    refresh: number;
}

/**
 * The logs of a cron job, shown in an expanded row.
 *
 * Presents three columns: a calendar that marks the days the job ran, the
 * runs of the selected day, and the output of the selected run.
 */
export const CronJobLogs = ({ level, job, refresh }: CronJobLogsProps) => {
    const [runs, setRuns] = useState<CronRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [selectedRun, setSelectedRun] = useState<string | null>(null);
    const [viewerHeight, setViewerHeight] = useState<number | null>(null);
    const [isStacked, setIsStacked] = useState(false);
    const calendarRef = useRef<HTMLDivElement>(null);

    // only the three column layout uses the calendar height, the medium and
    // small layouts stack the columns and scroll with their own max heights
    useEffect(() => {
        const media = window.matchMedia("(max-width: 1100px)");
        const update = () => setIsStacked(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    // size the viewer to the calendar so that the runs and log columns scroll
    // within the same height as the calendar
    useEffect(() => {
        const element = calendarRef.current;
        if (!element || isStacked)
            return;

        const update = () => setViewerHeight(element.offsetHeight);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [runs, isStacked]);

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        setError(null);
        readCronJobLogs(level, job)
                .then(result => {
                    if (!cancelled) {
                        setRuns(result);
                        setLoading(false);
                        if (result.length > 0) {
                            const latest = result[result.length - 1];
                            setSelectedDay(current => current ?? new Date(latest.timestamp));
                            setSelectedRun(current => current ?? latest.id);
                        }
                    }
                })
                .catch(error => {
                    if (!cancelled) {
                        setRuns([]);
                        setError(error instanceof Error ? error.message : String(error));
                        setLoading(false);
                    }
                });

        return () => {
            cancelled = true;
        };
    }, [level, job, refresh]);

    const runsByDay = new Map<string, CronRun[]>();
    for (const run of runs) {
        const key = dayKey(new Date(run.timestamp));
        const dayRuns = runsByDay.get(key);
        if (dayRuns)
            dayRuns.push(run);
        else
            runsByDay.set(key, [run]);
    }

    const selectedDayRuns = selectedDay !== null ? (runsByDay.get(dayKey(selectedDay)) ?? []) : [];
    const selected = runs.find(run => run.id === selectedRun) ?? selectedDayRuns[0] ?? null;

    const selectDay = (date: Date) => {
        setSelectedDay(date);
        const dayRuns = runsByDay.get(dayKey(date));
        setSelectedRun(dayRuns && dayRuns.length > 0 ? dayRuns[0].id : null);
    };

    if (loading)
        return <EmptyState><EmptyStateBody>{_("Loading logs...")}</EmptyStateBody></EmptyState>;

    if (error !== null)
        return (
            <EmptyState>
                <EmptyStateBody>
                    <Alert id="cron-job-logs-error" isInline variant="danger" title={_("Failed to read the job logs")}>
                        {error}
                    </Alert>
                </EmptyStateBody>
            </EmptyState>
        );

    if (runs.length === 0)
        return <EmptyState><EmptyStateBody>{_("No runs recorded yet")}</EmptyStateBody></EmptyState>;

    return (
        <div className="cron-log-viewer" style={viewerHeight !== null && !isStacked ? { height: viewerHeight } : undefined}>
            <div className="cron-log-column cron-log-calendar-column">
                <div ref={calendarRef} className="cron-log-calendar">
                    <CalendarMonth
                        {...(selectedDay !== null ? { date: selectedDay } : {})}
                        onChange={(_event, date) => selectDay(date)}
                        dayFormat={date => {
                            const hasRuns = runsByDay.has(dayKey(date));
                            return (
                                <div className="cron-log-calendar-day">
                                    {date.getDate()}
                                    {hasRuns && <span className="cron-log-calendar-dot" />}
                                </div>
                            );
                        }}
                    />
                </div>
            </div>
            <div className="cron-log-column cron-log-runs-column">
                {selectedDayRuns.length === 0
                    ? <EmptyState><EmptyStateBody>{_("No runs on this day")}</EmptyStateBody></EmptyState>
                    : (
                        <Menu
                            className="cron-log-runs"
                            isPlain
                            onSelect={(_event, itemId) => setSelectedRun(String(itemId))}
                            selected={selected?.id}
                        >
                            <MenuContent>
                                <MenuList>
                                    {selectedDayRuns.map(run => (
                                        <MenuItem key={run.id} itemId={run.id}>
                                            {formatRunTime(run.timestamp)}
                                        </MenuItem>
                                    ))}
                                </MenuList>
                            </MenuContent>
                        </Menu>
                    )}
            </div>
            <div className="cron-log-column cron-log-log-column">
                {selected === null
                    ? <EmptyState><EmptyStateBody>{_("No log selected")}</EmptyStateBody></EmptyState>
                    : <pre className="cron-log-output">{selected.output}</pre>}
            </div>
        </div>
    );
};
