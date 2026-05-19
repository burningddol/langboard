import Dialog from "@/components/base/Dialog";
import { usePageNavigateRef } from "@/core/hooks/usePageNavigate";
import { useAuth } from "@/core/providers/AuthProvider";
import { ROUTES } from "@/core/routing/constants";
import { getEditorStore } from "@/core/stores/EditorStore";
import { cn } from "@/core/utils/ComponentUtils";
import BoardCard from "@/pages/BoardPage/components/card/BoardCard";
import { BoardCardUnsavedProvider, useBoardCardUnsavedActions } from "@/pages/BoardPage/components/card/BoardCardUnsavedProvider";
import { EHttpStatus } from "@langboard/core/enums";
import { memo, useRef, useState, useEffect } from "react";
import { Navigate, useParams } from "react-router";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/plate-ui/alert-dialog";
import { useTranslation } from "react-i18next";
import { useBoardController } from "@/core/providers/BoardController";

interface IBoardCardPageProps {
    projectUID?: string;
    cardUID?: string;
    embedded?: bool;
    isExpanded?: bool;
    setIsExpanded?: React.Dispatch<React.SetStateAction<bool>>;
}

const BoardCardPageComponent = ({
    projectUID: projectUIDProp,
    cardUID: cardUIDProp,
    embedded = false,
    isExpanded: controlledIsExpanded,
    setIsExpanded: controlledSetIsExpanded,
}: IBoardCardPageProps) => {
    const navigate = usePageNavigateRef();
    const { currentUser } = useAuth();
    const params = useParams();
    const projectUID = projectUIDProp ?? params.projectUID;
    const cardUID = cardUIDProp ?? params.cardUID;
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const [isDirtyAlertOpen, setIsDirtyAlertOpen] = useState(false);
    const [isComposing, setIsComposing] = useState(false);
    const [localIsExpanded, setLocalIsExpanded] = useState(false);
    const isExpanded = controlledIsExpanded ?? localIsExpanded;
    const setIsExpanded = controlledSetIsExpanded ?? setLocalIsExpanded;
    const { selectCardViewType } = useBoardController();
    const shouldHideForCardSelection = !!selectCardViewType;
    const { resetAll, getHasUnsavedChanges } = useBoardCardUnsavedActions();
    const [t] = useTranslation();

    if (!projectUID || !cardUID) {
        return <Navigate to={ROUTES.ERROR(EHttpStatus.HTTP_404_NOT_FOUND)} replace />;
    }

    const close = () => {
        navigate({
            pathname: ROUTES.BOARD.MAIN(projectUID),
            search: window.location.search,
        });
    };

    const requestClose = () => {
        setIsDirtyAlertOpen(true);
    };

    const handleCloseRequest = () => {
        // Ignore close request during IME composition to prevent double ESC handling
        if (isComposing) {
            return;
        }

        if (getHasUnsavedChanges()) {
            requestClose();
            return;
        }

        close();
    };

    // Detect IME composition state to handle Korean input properly
    useEffect(() => {
        const handleCompositionStart = () => setIsComposing(true);
        const handleCompositionEnd = () => setIsComposing(false);

        document.addEventListener("compositionstart", handleCompositionStart);
        document.addEventListener("compositionend", handleCompositionEnd);

        return () => {
            document.removeEventListener("compositionstart", handleCompositionStart);
            document.removeEventListener("compositionend", handleCompositionEnd);
        };
    }, []);

    return (
        <>
            {currentUser && cardUID && (
                <>
                    <Dialog.Root
                        modal={false}
                        open={true}
                        onOpenChange={(isOpen) => {
                            if (!isOpen && !selectCardViewType) {
                                handleCloseRequest();
                            }
                        }}
                    >
                        <Dialog.Content
                            className={cn(
                                "border-0 p-0 shadow-none",
                                isExpanded &&
                                    (embedded
                                        ? [
                                              "pointer-events-auto absolute inset-0 z-[1]",
                                              "h-full w-full max-w-none overflow-hidden",
                                              "rounded-none bg-background",
                                          ]
                                        : [
                                              "pointer-events-auto fixed bottom-0 left-0 right-0 top-16",
                                              "w-auto max-w-none overflow-hidden rounded-none bg-background",
                                              "md:left-[var(--board-chat-sidebar-width,0px)]",
                                          ]),
                                !isExpanded && [
                                    "h-[calc(100dvh-theme(spacing.6))] max-h-[calc(100dvh-theme(spacing.6))]",
                                    "max-w-[100vw] overflow-visible bg-transparent",
                                    "sm:h-[calc(100dvh-theme(spacing.8))] sm:max-h-[calc(100dvh-theme(spacing.8))]",
                                    "sm:max-w-[90vw] lg:max-w-[1120px]",
                                ],
                                shouldHideForCardSelection && "pointer-events-none -z-[9998] opacity-0"
                            )}
                            overlayClassName={
                                shouldHideForCardSelection
                                    ? "!pointer-events-none bg-transparent opacity-0 backdrop-blur-none"
                                    : isExpanded
                                      ? "!pointer-events-none !absolute !inset-0 !z-[1] bg-transparent backdrop-blur-none"
                                      : undefined
                            }
                            overlayContentClassName={shouldHideForCardSelection || isExpanded ? "pointer-events-none" : undefined}
                            contentWrapperClassName={
                                shouldHideForCardSelection
                                    ? "pointer-events-none"
                                    : cn(
                                          "pointer-events-none [&_[data-dialog-content=true]]:pointer-events-auto",
                                          !isExpanded && "!items-start pb-2 pt-4 sm:pt-6",
                                          !isExpanded && "[&_[data-radix-scroll-area-viewport]>div]:!overflow-visible"
                                      )
                            }
                            viewportClassName={!isExpanded ? "!py-0" : undefined}
                            aria-describedby=""
                            withCloseButton={false}
                            nonModalOverlay
                            disablePortal={embedded}
                            viewportRef={viewportRef}
                            onInteractOutside={(event) => {
                                if (isExpanded) {
                                    event.preventDefault();
                                }
                            }}
                            onOverlayInteract={(event) => {
                                if (isExpanded) {
                                    event.preventDefault();
                                    return;
                                }

                                if (getHasUnsavedChanges()) {
                                    requestClose();
                                    return;
                                }

                                if (getEditorStore().isInCurrentEditor()) {
                                    event.preventDefault();
                                    event.stopPropagation();

                                    getEditorStore().setCurrentEditor(null);
                                }
                            }}
                        >
                            <BoardCard
                                projectUID={projectUID}
                                cardUID={cardUID}
                                currentUser={currentUser}
                                viewportRef={viewportRef}
                                isExpanded={isExpanded}
                                setIsExpanded={setIsExpanded}
                                onClose={handleCloseRequest}
                            />
                        </Dialog.Content>
                    </Dialog.Root>
                </>
            )}
            <AlertDialog open={isDirtyAlertOpen} onOpenChange={setIsDirtyAlertOpen}>
                <AlertDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("card.unsavedChanges.Discard card edits?")}</AlertDialogTitle>
                        <AlertDialogDescription className="whitespace-pre-line">
                            {t("card.unsavedChanges.You have unsaved card changes.\nLeaving now will discard them.")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("card.unsavedChanges.Keep editing")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                resetAll();
                                setIsDirtyAlertOpen(false);
                                close();
                            }}
                        >
                            {t("card.unsavedChanges.Discard changes")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

const BoardCardPage = memo((props: IBoardCardPageProps) => {
    return (
        <BoardCardUnsavedProvider>
            <BoardCardPageComponent {...props} />
        </BoardCardUnsavedProvider>
    );
});

export default BoardCardPage;
