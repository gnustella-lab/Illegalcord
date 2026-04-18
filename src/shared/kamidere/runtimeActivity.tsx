import "./runtimeActivity.css";

import * as DataStore from "@api/DataStore";
import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { createRoot, React } from "@webpack/common";

const cl = classNameFactory("vc-kamidere-runtime-");

const HUD_PREFS_KEY = "kamidere-runtime-activity:v1";
const TASKS_PER_PAGE = 3;
const DOCK_LAUNCHER_VISUAL_SIZE = 12;
const DOCK_LAUNCHER_HITBOX_SIZE = 30;
const DOCK_LAUNCHER_GAP = 4;
const EMPTY_HUD_HEIGHT = 64;
const HUD_BASE_HEIGHT = 34;
const HUD_TASK_HEIGHT = 46;
const HUD_ROW_GAP = 6;
const DEFAULT_DOCKED_LAUNCHER = {
    x: 48,
    y: 8,
    size: DOCK_LAUNCHER_HITBOX_SIZE,
};
const DOCK_ANCHOR_SELECTORS = [
    ".button__63abb.forward__63abb",
    ".forward__63abb",
    "[aria-label='Forward']",
] as const;

export type KamidereRuntimeTaskStatus = "running" | "completed" | "cancelled" | "failed";

export interface KamidereRuntimeTask {
    id: string;
    toolId: string;
    name: string;
    status: KamidereRuntimeTaskStatus;
    subtitle?: string;
    detail?: string;
    progressCurrent?: number;
    progressTotal?: number | null;
    startedAt: number;
    updatedAt: number;
}

interface RuntimeHudPrefs {
    x: number;
    y: number;
    width: number;
    hidden: boolean;
    page: number;
}

const DEFAULT_PREFS: RuntimeHudPrefs = {
    x: 24,
    y: 88,
    width: 318,
    hidden: false,
    page: 0,
};

type RuntimeHudSnapshot = {
    tasks: KamidereRuntimeTask[];
    prefs: RuntimeHudPrefs;
};

interface HudMorphState {
    mode: "collapse" | "expand";
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    fromWidth: number;
    toWidth: number;
    fromHeight: number;
    toHeight: number;
    active: boolean;
}

interface DockedLauncherMetrics {
    x: number;
    y: number;
    size: number;
}

const taskMap = new Map<string, KamidereRuntimeTask>();
const listeners = new Set<() => void>();
let prefs = { ...DEFAULT_PREFS };
let prefsLoaded = false;
let mountNode: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let mountUsers = 0;

function clampWidth(width: number) {
    return Math.max(220, Math.min(420, width));
}

function getSortedTasks() {
    return Array.from(taskMap.values()).sort((left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id));
}

function getMaxPage(taskCount: number) {
    return Math.max(0, Math.ceil(taskCount / TASKS_PER_PAGE) - 1);
}

function getDockedLauncherMetrics(): DockedLauncherMetrics {
    if (typeof document === "undefined") return DEFAULT_DOCKED_LAUNCHER;

    const anchor = DOCK_ANCHOR_SELECTORS
        .map(selector => document.querySelector(selector))
        .find(Boolean) as HTMLElement | null;

    if (!anchor) return DEFAULT_DOCKED_LAUNCHER;

    const rect = anchor.getBoundingClientRect();
    const visualSize = DOCK_LAUNCHER_VISUAL_SIZE;
    const size = DOCK_LAUNCHER_HITBOX_SIZE;

    return {
        x: Math.round(rect.right + DOCK_LAUNCHER_GAP),
        y: Math.round(rect.top + ((rect.height - size) / 2) - 1),
        size,
    };
}

function getExpectedHudHeight(taskCount: number) {
    if (taskCount <= 0) {
        return EMPTY_HUD_HEIGHT;
    }

    const rows = Math.min(taskCount, TASKS_PER_PAGE);
    return HUD_BASE_HEIGHT + rows * HUD_TASK_HEIGHT + Math.max(0, rows - 1) * HUD_ROW_GAP;
}

function getHudMountTarget() {
    if (typeof document === "undefined") return null;
    return document.querySelector("#app-mount") as HTMLElement | null ?? document.body;
}

