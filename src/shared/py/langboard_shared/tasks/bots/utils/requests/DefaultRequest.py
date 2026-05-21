from json import dumps as json_dumps
from json import loads as json_loads
from typing import Any
from .....ai import LangboardCalledAPIToolsComponent, LangboardCalledVariablesComponent
from .....core.logger import Logger
from .....domain.models import BotLog
from .....domain.models.BaseBotModel import BotPlatformRunningType
from .....domain.models.bases import BaseBotLogModel
from .....Env import Env
from .....helpers.ApiComfortToolHelper import create_api_comfort_tool_prompt, create_api_names_with_comfort_tools
from .LangflowRequest import LangflowRequest


logger = Logger.use("bot-task")


class DefaultRequest(LangflowRequest):
    def create_request_data(self, bot_log: tuple[BotLog, BaseBotLogModel | None]):
        request_data = super().create_request_data(bot_log)
        if not request_data:
            return None

        if self._bot.platform_running_type == BotPlatformRunningType.Default:
            request_data["url"] = f"{self._base_url}/api/v1/webhook/{self._bot.id}"
            request_data["data"]["tweaks"] = self.__set_default_tweaks(request_data["data"]["tweaks"])
        else:
            return None

        return request_data

    def __set_default_tweaks(self, tweaks: dict[str, Any]) -> dict[str, Any]:
        try:
            bot_value: dict = json_loads(json_dumps(json_loads(self._bot.value or "{}")))
            agent_llm = bot_value.pop("agent_llm", "")
            if not agent_llm:
                raise ValueError("agent_llm is required for Default platform")

            api_names = bot_value.pop("api_names", [])
            system_prompt = bot_value.pop("system_prompt", "")
            comfort_tool_names = bot_value.pop("comfort_tool_names", [])
            comfort_tool_descriptions = bot_value.pop("comfort_tool_descriptions", {})
            comfort_tool_definitions = bot_value.pop("comfort_tool_definitions", {})
            if not isinstance(api_names, list):
                api_names = []
            if not isinstance(comfort_tool_names, list):
                comfort_tool_names = []
            if not isinstance(comfort_tool_descriptions, dict):
                comfort_tool_descriptions = {}
            if not isinstance(comfort_tool_definitions, dict):
                comfort_tool_definitions = {}

            if agent_llm in {"Ollama", "LM Studio"}:
                tweaks[agent_llm] = bot_value
            else:
                bot_value["agent_llm"] = agent_llm
                tweaks["Agent"] = bot_value

            if "base_url" in tweaks:
                del tweaks["base_url"]

            if "Ollama" in tweaks and tweaks["Ollama"].get("base_url", "") == "default":
                tweaks["Ollama"]["base_url"] = Env.OLLAMA_API_URL

            comfort_tool_prompt = create_api_comfort_tool_prompt(
                comfort_tool_names, comfort_tool_descriptions, comfort_tool_definitions
            )
            if comfort_tool_prompt:
                system_prompt = "\n\n".join([prompt for prompt in [system_prompt, comfort_tool_prompt] if prompt])
            if system_prompt:
                tweaks["Prompt"] = {"prompt": system_prompt}

            callable_api_names = create_api_names_with_comfort_tools(
                api_names, comfort_tool_names, comfort_tool_definitions
            )
            if callable_api_names:
                api_tools_component = LangboardCalledAPIToolsComponent(api_names=callable_api_names)

                tweaks["api_names"] = callable_api_names
                tweaks[LangboardCalledVariablesComponent.__name__]["api_names"] = callable_api_names
                tweaks.update(api_tools_component.to_data())
                tweaks.update(api_tools_component.to_tweaks())
        except Exception:
            pass

        return tweaks
