export enum EBotPlatform {
    Default = "default",
    Langflow = "langflow",
    N8N = "n8n",
}

export enum EBotPlatformRunningType {
    Default = "default",
    Endpoint = "endpoint",
    FlowJson = "flow_json",
}

export const AVAILABLE_RUNNING_TYPES_BY_PLATFORM: Record<EBotPlatform, EBotPlatformRunningType[]> = {
    [EBotPlatform.Default]: [EBotPlatformRunningType.Default],
    [EBotPlatform.Langflow]: [EBotPlatformRunningType.Endpoint, EBotPlatformRunningType.FlowJson],
    [EBotPlatform.N8N]: [EBotPlatformRunningType.Default],
};

export const ALLOWED_ALL_IPS_BY_PLATFORMS: Record<EBotPlatform, EBotPlatformRunningType[]> = {
    [EBotPlatform.Default]: [EBotPlatformRunningType.Default],
    [EBotPlatform.Langflow]: [EBotPlatformRunningType.FlowJson],
    [EBotPlatform.N8N]: [EBotPlatformRunningType.Default],
};

export const AGENT_MODELS = [
    "OpenAI",
    "Azure OpenAI",
    "Groq",
    "Anthropic",
    "NVIDIA",
    "IBM Watson",
    "Amazon Bedrock",
    "Google Generative AI",
    "SambaNova",
    "Ollama",
    "LM Studio",
] as const;

export type TAgentModelName = (typeof AGENT_MODELS)[number];

export enum EApiPermission {
    Read = "read",
    Create = "create",
    Edit = "edit",
    Delete = "delete",
}

export enum EAgentPermissionLevel {
    Read = "read",
    Edit = "edit",
    FullAccess = "full_access",
}

export const AGENT_PERMISSION_LEVEL_PERMISSIONS: Record<EAgentPermissionLevel, EApiPermission[]> = {
    [EAgentPermissionLevel.Read]: [EApiPermission.Read],
    [EAgentPermissionLevel.Edit]: [EApiPermission.Read, EApiPermission.Create, EApiPermission.Edit],
    [EAgentPermissionLevel.FullAccess]: [EApiPermission.Read, EApiPermission.Create, EApiPermission.Edit, EApiPermission.Delete],
};
