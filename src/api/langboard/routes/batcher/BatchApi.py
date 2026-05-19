from enum import Enum
from json import dumps as json_dumps
from json import loads as json_loads
from re import escape as re_escape
from re import fullmatch as re_fullmatch
from re import sub as re_sub
from fastapi import Request, status
from langboard_shared.core.filter import AuthFilter
from langboard_shared.core.routing import ApiPermission, AppRouter, JsonResponse
from langboard_shared.core.routing.ApiSchemaHelper import ApiSchemaMap
from langboard_shared.core.utils.Converter import json_default
from langboard_shared.domain.models import Bot, User
from langboard_shared.helpers.AgentApiPermissionHelper import get_agent_allowed_permissions
from langboard_shared.security import Auth
from starlette.datastructures import Headers
from starlette.types import Message
from .BatchForm import BatchForm, BatchFormRequestSchema


@AppRouter.schema(form=BatchForm, permission=ApiPermission.Read)
@AppRouter.api.post(
    "/batch",
    tags=["Batcher"],
    description="Batch API for processing multiple requests in a single call. The response will be a list of responses corresponding to each request schema provided in the form.",
)
@AuthFilter.add()
async def batch_apis(request: Request, form: BatchForm, user_or_bot: User | Bot = Auth.scope("all")):
    API_METHODS = {"GET", "POST", "PUT", "DELETE"}
    allowed_permissions = get_agent_allowed_permissions(Headers(raw=request.headers.raw), default_read=True)
    responses = []
    for request_schema in form.request_schemas:
        if request_schema.method.upper() not in API_METHODS:
            responses.append(_batch_response({}, status.HTTP_400_BAD_REQUEST))
            continue

        api_schema, request_path, error_response = _resolve_batch_request(request_schema, allowed_permissions)
        if error_response is not None:
            responses.append(error_response)
            continue
        if api_schema is None:
            responses.append(_batch_response({"message": "API schema not found."}, status.HTTP_404_NOT_FOUND))
            continue

        query_string = _query_dict_to_bytes(request_schema.query or {})
        scope = {
            "type": "http",
            "method": request_schema.method,
            "path": request_path,
            "query_string": query_string,
            "headers": request.headers.raw,
            "auth": user_or_bot,
            "is_batch": True,
            "batch_api_schema": api_schema,
        }

        response = {}
        responses.append(response)

        async def receive():
            message = b""
            if request_schema.form:
                message = json_dumps(request_schema.form, default=json_default).encode()
            return {"type": "http.request", "body": message, "more_body": False}

        async def send(message: Message):
            message_type = message.get("type")
            if message_type == "http.response.start":
                response["status"] = message.get("status", status.HTTP_200_OK)
                return

            if message_type != "http.response.body":
                return

            body = message.get("body", b"{}")
            try:
                response["body"] = json_loads(body) if body else {}
            except Exception:
                response["body"] = {"error": "Invalid JSON response"}

        await AppRouter.get_app()(scope, receive, send)

    return JsonResponse(content=responses)


def _query_dict_to_bytes(query: dict) -> bytes:
    return b"&".join(f"{key}={value}".encode() for key, value in query.items() if value is not None)


def _batch_response(content: dict, status_code: int = status.HTTP_200_OK) -> dict:
    return {"status": status_code, "body": content}


def _resolve_batch_request(
    request_schema: BatchFormRequestSchema, allowed_permissions: set[str] | None
) -> tuple[ApiSchemaMap | None, str, dict | None]:
    api_schema = _get_batch_api_schema(request_schema)
    if not api_schema:
        return (
            None,
            request_schema.path_or_api_name,
            _batch_response({"message": "API schema not found."}, status.HTTP_404_NOT_FOUND),
        )

    if api_schema["path"] == "/batch":
        return (
            None,
            request_schema.path_or_api_name,
            _batch_response({"message": "Nested batch requests are not allowed."}, status.HTTP_400_BAD_REQUEST),
        )

    if request_schema.method.upper() != api_schema["method"].upper():
        return (
            None,
            request_schema.path_or_api_name,
            _batch_response({"message": "API method does not match."}, status.HTTP_405_METHOD_NOT_ALLOWED),
        )

    permission = api_schema["permission"]
    permission_value = permission.value if isinstance(permission, Enum) else permission
    if allowed_permissions is not None and permission_value not in allowed_permissions:
        return (
            None,
            request_schema.path_or_api_name,
            _batch_response({"message": "Not enough permissions to access this endpoint."}, status.HTTP_403_FORBIDDEN),
        )

    request_params = {**(request_schema.form or {}), **(request_schema.query or {})}
    missing_path_params = [path_param for path_param in api_schema["path_params"] if path_param not in request_params]
    if missing_path_params:
        return (
            None,
            request_schema.path_or_api_name,
            _batch_response(
                {"message": f"Missing path parameter(s): {', '.join(missing_path_params)}"}, status.HTTP_400_BAD_REQUEST
            ),
        )

    return api_schema, _get_request_path(request_schema, api_schema), None


def _get_batch_api_schema(request_schema: BatchFormRequestSchema) -> ApiSchemaMap | None:
    api_schema = AppRouter.api_routes.get(request_schema.path_or_api_name)
    if api_schema:
        return api_schema

    for schema in AppRouter.api_routes.values():
        if schema["method"].upper() != request_schema.method.upper():
            continue
        if _matches_api_path(schema["path"], request_schema.path_or_api_name):
            return schema

    return None


def _get_request_path(request_schema: BatchFormRequestSchema, api_schema: ApiSchemaMap) -> str:
    if request_schema.path_or_api_name not in AppRouter.api_routes:
        return request_schema.path_or_api_name

    try:
        return api_schema["path"].format(**{**(request_schema.form or {}), **(request_schema.query or {})})
    except Exception:
        return api_schema["path"]


def _matches_api_path(api_path: str, request_path: str) -> bool:
    pattern = re_escape(api_path)
    pattern = re_sub(r"\\\{[^}]+\\\}", r"[^/]+", pattern)
    return re_fullmatch(pattern, request_path) is not None
