import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from langboard_shared.Env import Env
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg import AsyncConnection


_checkpoint_setup_done = False
_checkpoint_setup_lock = asyncio.Lock()
_CHECKPOINT_SETUP_LOCK_ID = 473918502


def _is_postgres_database_url(database_url: str) -> bool:
    return database_url.startswith(("postgresql://", "postgres://"))


async def _setup_checkpointer_once(saver: AsyncPostgresSaver) -> None:
    global _checkpoint_setup_done
    if _checkpoint_setup_done:
        return

    async with _checkpoint_setup_lock:
        if _checkpoint_setup_done:
            return

        async with await AsyncConnection.connect(Env.MAIN_DATABASE_URL, autocommit=True) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute("SELECT pg_advisory_lock(%s)", (_CHECKPOINT_SETUP_LOCK_ID,))
                try:
                    await saver.setup()
                finally:
                    await cursor.execute("SELECT pg_advisory_unlock(%s)", (_CHECKPOINT_SETUP_LOCK_ID,))

        _checkpoint_setup_done = True


@asynccontextmanager
async def open_graph_checkpointer() -> AsyncIterator[AsyncPostgresSaver | None]:
    if not _is_postgres_database_url(Env.MAIN_DATABASE_URL):
        yield None
        return

    async with AsyncPostgresSaver.from_conn_string(Env.MAIN_DATABASE_URL) as saver:
        await _setup_checkpointer_once(saver)
        yield saver
