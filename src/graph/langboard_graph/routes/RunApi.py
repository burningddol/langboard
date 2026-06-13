from typing import Any, Literal, cast
from fastapi import BackgroundTasks, HTTPException, status
from fastapi.responses import StreamingResponse
from langboard_shared.core.db import DbSession, SqlBuilder
from langboard_shared.core.logger import Logger
from langboard_shared.core.routing import ApiErrorCode, ApiException, AppRouter, JsonResponse
from langboard_shared.core.types import SnowflakeID
from langboard_shared.domain.models import BotLog
from langboard_shared.domain.models.BaseBotModel import BotPlatform, BotPlatformRunningType
from langboard_shared.domain.models.bases import BaseBotLogModel
from langboard_shared.domain.models.Bot import Bot
from langboard_shared.domain.models.InternalBot import InternalBot
from langboard_shared.domain.services import DomainService
from langboard_shared.helpers import ModelHelper
from pydantic import BaseModel, Field
from sqlalchemy import Row
from ..core.graph import GraphRunner
from ..core.graph.registry import get_default_graph_status, run_default_graph
from ..core.schema import GraphRequestModel, RunResponse
from ..core.schema.Exception import APIException


class GraphResumeRequest(BaseModel):
    resume: Any = Field(..., description="Value to resume the interrupted graph with")
    session_id: str | None = Field(default=None, description="Optional session id for response compatibility")


@AppRouter.api.post("/api/v1/graph/run/{session_id}")
async def run_graph(
    session_id: str,
    api_request: GraphRequestModel,
    stream: bool = False,
    service: DomainService = DomainService.scope(),
):
    _validate_session_id(session_id, api_request)
    result = _get_bot(api_request)
    if isinstance(result, ApiErrorCode):
        raise ApiException.NotFound_404(result)

    bot = result
    project = await _get_raw_project(service, api_request)
    bot_log = _get_raw_bot_log(api_request)

    runner = GraphRunner(
        api_request,
        stream,
        project,
        (cast(Literal["bot", "internal_bot"], bot.__tablename__), bot.model_dump()),
        bot_log,
    )

    if runner.stream:
        result = await runner.run_stream()
        main_task, response_generator = result

        async def on_disconnect() -> None:
            Logger.main.debug("Client disconnected, closing graph task")
            main_task.cancel()

        return StreamingResponse(response_generator, background=on_disconnect, media_type="text/event-stream")  # type: ignore

    try:
        return await runner.run()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise APIException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, exception=exc) from exc


@AppRouter.api.post("/api/v1/graph/webhook/{session_id}")
async def webhook_run_graph(
    session_id: str,
    api_request: GraphRequestModel,
    background_tasks: BackgroundTasks,
    service: DomainService = DomainService.scope(),
):
    _validate_session_id(session_id, api_request)
    result = _get_bot(api_request)
    if isinstance(result, ApiErrorCode):
        return JsonResponse(content=result, status_code=status.HTTP_404_NOT_FOUND)

    bot = result
    project = await _get_raw_project(service, api_request)
    bot_log = _get_raw_bot_log(api_request)

    runner = GraphRunner(
        api_request,
        raw_project=project,
        raw_bot=(cast(Literal["bot", "internal_bot"], bot.__tablename__), bot.model_dump()),
        raw_bot_log=bot_log,
    )

    try:
        background_tasks.add_task(runner.run)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return JsonResponse(content={"message": "Task started in the background", "status": "in progress"})


@AppRouter.api.post("/api/v1/graph/resume/{thread_id}")
async def resume_graph(thread_id: str, resume_request: GraphResumeRequest):
    try:
        graph_result = await run_default_graph(
            input_value=None,
            tweaks=None,
            session_id=resume_request.session_id or thread_id,
            thread_id=thread_id,
            resume=resume_request.resume,
        )
        return RunResponse.from_graph_result(
            graph_result,
            session_id=resume_request.session_id or thread_id,
            thread_id=thread_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise APIException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, exception=exc) from exc


@AppRouter.api.get("/api/v1/graph/status/{thread_id}")
async def get_graph_status(thread_id: str):
    try:
        return JsonResponse(content=await get_default_graph_status(thread_id))
    except Exception as exc:
        raise APIException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, exception=exc) from exc


def _validate_session_id(session_id: str, api_request: GraphRequestModel) -> None:
    if api_request.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Graph session_id path/body mismatch.")


def _get_bot(api_request: GraphRequestModel) -> ApiErrorCode | InternalBot | Bot:
    if api_request.run_type == "internal_bot":
        bot_class = InternalBot
        bot_code = ApiErrorCode.NF3001
    elif api_request.run_type == "bot":
        bot_class = Bot
        bot_code = ApiErrorCode.NF3004
    else:
        return ApiErrorCode.NF3002

    with DbSession.use(readonly=True) as db:
        result = db.exec(
            SqlBuilder.select.table(bot_class).where((bot_class.id == SnowflakeID.from_short_code(api_request.uid)))
        )
        bot = result.first()

    if isinstance(bot, Row):
        bot = bot._data

    if not isinstance(bot, (InternalBot, Bot)):
        return bot_code

    if bot.platform == BotPlatform.Default and bot.platform_running_type == BotPlatformRunningType.Default:
        return bot

    return ApiErrorCode.NF3002


def _get_raw_bot_log(api_request: GraphRequestModel) -> tuple[dict | None, dict | None]:
    bot_log = None
    scope_log = None
    if not api_request.log_uid:
        return bot_log, scope_log

    query = SqlBuilder.select.table(BotLog)
    if api_request.scope_log_table:
        scope_log_class = ModelHelper.get_model_by_table_name(api_request.scope_log_table)
        if scope_log_class and isinstance(scope_log_class, type) and issubclass(scope_log_class, BaseBotLogModel):
            query = SqlBuilder.select.tables(BotLog, scope_log_class).join(
                scope_log_class, scope_log_class.column("bot_log_id") == BotLog.id
            )
    query = query.where(BotLog.id == SnowflakeID.from_short_code(api_request.log_uid))

    with DbSession.use(readonly=True) as db:
        result = db.exec(query)
        bot_log = result.first()

    if isinstance(bot_log, Row):
        bot_log = bot_log._data

    if not isinstance(bot_log, tuple) or len(bot_log) != 2:
        if isinstance(bot_log, tuple):
            bot_log = bot_log[0]
        bot_log = bot_log.model_dump() if bot_log else None, scope_log
    else:
        bot_log = bot_log[0].model_dump(), bot_log[1].model_dump()
    return bot_log


async def _get_raw_project(service: DomainService, api_request: GraphRequestModel) -> dict | None:
    if not api_request.project_uid:
        return None

    project = service.project.get_by_id_like(api_request.project_uid)
    return project.model_dump() if project else None
