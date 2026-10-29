"""Official MCP service exposing ZoneGuard's real vision tools.

Run with `python -m zoneguard.mcp_server`; the service is stdio-safe and never
opens desktop windows or returns arbitrary filesystem contents.
"""
import logging, sys
from mcp.server.fastmcp import FastMCP
from .vision import analyze_video as _analyze_video, extract_relevant_frames as _extract_relevant_frames, detect_motion as _detect_motion, track_target as _track_target, analyze_region as _analyze_region, verify_zone_crossing as _verify_zone_crossing, generate_incident_report as _generate_incident_report

mcp = FastMCP("zoneguard-vision")
logger = logging.getLogger("zoneguard.mcp")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

def analyze_video(path: str, polygon: list, max_frames: int = 80, zones: list = None) -> dict:
    return _analyze_video(path, polygon, max_frames, zones=zones)
def extract_relevant_frames(path: str, timestamps: list, limit: int = 8) -> dict:
    return _extract_relevant_frames(path, timestamps, limit)
def detect_motion(path: str, polygon: list, timestamps: list, threshold: int = 25) -> dict:
    return _detect_motion(path, polygon, timestamps, threshold)
def track_target(path: str, bbox: list, start_timestamp: float = 0, max_frames: int = 40) -> dict:
    return _track_target(path, bbox, start_timestamp, max_frames)
def analyze_region(path: str, polygon: list, timestamps: list) -> dict:
    return _analyze_region(path, polygon, timestamps)
def verify_zone_crossing(observations: list, fps: float, max_gap_seconds: float = 1.0, min_persistence_seconds: float = 0.5) -> dict:
    return _verify_zone_crossing(observations, fps, max_gap_seconds, min_persistence_seconds)
def generate_incident_report(scan: dict, verification: dict, motion: dict = None) -> dict:
    return _generate_incident_report(scan, verification, motion)
mcp.tool()(analyze_video)
mcp.tool()(extract_relevant_frames)
mcp.tool()(detect_motion)
mcp.tool()(track_target)
mcp.tool()(analyze_region)
mcp.tool()(verify_zone_crossing)
mcp.tool()(generate_incident_report)

if __name__ == "__main__":
    logger.info("starting MCP stdio server; tools=%s", sorted(mcp._tool_manager._tools))
    mcp.run(transport="stdio")
