"""Bounded MCP stdio integration test using the official Python SDK."""
from __future__ import annotations
import anyio, asyncio, logging, os, sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.shared.exceptions import McpError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stderr)
ROOT=Path(__file__).resolve().parents[1]
async def run():
    phase="process_creation"; params=StdioServerParameters(command=sys.executable,args=["-u","-m","zoneguard.mcp_server"],cwd=ROOT,env={**os.environ,"PYTHONPATH":str(ROOT)})
    logging.info("phase=%s",phase)
    with anyio.fail_after(20):
        async with stdio_client(params) as (read,write):
            phase="initialization"; logging.info("phase=%s",phase)
            async with ClientSession(read,write) as session:
                with anyio.fail_after(10): await session.initialize()
                phase="tool_discovery"; logging.info("phase=%s",phase)
                with anyio.fail_after(10): listed=await session.list_tools()
                names=[tool.name for tool in listed.tools]
                required={"analyze_video","extract_relevant_frames","detect_motion","track_target","analyze_region","verify_zone_crossing","generate_incident_report"}
                assert required <= set(names), names
                phase="tool_invocation"; logging.info("phase=%s",phase)
                with anyio.fail_after(10): result=await session.call_tool("verify_zone_crossing",{"observations":[{"track_id":1,"timestamp":0.0,"inside_zone":False,"confidence":0.8,"bbox":[100,10,20,20]},{"track_id":1,"timestamp":0.5,"inside_zone":True,"confidence":0.8,"bbox":[50,10,20,20]}],"fps":2.0})
                assert not result.isError and result.content
                phase="invalid_tool_error"; logging.info("phase=%s",phase)
                try:
                    with anyio.fail_after(10): await session.call_tool("not_registered",{})
                except McpError:
                    pass
                else: raise AssertionError("invalid tool call did not return an MCP error")
            phase="shutdown"; logging.info("phase=%s",phase)
    print({"status":"passed","tools":names,"invocation_content_blocks":len(result.content),"invalid_request":"handled"})
if __name__=="__main__":
    try: asyncio.run(run())
    except BaseException as exc:
        logging.error("MCP smoke failed: %s", exc)
        raise
