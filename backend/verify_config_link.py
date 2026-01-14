
import asyncio
import os
import sys

# Add backend to path by appending current directory
sys.path.append(os.getcwd())

from app.services.llm_factory import LLMFactory
# from app.services.task_manager import TaskManager 
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

def test_factory_strict_mode():
    print("Testing LLMFactory Strict Mode (No Global Fallback)...")
    
    # Test Data: Empty config (simulating new workspace)
    empty_config = {}
    
    try:
        # This SHOULD fail if strict mode is implemented
        # Currently (before fix), it will succeed using Global Env Var, which is what we want to prevent.
        client = LLMFactory.create_client(empty_config)
        
        # If we reach here, it used the fallback -> FAIL
        print(f"❌ Strict Mode Failed: Client created successfully using defaults (Provider: {type(client)})")
        # Check what it used
        if hasattr(client, 'openai_api_key'):
             print(f"   Used API Key: {client.openai_api_key.get_secret_value()[:5]}...")
             
    except ValueError as e:
        # If it raises ValueError, it means it correctly blocked the creation
        print(f"✅ Strict Mode Success: Caught expected error: {e}")
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")

if __name__ == "__main__":
    test_factory_strict_mode()
