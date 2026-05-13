import { EBotPlatform, EBotPlatformRunningType } from "@langboard/core/ai";
import { TEditorCollaborationType } from "@langboard/core/constants";

export type TBotValueInputType = "default" | "text" | "json" | "none";

export type TBotValueDefaultInputRefLike = {
    type: "default-bot-json";
    value: string;
    validate: (shouldFocus?: bool) => bool;
    onSuccess: () => void;
};

export type TSharedBotValueInputProps = Omit<IBotValueInputProps, "valueType">;

export interface IBotValueInputProps {
    collaborationType?: TEditorCollaborationType;
    platform: EBotPlatform;
    platformRunningType: EBotPlatformRunningType;
    section?: number | string;
    uid?: number | string;
    value: string;
    valueType: TBotValueInputType;
    newValueRef: React.RefObject<string>;
    isValidating: bool;
    disabled?: bool;
    isEditing?: bool;
    startEditing?: () => void;
    cancelEditing?: () => void;
    previewByDialog?: bool;
    change?: () => void;
    required?: bool;
    label: string;
    ref?: React.Ref<HTMLInputElement | HTMLTextAreaElement | TBotValueDefaultInputRefLike>;
}
