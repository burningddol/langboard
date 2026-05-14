import { sanitizeEditorValue } from "@/components/Editor/utils";
import { Routing } from "@langboard/core/constants";
import { api } from "@/core/helpers/Api";
import { TMutationOptions, useQueryMutation } from "@/core/helpers/QueryMutation";
import { addPendingLocalCommentCount } from "@/controllers/socket/card/comment/commentCountSync";
import { ProjectCard } from "@/core/models";
import { IEditorContent } from "@/core/models/Base";
import { Utils } from "@langboard/core/utils";

export interface IAddCardCommentForm {
    project_uid: string;
    card_uid: string;
    content: IEditorContent;
}

const useAddCardComment = (options?: TMutationOptions<IAddCardCommentForm>) => {
    const { mutate } = useQueryMutation();

    const addCardComment = async (params: IAddCardCommentForm) => {
        const url = Utils.String.format(Routing.API.BOARD.CARD.COMMENT.ADD, { uid: params.project_uid, card_uid: params.card_uid });
        const res = await api.post(
            url,
            {
                ...sanitizeEditorValue(params.content),
            },
            {
                env: {
                    interceptToast: options?.interceptToast,
                } as never,
            }
        );

        const card = ProjectCard.Model.getModel(params.card_uid);
        if (card && Utils.Type.isNumber(card.count_comment)) {
            card.count_comment = card.count_comment + 1;
            addPendingLocalCommentCount(params.card_uid);
        }

        return res.data;
    };

    const result = mutate(["add-card-comment"], addCardComment, {
        ...options,
        retry: 0,
    });

    return result;
};

export default useAddCardComment;
