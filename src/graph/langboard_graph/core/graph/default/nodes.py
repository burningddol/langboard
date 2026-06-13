from json import dumps as json_dumps
from re import sub as re_sub
from typing import Any, cast
from langboard_shared.core.logger import Logger
from langboard_shared.Env import Env
from langchain.chat_models import init_chat_model
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langgraph.types import interrupt
from .context import create_runtime_context_state
from .state import DefaultGraphState
from .tooling import (
    create_langboard_api_approval_request,
    create_langboard_api_tools,
    create_langboard_context_prompt,
    create_langboard_entity_context_prompt,
    create_langboard_event_input,
)


_PROVIDER_MAP = {
    "OpenAI": "openai",
    "Azure OpenAI": "azure_openai",
    "Groq": "groq",
    "Anthropic": "anthropic",
    "NVIDIA": "nvidia",
    "IBM Watson": "ibm",
    "Amazon Bedrock": "bedrock_converse",
    "Google Generative AI": "google_genai",
    "Ollama": "ollama",
    "LM Studio": "openai",
}

_NON_MODEL_SETTING_KEYS = {
    "agent_llm",
    "api_names",
    "comfort_tool_names",
    "comfort_tool_descriptions",
    "comfort_tool_definitions",
    "system_prompt",
    "approval_request",
    "api_approval_policy",
}

_LANGBOARD_RESPONSE_RULES = "\n".join(
    [
        "Langboard user-facing response rules:",
        "- Do not expose internal identifiers or raw API metadata in normal answers.",
        "- Never include uid fields such as card_uid, project_uid, project_column_uid, project_wiki_uid, bot_uid, thread_id, or session_id unless the user explicitly asks for an exact internal id.",
        "- When reporting an action result, use human-readable project, column, card, wiki, bot, or user names instead of uid values.",
        "- Never guess uid fields from human-readable names. If a user gives a card, column, wiki, project, bot, label, or user name, first use the relevant lookup/list API and then use the returned uid.",
        "- For card title tasks, use card lookup or project card list APIs before calling card detail, metadata, edit, relationship, checklist, comment, archive, or delete APIs.",
    ]
)
_INTERNAL_UID_KEYS = (
    "card_uid",
    "project_uid",
    "project_column_uid",
    "project_wiki_uid",
    "bot_uid",
    "internal_bot_uid",
    "bot_log_uid",
    "chat_session_uid",
    "chat_history_uid",
    "scope_uid",
    "thread_id",
    "session_id",
)


def _get_graph_config(tweaks: dict[str, Any]) -> tuple[str | None, dict[str, Any], str]:
    graph_config = tweaks.get("Graph")
    if isinstance(graph_config, dict):
        agent_llm = graph_config.get("agent_llm")
        settings = graph_config.get("settings")
        system_prompt = graph_config.get("system_prompt", "")
        return (
            agent_llm,
            settings if isinstance(settings, dict) else {},
            system_prompt if isinstance(system_prompt, str) else "",
        )

    if isinstance(tweaks.get("Ollama"), dict):
        return "Ollama", tweaks["Ollama"], _get_system_prompt(tweaks)
    if isinstance(tweaks.get("LM Studio"), dict):
        return "LM Studio", tweaks["LM Studio"], _get_system_prompt(tweaks)
    if isinstance(tweaks.get("Agent"), dict):
        settings = tweaks["Agent"]
        return settings.get("agent_llm"), settings, _get_system_prompt(tweaks)
    return None, {}, _get_system_prompt(tweaks)


def _get_system_prompt(tweaks: dict[str, Any]) -> str:
    prompt = tweaks.get("Prompt")
    if not isinstance(prompt, dict):
        return ""
    value = prompt.get("prompt", "")
    return value if isinstance(value, str) else ""


