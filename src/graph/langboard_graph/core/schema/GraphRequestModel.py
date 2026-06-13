from typing import Any, Literal
from pydantic import BaseModel, Field


class GraphRequestModel(BaseModel):
    input_value: str | None = Field(default=None, description="The input value")
    input_type: str | None = Field(default="chat", description="The input type")
    output_type: str | None = Field(default="chat", description="The output type")
    output_component: str | None = Field(default="", description="Reserved for response compatibility")
    tweaks: dict[str, Any] | None = Field(default=None, description="Graph runtime context")
    session_id: str = Field(..., description="The session id")
    thread_id: str | None = Field(default=None, description="Stable graph checkpoint thread id")
    run_type: Literal["internal_bot", "bot"] = Field(..., description="The runner type")
    uid: str = Field(...)
    project_uid: str | None = Field(default=None, description="The project uid")
    log_uid: str | None = Field(default=None, description="The bot log uid")
    scope_log_table: str | None = Field(default=None, description="The scope bot log table")
