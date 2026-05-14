from typing import Any
from ....core.domain import BaseDomainService
from ....core.domain.BaseDomainService import TMutableValidatorMap
from ....core.storage import FileModel
from ....core.types.BotRelatedTypes import AVAILABLE_BOT_TARGET_TABLES
from ....core.types.ParamTypes import TBotParam
from ....core.utils.Converter import convert_python_data
from ....core.utils.IpAddress import ALLOWED_ALL_IPS, is_valid_ipv4_address_or_range, make_valid_ipv4_range
from ....core.utils.String import generate_random_string
from ....helpers import BotHelper, InfraHelper
from ....publishers import BotPublisher
from ....tasks.bots import BotDefaultTask
from ...models import Bot, BotDefaultScopeBranch, Card, Project, ProjectColumn
from ...models.BaseBotModel import BotPlatform, BotPlatformRunningType


class BotService(BaseDomainService):
    @staticmethod
    def name() -> str:
        """DO NOT EDIT THIS METHOD"""
        return "bot"

    def get_by_id_like(self, bot: TBotParam | None) -> Bot | None:
        bot = InfraHelper.get_by_id_like(Bot, bot)
        return bot

    def get_api_list(self, is_setting: bool = False) -> list[dict[str, Any]]:
        bots = InfraHelper.get_all(Bot)
        api_bots = []
        for bot in bots:
            api_bot = bot.api_response(is_setting=is_setting)
            api_bots.append(api_bot)
        return api_bots

    def create(
        self,
        name: str,
        bot_uname: str,
        platform: BotPlatform,
        platform_running_type: BotPlatformRunningType,
        api_url: str,
        api_key: str,
        ip_whitelist: list[str],
        value: str | None = None,
        avatar: FileModel | None = None,
    ) -> Bot | None:
        existing_bot = InfraHelper.get_by(Bot, "bot_uname", bot_uname)
        if existing_bot:
            return None

        bot = Bot(
            name=name,
            bot_uname=bot_uname,
            platform=platform,
            platform_running_type=platform_running_type,
            avatar=avatar,
            api_url=api_url,
            api_key=api_key,
            app_api_token=self.generate_api_key(),
            ip_whitelist=self.filter_valid_ip_whitelist(ip_whitelist),
            value=value or "",
        )

        self.repo.bot.insert(bot)

        BotPublisher.bot_created(bot)
        BotDefaultTask.bot_created(bot)

        return bot

    def copy(self, bot: TBotParam | None) -> Bot | None:
        source_bot = InfraHelper.get_by_id_like(Bot, bot)
        if not source_bot:
            return None

        copied_bot = Bot(
            name=f"{source_bot.name} Copy",
            bot_uname=self.generate_copied_bot_uname(source_bot.bot_uname),
            platform=source_bot.platform,
            platform_running_type=source_bot.platform_running_type,
            avatar=source_bot.avatar,
            api_url=source_bot.api_url,
            api_key=source_bot.api_key,
            app_api_token=self.generate_api_key(),
            ip_whitelist=[*source_bot.ip_whitelist],
            value=source_bot.value,
        )

        self.repo.bot.insert(copied_bot)
        BotPublisher.bot_created(copied_bot)
        self.copy_default_scope_branches(source_bot, copied_bot)
        BotDefaultTask.bot_created(copied_bot)

        return copied_bot

    def update(self, bot: TBotParam | None, form: dict) -> bool | tuple[Bot, dict[str, Any]] | None:
        bot = InfraHelper.get_by_id_like(Bot, bot)
        if not bot:
            return None
        validators: TMutableValidatorMap = {
            "name": "default",
            "bot_uname": "default",
            "avatar": "default",
            "api_url": "default",
            "platform": "default",
            "platform_running_type": "default",
            "api_key": "default",
            "value": "default",
        }
        unpublishable_keys = [
            "api_url",
            "platform",
            "platform_running_type",
            "api_key",
            "value",
        ]

        if "platform" in form and form["platform"] != bot.platform:
            if form["platform"] not in Bot.ALLOWED_ALL_IPS_BY_PLATFORMS:
                form.pop("platform", None)
                form.pop("platform_running_type", None)
            else:
                available_running_types = Bot.AVAILABLE_RUNNING_TYPES_BY_PLATFORM[form["platform"]]
                platform_running_type = form.get("platform_running_type", available_running_types[0])
                if platform_running_type not in available_running_types:
                    form["platform_running_type"] = available_running_types[0]

        if "platform_running_type" in form:
            platform = form.get("platform", bot.platform)
            if platform not in Bot.AVAILABLE_RUNNING_TYPES_BY_PLATFORM:
                form.pop("platform_running_type", None)
            else:
                available_running_types = Bot.AVAILABLE_RUNNING_TYPES_BY_PLATFORM[platform]
                if form["platform_running_type"] not in available_running_types:
                    form.pop("platform_running_type", None)

        if "bot_uname" in form:
            existing_bot = InfraHelper.get_by(Bot, "bot_uname", form["bot_uname"])
            if existing_bot:
                return False

        old_record = self.apply_mutates(bot, form, validators)

        if "delete_avatar" in form and form["delete_avatar"]:
            old_record["avatar"] = convert_python_data(bot.avatar)
            bot.avatar = None

        if not old_record:
            return True

        self.repo.bot.update(bot)

        model: dict[str, Any] = {}
        unpublishable_model: dict[str, Any] = {}
        for key in form:
            if key in unpublishable_keys:
                if key in old_record:
                    unpublishable_model[key] = convert_python_data(getattr(bot, key))
                continue

            if key not in validators or key not in old_record:
                continue
            if key == "avatar":
                if bot.avatar:
                    model[key] = bot.avatar.path
                else:
                    model["deleted_avatar"] = True
            else:
                model[key] = convert_python_data(getattr(bot, key))

        BotPublisher.bot_updated(bot.get_uid(), model)
        BotPublisher.bot_setting_updated(bot.get_uid(), unpublishable_model)

        model = {**model}
        for key in unpublishable_keys:
            if key in old_record:
                model[key] = convert_python_data(getattr(bot, key))

        return bot, model

    def update_ip_whitelist(self, bot: TBotParam | None, ip_whitelist: list[str]) -> bool | tuple[Bot, dict[str, Any]]:
        bot = InfraHelper.get_by_id_like(Bot, bot)
        if not bot:
            return False

        valid_ip_whitelist = self.filter_valid_ip_whitelist(ip_whitelist)

        bot.ip_whitelist = valid_ip_whitelist
        self.repo.bot.update(bot)

        BotPublisher.bot_setting_updated(bot.get_uid(), {"ip_whitelist": valid_ip_whitelist})

        return bot, {"ip_whitelist": valid_ip_whitelist}

    def generate_new_api_token(self, bot: TBotParam | None) -> Bot | None:
        bot = InfraHelper.get_by_id_like(Bot, bot)
        if not bot:
            return None

        bot.app_api_token = self.generate_api_key()
        self.repo.bot.update(bot)

        BotPublisher.bot_setting_updated(bot.get_uid(), {"app_api_token": bot.app_api_token})

        return bot

    def delete(self, bot: TBotParam | None) -> bool:
        bot = InfraHelper.get_by_id_like(Bot, bot)
        if not bot:
            return False

        self.repo.bot.delete(bot)

        BotPublisher.bot_deleted(bot.get_uid())

        return True

    def generate_api_key(self) -> str:
        api_key = f"sk-{generate_random_string(53)}"
        while True:
            is_existed = InfraHelper.get_by(Bot, "api_key", api_key)
            if not is_existed:
                break
            api_key = f"sk-{generate_random_string(53)}"
        return api_key

    def generate_copied_bot_uname(self, bot_uname: str) -> str:
        base_uname = bot_uname
        candidate = f"{base_uname}-copy"
        index = 2

        while InfraHelper.get_by(Bot, "bot_uname", candidate):
            candidate = f"{base_uname}-copy-{index}"
            index += 1

        return candidate

    def copy_default_scope_branches(self, source_bot: Bot, copied_bot: Bot) -> None:
        source_branches = InfraHelper.get_all_by(BotDefaultScopeBranch, "bot_id", source_bot.id)

        for source_branch in source_branches:
            copied_branch = BotDefaultScopeBranch(bot_id=copied_bot.id, name=source_branch.name)
            self.repo.bot_default_scope_branch.insert(copied_branch)

            for target_table in AVAILABLE_BOT_TARGET_TABLES:
                default_scope_model = BotHelper.get_default_scope_model_class(target_table)
                default_scope_repo = self.get_default_scope_repo(target_table)
                if not default_scope_model or not default_scope_repo:
                    continue

                source_default_scopes = InfraHelper.get_all_by(
                    default_scope_model, "bot_default_scope_branch_id", source_branch.id
                )
                if not source_default_scopes:
                    continue

                copied_default_scope = default_scope_model(
                    bot_default_scope_branch_id=copied_branch.id,
                    conditions=[*source_default_scopes[0].conditions],
                )
                default_scope_repo.insert(copied_default_scope)

            BotPublisher.default_scope_branch_created(copied_branch)

    def get_default_scope_repo(self, target_table: str):
        if target_table == Project.__tablename__:
            return self.repo.project_bot_default_scope
        if target_table == ProjectColumn.__tablename__:
            return self.repo.project_column_bot_default_scope
        if target_table == Card.__tablename__:
            return self.repo.card_bot_default_scope
        return None

    def filter_valid_ip_whitelist(self, ip_whitelist: list[str]) -> list[str]:
        valid_ip_whitelist = []
        if ALLOWED_ALL_IPS in ip_whitelist:
            valid_ip_whitelist.append(ALLOWED_ALL_IPS)
        else:
            for ip in ip_whitelist:
                if not is_valid_ipv4_address_or_range(ip):
                    continue
                if ip.endswith("/24"):
                    ip = make_valid_ipv4_range(ip)
                valid_ip_whitelist.append(ip)
        return valid_ip_whitelist
