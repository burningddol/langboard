/* eslint-disable @typescript-eslint/no-explicit-any */
import BotRunner from "@/core/ai/BotRunner";
import SnowflakeID from "@/core/db/SnowflakeID";
import EventManager from "@/core/server/EventManager";
import { Utils } from "@langboard/core/utils";
import { ESocketStatus, ESocketTopic } from "@langboard/core/enums";
import ChatHistory from "@/models/ChatHistory";
import { EInternalBotType } from "@/models/InternalBot";
import ProjectAssignedInternalBot from "@/models/ProjectAssignedInternalBot";
import { SocketEvents } from "@langboard/core/constants";
import ChatSession from "@/models/ChatSession";
import { TChatScope } from "@langboard/core/types";
import ProjectChatSession from "@/models/ProjectChatSession";
import { EAgentPermissionLevel } from "@langboard/core/ai";
import { EEditorCollaborationType } from "@langboard/core/constants";
import { getActiveEditorSyncDocumentNames } from "@/core/server/Hocus";

const parseEditorSyncDocumentName = (documentName: string) => {
    const [type, entityUID, section, ...extraParts] = documentName.split(":");
    if (!type || !entityUID || extraParts.length > 0) {
        return null;
    }

    return {
        entityUID,
        section,
        type,
    };
};

const isAgentPermissionLevel = (value: unknown): value is EAgentPermissionLevel => {
    return Object.values(EAgentPermissionLevel).some((permissionLevel) => permissionLevel === value);
};

const getCollaborativeDocumentSchema = (type: string, section?: string) => {
    if (type === EEditorCollaborationType.BoardColumnName) {
        return {
            api_field: "name",
            field: "name",
        };
    }

    if (type === EEditorCollaborationType.Card) {
        switch (section) {
            case "title":
                return { api_field: "title", field: "title" };
            case "description":
                return { api_field: "description" };
            case "deadline":
                return { api_field: "deadline_at", field: "value" };
            case "members":
                return { api_field: "assigned_users", field: "selected-member-uids" };
            case "labels":
                return { api_field: "labels", field: "selected-label-uids" };
            case "relationships-parents":
            case "relationships-children":
                return { api_field: "relationships", field: "selected-relationships" };
            default:
                if (section?.startsWith("attachment-")) {
                    return { api_field: "attachment_name", field: "name" };
                }
                if (section?.startsWith("comment-")) {
                    return { api_field: "content" };
                }
                if (section?.startsWith("checklist-")) {
                    return { api_field: "title", field: "title" };
                }
                if (section?.startsWith("checkitem-") && section.endsWith("-deadline")) {
                    return { api_field: "deadline_at", field: "value" };
                }
                if (section?.startsWith("checkitem-")) {
                    return { api_field: "title", field: "title" };
                }
                if (section?.startsWith("metadata-")) {
                    return { api_field: "metadata", field: "key/value" };
                }
        }
    }

    if (type === EEditorCollaborationType.Wiki) {
        switch (section) {
            case "title":
                return { api_field: "title", field: "title" };
            case "content":
                return { api_field: "content" };
            case "private-assignees":
                return { api_field: "assignees", field: "selected-member-uids" };
            default:
                if (section?.startsWith("metadata-")) {
                    return { api_field: "metadata", field: "key/value" };
                }
        }
    }

    if (type === EEditorCollaborationType.BotSchedule) {
        return { api_field: "schedule", field: "schedule" };
    }

    return {};
};

const getActiveCollaborativeDocuments = async (projectUID: string, scopeTable: TChatScope | undefined, scopeUID: string | undefined) => {
    if (!scopeUID) {
        return [];
    }

    let type: EEditorCollaborationType | undefined;
    switch (scopeTable) {
        case "card":
            type = EEditorCollaborationType.Card;
            break;
        case "project_wiki":
            type = EEditorCollaborationType.Wiki;
            break;
        case "project_column":
            type = EEditorCollaborationType.BoardColumnName;
            break;
    }

    if (!type) {
        return [];
    }

    const lookupUID = type === EEditorCollaborationType.BoardColumnName ? projectUID : scopeUID;
    const scopedDocumentLookups = [{ type, lookupUID }];
    if (scopeTable === "card" || scopeTable === "project_column") {
        scopedDocumentLookups.push({
            type: EEditorCollaborationType.BotSchedule,
            lookupUID: projectUID,
        });
    }

    const activeDocumentNames = (
        await Promise.all(scopedDocumentLookups.map((lookup) => getActiveEditorSyncDocumentNames(lookup.type, lookup.lookupUID)))
    ).flat();
    const activeDocuments = activeDocumentNames.flatMap((documentName) => {
        const parsed = parseEditorSyncDocumentName(documentName);
        if (!parsed) {
            return [];
        }

        if (parsed.type === EEditorCollaborationType.BoardColumnName && scopeUID && parsed.section !== scopeUID) {
            return [];
        }
        if (
            parsed.type === EEditorCollaborationType.BotSchedule &&
            scopeTable &&
            scopeUID &&
            !parsed.section?.startsWith(`${scopeTable}-${scopeUID}-`)
        ) {
            return [];
        }

        return [
            {
                document_name: documentName,
                entity_uid: parsed.entityUID,
                section: parsed.section,
                type: parsed.type,
                ...getCollaborativeDocumentSchema(parsed.type, parsed.section),
            },
        ];
    });

    return activeDocuments;
};

