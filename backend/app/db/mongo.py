import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

logger = logging.getLogger(__name__)

class MongoDatabase:
    client: Optional[AsyncIOMotorClient] = None
    is_connected: bool = False

    async def connect(self) -> bool:
        """Attempt connection to MongoDB with timeout."""
        try:
            self.client = AsyncIOMotorClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=2000,
                connectTimeoutMS=2000
            )
            # Test ping
            await self.client.admin.command("ping")
            self.is_connected = True
            logger.info("Successfully connected to MongoDB at %s", settings.MONGODB_URI)
            return True
        except Exception as e:
            self.is_connected = False
            logger.warning("MongoDB not reachable (%s). Falling back to embedded local document store.", e)
            return False

    async def disconnect(self):
        if self.client:
            self.client.close()
            self.is_connected = False
            logger.info("MongoDB client disconnected.")

    def get_db(self):
        if self.client and self.is_connected:
            return self.client[settings.MONGODB_DB_NAME]
        return None

mongo_db = MongoDatabase()