def _create_chat_model(agent_llm: str | None, settings: dict[str, Any]):
    if not agent_llm:
        return None

    provider = _PROVIDER_MAP.get(agent_llm)
    if not provider:
        return None

    model_name = settings.get("model_name") or settings.get("model") or settings.get("model_id")
    if not model_name:
        return None

    kwargs = {
        key: value for key, value in settings.items() if key not in _NON_MODEL_SETTING_KEYS and value not in (None, "")
    }
    kwargs.pop("model", None)
    kwargs.pop("model_name", None)

    if agent_llm == "Ollama" and kwargs.get("base_url") == "default":
        kwargs["base_url"] = Env.OLLAMA_API_URL
    if agent_llm == "LM Studio":
        kwargs.setdefault("api_key", "lm-studio")

    try:
        return init_chat_model(str(model_name), model_provider=provider, **kwargs)
    except Exception as exc:
        Logger.main.exception(exc)
        return None


async def run_default_agent(state: DefaultGraphState) -> DefaultGraphState:
    input_value = state.get("input_value") or ""
    tweaks = state.get("tweaks") or {}
    _set_runtime_context_state(state, tweaks)
    approval_request = _get_approval_request(tweaks, state)
    if approval_request is None:
        approval_request = await create_langboard_api_approval_request(
            tweaks,
            thread_id=state.get("thread_id"),
            session_id=state.get("session_id"),
        )
    if approval_request is not None:
        state["approval_requests"] = (
            [approval_request] if isinstance(approval_request, dict) else [{"message": str(approval_request)}]
        )
        state["approval_result"] = interrupt(approval_request)
        approval_result = state["approval_result"]
        instruction = _get_approval_instruction(approval_result)
        if _is_rejected_approval_result(approval_result):
            state["response"] = _get_rejected_approval_response(state["approval_result"])
            return state
        if _is_approved_approval_result(approval_result):
            _apply_approved_api_context(tweaks, approval_result)
            if instruction:
                input_value = _create_instructed_input(input_value, instruction, allow_privileged_tools=True)
        elif instruction:
            _apply_instruction_api_context(tweaks)
            input_value = _create_instructed_input(input_value, instruction, allow_privileged_tools=False)

    agent_llm, settings, system_prompt = _get_graph_config(tweaks)
    chat_model = _create_chat_model(agent_llm, settings)
    input_value = create_langboard_event_input(input_value, tweaks)

    if chat_model is None:
        state["response"] = input_value or "Graph request received."
        return state

    messages: list[BaseMessage] = []
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))
    messages.append(SystemMessage(content=_LANGBOARD_RESPONSE_RULES))
    context_prompt = create_langboard_context_prompt(tweaks)
    if context_prompt:
        messages.append(SystemMessage(content=context_prompt))
    entity_context_prompt = await create_langboard_entity_context_prompt(tweaks, input_value)
    if entity_context_prompt:
        messages.append(SystemMessage(content=entity_context_prompt))
    messages.append(HumanMessage(content=input_value))

    tools = await create_langboard_api_tools(tweaks)
    result, tool_results = await _invoke_agent(chat_model, messages, tools)
    state["tool_results"] = tool_results
    content = result.content
    if isinstance(content, str):
        state["response"] = _sanitize_user_response(content)
    else:
        state["response"] = json_dumps(content, ensure_ascii=False)
    return state


def _sanitize_user_response(content: str) -> str:
    sanitized = content
    for key in _INTERNAL_UID_KEYS:
        sanitized = re_sub(rf"\s*\({key}:\s*`?[^)`\s]+`?\)", "", sanitized)
        sanitized = re_sub(rf"(?im)^\s*{key}:\s*`?[^`\n]+`?\s*$\n?", "", sanitized)
    return sanitized.strip()


def _set_runtime_context_state(state: DefaultGraphState, tweaks: dict[str, Any]) -> None:
    state.update(create_runtime_context_state(tweaks))


def _apply_approved_api_context(tweaks: dict[str, Any], approval_result: Any) -> None:
    if not isinstance(approval_result, dict) or not approval_result.get("approved") or approval_result.get("rejected"):
        return

    variables = _get_variables(tweaks)
    app_api_token = approval_result.get("app_api_token")
    if isinstance(app_api_token, str) and app_api_token.strip():
        variables["app_api_token"] = app_api_token

    api_approval_policy = approval_result.get("api_approval_policy")
    if isinstance(api_approval_policy, dict):
        graph_config = tweaks.get("Graph")
        if isinstance(graph_config, dict):
            graph_config["api_approval_policy"] = api_approval_policy

        rest_data = _get_rest_data(variables)
        rest_data["api_approval_policy"] = api_approval_policy