function getMorphGhostInlineStyle(morphState: HudMorphState) {
    const isCircle = morphState.mode === "expand" ? !morphState.active : morphState.active;

    return {
        left: 0,
        top: 0,
        width: `${morphState.active ? morphState.toWidth : morphState.fromWidth}px`,
        height: `${morphState.active ? morphState.toHeight : morphState.fromHeight}px`,
        transform: `translate3d(${morphState.active ? morphState.toX : morphState.fromX}px, ${morphState.active ? morphState.toY : morphState.fromY}px, 0)`,
        borderRadius: isCircle ? "999px" : "6px",
        borderColor: isCircle ? "transparent" : undefined,
        background: isCircle ? "transparent" : undefined,
        boxShadow: isCircle ? "none" : undefined,
        opacity: isCircle ? 0.42 : 0.86,
    } as React.CSSProperties;
}

function getSnapshot(): RuntimeHudSnapshot {
    const tasks = getSortedTasks();
    const maxPage = getMaxPage(tasks.length);
    if (prefs.page > maxPage) {
        prefs = { ...prefs, page: maxPage };
    }

    return {
        tasks,
        prefs,
    };
}

function notify() {
    listeners.forEach(listener => listener());
}

async function loadPrefs() {
    if (prefsLoaded) return;
    prefsLoaded = true;

    const stored = await DataStore.get(HUD_PREFS_KEY) as Partial<RuntimeHudPrefs> | undefined;
    if (!stored) {
        notify();
        return;
    }

    prefs = {
        x: typeof stored.x === "number" ? stored.x : DEFAULT_PREFS.x,
        y: typeof stored.y === "number" ? stored.y : DEFAULT_PREFS.y,
        width: clampWidth(typeof stored.width === "number" ? stored.width : DEFAULT_PREFS.width),
        hidden: Boolean(stored.hidden),
        page: typeof stored.page === "number" ? stored.page : DEFAULT_PREFS.page,
    };

    notify();
}

function persistPrefs() {
    void DataStore.set(HUD_PREFS_KEY, prefs);
}

