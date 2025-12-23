"""
DeepSeek Reasoner LLM Adapter

This module provides a LangChain-compatible wrapper around DeepSeek R1 (deepseek-reasoner)
that properly handles the `reasoning_content` field required by DeepSeek's Thinking Mode API.

Key features:
1. Uses the native `openai` library for API calls
2. Preserves `reasoning_content` in `additional_kwargs` for proper serialization
3. Supports TRUE STREAMING with _astream method for on_chat_model_stream events
4. Properly handles tool calls with thinking mode
"""

from typing import Any, Dict, Iterator, List, Optional, AsyncIterator
from langchain_core.callbacks import CallbackManagerForLLMRun, AsyncCallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from pydantic import Field
from openai import OpenAI, AsyncOpenAI
import json


def _convert_message_to_dict(message: BaseMessage) -> Dict[str, Any]:
    """Convert a LangChain message to OpenAI-compatible dict format."""
    if isinstance(message, SystemMessage):
        return {"role": "system", "content": message.content}
    elif isinstance(message, HumanMessage):
        return {"role": "user", "content": message.content}
    elif isinstance(message, AIMessage):
        msg_dict: Dict[str, Any] = {"role": "assistant", "content": message.content or ""}
        
        # CRITICAL: Preserve reasoning_content for DeepSeek R1 thinking mode
        if message.additional_kwargs.get("reasoning_content"):
            msg_dict["reasoning_content"] = message.additional_kwargs["reasoning_content"]
        
        # Preserve tool_calls if present
        if message.tool_calls:
            msg_dict["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": tc["args"] if isinstance(tc["args"], str) else json.dumps(tc["args"])
                    }
                }
                for tc in message.tool_calls
            ]
        return msg_dict
    elif isinstance(message, ToolMessage):
        return {
            "role": "tool",
            "tool_call_id": message.tool_call_id,
            "content": message.content
        }
    else:
        raise ValueError(f"Unknown message type: {type(message)}")


def _convert_tool_to_openai_format(tool: Any) -> Dict[str, Any]:
    """Convert a LangChain tool to OpenAI function format."""
    if hasattr(tool, "name") and hasattr(tool, "description") and hasattr(tool, "args_schema"):
        # It's a LangChain tool
        schema = tool.args_schema.schema() if tool.args_schema else {"type": "object", "properties": {}}
        return {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": schema
            }
        }
    elif isinstance(tool, dict):
        # Already in OpenAI format
        return tool
    else:
        raise ValueError(f"Unknown tool format: {type(tool)}")


