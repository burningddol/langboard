/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Plate } from "platejs/react";
import { TUseCreateEditor, useCreateEditor } from "@/components/Editor/useCreateEditor";
import { Editor, EditorContainer } from "@/components/plate-ui/editor";
import { IEditorContent } from "@/core/models/Base";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Value } from "platejs";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { EditorDataProvider, TEditorDataProviderProps, useEditorData } from "@/core/providers/EditorDataProvider";
import { TEditor } from "@/components/Editor/editor-kit";
import { useMounted } from "@/core/hooks/useMounted";
import { YjsPlugin } from "@platejs/yjs/react";
import { PlateEditor as TPlateEditor } from "platejs/react";
import { MarkdownPlugin } from "@platejs/markdown";
import { useSocket } from "@/core/providers/SocketProvider";
import { EEditorType } from "@langboard/core/constants";
import { ESocketTopic } from "@langboard/core/enums";
import type { TSocketScopedTopic } from "@/core/stores/socket/types";
import { useTranslation } from "react-i18next";
import SyncBlocker from "@/components/Collaborative/SyncBlocker";

interface IEditorSyncRichPatchRequest {
    document_name: string;
    value: string;
}

interface IRichPatchSocketTarget {
    topic: TSocketScopedTopic;
    topicId: string;
}

const EDITOR_SYNC_RICH_PATCH_REQUEST_EVENT = "editor-sync:rich-draft-patch-request";
const EMPTY_EDITOR_VALUE: Value = [{ type: "p", children: [{ text: "" }] }];
const YJS_SELECTION_MISMATCH_ERROR = "Path doesn't match yText";

type TEditorOnChange = () => void;

const isYjsSelectionMismatchError = (error: unknown) => {
    return error instanceof Error && error.message.includes(YJS_SELECTION_MISMATCH_ERROR);
};

const isEditorOnChange = (value: unknown): value is TEditorOnChange => {
    return typeof value === "function";
};

interface IBasePlateEditorProps extends Omit<TUseCreateEditor, "plugins"> {
    setValue?: (value: IEditorContent) => void;
    onEditorChange?: (editor: TEditor) => void;
    serializeOnChange?: bool;
    focusOnReady?: bool;
    variant?: React.ComponentProps<typeof Editor>["variant"];
    className?: string;
    containerClassName?: string;
    editorRef?: React.RefObject<TEditor | null>;
    editorComponentRef?: React.Ref<HTMLDivElement>;
    placeholder?: string;
    deserializedValue?: Value;
    onCollaborativeValueReady?: (updateValue: ((value: string) => void) | null) => void;
    onCollaborativeValueResetReady?: (resetValue: ((value: string) => void) | null) => void;
}

interface IPlateViewerProps extends IBasePlateEditorProps {
    setValue?: never;
    readOnly: true;
}

interface IPlateEditorProps extends IBasePlateEditorProps {
    setValue: (value: IEditorContent) => void;
    readOnly?: bool;
}

export type TPlateEditorProps = IPlateViewerProps | IPlateEditorProps;

export function PlateEditor(props: TPlateEditorProps & Omit<TEditorDataProviderProps, "children">) {
    return (
        <EditorDataProvider {...(props as any)}>
            <EditorWrapper {...props} />
        </EditorDataProvider>
    );
}

