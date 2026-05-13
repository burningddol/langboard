import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import type { IEditorContent } from "@/core/models/Base";

type TBoardCardUnsavedSection = "deadline" | "description" | "title";
export interface IBoardCardDetailsPatch {
    deadline_at?: Date | "";
    description?: IEditorContent;
    title?: string;
}

type TSectionHandler = () => IBoardCardDetailsPatch | null | void | Promise<IBoardCardDetailsPatch | null | void>;

interface IBoardCardUnsavedActionsContext {
    markSectionDirty: (section: TBoardCardUnsavedSection, dirty: bool) => void;
    resetSection: (section: TBoardCardUnsavedSection) => void;
    resetAll: () => void;
    getHasUnsavedChanges: () => bool;
    registerSectionSaveHandler: (section: TBoardCardUnsavedSection, handler: TSectionHandler) => () => void;
    registerSectionCancelHandler: (section: TBoardCardUnsavedSection, handler: TSectionHandler) => () => void;
    saveDirtySections: () => Promise<IBoardCardDetailsPatch | false>;
    cancelDirtySections: () => void;
}

const BoardCardUnsavedActionsContext = createContext<IBoardCardUnsavedActionsContext | null>(null);

export const BoardCardUnsavedProvider = ({ children }: { children: React.ReactNode }) => {
    const sectionStateRef = useRef<Partial<Record<TBoardCardUnsavedSection, bool>>>({});
    const hasUnsavedChangesRef = useRef(false);
    const saveHandlersRef = useRef<Partial<Record<TBoardCardUnsavedSection, TSectionHandler>>>({});
    const cancelHandlersRef = useRef<Partial<Record<TBoardCardUnsavedSection, TSectionHandler>>>({});

    const updateDirtyFlag = useCallback(() => {
        hasUnsavedChangesRef.current = Object.values(sectionStateRef.current).some(Boolean);
    }, []);

    const markSectionDirty = useCallback(
        (section: TBoardCardUnsavedSection, dirty: bool) => {
            const next = sectionStateRef.current;
            if (!!next[section] === dirty) {
                return;
            }

            if (!dirty) {
                delete next[section];
            } else {
                next[section] = true;
            }

            updateDirtyFlag();
        },
        [updateDirtyFlag]
    );

    const resetSection = useCallback(
        (section: TBoardCardUnsavedSection) => {
            const next = sectionStateRef.current;
            if (!next[section]) {
                return;
            }

            delete next[section];
            updateDirtyFlag();
        },
        [updateDirtyFlag]
    );

    const resetAll = useCallback(() => {
        sectionStateRef.current = {};
        hasUnsavedChangesRef.current = false;
    }, []);

    const registerSectionSaveHandler = useCallback((section: TBoardCardUnsavedSection, handler: TSectionHandler) => {
        saveHandlersRef.current[section] = handler;

        return () => {
            if (saveHandlersRef.current[section] === handler) {
                delete saveHandlersRef.current[section];
            }
        };
    }, []);

    const registerSectionCancelHandler = useCallback((section: TBoardCardUnsavedSection, handler: TSectionHandler) => {
        cancelHandlersRef.current[section] = handler;

        return () => {
            if (cancelHandlersRef.current[section] === handler) {
                delete cancelHandlersRef.current[section];
            }
        };
    }, []);

    const saveDirtySections = useCallback(async () => {
        const dirtySections = Object.keys(sectionStateRef.current) as TBoardCardUnsavedSection[];
        const details: IBoardCardDetailsPatch = {};

        for (const section of dirtySections) {
            const handler = saveHandlersRef.current[section];
            if (!handler) {
                return false;
            }

            try {
                const result = await handler();
                if (result) {
                    Object.assign(details, result);
                }
            } catch {
                return false;
            }
        }

        return details;
    }, []);

    const cancelDirtySections = useCallback(() => {
        const dirtySections = Object.keys(sectionStateRef.current) as TBoardCardUnsavedSection[];

        for (const section of dirtySections) {
            cancelHandlersRef.current[section]?.();
        }

        resetAll();
    }, [resetAll]);

    const actionsValue = useMemo(
        () => ({
            markSectionDirty,
            resetSection,
            resetAll,
            getHasUnsavedChanges: () => hasUnsavedChangesRef.current,
            registerSectionSaveHandler,
            registerSectionCancelHandler,
            saveDirtySections,
            cancelDirtySections,
        }),
        [markSectionDirty, resetSection, resetAll, registerSectionSaveHandler, registerSectionCancelHandler, saveDirtySections, cancelDirtySections]
    );

    return <BoardCardUnsavedActionsContext.Provider value={actionsValue}>{children}</BoardCardUnsavedActionsContext.Provider>;
};

export const useBoardCardUnsavedActions = () => {
    const context = useContext(BoardCardUnsavedActionsContext);
    if (!context) {
        throw new Error("useBoardCardUnsavedActions must be used within BoardCardUnsavedProvider");
    }

    return context;
};
