from typing import Any, TypedDict


class DefaultGraphState(TypedDict, total=False):
    input_value: str
    tweaks: dict[str, Any]
    session_id: str
    thread_id: str
    project_context: dict[str, Any] | None
    card_context: dict[str, Any] | None
    parent_cards: list[dict[str, Any]]
    child_cards: list[dict[str, Any]]
    relationship_context: list[dict[str, Any]]
    ontology_context: dict[str, Any] | None
    approval_requests: list[dict[str, Any]]
    approval_result: Any
    tool_results: list[dict[str, Any]]
    response: str
