/* eslint-disable @typescript-eslint/no-explicit-any */
import { TBigIntString } from "@/core/db/BaseModel";
import { EAgentPermissionLevel } from "@langboard/core/ai";

export interface IBotRequestModel {
    message: string;
    projectUID: string;
    userId: TBigIntString;
    inputType?: string;
    outputType?: string;
    sessionId?: string;
    tweaks?: Record<string, Record<string, any>>;
    restData?: Record<string, any> & {
        api_permission_level?: EAgentPermissionLevel;
    };
    isTitle?: bool;
    filePath?: string;
}
