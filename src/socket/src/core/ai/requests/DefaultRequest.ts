/* eslint-disable @typescript-eslint/no-explicit-any */
import { IRequestData, IRequestExecuteParams } from "@/core/ai/requests/BaseRequest";
import { LangboardCalledAPIToolsComponent, LangboardCalledVariablesComponent } from "@/core/ai/helpers/TweaksComponent";
import { createApiComfortToolPrompt, expandApiNamesWithComfortTools } from "@/core/ai/helpers/ApiComfortTools";
import { IBotRequestModel } from "@/core/ai/types";
import { Utils } from "@langboard/core/utils";
import { OLLAMA_API_URL } from "@/Constants";
import LangflowRequest from "@/core/ai/requests/LangflowRequest";
import { EBotPlatformRunningType } from "@langboard/core/ai";

class DefaultRequest extends LangflowRequest {
    protected createRequestData(params: IRequestExecuteParams): IRequestData | null {
        const apiRequestModel = super.createRequestData(params);
        if (!apiRequestModel) {
            return null;
        }

        apiRequestModel.reqData = apiRequestModel.reqData as Record<string, any>;

        apiRequestModel.url = `${this.baseURL}/api/v1/run/${this.internalBot.id}`;

        const queryParams = new URLSearchParams({
            stream: params.useStream ? "true" : "false",
        });

        apiRequestModel.url = `${apiRequestModel.url}?${queryParams.toString()}`;

        apiRequestModel.reqData.tweaks = apiRequestModel.reqData.tweaks ?? {};

        if (this.internalBot.platform_running_type === EBotPlatformRunningType.Default) {
            apiRequestModel.reqData.tweaks = this.#setTweaks(params.requestModel, apiRequestModel.reqData.tweaks);
        }

        return apiRequestModel;
    }

    #setTweaks(requestModel: IBotRequestModel, tweaks: Record<string, any>) {
        try {
            const botValue: Record<string, any> = Utils.Json.Parse(this.internalBot.value ?? "{}");
            if (!botValue.agent_llm) {
                throw new Error("agent_llm is required for Default platform");
            }

            const agentLLM = botValue.agent_llm;
            delete botValue.agent_llm;

            if (["Ollama", "LM Studio"].includes(agentLLM)) {
                tweaks[agentLLM] = botValue;
            } else {
                botValue.agent_llm = agentLLM;
                tweaks.Agent = botValue;
            }

            const comfortToolNames = Array.isArray(botValue.comfort_tool_names)
                ? botValue.comfort_tool_names.filter((comfortToolName): comfortToolName is string => Utils.Type.isString(comfortToolName))
                : [];
            const comfortToolDescriptions =
                botValue.comfort_tool_descriptions && Utils.Type.isObject(botValue.comfort_tool_descriptions)
                    ? (botValue.comfort_tool_descriptions as Record<string, string>)
                    : {};
            delete botValue.comfort_tool_names;
            delete botValue.comfort_tool_descriptions;

            if (tweaks.base_url) {
                delete tweaks.base_url;
            }

            if (tweaks.Ollama?.base_url === "default") {
                tweaks.Ollama.base_url = OLLAMA_API_URL;
            }

            const possibleAgents = ["", "Agent", "Ollama", "LM Studio"];
            for (let i = 0; i < possibleAgents.length; ++i) {
                const possibleKey = possibleAgents[i];
                const agentData = possibleKey ? (tweaks[possibleKey] ?? {}) : tweaks;
                const comfortToolPrompt = createApiComfortToolPrompt(comfortToolNames, comfortToolDescriptions);

                if (agentData.system_prompt || comfortToolPrompt) {
                    let systemPrompt = "";
                    if (requestModel.isTitle) {
                        systemPrompt = this.getTitlePrompt();
                    } else {
                        if (this.internalBotSettings) {
                            systemPrompt = this.internalBotSettings.prompt;
                        } else {
                            systemPrompt = agentData.system_prompt;
                        }
                    }

                    if (!requestModel.isTitle && comfortToolPrompt) {
                        systemPrompt = [systemPrompt, comfortToolPrompt].filter(Boolean).join("\n\n");
                    }

                    delete agentData.system_prompt;
                    tweaks.Prompt = {
                        prompt: systemPrompt,
                    };
                }

                const apiNames = expandApiNamesWithComfortTools(Array.isArray(agentData.api_names) ? agentData.api_names : [], comfortToolNames);
                delete agentData.api_names;
                if (apiNames.length) {
                    const apiToolsComponent = new LangboardCalledAPIToolsComponent(apiNames);
                    tweaks[LangboardCalledVariablesComponent.name].api_names = apiNames;
                    tweaks = { ...tweaks, ...apiToolsComponent.toTweaks(), ...apiToolsComponent.toData() };
                }
            }
        } catch {
            // Ignore parsing errors
        }

        return tweaks;
    }
}

export default DefaultRequest;
