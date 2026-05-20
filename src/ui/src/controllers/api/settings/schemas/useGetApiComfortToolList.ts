import { api } from "@/core/helpers/Api";
import { TMutationOptions, useQueryMutation } from "@/core/helpers/QueryMutation";

export interface IApiComfortTool {
    label: string;
    description: string;
    api_names: string[];
}

const useGetApiComfortToolList = (options?: TMutationOptions<{}, Record<string, IApiComfortTool>>) => {
    const { mutate } = useQueryMutation();

    const getApiComfortToolList = async () => {
        const res = await api.get("/schema/api/comfort", {
            env: {
                noToast: options?.interceptToast,
            } as never,
        });

        return res.data.comfort_tools;
    };

    const result = mutate(["get-api-comfort-tool-list"], getApiComfortToolList, {
        ...options,
        retry: 0,
    });

    return result;
};

export default useGetApiComfortToolList;