class DeepSeekReasonerLLM(BaseChatModel):
    """
    A LangChain-compatible chat model for DeepSeek R1 (deepseek-reasoner).
    
    This class uses the native OpenAI library to properly handle the
    `reasoning_content` field required by DeepSeek's Thinking Mode API.
    
    STREAMING: Implements _astream for true token-level streaming via on_chat_model_stream events.
    """
    
    model: str = "deepseek-reasoner"
    api_key: str = Field(default="")
    base_url: str = Field(default="https://api.deepseek.com")
    temperature: float = 0.0
    streaming: bool = True
    
    # Bound tools
    _tools: List[Any] = []
    
    @property
    def _llm_type(self) -> str:
        return "deepseek-reasoner"
    
    @property
    def _identifying_params(self) -> Dict[str, Any]:
        return {
            "model": self.model,
            "base_url": self.base_url,
            "temperature": self.temperature
        }
    
    def bind_tools(self, tools: List[Any]) -> "DeepSeekReasonerLLM":
        """Bind tools to this LLM instance."""
        new_instance = DeepSeekReasonerLLM(
            model=self.model,
            api_key=self.api_key,
            base_url=self.base_url,
            temperature=self.temperature,
            streaming=self.streaming
        )
        new_instance._tools = tools
        return new_instance
    
    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        """Synchronous generation - delegates to async version in practice."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self._agenerate(messages, stop, run_manager, **kwargs)
        )
    
    async def _astream(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        """
        TRUE STREAMING implementation for DeepSeek R1.
        
        This yields AIMessageChunk objects for each token, allowing LangGraph's
        astream_events() to emit on_chat_model_stream events with reasoning_content.
        """
        client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
        
        # Convert messages
        openai_messages = [_convert_message_to_dict(m) for m in messages]
        
        # Prepare request
        request_kwargs: Dict[str, Any] = {
            "model": self.model,
            "messages": openai_messages,
            "stream": True,  # ENABLE STREAMING
        }
        
        # Add tools if bound
        if self._tools:
            request_kwargs["tools"] = [_convert_tool_to_openai_format(t) for t in self._tools]
        
        # Make streaming API call
        stream = await client.chat.completions.create(**request_kwargs)
        
        # Accumulate for tool_calls reconstruction
        accumulated_tool_calls: Dict[int, Dict[str, Any]] = {}
        
        async for chunk in stream:
            if not chunk.choices:
                continue
                
            choice = chunk.choices[0]
            delta = choice.delta
            
            # Build AIMessageChunk with proper additional_kwargs for this delta
            additional_kwargs: Dict[str, Any] = {}
            
            # CRITICAL: Stream reasoning_content if present
            if hasattr(delta, "reasoning_content") and delta.reasoning_content:
                additional_kwargs["reasoning_content"] = delta.reasoning_content
            
            # Handle streaming tool_calls
            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in accumulated_tool_calls:
                        accumulated_tool_calls[idx] = {
                            "id": tc_delta.id or "",
                            "name": tc_delta.function.name if tc_delta.function else "",
                            "args": ""
                        }
                    else:
                        if tc_delta.id:
                            accumulated_tool_calls[idx]["id"] = tc_delta.id
                        if tc_delta.function and tc_delta.function.name:
                            accumulated_tool_calls[idx]["name"] = tc_delta.function.name
                    
                    if tc_delta.function and tc_delta.function.arguments:
                        accumulated_tool_calls[idx]["args"] += tc_delta.function.arguments
            
            content = delta.content or ""
            
            # Create the chunk message
            chunk_message = AIMessageChunk(
                content=content,
                additional_kwargs=additional_kwargs
            )
            
            # Yield the generation chunk for LangGraph to emit on_chat_model_stream event
            generation_chunk = ChatGenerationChunk(message=chunk_message)
            
            if run_manager:
                # FIX: LangGraph/LangChain callbacks often ignore empty tokens, which prevents
                # on_chat_model_stream from firing for reasoning-only chunks.
                # We inject an invisible zero-width space for the callback ONLY to force the event.
                callback_content = content
                
                # Check if we need to force an event for reasoning
                if not content and additional_kwargs.get("reasoning_content"):
                     callback_content = "\u200b" # Zero-width space
                
                # Reconstruct chunk for callback if content changed
                if callback_content != content:
                    callback_chunk = ChatGenerationChunk(
                        message=AIMessageChunk(
                            content=callback_content,
                            additional_kwargs=additional_kwargs
                        )
                    )
                    await run_manager.on_llm_new_token(callback_content, chunk=callback_chunk)
                else:
                    await run_manager.on_llm_new_token(content, chunk=generation_chunk)
            
            yield generation_chunk
        
        # After stream ends, if there were tool_calls, yield a final chunk with them
        if accumulated_tool_calls:
            tool_calls = [
                {
                    "id": tc["id"],
                    "name": tc["name"],
                    "args": json.loads(tc["args"]) if tc["args"] else {},
                    "type": "tool_call"
                }
                for tc in accumulated_tool_calls.values()
            ]
            
            final_chunk = AIMessageChunk(
                content="",
                tool_calls=tool_calls
            )
            yield ChatGenerationChunk(message=final_chunk)
    
    async def _agenerate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        """Async generation - accumulates streaming chunks into final result."""
        accumulated_content = ""
        accumulated_reasoning = ""
        accumulated_tool_calls = []
        
        async for chunk in self._astream(messages, stop, run_manager, **kwargs):
            msg = chunk.message
            accumulated_content += msg.content
            
            if msg.additional_kwargs.get("reasoning_content"):
                accumulated_reasoning += msg.additional_kwargs["reasoning_content"]
            
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                accumulated_tool_calls = msg.tool_calls  # Final chunk has complete tool_calls
        
        # Build final AIMessage
        additional_kwargs: Dict[str, Any] = {}
        if accumulated_reasoning:
            additional_kwargs["reasoning_content"] = accumulated_reasoning
        
        ai_message = AIMessage(
            content=accumulated_content,
            additional_kwargs=additional_kwargs,
            tool_calls=accumulated_tool_calls if accumulated_tool_calls else []
        )
        
        return ChatResult(
            generations=[ChatGeneration(message=ai_message)],
            llm_output={"model": self.model}
        )
    