function EditorWrapper({
    value,
    readOnly,
    variant = "ai",
    serializeOnChange = true,
    focusOnReady = false,
    className,
    containerClassName,
    setValue,
    onEditorChange,
    editorRef,
    editorComponentRef,
    placeholder,
    deserializedValue,
    onCollaborativeValueReady,
    onCollaborativeValueResetReady,
    ...props
}: TPlateEditorProps) {
    if (!editorRef) {
        editorRef = useRef<TEditor>(null);
    }

    const [t] = useTranslation();
    const internalEditorComponentRef = useRef<HTMLDivElement>(null);
    const [isCollaborativeReady, setIsCollaborativeReady] = useState(false);
    const [showSyncUnavailable, setShowSyncUnavailable] = useState(false);
    const [collaborativeRetryKey, setCollaborativeRetryKey] = useState(0);
    const handleCollaborativeSyncChange = useCallback((isSynced: bool) => {
        setIsCollaborativeReady(isSynced);
    }, []);
    const editor = useCreateEditor({
        value,
        readOnly,
        deserializedValue,
        onCollaborativeSyncChange: handleCollaborativeSyncChange,
        ...props,
    } as TUseCreateEditor);
    const mounted = useMounted();
    const socket = useSocket();
    const { documentID, editorType, form } = useEditorData();
    const isWaitingForCollaborativeReady = !readOnly && !!documentID && !isCollaborativeReady;
    const valueRef = useRef(value);
    const deserializedValueRef = useRef(deserializedValue);
    valueRef.current = value;
    deserializedValueRef.current = deserializedValue;
    const richPatchSocketTarget = useMemo<IRichPatchSocketTarget | null>(() => {
        if (!documentID) {
            return null;
        }

        if (editorType === EEditorType.CardDescription && form?.card_uid) {
            return {
                topic: ESocketTopic.BoardCard,
                topicId: form.card_uid as string,
            };
        }

        if (editorType === EEditorType.WikiContent && form?.wiki_uid) {
            return {
                topic: ESocketTopic.BoardWikiPrivate,
                topicId: form.wiki_uid as string,
            };
        }

        return null;
    }, [documentID, editorType, form]);
    const focusEditor = useCallback(() => {
        if (!focusOnReady || readOnly) {
            return;
        }

        const focusElement = internalEditorComponentRef.current;
        if (!focusElement) {
            return;
        }

        window.setTimeout(() => {
            try {
                editor.tf.focus({ edge: "endEditor", retries: 3 });
            } catch (e) {
                console.log(e);
                focusElement.focus();
            }
        }, 0);
    }, [editor, focusOnReady, readOnly]);
    const normalizeEditorValue = useCallback((value: Value) => {
        if (value.length) {
            return value;
        }

        return EMPTY_EDITOR_VALUE;
    }, []);
    const getEditorValue = useCallback(
        (editor: TPlateEditor) => {
            if (deserializedValueRef.current) {
                return normalizeEditorValue(deserializedValueRef.current);
            }

            if (valueRef.current) {
                return normalizeEditorValue(editor.getApi(MarkdownPlugin).markdown.deserialize(valueRef.current.content));
            } else {
                return EMPTY_EDITOR_VALUE;
            }
        },
        [normalizeEditorValue]
    );

    const handleValueChange = useCallback(
        (opts: { editor: TPlateEditor }) => {
            if (readOnly) {
                return;
            }

            onEditorChange?.(opts.editor as TEditor);

            if (!serializeOnChange) {
                return;
            }

            const nextContent = opts.editor.getApi(MarkdownPlugin).markdown.serialize();
            if (nextContent === valueRef.current?.content) {
                return;
            }

            setValue?.({
                content: nextContent,
            });
        },
        [onEditorChange, readOnly, serializeOnChange, setValue]
    );

    editorRef.current = editor;

    const updateCollaborativeValue = useCallback(
        (nextContent: string) => {
            const nextValue = normalizeEditorValue(editor.getApi(MarkdownPlugin).markdown.deserialize(nextContent));
            editor.tf.reset();
            editor.tf.setValue(nextValue);
            setValue?.({
                content: nextContent,
            });
        },
        [editor, normalizeEditorValue, setValue]
    );

    const hasRemoteCollaborativeEditor = useCallback(() => {
        const awareness = editor.getOptions(YjsPlugin)?.awareness;
        if (!awareness) {
            return false;
        }

        return Array.from(awareness.getStates().keys()).some((clientID) => clientID !== awareness.clientID);
    }, [editor]);

    const resetCollaborativeValue = useCallback(
        (nextContent: string) => {
            if (hasRemoteCollaborativeEditor()) {
                return;
            }

            updateCollaborativeValue(nextContent);
        },
        [hasRemoteCollaborativeEditor, updateCollaborativeValue]
    );

    useEffect(() => {
        if (readOnly || !documentID || !isCollaborativeReady) {
            onCollaborativeValueReady?.(null);
            return;
        }

        onCollaborativeValueReady?.(updateCollaborativeValue);
        return () => {
            onCollaborativeValueReady?.(null);
        };
    }, [documentID, isCollaborativeReady, onCollaborativeValueReady, readOnly, updateCollaborativeValue]);

    useEffect(() => {
        if (readOnly || !documentID || !isCollaborativeReady) {
            onCollaborativeValueResetReady?.(null);
            return;
        }

        onCollaborativeValueResetReady?.(resetCollaborativeValue);
        return () => {
            onCollaborativeValueResetReady?.(null);
        };
    }, [documentID, isCollaborativeReady, onCollaborativeValueResetReady, readOnly, resetCollaborativeValue]);

    useEffect(() => {
        setIsCollaborativeReady(readOnly || !documentID);
    }, [documentID, readOnly]);

    useEffect(() => {
        if (!mounted || readOnly || !documentID || !richPatchSocketTarget) {
            return;
        }

        const callback = (data: IEditorSyncRichPatchRequest) => {
            if (data.document_name !== documentID) {
                return;
            }

            updateCollaborativeValue(data.value);
        };

        socket.on<IEditorSyncRichPatchRequest>({
            topic: richPatchSocketTarget.topic,
            topicId: richPatchSocketTarget.topicId,
            event: EDITOR_SYNC_RICH_PATCH_REQUEST_EVENT,
            eventKey: documentID,
            callback,
        });

        return () => {
            socket.off({
                topic: richPatchSocketTarget.topic,
                topicId: richPatchSocketTarget.topicId,
                event: EDITOR_SYNC_RICH_PATCH_REQUEST_EVENT,
                eventKey: documentID,
                callback: callback as unknown as (data: unknown) => void,
            });
        };
    }, [documentID, mounted, readOnly, richPatchSocketTarget, socket, updateCollaborativeValue]);

    useEffect(() => {
        if (!mounted || readOnly || !documentID) {
            return;
        }

        const yjsApi = editor.getApi(YjsPlugin)?.yjs;
        if (!yjsApi) {
            return;
        }

        setIsCollaborativeReady(false);
        const originalOnChange = editor.onChange;
        if (!isEditorOnChange(originalOnChange)) {
            return;
        }

        editor.onChange = () => {
            try {
                originalOnChange();
            } catch (error) {
                if (!isYjsSelectionMismatchError(error)) {
                    throw error;
                }

                editor.selection = null;
                originalOnChange();
            }
        };

        try {
            editor.tf.blur();
        } catch {
            // The editor can be between mount and editable registration here.
        }
        editor.selection = null;
        yjsApi.init({
            id: documentID,
            autoSelect: false,
            selection: null,
            value: getEditorValue(editor),
            onReady: () => {
                if (editor.getOptions(YjsPlugin)?._isSynced) {
                    setIsCollaborativeReady(true);
                }
            },
        });

        return () => {
            editor.onChange = originalOnChange;
            setIsCollaborativeReady(false);
            yjsApi.destroy();
        };
    }, [collaborativeRetryKey, documentID, editor, focusEditor, getEditorValue, mounted, readOnly]);

    useEffect(() => {
        if (isCollaborativeReady) {
            focusEditor();
        }
    }, [focusEditor, isCollaborativeReady]);

    useEffect(() => {
        if (!isWaitingForCollaborativeReady) {
            setShowSyncUnavailable(false);
            return;
        }

        const timeoutID = window.setTimeout(() => {
            setShowSyncUnavailable(true);
        }, 5_000);

        return () => {
            window.clearTimeout(timeoutID);
        };
    }, [isWaitingForCollaborativeReady]);

    useEffect(() => {
        if (!mounted || readOnly || !focusOnReady || documentID) {
            return;
        }

        focusEditor();
    }, [documentID, focusEditor, focusOnReady, mounted, readOnly]);

    const setEditorComponentRefs = useCallback(
        (node: HTMLDivElement | null) => {
            internalEditorComponentRef.current = node;

            if (!editorComponentRef) {
                return;
            }

            if (typeof editorComponentRef === "function") {
                editorComponentRef(node);
                return;
            }

            editorComponentRef.current = node;
        },
        [editorComponentRef]
    );

    return (
        <FocusScope trapped={false} loop={false} className="w-full outline-none">
            <Plate editor={editor} readOnly={readOnly} onValueChange={handleValueChange}>
                <div className="relative">
                    <EditorContainer className={containerClassName}>
                        <Editor variant={variant} className={className} placeholder={placeholder} readOnly={readOnly} ref={setEditorComponentRefs} />
                    </EditorContainer>
                    {isWaitingForCollaborativeReady && (
                        <SyncBlocker
                            actionLabel={showSyncUnavailable ? t("common.Refresh") : undefined}
                            label={t(showSyncUnavailable ? "common.Realtime sync unavailable." : "common.Syncing draft...")}
                            onAction={showSyncUnavailable ? () => setCollaborativeRetryKey((prev) => prev + 1) : undefined}
                        />
                    )}
                </div>
            </Plate>
        </FocusScope>
    );
}
