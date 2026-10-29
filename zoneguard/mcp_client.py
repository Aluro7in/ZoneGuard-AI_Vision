"""Small official-SDK client used to discover and invoke ZoneGuard MCP tools."""
from __future__ import annotations
import sys, os
from datetime import timedelta
from pathlib import Path
from typing import Any
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def discover_tools() -> list[str]:
    root=Path(__file__).resolve().parent.parent; env={**os.environ,'PYTHONPATH':str(root)}; params=StdioServerParameters(command=sys.executable,args=['-u','-m','zoneguard.mcp_server'],env=env,cwd=root)
    async with stdio_client(params) as (read,write):
        async with ClientSession(read,write,read_timeout_seconds=timedelta(seconds=10)) as session:
            await session.initialize(); result=await session.list_tools(); return [tool.name for tool in result.tools]

async def call_tool(name: str, arguments: dict[str,Any]) -> Any:
    root=Path(__file__).resolve().parent.parent; env={**os.environ,'PYTHONPATH':str(root)}; params=StdioServerParameters(command=sys.executable,args=['-u','-m','zoneguard.mcp_server'],env=env,cwd=root)
    async with stdio_client(params) as (read,write):
        async with ClientSession(read,write,read_timeout_seconds=timedelta(seconds=10)) as session:
            await session.initialize(); return await session.call_tool(name,arguments)
