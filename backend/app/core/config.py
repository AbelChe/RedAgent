from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI-Pentest Agent"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5438/pentest"
    REDIS_URL: str = "redis://localhost:6389"
    
    # LLM Settings
    LLM_PROVIDER: str = "anthropic" # anthropic, openai, deepseek, etc.
    LLM_MODEL: str = "claude-3-5-sonnet-20240620"
    LLM_API_BASE: str = "" # Optional, for custom OpenAI-compatible endpoints
    LLM_API_KEY: str = "" # Generic API Key

    # Legacy support
    ANTHROPIC_API_KEY: str = "" 
    ANTHROPIC_AUTH_TOKEN: str = "" 

    @property
    def api_key(self):
        # Return generic key or provider specific fallback
        if self.LLM_API_KEY:
            return self.LLM_API_KEY
        return self.ANTHROPIC_API_KEY or self.ANTHROPIC_AUTH_TOKEN
    
    class Config:
        env_file = ".env"

settings = Settings()
