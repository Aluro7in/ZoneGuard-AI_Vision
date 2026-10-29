"""Protocol-level MCP subprocess smoke test without relying on fabricated traces."""
from __future__ import annotations
import json, os, subprocess, sys, threading, queue
from pathlib import Path
from mcp.types import LATEST_PROTOCOL_VERSION

root=Path(__file__).resolve().parents[1]; env={**os.environ,"PYTHONPATH":str(root)}
stderr_path=root/'data'/'mcp-smoke.stderr.log'; stderr_path.parent.mkdir(exist_ok=True)
stderr_file=stderr_path.open('w+',encoding='utf-8')
proc=subprocess.Popen([sys.executable,"-u","-m","zoneguard.mcp_server"],cwd=root,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=stderr_file,text=True)
lines=queue.Queue()
def read_stdout():
    for line in proc.stdout:
        lines.put(line)
threading.Thread(target=read_stdout,daemon=True).start()
messages=[
 {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":LATEST_PROTOCOL_VERSION,"capabilities":{},"clientInfo":{"name":"zoneguard-smoke","version":"1"}}},
]
assert proc.stdin and proc.stdout
responses=[]
phase="initialization"
try:
    for message in messages:
        proc.stdin.write(json.dumps(message)+"\n"); proc.stdin.flush()
        try: line=lines.get(timeout=10)
        except queue.Empty: raise TimeoutError(f"timeout during {phase}; child_alive={proc.poll() is None}; diagnostics={stderr_path.read_text(encoding='utf-8')}")
        if not line: raise RuntimeError(f"MCP server exited; diagnostics: {stderr_path.read_text(encoding='utf-8')}")
        responses.append(json.loads(line))
    phase="tool_discovery"
    proc.stdin.write(json.dumps({"jsonrpc":"2.0","method":"notifications/initialized","params":{}})+"\n"); proc.stdin.flush()
    proc.stdin.write(json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})+"\n"); proc.stdin.flush()
    try: line=lines.get(timeout=10)
    except queue.Empty: raise TimeoutError(f"timeout during {phase}; child_alive={proc.poll() is None}; diagnostics={stderr_path.read_text(encoding='utf-8')}")
    if not line: raise RuntimeError(f"MCP server exited; diagnostics: {stderr_path.read_text(encoding='utf-8')}")
    responses.append(json.loads(line))
finally:
    if proc.poll() is None: proc.terminate()
    proc.wait(timeout=5); stderr_file.flush(); stderr_file.close()
    proc.terminate(); proc.wait(timeout=5)
tools=[tool["name"] for tool in responses[-1]["result"]["tools"]]
required={"analyze_video","extract_relevant_frames","detect_motion","track_target","analyze_region","verify_zone_crossing","generate_incident_report"}
assert required <= set(tools), (required,set(tools))
print(json.dumps({"initialize_id":responses[0].get("id"),"tool_count":len(tools),"tools":tools},indent=2))
