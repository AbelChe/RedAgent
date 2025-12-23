import os
from glob import glob
from typing import Dict, List

class KnowledgeBaseService:
    def __init__(self, tools_dir: str = "../mcp-server/tools"):
        # Make path absolute relative to backend root
        self.tools_dir = os.path.join(os.getcwd(), tools_dir)
        self.tool_prompts: Dict[str, str] = {}
        self.reload_tools()

    def reload_tools(self):
        """Reload all markdown files from the tools directory"""
        if not os.path.exists(self.tools_dir):
            print(f"⚠️ Knowledge base directory not found: {self.tools_dir}")
            return

        md_files = glob(os.path.join(self.tools_dir, "*.md"))
        for file_path in md_files:
            tool_name = os.path.basename(file_path).replace(".md", "")
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    self.tool_prompts[tool_name] = content
            except Exception as e:
                print(f"❌ Failed to load tool knowledge {tool_name}: {e}")
        
        print(f"📚 Loaded {len(self.tool_prompts)} tool knowledge entries: {list(self.tool_prompts.keys())}")

    def get_tool_prompt(self, tool_name: str) -> str:
        return self.tool_prompts.get(tool_name, "")

    def get_all_tool_prompts(self) -> str:
        """Combine all tool prompts into a single System Prompt context"""
        combined = "## Available Tools Knowledge\n\n"
        for name, content in self.tool_prompts.items():
            combined += f"### Tool: {name}\n{content}\n---\n"
        return combined

kb_service = KnowledgeBaseService()