export function subscribeKamidereRuntimeActivity(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function upsertKamidereRuntimeTask(task: Omit<KamidereRuntimeTask, "updatedAt"> & { updatedAt?: number; }) {
    if (!root) {
        mountKamidereRuntimeActivity();
    }
    taskMap.set(task.id, {
        ...task,
        updatedAt: task.updatedAt ?? Date.now(),
    });
    notify();
}

export function removeKamidereRuntimeTask(taskId: string) {
    if (!taskMap.delete(taskId)) return;
    notify();
}

export function setKamidereRuntimeHudPrefs(next: Partial<RuntimeHudPrefs>) {
    prefs = {
        ...prefs,
        ...next,
        width: clampWidth(next.width ?? prefs.width),
    };
    persistPrefs();
    notify();
}

export function mountKamidereRuntimeActivity() {
    if (typeof document === "undefined") return;
    const target = getHudMountTarget();
    if (!target) return;

    mountUsers += 1;
    void loadPrefs();

    if (root) {
        if (mountNode && !mountNode.isConnected) target.appendChild(mountNode);
        return;
    }

    if (!mountNode) {
        mountNode = document.createElement("div");
        mountNode.id = "vc-kamidere-runtime-hud-root";
    }
    if (!mountNode.isConnected) {
        target.appendChild(mountNode);
    }

    root = createRoot(mountNode);
    root.render(
        <ErrorBoundary noop>
            <KamidereRuntimeHud />
        </ErrorBoundary>,
    );
}

export function unmountKamidereRuntimeActivity() {
    mountUsers = Math.max(0, mountUsers - 1);
    if (mountUsers > 0) return;

    root?.unmount();
    root = null;
    mountNode?.remove();
    mountNode = null;
}

export function useKamidereRuntimeActivity() {
    const [signal, forceUpdate] = React.useReducer(value => value + 1, 0);

    React.useEffect(() => {
        const unsubscribe = subscribeKamidereRuntimeActivity(forceUpdate);
        void loadPrefs();
        return unsubscribe;
    }, []);

    return React.useMemo(() => getSnapshot(), [signal]);
}

function TaskCard({ task, animate = true }: { task: KamidereRuntimeTask; animate?: boolean; }) {
    const isRunning = task.status === "running";
    const progressPercent = task.progressTotal && task.progressTotal > 0 && task.progressCurrent != null
        ? Math.min(100, Math.max(0, Math.round((task.progressCurrent / task.progressTotal) * 100)))
        : null;
    const progressLabel = task.progressCurrent != null
        ? `${task.progressCurrent}/${task.progressTotal ?? "?"}`
        : task.detail ?? "Live";
    const supplementalDetail = task.detail && task.detail !== progressLabel ? task.detail : null;
    const detailLine = task.subtitle && supplementalDetail
        ? `${task.subtitle} · ${supplementalDetail}`
        : task.subtitle ?? supplementalDetail ?? (isRunning ? "Running" : task.status);

    return (
        <div className={cl("task", animate && "task-enter")}>
            <div className={cl("task-main")}>
                <div className={cl("task-spinner")} aria-hidden={!isRunning} />
                <div className={cl("task-copy")}>
                    <div className={cl("task-title-row")}>
                        <div className={cl("task-name")}>{task.name}</div>
                        <div className={cl("task-count")}>{progressLabel}</div>
                    </div>
                    <div className={cl("task-detail")}>{detailLine}</div>
                </div>
            </div>

            <div className={cl("task-progress-track")}>
                <div
                    className={cl("task-progress-fill")}
                    style={{ width: `${progressPercent ?? 22}%` }}
                />
            </div>
        </div>
    );
}

function CloseIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M7 7L17 17"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
            <path
                d="M17 7L7 17"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function ChevronIcon({ direction }: { direction: "left" | "right"; }) {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d={direction === "left"
                    ? "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                    : "M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"}
            />
        </svg>
    );
}

function LauncherIcon({ spinning = false }: { spinning?: boolean; }) {
    return (
        <span className={cl("launcher-icon", spinning && "launcher-icon-spinning")}>
            <span className={cl("launcher-icon-ring")} />
        </span>
    );
}

function EmptyStateCard() {
    return (
        <div className={cl("empty-state")}>
            <div className={cl("empty-copy")}>
                <div className={cl("empty-title")}>Nothing running right now</div>
                <div className={cl("empty-detail")}>Start a tool and it will appear here live.</div>
            </div>
        </div>
    );
}

function KamidereRuntimeHud() {
    const { tasks, prefs: currentPrefs } = useKamidereRuntimeActivity();
    const hasActiveTasks = tasks.some(task => task.status === "running");
    const [dragging, setDragging] = React.useState(false);
    const [resizing, setResizing] = React.useState(false);
    const [draftPrefs, setDraftPrefs] = React.useState(currentPrefs);
    const [morphState, setMorphState] = React.useState<HudMorphState | null>(null);
    const [dockMetrics, setDockMetrics] = React.useState<DockedLauncherMetrics>(() => getDockedLauncherMetrics());
    const [suppressTaskEntrance, setSuppressTaskEntrance] = React.useState(false);
    const dragStartRef = React.useRef<{ pointerX: number; pointerY: number; x: number; y: number; width: number; } | null>(null);
    const draftPrefsRef = React.useRef(currentPrefs);
    const frameRef = React.useRef<number | null>(null);
    const hudRef = React.useRef<HTMLDivElement | null>(null);
    const previousHasActiveTasksRef = React.useRef<boolean | null>(null);
    const idleHydrationHandledRef = React.useRef(false);
    const shouldTrackDockAggressively = !currentPrefs.hidden || hasActiveTasks || morphState != null;

    const syncDockMetrics = React.useCallback(() => {
        const next = getDockedLauncherMetrics();
        setDockMetrics(current => current.x === next.x && current.y === next.y && current.size === next.size ? current : next);
    }, []);

    React.useEffect(() => {
        if (dragging || resizing) return;
        draftPrefsRef.current = currentPrefs;
        setDraftPrefs(currentPrefs);
    }, [currentPrefs, dragging, resizing]);

    React.useEffect(() => {
        if (typeof document === "undefined") return;

        syncDockMetrics();

        const onWindowChange = () => {
            syncDockMetrics();
        };

        window.addEventListener("resize", onWindowChange);

        if (!shouldTrackDockAggressively) {
            return () => {
                window.removeEventListener("resize", onWindowChange);
            };
        }

        const observer = new MutationObserver(() => {
            syncDockMetrics();
        });

        window.addEventListener("scroll", onWindowChange, true);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        return () => {
            window.removeEventListener("resize", onWindowChange);
            window.removeEventListener("scroll", onWindowChange, true);
            observer.disconnect();
        };
    }, [shouldTrackDockAggressively, syncDockMetrics]);

    React.useEffect(() => () => {
        if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
    }, []);

    const pushDraftPrefs = React.useCallback((next: RuntimeHudPrefs) => {
        draftPrefsRef.current = next;

        if (frameRef.current !== null) return;

        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null;
            setDraftPrefs(draftPrefsRef.current);
        });
    }, []);

    React.useEffect(() => {
        if (!dragging && !resizing) return;

        const onPointerMove = (event: PointerEvent) => {
            const start = dragStartRef.current;
            if (!start) return;

            if (dragging) {
                pushDraftPrefs({
                    ...draftPrefsRef.current,
                    x: start.x + (event.clientX - start.pointerX),
                    y: start.y + (event.clientY - start.pointerY),
                });
                return;
            }

            if (resizing) {
                pushDraftPrefs({
                    ...draftPrefsRef.current,
                    width: clampWidth(start.width + (event.clientX - start.pointerX)),
                });
            }
        };

        const onPointerUp = () => {
            const nextPrefs = draftPrefsRef.current;
            setDragging(false);
            setResizing(false);
            dragStartRef.current = null;
            setKamidereRuntimeHudPrefs(nextPrefs);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);

        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };
    }, [dragging, pushDraftPrefs, resizing]);

    const startDrag = (event: React.PointerEvent) => {
        event.preventDefault();
        dragStartRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            x: currentPrefs.x,
            y: currentPrefs.y,
            width: currentPrefs.width,
        };
        draftPrefsRef.current = currentPrefs;
        setDraftPrefs(currentPrefs);
        setDragging(true);
    };

    const startResize = (event: React.PointerEvent) => {
        event.stopPropagation();
        event.preventDefault();
        dragStartRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            x: currentPrefs.x,
            y: currentPrefs.y,
            width: currentPrefs.width,
        };
        draftPrefsRef.current = currentPrefs;
        setDraftPrefs(currentPrefs);
        setResizing(true);
    };

    const dockStyle = {
        transform: `translate3d(${dockMetrics.x}px, ${dockMetrics.y}px, 0)`,
        width: `${dockMetrics.size}px`,
        height: `${dockMetrics.size}px`,
    } as React.CSSProperties;

    const maxPage = getMaxPage(tasks.length);
    const page = Math.min(currentPrefs.page, maxPage);
    const offset = page * TASKS_PER_PAGE;
    const visibleTasks = tasks.slice(offset, offset + TASKS_PER_PAGE);
    const isEmpty = visibleTasks.length === 0;
    const activePrefs = dragging || resizing ? draftPrefs : currentPrefs;
    const style = {
        transform: `translate3d(${activePrefs.x}px, ${activePrefs.y}px, 0)`,
        width: `${activePrefs.width}px`,
    } as React.CSSProperties;

    const startCollapse = React.useCallback(() => {
        const rect = hudRef.current?.getBoundingClientRect();
        setMorphState({
            mode: "collapse",
            fromX: activePrefs.x,
            fromY: activePrefs.y,
            toX: dockMetrics.x,
            toY: dockMetrics.y,
            fromWidth: rect?.width ?? activePrefs.width,
            toWidth: dockMetrics.size,
            fromHeight: rect?.height ?? 78,
            toHeight: dockMetrics.size,
            active: false,
        });

        window.requestAnimationFrame(() => {
            setMorphState(current => current ? { ...current, active: true } : current);
        });
    }, [activePrefs.x, activePrefs.y, activePrefs.width, dockMetrics.size, dockMetrics.x, dockMetrics.y]);

    const startExpand = React.useCallback(() => {
        setSuppressTaskEntrance(true);
        const rect = hudRef.current?.getBoundingClientRect();
        const targetHeight = rect?.height ?? getExpectedHudHeight(visibleTasks.length);
        setMorphState({
            mode: "expand",
            fromX: dockMetrics.x,
            fromY: dockMetrics.y,
            toX: currentPrefs.x,
            toY: currentPrefs.y,
            fromWidth: dockMetrics.size,
            toWidth: currentPrefs.width,
            fromHeight: dockMetrics.size,
            toHeight: targetHeight,
            active: false,
        });

        window.requestAnimationFrame(() => {
            setMorphState(current => current ? { ...current, active: true } : current);
        });
    }, [currentPrefs.width, currentPrefs.x, currentPrefs.y, dockMetrics.size, dockMetrics.x, dockMetrics.y, visibleTasks.length]);

    React.useEffect(() => {
        if (!morphState?.active) return;

        const timeout = window.setTimeout(() => {
            if (morphState.mode === "collapse") {
                setKamidereRuntimeHudPrefs({ hidden: true });
            } else {
                setKamidereRuntimeHudPrefs({ hidden: false });
            }

            setMorphState(null);
        }, 170);

        return () => window.clearTimeout(timeout);
    }, [morphState]);

    React.useEffect(() => {
        if (currentPrefs.hidden || morphState) return;
        if (!suppressTaskEntrance) return;

        const frame = window.requestAnimationFrame(() => {
            setSuppressTaskEntrance(false);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [currentPrefs.hidden, morphState, suppressTaskEntrance]);

    React.useEffect(() => {
        if (morphState || dragging || resizing) return;

        const previousHasActiveTasks = previousHasActiveTasksRef.current;
        if (hasActiveTasks) {
            if (previousHasActiveTasks !== true) {
                idleHydrationHandledRef.current = false;
            }

            previousHasActiveTasksRef.current = true;
            return;
        }

        if (!hasActiveTasks && !idleHydrationHandledRef.current) {
            idleHydrationHandledRef.current = true;
            if (!currentPrefs.hidden) {
                setKamidereRuntimeHudPrefs({ hidden: true });
            }
        }

        previousHasActiveTasksRef.current = hasActiveTasks;
    }, [currentPrefs.hidden, dragging, hasActiveTasks, morphState, resizing]);

    if (activePrefs.hidden) {
        return (
            <div className={cl("hud-root")}>
                {!morphState && (
                    <button
                        type="button"
                        className={cl("launcher", hasActiveTasks ? "state-active" : "state-idle")}
                        style={dockStyle}
                        onClick={startExpand}
                        aria-label="Open Kamidere runtime tools"
                    >
                        <LauncherIcon spinning={hasActiveTasks} />
                    </button>
                )}
                {morphState && (
                    <div
                        className={cl("morph-ghost", hasActiveTasks ? "state-active" : "state-idle", morphState.active && "morph-ghost-active")}
                        style={getMorphGhostInlineStyle(morphState)}
                    />
                )}
            </div>
        );
    }

    return (
        <div className={cl("hud-root")}>
            {morphState && (
                <div
                    className={cl("morph-ghost", hasActiveTasks ? "state-active" : "state-idle", morphState.active && "morph-ghost-active")}
                    style={getMorphGhostInlineStyle(morphState)}
                />
            )}
        <div
            ref={hudRef}
            className={cl(
                "hud",
                isEmpty && "hud-empty",
                hasActiveTasks ? "state-active" : "state-idle",
                (dragging || resizing) && "hud-interacting",
                morphState?.mode === "collapse" && "hud-collapsing",
            )}
            style={style}
        >
            <div
                className={cl("header", dragging && "header-dragging")}
                onPointerDown={startDrag}
            >
                <div className={cl("title-row")}>
                    <span className={cl("title-dot")} />
                    <div className={cl("title")}>Runtime</div>
                </div>

                <div className={cl("header-actions")}>
                    {tasks.length > TASKS_PER_PAGE && (
                        <>
                            <button
                                type="button"
                                className={cl("header-button")}
                                disabled={page <= 0}
                                onClick={event => {
                                    event.stopPropagation();
                                    setKamidereRuntimeHudPrefs({ page: Math.max(0, page - 1) });
                                }}
                                aria-label="Previous active tools"
                            >
                                <ChevronIcon direction="left" />
                            </button>
                            <button
                                type="button"
                                className={cl("header-button")}
                                disabled={page >= maxPage}
                                onClick={event => {
                                    event.stopPropagation();
                                    setKamidereRuntimeHudPrefs({ page: Math.min(maxPage, page + 1) });
                                }}
                                aria-label="Next active tools"
                            >
                                <ChevronIcon direction="right" />
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        className={cl("header-button")}
                        onClick={event => {
                            event.stopPropagation();
                            startCollapse();
                        }}
                        aria-label="Hide runtime tools"
                    >
                        <CloseIcon />
                    </button>
                </div>
            </div>

            <div className={cl("task-row")}>
                {visibleTasks.length > 0
                    ? visibleTasks.map(task => <TaskCard key={task.id} task={task} animate={!suppressTaskEntrance} />)
                    : <EmptyStateCard />}
            </div>

            <div className={cl("resize-edge", "resize-edge-right")} onPointerDown={startResize} />
        </div>
        </div>
    );
}

