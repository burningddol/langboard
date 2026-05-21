from typing import Any, Mapping
from fastapi import Request, status
from langboard_shared.core.filter import AuthFilter
from langboard_shared.core.routing import AppRouter, JsonResponse
from langboard_shared.domain.models import Bot, User
from langboard_shared.domain.models.ApiComfortTool import ApiComfortToolMap
from langboard_shared.domain.services import DomainService
from langboard_shared.helpers.AgentApiPermissionHelper import get_agent_allowed_permissions
from langboard_shared.security import Auth
from pydantic import BaseModel, ConfigDict, Field
from starlette.datastructures import Headers
from .BatchForm import BatchFormRequestSchema
from .BatchRunner import execute_batch_request_schemas


class ApiComfortToolRunForm(BaseModel):
    model_config = ConfigDict(extra="allow")

    query: dict[str, Any] | None = Field(default=None)
    form: dict[str, Any] | None = Field(default=None)


@AppRouter.api.post(
    "/api/comfort/{comfort_tool_name}",
    tags=["API comfort tools"],
    description="Run an API comfort tool. The comfort tool executes its registered base APIs and returns their combined responses.",
)
@AuthFilter.add()
async def run_api_comfort_tool(
    request: Request,
    comfort_tool_name: str,
    form: ApiComfortToolRunForm,
    user_or_bot: User | Bot = Auth.scope("all"),
    service: DomainService = DomainService.scope(),
):
    comfort_tool = service.app_setting.get_api_comfort_tool_list().get(comfort_tool_name)
    if not comfort_tool:
        return JsonResponse(content={"message": "API comfort tool not found."}, status_code=status.HTTP_404_NOT_FOUND)

    allowed_permissions = get_agent_allowed_permissions(Headers(raw=request.headers.raw), default_read=True)
    shared_params = _create_comfort_tool_shared_params(form)
    request_schemas = [
        _create_comfort_tool_request_schema(api_name, shared_params, comfort_tool)
        for api_name in comfort_tool["api_names"]
    ]
    responses = await execute_batch_request_schemas(request, request_schemas, user_or_bot, allowed_permissions)
    return JsonResponse(
        content={
            "comfort_tool": comfort_tool_name,
            "base_apis": comfort_tool["api_names"],
            "responses": {api_name: response for api_name, response in zip(comfort_tool["api_names"], responses)},
        }
    )


def _create_comfort_tool_shared_params(form: ApiComfortToolRunForm) -> dict[str, Any]:
    data = form.model_dump(exclude_none=True)
    extra = form.model_extra or {}
    query = data.pop("query", {}) or {}
    body_form = data.pop("form", {}) or {}
    return {**query, **body_form, **data, **extra}


def _create_comfort_tool_request_schema(
    api_name: str, shared_params: dict[str, Any], comfort_tool: ApiComfortToolMap
) -> BatchFormRequestSchema:
    api_schema = AppRouter.api_routes.get(api_name)
    method = (api_schema or {}).get("method", "GET")
    api_queries = _get_dict_value(comfort_tool, "api_queries")
    api_forms = _get_dict_value(comfort_tool, "api_forms")
    default_query = _get_dict_value(comfort_tool, "query")
    default_form = _get_dict_value(comfort_tool, "form")
    api_query = _get_dict_value(api_queries, api_name)
    api_form = _get_dict_value(api_forms, api_name)

    query = {**default_query, **api_query, **shared_params}
    body_form = None if method.upper() == "GET" else {**default_form, **api_form, **shared_params}
    return BatchFormRequestSchema(
        path_or_api_name=api_name,
        method=method,
        query=query,
        form=body_form,
    )


def _get_dict_value(source: Mapping[str, Any], key: str) -> dict[str, Any]:
    value = source.get(key)
    return value if isinstance(value, dict) else {}
