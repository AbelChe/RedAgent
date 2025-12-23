from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from app.core.config import settings

class LLMFactory:
    @staticmethod
    def create_client():
        """
        Create LLM client based on settings (LLM_PROVIDER).
        
        For DeepSeek's reasoning model (deepseek-reasoner), uses a custom adapter
        that properly handles the `reasoning_content` field required by DeepSeek's
        Thinking Mode API. For other models, uses standard LangChain integrations.
        """
        provider = settings.LLM_PROVIDER.lower()
        api_key = settings.api_key
        model_name = settings.LLM_MODEL
        
        if not api_key:
             raise ValueError("API Key is not set in configuration")

        if provider == "anthropic":
            return ChatAnthropic(
                model=model_name,
                temperature=0,
                api_key=api_key,
                streaming=True
            )
        
        elif provider == "deepseek" and model_name == "deepseek-reasoner":
            # Use custom DeepSeek Reasoner adapter for thinking mode
            from app.services.deepseek_reasoner_llm import DeepSeekReasonerLLM
            return DeepSeekReasonerLLM(
                model=model_name,
                api_key=api_key,
                base_url=settings.LLM_API_BASE if settings.LLM_API_BASE else "https://api.deepseek.com",
                streaming=True
            )
        
        elif provider in ["openai", "deepseek", "qwen"]:
            # OpenAI-compatible API (including deepseek-chat)
            return ChatOpenAI(
                model=model_name,
                temperature=0,
                api_key=api_key,
                base_url=settings.LLM_API_BASE if settings.LLM_API_BASE else None,
                streaming=True
            )
        
        else:
            raise ValueError(f"Unsupported LLM Provider: {provider}")

llm_factory = LLMFactory()
