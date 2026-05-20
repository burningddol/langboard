from typing import TypedDict


class ApiComfortToolMap(TypedDict):
    label: str
    description: str
    api_names: list[str]


API_COMFORT_TOOLS: dict[str, ApiComfortToolMap] = {
    "card_lookup": {
        "label": "Card lookup",
        "description": (
            "Read the card with its detail payload, comments, and recent card activity. "
            "Use this when the user asks to understand or summarize a card."
        ),
        "api_names": ["get_card_details", "get_card_comments", "get_card_activities"],
    },
    "card_label_update": {
        "label": "Card label update",
        "description": (
            "Read available project labels and update the card labels. "
            "Use this when the user asks to add, remove, or replace labels."
        ),
        "api_names": ["get_project_labels", "update_card_labels"],
    },
    "card_checklist_update": {
        "label": "Card checklist update",
        "description": (
            "Read the card checklist state, then create checklists or checkitems as needed. "
            "Use this when the user asks to add checklist content."
        ),
        "api_names": ["get_card_details", "create_checklist", "create_checkitem"],
    },
    "card_column_move": {
        "label": "Card column move",
        "description": (
            "Read available project columns and move the card to the requested column. "
            "Use this when the user asks to move a card."
        ),
        "api_names": ["get_project_columns", "change_card_order_or_move_column"],
    },
    "project_mention": {
        "label": "Project mention",
        "description": (
            "Read project assignees so a response can mention the right people or bots. "
            "Use this when the user asks to mention someone in the project context."
        ),
        "api_names": ["get_project_assigned_users"],
    },
    "card_relationship_update": {
        "label": "Card relationship update",
        "description": (
            "Read the current card relationship state and update relationships. "
            "Use this when the user asks to add or remove parent, child, or related cards."
        ),
        "api_names": ["get_card_details", "update_card_relationships"],
    },
}


def get_api_comfort_tool_list() -> dict[str, ApiComfortToolMap]:
    return API_COMFORT_TOOLS


def expand_api_names_with_comfort_tools(api_names: list[str] | None, comfort_tool_names: list[str] | None) -> list[str]:
    expanded_api_names: list[str] = []
    seen_api_names: set[str] = set()

    def add_api_name(api_name: str):
        if api_name in seen_api_names:
            return

        seen_api_names.add(api_name)
        expanded_api_names.append(api_name)

    for comfort_tool_name in comfort_tool_names or []:
        comfort_tool = API_COMFORT_TOOLS.get(comfort_tool_name)
        if not comfort_tool:
            continue

        for api_name in comfort_tool["api_names"]:
            add_api_name(api_name)

    for api_name in api_names or []:
        add_api_name(api_name)

    return expanded_api_names


def create_api_comfort_tool_prompt(
    comfort_tool_names: list[str] | None, comfort_tool_descriptions: dict[str, str] | None = None
) -> str:
    prompt_lines: list[str] = []

    for comfort_tool_name in comfort_tool_names or []:
        comfort_tool = API_COMFORT_TOOLS.get(comfort_tool_name)
        if not comfort_tool:
            continue

        prompt_lines.append(
            "\n".join(
                [
                    f"- {comfort_tool['label']} ({comfort_tool_name})",
                    f"  Base tools: {', '.join(comfort_tool['api_names'])}",
                    f"  Default behavior: {comfort_tool['description']}",
                ]
            )
        )

        user_description = (comfort_tool_descriptions or {}).get(comfort_tool_name)
        if user_description:
            prompt_lines.append(f"  User description: {user_description}")

    if not prompt_lines:
        return ""

    return "\n".join(
        [
            "Comfort tool instructions:",
            "The selected comfort tools are wrappers around the listed base tools. Use the base tools directly and follow these composed instructions.",
            *prompt_lines,
        ]
    )
