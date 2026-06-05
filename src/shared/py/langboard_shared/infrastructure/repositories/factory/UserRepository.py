from ....core.db import DbSession, SqlBuilder
from ....core.domain import BaseRepository
from ....domain.models import User, UserEmail, UserProfile
from ....helpers import InfraHelper


class UserRepository(BaseRepository[User]):
    @staticmethod
    def model_cls():
        return User

    @staticmethod
    def name() -> str:
        return "user"

    def get_all_with_profile_in_settings(self):
        query = (
            SqlBuilder.select.tables(User, UserProfile)
            .outerjoin(UserProfile, User.column("id") == UserProfile.column("user_id"))
            .where(User.column("deleted_at") == None)  # noqa
            .order_by(User.column("created_at").desc(), User.column("id").desc())
        )

        records = []
        with DbSession.use(readonly=True) as db:
            result = db.exec(query)
            records = result.all()
        return records

    def count_not_deleted(self) -> int:
        with DbSession.use(readonly=True) as db:
            return (
                db.exec(
                    SqlBuilder.select.count(User, User.column("id")).where(User.column("deleted_at") == None)  # noqa
                ).first()
                or 0
            )

    def get_not_deleted_page(self, offset: int, limit: int) -> list[User]:
        with DbSession.use(readonly=True) as db:
            return db.exec(
                SqlBuilder.select.table(User)
                .where(User.column("deleted_at") == None)  # noqa
                .order_by(User.column("created_at").asc(), User.column("id").asc())
                .offset(offset)
                .limit(limit)
            ).all()

    def get_by_email(self, email: str | None):
        user = InfraHelper.get_by(User, "email", email)
        if user:
            return user, None
        record = (None, None)
        with DbSession.use(readonly=True) as db:
            result = db.exec(
                SqlBuilder.select.tables(User, UserEmail)
                .join(
                    UserEmail,
                    (User.column("id") == UserEmail.column("user_id")) & (UserEmail.column("deleted_at") == None),  # noqa
                )
                .where(UserEmail.column("email") == email)
                .limit(1)
            )
            record = result.first() or (None, None)
        return record
