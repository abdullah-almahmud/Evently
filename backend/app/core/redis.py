import json
from typing import Any, Dict, Optional
import redis.asyncio as aioredis
from redis.asyncio import Redis
from app.core.config import settings

redis_client: Optional[Redis] = None


def get_redis() -> Redis:
    """
    Returns the global Redis client instance, initializing it if necessary.
    """
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            health_check_interval=30,
        )
    return redis_client


async def close_redis() -> None:
    """Closes the global Redis client connection."""
    global redis_client
    if redis_client is not None:
        await redis_client.close()
        redis_client = None


async def hold_seat(seat_id: str, user_id: str) -> bool:
    """
    Atomically holds a specific seat for a user for 10 minutes (600s).
    Uses SET key user_id NX EX 600.
    Returns True if the hold was successfully acquired, False if already held.
    """
    client = get_redis()
    key = f"seat:hold:{seat_id}"
    acquired = await client.set(key, str(user_id), nx=True, ex=600)
    return bool(acquired)


async def release_seat(seat_id: str) -> None:
    """Releases a seat hold key from Redis."""
    client = get_redis()
    key = f"seat:hold:{seat_id}"
    await client.delete(key)


async def get_seat_holder(seat_id: str) -> Optional[str]:
    """Retrieves the user ID currently holding a seat, if any."""
    client = get_redis()
    key = f"seat:hold:{seat_id}"
    return await client.get(key)


# Atomic Lua script for GA tier capacity decrement with floor check
HOLD_GA_LUA_SCRIPT = """
local key = KEYS[1]
local quantity = tonumber(ARGV[1])
local current = redis.call('get', key)

if not current then
    return 0
end

local available = tonumber(current)
if available >= quantity then
    redis.call('decrby', key, quantity)
    return 1
else
    return 0
end
"""


async def hold_ga_tier(tier_id: str, user_id: str, quantity: int) -> bool:
    """
    Atomically decrements available capacity for a General Admission tier
    ensuring it does not drop below zero.
    Returns True if successfully held, False otherwise.
    """
    client = get_redis()
    key = f"tier:capacity:{tier_id}"
    result = await client.eval(HOLD_GA_LUA_SCRIPT, 1, key, quantity)
    if result == 1:
        # Also store user hold info for reference/expiration (10 mins)
        user_hold_key = f"tier:hold:{tier_id}:{user_id}"
        await client.set(user_hold_key, str(quantity), ex=600)
        return True
    return False


async def publish_event(event_id: str, message: Dict[str, Any]) -> None:
    """
    Publishes a real-time event message to the event's Redis pub/sub channel.
    Channel name: ws:event:{event_id}
    """
    client = get_redis()
    channel = f"ws:event:{event_id}"
    await client.publish(channel, json.dumps(message))
