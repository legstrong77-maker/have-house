from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg://havehouse:havehouse@localhost:5432/havehouse"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8080"
    TZ: str = "Asia/Taipei"

    @property
    def cors_origins_list(self) -> list[str]:
        return [s.strip() for s in self.CORS_ORIGINS.split(",") if s.strip()]


settings = Settings()
