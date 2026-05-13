from typing import Any
from ..core.publisher import BaseSocketPublisher, SocketPublishModel
from ..core.routing import GLOBAL_TOPIC_ID, SettingSocketTopicID, SocketTopic
from ..core.utils.decorators import staticclass
from ..domain.models import McpToolGroup, NotificationScheduleRule, WebhookSetting


@staticclass
class AppSettingPublisher(BaseSocketPublisher):
    @staticmethod
    def selected_users_deleted(uids: list[str]):
        model = {"uids": uids}
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.User.value,
            event="user:deleted",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def user_created(model: dict[str, Any]):
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.User.value,
            event="settings:user:created",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def global_relationship_created(model: dict[str, Any]):
        publish_model = SocketPublishModel(
            topic=SocketTopic.Global,
            topic_id=GLOBAL_TOPIC_ID,
            event="global-relationship:created",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def global_relationship_updated(uid: str, model: dict[str, Any]):
        publish_model = SocketPublishModel(
            topic=SocketTopic.Global,
            topic_id=GLOBAL_TOPIC_ID,
            event=f"global-relationship:updated:{uid}",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def global_relationship_deleted(uid: str):
        publish_model = SocketPublishModel(
            topic=SocketTopic.Global,
            topic_id=GLOBAL_TOPIC_ID,
            event=f"global-relationship:deleted:{uid}",
        )

        AppSettingPublisher.put_dispather({}, publish_model)

    @staticmethod
    def selected_global_relationships_deleted(uids: list[str]):
        model = {"uids": uids}
        publish_model = SocketPublishModel(
            topic=SocketTopic.Global,
            topic_id=GLOBAL_TOPIC_ID,
            event="global-relationship:deleted",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def mcp_tool_group_created(tool_group: McpToolGroup):
        if tool_group.user_id:
            return

        model = {"tool_group": tool_group.api_response()}
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.McpToolGroup.value,
            event="mcp-tool-group:created",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def mcp_tool_group_updated(tool_group: McpToolGroup, model: dict[str, Any]):
        if tool_group.user_id:
            return

        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.McpToolGroup.value,
            event=f"mcp-tool-group:updated:{tool_group.get_uid()}",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def mcp_tool_group_deleted(uid: str):
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.McpToolGroup.value,
            event=f"mcp-tool-group:deleted:{uid}",
        )

        AppSettingPublisher.put_dispather({}, publish_model)

    @staticmethod
    def selected_mcp_tool_groups_deleted(uids: list[str]):
        model = {"uids": uids}
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.McpToolGroup.value,
            event="mcp-tool-group:deleted",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def webhook_setting_created(setting: WebhookSetting):
        model = {"uid": setting.get_uid()}
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.Webhook.value,
            event="settings:webhook:created",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def webhook_setting_updated(uid: str, model: dict[str, Any]):
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.Webhook.value,
            event=f"settings:webhook:updated:{uid}",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def webhook_setting_deleted(uid: str):
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.Webhook.value,
            event=f"settings:webhook:deleted:{uid}",
        )

        AppSettingPublisher.put_dispather({}, publish_model)

    @staticmethod
    def selected_webhook_settings_deleted(uids: list[str]):
        model = {"uids": uids}
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.Webhook.value,
            event="settings:webhook:deleted",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def notification_schedule_rule_created(rule: NotificationScheduleRule):
        model = {"notification_rule": rule.api_response()}
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.NotificationSchedule.value,
            event="settings:notification-schedule:rule:created",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def notification_schedule_rule_updated(uid: str, model: dict[str, Any]):
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.NotificationSchedule.value,
            event=f"settings:notification-schedule:rule:updated:{uid}",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)

    @staticmethod
    def notification_schedule_rule_deleted(uid: str):
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.NotificationSchedule.value,
            event=f"settings:notification-schedule:rule:deleted:{uid}",
        )

        AppSettingPublisher.put_dispather({}, publish_model)

    @staticmethod
    def selected_notification_schedule_rules_deleted(uids: list[str]):
        model = {"uids": uids}
        publish_model = SocketPublishModel(
            topic=SocketTopic.AppSettings,
            topic_id=SettingSocketTopicID.NotificationSchedule.value,
            event="settings:notification-schedule:rule:deleted",
            data_keys=list(model.keys()),
        )

        AppSettingPublisher.put_dispather(model, publish_model)
