from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from app.core.config import settings

class LLMFactory:
    @staticmethod
    @staticmethod
    def create_client(workspace_config: dict = None):
        """
        Create LLM client based on settings (LLM_PROVIDER).
        
        Args:
            workspace_config: Optional dictionary containing workspace-specific overrides.
                            Expected structure: {"ai": {"provider": "...", "model": "...", "api_key": "...", "api_base": "..."}}
        """
        provider = None
        api_key = None
        model_name = None
        api_base = None

        if workspace_config is not None:
             # STRICT MODE: Only use workspace config if passed (even if empty)
             # This prevents falling back to global settings for workspaces
            ai_config = workspace_config.get("ai", {})
            provider = ai_config.get("provider")
            api_key = ai_config.get("api_key")
            model_name = ai_config.get("model")
            api_base = ai_config.get("api_base")
            
            if not provider or not api_key:
                 # Provide a clear error message for the frontend to display
                 raise ValueError("Workspace AI is not configured. Please go to Settings to configure a provider.")
        
        else:
            # Legacy/Global Fallback (only if workspace_config is explicitly None)
            provider = settings.LLM_PROVIDER.lower()
            api_key = settings.api_key
            model_name = settings.LLM_MODEL
            api_base = settings.LLM_API_BASE
        
        if not api_key:
             raise ValueError("API Key is not set in configuration")

        if provider == "anthropic":
            return ChatAnthropic(
                model=model_name,
                temperature=0,
                api_key=api_key,
                streaming=True,
                base_url=api_base if api_base else None
            )
        
        elif provider == "deepseek" and model_name == "deepseek-reasoner":
            # Use custom DeepSeek Reasoner adapter for thinking mode
            from app.services.deepseek_reasoner_llm import DeepSeekReasonerLLM
            return DeepSeekReasonerLLM(
                model=model_name,
                api_key=api_key,
                base_url=api_base if api_base else "https://api.deepseek.com",
                streaming=True
            )
        
        elif provider in ["openai", "deepseek", "qwen"]:
            # OpenAI-compatible API (including deepseek-chat)
            return ChatOpenAI(
                model=model_name,
                temperature=0,
                api_key=api_key,
                base_url=api_base if api_base else None,
                streaming=True
            )
        
        else:
            raise ValueError(f"Unsupported LLM Provider: {provider}")

llm_factory = LLMFactory()
