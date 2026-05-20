/* eslint-disable @/max-len */
interface IApiComfortTool {
    label: string;
    description: string;
    apiNames: string[];
}

const API_COMFORT_TOOLS: Record<string, IApiComfortTool> = {
    card_lookup: {
        label: "Card lookup",
        description:
            "Read the card with its detail payload, comments, and recent card activity. Use this when the user asks to understand or summarize a card.",
        apiNames: ["get_card_details", "get_card_comments", "get_card_activities"],
    },
    card_label_update: {
        label: "Card label update",
        description: "Read available project labels and update the card labels. Use this when the user asks to add, remove, or replace labels.",
        apiNames: ["get_project_labels", "update_card_labels"],
    },
    card_checklist_update: {
        label: "Card checklist update",
        description:
            "Read the card checklist state, then create checklists or checkitems as needed. Use this when the user asks to add checklist content.",
        apiNames: ["get_card_details", "create_checklist", "create_checkitem"],
    },
    card_column_move: {
        label: "Card column move",
        description: "Read available project columns and move the card to the requested column. Use this when the user asks to move a card.",
        apiNames: ["get_project_columns", "change_card_order_or_move_column"],
    },
    project_mention: {
        label: "Project mention",
        description:
            "Read project assignees so a response can mention the right people or bots. Use this when the user asks to mention someone in the project context.",
        apiNames: ["get_project_assigned_users"],
    },
    card_relationship_update: {
        label: "Card relationship update",
        description:
            "Read the current card relationship state and update relationships. Use this when the user asks to add or remove parent, child, or related cards.",
        apiNames: ["get_card_details", "update_card_relationships"],
    },
};

export const expandApiNamesWithComfortTools = (apiNames: string[] = [], comfortToolNames: string[] = []) => {
    const expandedApiNames: string[] = [];
    const seenApiNames = new Set<string>();

    const addApiName = (apiName: string) => {
        if (seenApiNames.has(apiName)) {
            return;
        }

        seenApiNames.add(apiName);
        expandedApiNames.push(apiName);
    };

    comfortToolNames.forEach((comfortToolName) => {
        API_COMFORT_TOOLS[comfortToolName]?.apiNames.forEach(addApiName);
    });

    apiNames.forEach(addApiName);

    return expandedApiNames;
};

export const createApiComfortToolPrompt = (comfortToolNames: string[] = [], comfortToolDescriptions: Record<string, string> = {}) => {
    const promptLines = comfortToolNames.flatMap((comfortToolName) => {
        const comfortTool = API_COMFORT_TOOLS[comfortToolName];
        if (!comfortTool) {
            return [];
        }

        const lines = [
            `- ${comfortTool.label} (${comfortToolName})`,
            `  Base tools: ${comfortTool.apiNames.join(", ")}`,
            `  Default behavior: ${comfortTool.description}`,
        ];

        const userDescription = comfortToolDescriptions[comfortToolName];
        if (userDescription) {
            lines.push(`  User description: ${userDescription}`);
        }

        return [lines.join("\n")];
    });

    if (!promptLines.length) {
        return "";
    }

    return [
        "Comfort tool instructions:",
        "The selected comfort tools are wrappers around the listed base tools. Use the base tools directly and follow these composed instructions.",
        ...promptLines,
    ].join("\n");
};