def _apply_instruction_api_context(tweaks: dict[str, Any]) -> None:
    instruction_policy = {
        "read": "allow",
        "create": "deny",
        "edit": "deny",
        "delete": "deny",
    }
    graph_config = tweaks.get("Graph")
    if isinstance(graph_config, dict):
        graph_config["api_approval_policy"] = instruction_policy

    variables = _get_variables(tweaks)
    rest_data = _get_rest_data(variables)
    rest_data["api_approval_policy"] = instruction_policy


def _create_instructed_input(input_value: str, instruction: str, *, allow_privileged_tools: bool) -> str:
    tool_instruction = (
        "The requested privileged API action was approved. The human instruction below is the latest instruction and overrides the original request when they conflict. Do not execute the original requested action unless the latest instruction still asks for it. Use available API tools when needed."
        if allow_privileged_tools
        else "The requested privileged API action was not approved. Follow the instruction without using create, edit, or delete API tools."
    )
    return "\n\n".join(
        [
            "Latest human instruction after approval request:",
            instruction,
            "Original request for context only. Do not follow it when it conflicts with the latest human instruction:",
            input_value,
            tool_instruction,
        ]
    ).strip()


def _get_approval_request(tweaks: dict[str, Any], state: DefaultGraphState) -> dict[str, Any] | str | None:
    graph_config = tweaks.get("Graph")
    if not isinstance(graph_config, dict):
        return None

    approval_request = graph_config.get("approval_request")
    if approval_request is None:
        return None

    variables = _get_variables(tweaks)
    rest_data = _get_rest_data(variables)
    base_request = {
        "type": "approval_request",
        "thread_id": state.get("thread_id"),
        "session_id": state.get("session_id"),
        "origin_type": _get_origin_type(variables, rest_data),
        "scope_table": _get_scope_table(rest_data),
        "scope_uid": _get_scope_uid(rest_data, variables),
        "document_name": _get_document_name(rest_data),
    }

    if isinstance(approval_request, dict):
        return {
            **base_request,
            "preview": _get_preview(approval_request),
            "request_payload": _get_request_payload(approval_request),
            **approval_request,
        }

    if approval_request is True:
        return {
            **base_request,
            "message": "Approval required to continue this graph.",
            "preview": {"title": "Approval required", "summary": "Approval required to continue this graph."},
        }

    if isinstance(approval_request, str):
        return {
            **base_request,
            "message": approval_request,
            "preview": {"title": "Approval required", "summary": approval_request},
        }

    return None


def _get_variables(tweaks: dict[str, Any]) -> dict[str, Any]:
    variables = tweaks.get("LangboardCalledVariablesComponent")
    return variables if isinstance(variables, dict) else {}


def _get_rest_data(variables: dict[str, Any]) -> dict[str, Any]:
    rest_data = variables.get("rest_data")
    return rest_data if isinstance(rest_data, dict) else {}


def _get_origin_type(variables: dict[str, Any], rest_data: dict[str, Any]) -> str:
    origin_type = rest_data.get("origin_type")
    if isinstance(origin_type, str) and origin_type:
        return origin_type

    event = variables.get("event")
    if event == "chat":
        return "chat"
    if event == "bot_cron_scheduled":
        return "schedule"
    if event == "bot_mentioned":
        return "manual_scope_run"
    if event in {"trigger", "schedule", "editor", "manual_scope_run"}:
        return str(event)
    if isinstance(event, str) and event:
        return "trigger"
    return "chat"


def _get_scope_table(rest_data: dict[str, Any]) -> str:
    chat_scope = rest_data.get("chat_scope")
    if isinstance(chat_scope, str) and chat_scope in {"project", "project_column", "card", "project_wiki"}:
        return chat_scope
    if rest_data.get("card_uid"):
        return "card"
    if rest_data.get("project_wiki_uid"):
        return "project_wiki"
    if rest_data.get("project_column_uid"):
        return "project_column"
    return "project"


