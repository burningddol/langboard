import { Navigate, Outlet, type RouteObject } from "react-router";
import { AuthGuard } from "@/core/routing/AuthGuard";
import { ROUTES } from "@/core/routing/constants";
import BoardProxy from "@/pages/BoardPage";
import { BoardController } from "@/core/providers/BoardController";
import WikiActivityDialog from "@/pages/BoardPage/components/wiki/WikiActivityDialog";
import WikiMetadataDialog from "@/pages/BoardPage/components/wiki/WikiMetadataDialog";
import BoardInvitationPage from "@/pages/BoardPage/BoardInvitationPage";
import { EHttpStatus } from "@langboard/core/enums";

const routes: RouteObject[] = [
    {
        path: ROUTES.BOARD.ROUTE,
        children: [
            {
                index: true,
                element: <Navigate to={ROUTES.ERROR(EHttpStatus.HTTP_404_NOT_FOUND)} replace />,
            },
        ],
    },
    {
        path: ROUTES.BOARD.MAIN(":projectUID"),
        element: (
            <AuthGuard>
                <BoardController>
                    <BoardProxy />
                    <Outlet />
                </BoardController>
            </AuthGuard>
        ),
        children: [
            {
                path: "wiki",
                element: <></>,
            },
            {
                path: "wiki/:wikiUID",
                element: <></>,
            },
            {
                path: "wiki/:wikiUID/activity",
                element: <WikiActivityDialog />,
            },
            {
                path: "wiki/:wikiUID/metadata",
                element: <WikiMetadataDialog />,
            },
            {
                path: "settings",
                element: <></>,
            },
            {
                path: "settings/:page",
                element: <></>,
            },
            {
                path: ":cardUID",
                element: <></>,
            },
        ],
    },
    {
        path: ROUTES.BOARD.INVITATION,
        element: (
            <AuthGuard>
                <BoardInvitationPage />
            </AuthGuard>
        ),
    },
];

export default {
    routes,
    loadInitially: true,
};