EventManager.on(ESocketTopic.Board, SocketEvents.CLIENT.BOARD.CHAT.IS_AVAILABLE, async ({ client, topicId }) => {
    const [internalBot, _] = (await ProjectAssignedInternalBot.getInternalBotByProjectUID(EInternalBotType.ProjectChat, topicId)) ?? [null, null];
    let isAvailable = false;
    if (internalBot) {
        try {
            isAvailable = await BotRunner.isAvailable({ internalBot });
        } catch {
            isAvailable = false;
        }
    }

    const apiBot = internalBot?.apiResponse ?? null;

    client.send({
        topic: ESocketTopic.Board,
        topic_id: topicId,
        event: SocketEvents.SERVER.BOARD.CHAT.IS_AVAILABLE,
        data: { available: isAvailable, bot: apiBot },
    });
});

EventManager.on(ESocketTopic.Board, SocketEvents.CLIENT.BOARD.CHAT.SEND, async ({ client, topicId, data }) => {
    const { message, file_path, task_id, session_uid, scope_uid } = data ?? {};
    if (!Utils.Type.isString(message) || !Utils.Type.isString(task_id)) {
        client.sendError(ESocketStatus.WS_4001_INVALID_DATA, "Invalid message data", false);
        return;
    }

    const internalBotResult = await ProjectAssignedInternalBot.getInternalBotByProjectUID(EInternalBotType.ProjectChat, topicId);
    if (!internalBotResult) {
        client.sendError(ESocketStatus.WS_4001_INVALID_DATA, "No chat bot available for this project", false);
        return;
    }

    const [internalBot, internalBotSettings] = internalBotResult;
    const apiPermissionLevel = isAgentPermissionLevel(data?.api_permission_level) ? data.api_permission_level : EAgentPermissionLevel.Read;
    const restData: Record<string, any> = {
        api_permission_level: apiPermissionLevel,
    };

    const scopeTable = data.scope_table as TChatScope | undefined;
    const scopeUID = Utils.Type.isString(scope_uid) ? scope_uid : undefined;
    if (scopeTable) {
        restData.chat_scope = scopeTable;
        switch (scopeTable) {
            case "project_column":
                restData.project_column_uid = scopeUID;
                break;
            case "card":
                restData.card_uid = scopeUID;
                break;
            case "project_wiki":
                restData.project_wiki_uid = scopeUID;
                break;
            default:
                restData.chat_scope = "project";
                break;
        }
    }

    const activeCollaborativeDocuments = await getActiveCollaborativeDocuments(topicId, scopeTable, scopeUID);
    if (activeCollaborativeDocuments.length) {
        restData.active_collaborative_documents = activeCollaborativeDocuments;
        restData.collaborative_edit_instruction = [
            "Some fields in the current scope are being edited in real time.",
            "When changing one of those fields, use the normal matching edit API with the intended final field value.",
            "The API will automatically update the active collaborative draft instead of saving directly.",
            "Do not store unsaved draft values in metadata.",
        ].join(" ");
    }

    const response = await BotRunner.runAbortable({
        internalBot,
        internalBotSettings,
        taskID: task_id,
        data: {
            message,
            file_path,
            project_uid: topicId,
            user_id: client.user.id,
            rest_data: restData,
        },
    });

    if (!response) {
        client.send({
            event: SocketEvents.SERVER.BOARD.CHAT.IS_AVAILABLE,
            topic: ESocketTopic.Board,
            topic_id: topicId,
        });
        return;
    }

    const isAborted = BotRunner.createAbortedChecker(EInternalBotType.ProjectChat, task_id);
    if (isAborted()) {
        return;
    }

    let chatSession: ChatSession | null = null;
    let session: ProjectChatSession | null = null;
    if (!Utils.Type.isString(session_uid) || !session_uid) {
        chatSession = await ChatSession.create({
            user_id: client.user.id,
            title: "Untitled",
            last_messaged_at: new Date(),
        }).save();

        session = await ProjectChatSession.create({
            chat_session_id: chatSession.id,
            project_id: SnowflakeID.fromShortCode(topicId).toString(),
        }).save();

        client.send({
            event: SocketEvents.SERVER.BOARD.CHAT.SESSION,
            topic: ESocketTopic.Board,
            topic_id: topicId,
            data: {
                session: {
                    ...chatSession.apiResponse,
                    ...session.apiResponse,
                },
            },
        });

        BotRunner.createTitle({
            internalBot,
            internalBotSettings,
            data: {
                message,
                user_id: client.user.id,
                project_uid: topicId,
            },
        }).then(async (title) => {
            title ||= "Untitled";
            if (!chatSession || !session || chatSession.title === title) {
                return;
            }

            chatSession.title = title;
            await ChatSession.update(chatSession.id, {
                title,
            });

            client.send({
                event: SocketEvents.SERVER.BOARD.CHAT.SESSION,
                topic: ESocketTopic.Board,
                topic_id: topicId,
                data: {
                    session: {
                        ...chatSession.apiResponse,
                        ...session.apiResponse,
                    },
                },
            });
        });
    } else {
        session = await ProjectChatSession.findByUID(session_uid);
        if (!session) {
            client.sendError(ESocketStatus.WS_4001_INVALID_DATA, "Invalid chat session model", false);
            return;
        }

        chatSession = await ChatSession.findByID(session.chat_session_id);
        if (!chatSession) {
            client.sendError(ESocketStatus.WS_4001_INVALID_DATA, "Invalid chat session", false);
            return;
        }
    }

    const userMessage = await ChatHistory.create({
        chat_session_id: chatSession.id,
        message: { content: message },
        is_received: false,
    }).save();
    await chatSession.updateLastMessagedAt(userMessage.created_at);

    client.send({
        event: SocketEvents.SERVER.BOARD.CHAT.SENT,
        topic: ESocketTopic.Board,
        topic_id: topicId,
        data: { user_message: { ...userMessage.apiResponse, chat_session_uid: session.uid } },
    });

    if (isAborted()) {
        return;
    }

    const stream = client.stream(ESocketTopic.Board, topicId, SocketEvents.SERVER.BOARD.CHAT.STREAM);
    const aiMessage = await ChatHistory.create({
        chat_session_id: chatSession.id,
        message: { content: "" },
        is_received: true,
    }).save();
    await chatSession.updateLastMessagedAt(aiMessage.created_at);
    const aiMessageUID = new SnowflakeID(aiMessage.id).toShortCode();

    stream.start({ ai_message: { ...aiMessage.apiResponse, chat_session_uid: session.uid } });

    if (isAborted()) {
        return;
    }

    if (Utils.Type.isString(response)) {
        aiMessage.message = { content: response };
        stream.buffer({ uid: aiMessageUID, message: aiMessage.message });
        stream.end({ uid: aiMessageUID, status: "success" });
        await aiMessage.save();
        await chatSession.updateLastMessagedAt(aiMessage.created_at);
        return;
    }

    const newContent = { content: "" };
    let isReceived = false;
    let lastContent: string | undefined = undefined;

    const saveMessage = async () => {
        await ChatHistory.update(aiMessage.id, {
            message: newContent,
        });
        await chatSession.updateLastMessagedAt(aiMessage.updated_at);
    };

    await response
        .onMessage(async (chunk) => {
            isReceived = true;
            const oldContent = newContent.content;
            let updatedContent = "";
            if (chunk) {
                if (oldContent) {
                    newContent.content = chunk.startsWith(oldContent) ? chunk : `${oldContent}${chunk}`;
                    updatedContent = chunk.split(oldContent, 2).pop() || chunk;
                } else {
                    newContent.content = chunk;
                    updatedContent = chunk;
                }
            }

            if (lastContent !== newContent.content) {
                stream.buffer({ uid: aiMessageUID, chunk: updatedContent });
                lastContent = newContent.content;
            }
        })
        .onError(async (error) => {
            stream.end({ uid: aiMessageUID, status: "failed", error: error.message });
            await aiMessage.remove();
        })
        .onEnd(async () => {
            if (!isReceived) {
                if (!isAborted()) {
                    stream.end({ uid: aiMessageUID, status: "failed" });
                    await aiMessage.remove();
                }

                return;
            }

            stream.end({ uid: aiMessageUID, status: isAborted() ? "aborted" : "success" });
            await saveMessage();
        })
        .stream();
});

EventManager.on(ESocketTopic.Board, SocketEvents.CLIENT.BOARD.CHAT.CANCEL, async ({ client, data }) => {
    const { task_id } = data ?? {};
    if (!Utils.Type.isString(task_id)) {
        client.sendError(ESocketStatus.WS_4001_INVALID_DATA, "Invalid task ID", false);
        return;
    }

    await BotRunner.abort({ botType: EInternalBotType.ProjectChat, taskID: task_id, client });
});