def _get_scope_uid(rest_data: dict[str, Any], variables: dict[str, Any] | None = None) -> str | None:
    for key in ("card_uid", "project_wiki_uid", "project_column_uid", "project_uid"):
        value = rest_data.get(key)
        if isinstance(value, str) and value:
            return value
    project_uid = (variables or {}).get("project_uid")
    if isinstance(project_uid, str) and project_uid:
        return project_uid
    return None


def _get_document_name(rest_data: dict[str, Any]) -> str | None:
    value = rest_data.get("document_name")
    if isinstance(value, str) and value:
        return value
    return None


def _get_preview(approval_request: dict[str, Any]) -> dict[str, Any]:
    preview = approval_request.get("preview")
    if isinstance(preview, dict):
        return preview

    message = approval_request.get("message")
    message = message if isinstance(message, str) and message else "Approval required to continue this graph."
    return {"title": "Approval required", "summary": message}


def _get_request_payload(approval_request: dict[str, Any]) -> dict[str, Any]:
    request_payload = approval_request.get("request_payload")
    return request_payload if isinstance(request_payload, dict) else {}


def _is_rejected_approval_result(approval_result: Any) -> bool:
    return (
        isinstance(approval_result, dict)
        and bool(approval_result.get("rejected"))
        and not approval_result.get("approved")
    )


def _is_approved_approval_result(approval_result: Any) -> bool:
    return (
        isinstance(approval_result, dict)
        and bool(approval_result.get("approved"))
        and not approval_result.get("rejected")
    )


def _get_approval_instruction(approval_result: Any) -> str:
    if not isinstance(approval_result, dict) or approval_result.get("rejected"):
        return ""

    instruction = approval_result.get("instruction")
    if isinstance(instruction, str) and instruction.strip():
        return instruction.strip()
    return ""


def _get_rejected_approval_response(approval_result: Any) -> str:
    if isinstance(approval_result, dict):
        reason = approval_result.get("reason")
        if isinstance(reason, str) and reason.strip():
            return f"Graph approval rejected: {reason.strip()}"
    return "Graph approval rejected."


async def _invoke_agent(
    chat_model: Any,
    messages: list[BaseMessage],
    tools: list[StructuredTool],
) -> tuple[BaseMessage, list[dict[str, Any]]]:
    if not tools:
        return await _invoke_chat_model(chat_model, messages), []

    try:
        tool_enabled_model = chat_model.bind_tools(tools)
    except Exception:
        return await _invoke_chat_model(chat_model, messages), []

    tool_map = {tool.name: tool for tool in tools}
    current_messages = list(messages)
    tool_results: list[dict[str, Any]] = []
    result: BaseMessage | None = None

    for _ in range(3):
        result = await _invoke_chat_model(tool_enabled_model, current_messages)
        current_messages.append(result)

        tool_calls = getattr(result, "tool_calls", None) or []
        if not tool_calls:
            return result, tool_results

        for tool_call in tool_calls[:8]:
            tool_name = tool_call.get("name")
            tool = tool_map.get(tool_name)
            if not tool:
                continue

            tool_args = tool_call.get("args") or {}
            try:
                tool_result = await tool.ainvoke(tool_args)
            except Exception as exc:
                tool_result = f"Tool {tool_name} failed: {exc}"

            tool_results.append({"name": tool_name, "args": tool_args, "result": tool_result})
            current_messages.append(
                ToolMessage(
                    content=str(tool_result),
                    tool_call_id=tool_call.get("id") or tool_name,
                )
            )

    final_result = await _invoke_chat_model(chat_model, current_messages)
    return final_result, tool_results


async def _invoke_chat_model(chat_model: Any, messages: list[BaseMessage]) -> BaseMessage:
    result = await chat_model.ainvoke(messages)
    if result is None:
        raise RuntimeError("Graph chat model returned no result.")
    return cast(BaseMessage, result)
