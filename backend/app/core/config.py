from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI-Pentest Agent"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5438/pentest"
    
    # LLM Settings
    LLM_PROVIDER: str = "anthropic" # anthropic, openai, deepseek, etc.
    LLM_MODEL: str = "claude-3-5-sonnet-20240620"
    LLM_API_BASE: str = "" # Optional, for custom OpenAI-compatible endpoints
    LLM_API_KEY: str = "" # Generic API Key

    # Legacy support  
    ANTHROPIC_API_KEY: str = ""
    
    # Celery Configuration (uses existing Docker Redis on port 6389)
    CELERY_BROKER_URL: str = "redis://localhost:6389/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6389/1"
    ANTHROPIC_AUTH_TOKEN: str = "" 
    
    # MCP Security
    MCP_TOKEN: str = "dev-token-placeholder"
    
    # MCP Connectivity
    # For user-deployed MCP containers: use host.docker.internal to connect back to platform
    # For production: set to ws://your-domain.com:8000 or internal service URL
    MCP_BACKEND_URL: str = "ws://host.docker.internal:8000"


    @property
    def api_key(self):
        # Return generic key or provider specific fallback
        if self.LLM_API_KEY:
            return self.LLM_API_KEY
        return self.ANTHROPIC_API_KEY or self.ANTHROPIC_AUTH_TOKEN
    
    class Config:
        env_file = ".env"

settings = Settings()
