import MultiSelectAssignee, { IFormProps, TSaveHandler } from "@/components/MultiSelectAssignee";
import Toast from "@/components/base/Toast";
import { EMAIL_REGEX } from "@/constants";
import useUpdateProjectAssignedUsers from "@/controllers/api/board/useUpdateProjectAssignedUsers";
import setupApiErrorHandler from "@/core/helpers/setupApiErrorHandler";
import { BotModel, User } from "@/core/models";
import { TUserLikeModel } from "@/core/models/ModelRegistry";
import { ProjectRole } from "@/core/models/roles";
import { useBoard } from "@/core/providers/BoardProvider";
import { cn } from "@/core/utils/ComponentUtils";
import { Utils } from "@langboard/core/utils";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface IBoardMemberListProps {
    isSelectCardView: bool;
}

const BoardMemberList = memo(({ isSelectCardView }: IBoardMemberListProps) => {
    const [t] = useTranslation();
    const { project, currentUser, hasRoleAction } = useBoard();
    const canEdit = hasRoleAction(ProjectRole.EAction.Update);
    const ownerUID = project.useField("owner_uid");
    const allMemebers = project.useForeignFieldArray("all_members");
    const invitedMemberUIDs = project.useField("invited_member_uids");
    const currentUserUID = currentUser.useField("uid");
    const groups = currentUser.useForeignFieldArray("user_groups");
    const visibleMembers = useMemo(() => allMemebers.filter((model) => !model.isDeletedUser()), [allMemebers]);
    const allSelectables = useMemo(
        () => visibleMembers.filter((model) => model.uid !== ownerUID && model.uid !== currentUserUID),
        [currentUserUID, ownerUID, visibleMembers]
    );
    const showableAssignees = useMemo(
        () => [...visibleMembers.filter((model) => model.isValidUser() && !invitedMemberUIDs.includes(model.uid))].slice(0, 6),
        [invitedMemberUIDs, visibleMembers]
    );
    const selectedAssignees = useMemo(() => visibleMembers.filter((model) => model.uid !== ownerUID), [ownerUID, visibleMembers]);
    const hiddenCurrentUserAssignee = useMemo(
        () => selectedAssignees.find((item) => item.uid === currentUserUID),
        [currentUserUID, selectedAssignees]
    );
    const visibleSelectedAssignees = useMemo(
        () => selectedAssignees.filter((item) => item.uid !== currentUserUID),
        [currentUserUID, selectedAssignees]
    );
    const { mutateAsync: updateProjectAssignedUsersMutateAsync } = useUpdateProjectAssignedUsers({ interceptToast: true });

    const save = (items: (string | User.TModel)[]) => {
        const mergedItems = hiddenCurrentUserAssignee ? [...items, hiddenCurrentUserAssignee] : items;
        const promise = updateProjectAssignedUsersMutateAsync({
            uid: project.uid,
            emails: mergedItems.flatMap((item) => {
                if (Utils.Type.isString(item)) {
                    return [item];
                }

                return "email" in item && Utils.Type.isString(item.email) ? [item.email] : [];
            }),
        });

        Toast.Add.promise(promise, {
            loading: t("common.Updating..."),
            error: (error) => {
                const messageRef = { message: "" };
                const { handle } = setupApiErrorHandler({}, messageRef);

                handle(error);
                return messageRef.message;
            },
            success: () => {
                return t("successes.Assigned members updated and invited new users successfully.");
            },
        });

        return promise;
    };

    return (
        <MultiSelectAssignee.Popover
            popoverButtonProps={{
                size: "icon",
                className: cn("size-8 xs:size-10", isSelectCardView ? "hidden" : ""),
                title: t("project.Assign members"),
            }}
            popoverContentProps={{
                className: cn(
                    "max-w-[calc(100vw_-_theme(spacing.20))]",
                    "sm:max-w-[calc(theme(screens.sm)_-_theme(spacing.60))]",
                    "lg:max-w-[calc(theme(screens.md)_-_theme(spacing.60))]",
                    "min-w-[min(theme(spacing.20),100%)]"
                ),
                align: "start",
            }}
            userAvatarListProps={{
                maxVisible: 6,
                size: { initial: "sm", xs: "default" },
                spacing: "3",
                listAlign: "start",
            }}
            tagContentProps={{
                scope: {
                    projectUID: project.uid,
                },
            }}
            renderSelectableItem={
                ((item: TUserLikeModel) => {
                    if (item.MODEL_NAME === BotModel.Model.MODEL_NAME) {
                        item = item as BotModel.TModel;
                        return `${item.name} (${item.bot_uname})`;
                    }

                    item = item as User.TModel;
                    const isInvited = item.isPresentableUnknownUser() || invitedMemberUIDs.includes(item.uid);
                    const invitedText = isInvited ? ` (${t("project.invited")})` : "";
                    return item.isValidUser() ? `${item.firstname} ${item.lastname}${invitedText}`.trim() : `${item.email} ${invitedText}`;
                }) as IFormProps["renderSelectableItem"]
            }
            addIconSize="6"
            allSelectables={allSelectables}
            showableAssignees={showableAssignees}
            selectedAssignees={visibleSelectedAssignees}
            originalAssignees={visibleSelectedAssignees}
            createSearchKeywords={(item: string | TUserLikeModel) => {
                if (Utils.Type.isString(item)) {
                    return [item];
                }

                if (item.MODEL_NAME === BotModel.Model.MODEL_NAME) {
                    return [];
                }

                item = item as User.TModel;
                if (item.isValidUser()) {
                    return [item.email, item.firstname, item.lastname];
                } else {
                    return [item.email, t("project.invited")];
                }
            }}
            createLabel={(item: string | TUserLikeModel) => {
                if (Utils.Type.isString(item)) {
                    return item;
                }

                if (item.MODEL_NAME === BotModel.Model.MODEL_NAME) {
                    item = item as BotModel.TModel;
                    return `${item.name} (${item.bot_uname})`;
                }

                item = item as User.TModel;
                const isInvited = item.isPresentableUnknownUser() || invitedMemberUIDs.includes(item.uid);
                const invitedText = isInvited ? ` (${t("project.invited")})` : "";
                if (item.isValidUser()) {
                    return `${item.firstname} ${item.lastname}${invitedText}`.trim();
                } else {
                    return `${item.email} ${invitedText}`;
                }
            }}
            placeholder={t("myAccount.Add an email...")}
            canAddNew
            validateNewItem={(value) => !!value && EMAIL_REGEX.test(value)}
            saveOnChange
            save={save as TSaveHandler}
            withUserGroups
            groups={groups}
            canEdit={canEdit || ownerUID === currentUser.uid}
        />
    );
});
BoardMemberList.displayName = "Board.MemberList";

export default BoardMemberList;
