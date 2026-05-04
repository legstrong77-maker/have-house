from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg://havehouse:havehouse@localhost:5432/havehouse"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8080"
    # Cloudflare Pages 預覽部署的 URL 帶 hash 前綴 (e.g. abc123.have-house.pages.dev)
    # 用 regex 一次允許所有 .pages.dev / .trycloudflare.com 子網域
    CORS_ORIGIN_REGEX: str = r"https://([a-z0-9-]+\.)?(have-house\.pages\.dev|trycloudflare\.com)"
    TZ: str = "Asia/Taipei"

    @property
    def cors_origins_list(self) -> list[str]:
        return [s.strip() for s in self.CORS_ORIGINS.split(",") if s.strip()]


settings = Settings()
