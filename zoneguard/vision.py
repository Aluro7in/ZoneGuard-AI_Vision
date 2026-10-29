"""OpenCV primitives and a bounded evidence-driven Agentic Vision controller."""
from __future__ import annotations
import base64, hashlib, math, os, time, uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable
import cv2
import numpy as np

MAX_VIDEO_BYTES = 1024 * 1024 * 1024
MAX_DIMENSION = 8192
MAX_FRAMES = 240
YOLOX_SHA256 = "dcaae0aaa2fea4167f89235ee340eb869d3707b25712218d4c7ce921ac90e2ba"

@dataclass
class Detection:
    frame: int; timestamp: float; track_id: int; label: str; confidence: float; bbox: list[int]; inside_zone: bool

def opencv_version() -> str: return cv2.__version__
def opencv5_status() -> dict[str, Any]:
    version = tuple(int(x) for x in cv2.__version__.split(".")[:2])
    return {"version": cv2.__version__, "supported": version >= (5, 0), "error": None if version >= (5, 0) else "ZoneGuard requires OpenCV 5.x; install requirements.txt before processing."}

def validate_polygon(polygon: list[list[int]], width: int, height: int) -> list[list[int]]:
    if not isinstance(polygon, list) or len(polygon) < 3: raise ValueError("A zone needs at least three points")
    if width <= 0 or height <= 0: raise ValueError("Video dimensions must be positive")
    result = []
    for point in polygon:
        if not isinstance(point, (list, tuple)) or len(point) != 2: raise ValueError("Zone points must be [x, y]")
        x, y = int(point[0]), int(point[1])
        if not (0 <= x < width and 0 <= y < height): raise ValueError("Zone point is outside the video bounds")
        result.append([x, y])
    contour = np.array(result, dtype=np.int32)
    if abs(cv2.contourArea(contour)) < 4: raise ValueError("Zone polygon has no usable area")
    return result

def point_in_polygon(point: tuple[int, int], polygon: list[list[int]]) -> bool:
    return cv2.pointPolygonTest(np.array(polygon, dtype=np.int32), point, False) >= 0

def bbox_iou(a: list[int], b: list[int]) -> float:
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    x1, y1 = max(ax, bx), max(ay, by); x2, y2 = min(ax+aw, bx+bw), min(ay+ah, by+bh)
    inter = max(0, x2-x1) * max(0, y2-y1); union = aw*ah + bw*bh - inter
    return inter / union if union else 0.0

def associate_detections(detections: list[tuple[list[int], float]], tracks: dict[int, dict[str, Any]], next_id: int, frame: int, max_missed: int = 3) -> tuple[list[tuple[int, list[int], float]], int]:
    """Greedy one-to-one IoU/center association with explicit stale-track expiry."""
    candidates = []
    for tid, track in tracks.items():
        for index, (box, score) in enumerate(detections):
            distance = math.dist((track["bbox"][0]+track["bbox"][2]/2, track["bbox"][1]+track["bbox"][3]/2), (box[0]+box[2]/2, box[1]+box[3]/2))
            candidates.append((-(bbox_iou(track["bbox"], box)), distance, tid, index))
    used_tracks, used_detections, matches = set(), set(), []
    for _, _, tid, index in sorted(candidates):
        if tid in used_tracks or index in used_detections: continue
        if bbox_iou(tracks[tid]["bbox"], detections[index][0]) < .05 and candidates: continue
        used_tracks.add(tid); used_detections.add(index); matches.append((tid, detections[index][0], detections[index][1]))
    for index, (box, score) in enumerate(detections):
        if index not in used_detections: tracks[next_id] = {"bbox": box, "missed": 0, "last_frame": frame}; matches.append((next_id, box, score)); next_id += 1
    for tid in list(tracks):
        if tid in used_tracks: continue
        if not any(tid == match[0] for match in matches): tracks[tid]["missed"] += 1
        if tracks[tid]["missed"] > max_missed: del tracks[tid]
    for tid, box, _ in matches: tracks[tid] = {"bbox": box, "missed": 0, "last_frame": frame}
    return matches, next_id

def video_info(path: str) -> dict[str, Any]:
    if not Path(path).is_file(): raise ValueError("Video file does not exist")
    cap = cv2.VideoCapture(path)
    try:
        if not cap.isOpened(): raise ValueError("Unable to open video (corrupt or unsupported codec)")
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0); count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0); width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if not fps or count <= 0 or width <= 0 or height <= 0: raise ValueError("Video metadata is incomplete")
        if width > MAX_DIMENSION or height > MAX_DIMENSION: raise ValueError("Video dimensions exceed the safe limit")
        return {"width": width, "height": height, "fps": fps, "frame_count": count, "duration": count/fps, "opencv_version": cv2.__version__}
    finally: cap.release()

def _jpeg(frame: np.ndarray) -> str:
    ok, data = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82]); return "data:image/jpeg;base64," + base64.b64encode(data).decode() if ok else ""

class PersonDetector:
    def __init__(self) -> None:
        self.mode = "hog_fallback"; self.net = None; self.input_size = 640
        model = os.getenv("ZONEGUARD_MODEL", str(Path(__file__).resolve().parent.parent / "models" / "object_detection_yolox_2022nov_int8bq.onnx"))
        if Path(model).is_file():
            expected=os.getenv("ZONEGUARD_MODEL_SHA256",YOLOX_SHA256).lower(); actual=hashlib.sha256(Path(model).read_bytes()).hexdigest().lower()
            if actual != expected: raise ValueError(f"Detector model SHA-256 mismatch: expected {expected}, got {actual}")
            self.net = cv2.dnn.readNet(model); self.mode = "opencv_zoo_yolox"
        else:
            cfg, weights = os.getenv("ZONEGUARD_DNN_CONFIG"), os.getenv("ZONEGUARD_DNN_WEIGHTS")
            if cfg or weights:
                if not cfg or not weights or not Path(cfg).is_file() or not Path(weights).is_file(): raise ValueError("Configured DNN model files are missing")
                self.net = cv2.dnn.readNetFromDarknet(cfg, weights); self.mode = "darknet_yolo"
        self.hog = cv2.HOGDescriptor(); self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    def detect(self, frame: np.ndarray) -> list[tuple[list[int], float]]:
        if self.net is None:
            boxes, weights = self.hog.detectMultiScale(frame, winStride=(8,8), padding=(8,8), scale=1.05)
            return [(list(map(int, b)), float(s)) for b, s in zip(boxes, weights) if float(s) >= .15]
        h, w = frame.shape[:2]
        if self.mode == "opencv_zoo_yolox":
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB); scale = min(self.input_size / h, self.input_size / w); resized = cv2.resize(rgb, (int(w*scale), int(h*scale)))
            padded = np.full((self.input_size, self.input_size, 3), 114, dtype=np.float32); padded[:resized.shape[0], :resized.shape[1]] = resized.astype(np.float32)
            self.net.setInput(np.transpose(padded, (2, 0, 1))[None]); output = self.net.forward(self.net.getUnconnectedOutLayersNames())[0][0]
            grids=[]; strides=[]
            for stride in (8,16,32):
                yy, xx = np.meshgrid(np.arange(self.input_size//stride), np.arange(self.input_size//stride), indexing="ij"); grids.append(np.stack((xx,yy),-1).reshape(-1,2)); strides.extend([stride]*((self.input_size//stride)**2))
            grids=np.concatenate(grids); strides=np.array(strides,dtype=np.float32)[:,None]; output[:,:2]=(output[:,:2]+grids)*strides; output[:,2:4]=np.exp(output[:,2:4])*strides
            cls=np.argmax(output[:,5:],axis=1); scores=output[:,4]*output[np.arange(len(output)),5+cls]; keep=(cls==0)&(scores>=.35); boxes=[]; kept_scores=[]
            for row, score in zip(output[keep], scores[keep]):
                x,y,bw,bh=row[:4]; boxes.append([max(0,int((x-bw/2)/scale)),max(0,int((y-bh/2)/scale)),min(w,int(bw/scale)),min(h,int(bh/scale))]); kept_scores.append(float(score))
            indices=cv2.dnn.NMSBoxes(boxes, kept_scores, .35, .5); return [(boxes[int(i)],kept_scores[int(i)]) for i in np.array(indices).reshape(-1)] if len(indices) else []
        self.net.setInput(cv2.dnn.blobFromImage(frame, 1/255.0, (416,416), swapRB=True)); outputs = self.net.forward(self.net.getUnconnectedOutLayersNames()); boxes=[]; scores=[]
        for output in outputs:
            for row in output:
                objectness = float(row[4]); class_scores = row[5:]; class_id = int(np.argmax(class_scores)); confidence = objectness * float(class_scores[class_id])
                if class_id != 0 or confidence < .35: continue
                cx, cy, bw, bh = row[:4] * [w,h,w,h]; boxes.append([max(0,int(cx-bw/2)),max(0,int(cy-bh/2)),min(w,int(bw)),min(h,int(bh))]); scores.append(confidence)
        keep = cv2.dnn.NMSBoxes(boxes, scores, .35, .4); return [(boxes[int(i)], scores[int(i)]) for i in np.array(keep).reshape(-1)] if len(keep) else []

def analyze_video(path: str, polygon: list[list[int]], max_frames: int = 80, detector: Any | None = None, zones: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    info = video_info(path); zones = zones or [{"id": "zone-1", "name": "Restricted zone", "polygon": polygon}]
    for zone in zones: validate_polygon(zone["polygon"], info["width"], info["height"])
    max_frames = max(1, min(int(max_frames), MAX_FRAMES)); detector = detector or PersonDetector(); step = max(1, math.ceil(info["frame_count"] / max_frames)); cap = cv2.VideoCapture(path); tracks={}; next_id=1; observations=[]; frame=0
    try:
        while True:
            ok, image = cap.read()
            if not ok: break
            if frame % step: frame += 1; continue
            matches, next_id = associate_detections(detector.detect(image), tracks, next_id, frame)
            for tid, box, score in matches:
                x,y,w,h=box; footpoint=(x+w//2,y+h); memberships=[{"zone_id":z["id"],"zone_name":z.get("name",z["id"]),"inside":point_in_polygon(footpoint,z["polygon"])} for z in zones]; inside=any(m["inside"] for m in memberships); item=asdict(Detection(frame, frame/info["fps"], tid, "person", round(score,3), box, inside)); item.update({"footpoint":list(footpoint),"zones":memberships}); observations.append(item)
            frame += 1
    finally: cap.release()
    return {"video": info, "detector": getattr(detector, "mode", "synthetic"), "observations": observations, "candidate_tracks": sorted({o["track_id"] for o in observations if o["inside_zone"]}), "zones": zones}

def render_annotated_video(path: str, result: dict[str, Any], output_path: str) -> dict[str, Any]:
    """Create a downloadable MP4 using only observations returned by the scan."""
    info=result["video"]; cap=cv2.VideoCapture(path); writer=cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"mp4v"), info["fps"], (info["width"],info["height"]))
    by_frame={}
    for observation in result.get("observations",[]): by_frame.setdefault(observation["frame"],[]).append(observation)
    try:
        index=0
        while True:
            ok,frame=cap.read()
            if not ok: break
            for zone in result.get("zones",[]): cv2.polylines(frame,[np.array(zone["polygon"],np.int32)],True,(0,170,255),2)
            for observation in by_frame.get(index,[]):
                x,y,w,h=observation["bbox"]; color=(0,55,255) if observation["inside_zone"] else (40,220,120); cv2.rectangle(frame,(x,y),(x+w,y+h),color,2); cv2.putText(frame,f"ID {observation['track_id']} {observation['confidence']:.2f}",(x,max(20,y-8)),cv2.FONT_HERSHEY_SIMPLEX,.55,color,2)
            writer.write(frame); index+=1
    finally: cap.release(); writer.release()
    return {"path":output_path,"size_bytes":Path(output_path).stat().st_size if Path(output_path).exists() else 0}

def extract_relevant_frames(path: str, timestamps: list[float], limit: int = 8) -> dict[str, Any]:
    info=video_info(path); cap=cv2.VideoCapture(path); frames=[]
    try:
        for timestamp in sorted(timestamps)[:limit]:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(max(0,timestamp)*info["fps"])); ok, image=cap.read()
            if ok: frames.append({"timestamp": timestamp, "frame": int(timestamp*info["fps"]), "image": _jpeg(image)})
    finally: cap.release()
    return {"frames": frames, "count": len(frames)}

def detect_motion(path: str, polygon: list[list[int]], timestamps: list[float], threshold: int = 25) -> dict[str, Any]:
    info=video_info(path); cap=cv2.VideoCapture(path); scores=[]
    try:
        for timestamp in sorted(timestamps)[:8]:
            cap.set(cv2.CAP_PROP_POS_FRAMES, max(0,int(timestamp*info["fps"]))); ok,a=cap.read(); ok2,b=cap.read()
            if ok and ok2:
                delta=cv2.absdiff(cv2.cvtColor(a,cv2.COLOR_BGR2GRAY),cv2.cvtColor(b,cv2.COLOR_BGR2GRAY)); mask=(delta>threshold).astype(np.uint8); zone=np.zeros(mask.shape,np.uint8); cv2.fillPoly(zone,[np.array(polygon,np.int32)],255); scores.append({"timestamp":timestamp,"motion_pixels":int(np.count_nonzero(mask & (zone>0)))})
    finally: cap.release()
    return {"motion": scores, "zone_motion": any(x["motion_pixels"] > 20 for x in scores)}

def track_target(path: str, bbox: list[int], start_timestamp: float = 0, max_frames: int = 40) -> dict[str, Any]:
    if len(bbox)!=4 or min(bbox[2:])<=0: raise ValueError("Target bbox must be [x, y, width, height]")
    info=video_info(path); cap=cv2.VideoCapture(path); cap.set(cv2.CAP_PROP_POS_FRAMES,int(start_timestamp*info["fps"])); ok,first=cap.read()
    if not ok: cap.release(); return {"tracking_available":False,"reason":"Unable to read target frame","observations":[]}
    creator=getattr(cv2,"TrackerCSRT_create",None) or getattr(getattr(cv2,"legacy",None),"TrackerCSRT_create",None)
    if creator is None: cap.release(); return {"tracking_available":False,"reason":"OpenCV CSRT tracker is unavailable","observations":[]}
    tracker=creator(); tracker.init(first,tuple(bbox)); result=[]
    try:
        for index in range(max_frames):
            ok,box=tracker.update(first if index==0 else cap.read()[1]);
            if not ok: break
            result.append({"frame":int(start_timestamp*info["fps"])+index,"timestamp":start_timestamp+index/info["fps"],"bbox":list(map(int,box))})
    finally: cap.release()
    return {"tracking_available":bool(result),"reason":None if result else "Tracker lost target","observations":result}

def analyze_region(path: str, polygon: list[list[int]], timestamps: list[float]) -> dict[str, Any]:
    return detect_motion(path, polygon, timestamps, threshold=18)

def verify_zone_crossing(observations: list[dict[str, Any]], fps: float, max_gap_seconds: float = 1.0, min_persistence_seconds: float = 0.5) -> dict[str, Any]:
    if fps <= 0: raise ValueError("FPS must be positive for temporal verification")
    crossings=[]; exits=[]; occupancy=[]; initial_occupancy=[]; by_track={}
    for item in observations: by_track.setdefault(item["track_id"],[]).append(item)
    for tid, points in by_track.items():
        points=sorted(points,key=lambda x:x["timestamp"]); start=None; previous=None; segment=[]
        for item in points:
            gap = item["timestamp"]-previous["timestamp"] if previous else 0
            if gap > max_gap_seconds: start=None; segment=[]
            if item["inside_zone"] and (previous is None or not previous["inside_zone"] or start is None): start=item
            if item["inside_zone"] and start is not None:
                segment.append(item); occupancy.append((tid,start,item))
                if previous is None: initial_occupancy.append({"track_id":tid,"start":item["timestamp"],"evidence_count":1,"confidence":item["confidence"]})
            if item["inside_zone"] and previous is not None and not previous["inside_zone"] and start is not None:
                crossings.append({"event_type":"entry","track_id":tid,"start":start["timestamp"],"end":item["timestamp"],"duration":0,"evidence_count":1,"confidence":item["confidence"]})
            if not item["inside_zone"] and previous is not None and previous["inside_zone"]:
                exits.append({"event_type":"exit","track_id":tid,"timestamp":item["timestamp"],"confidence":item["confidence"]})
            previous=item
        for _, first,last in [x for x in occupancy if x[0]==tid]:
            duration=last["timestamp"]-first["timestamp"]
            for crossing in crossings:
                if crossing["track_id"]==tid and crossing["start"]==first["timestamp"]: crossing.update(end=last["timestamp"],duration=round(duration,3),evidence_count=sum(1 for p in points if p["timestamp"]>=first["timestamp"] and p["timestamp"]<=last["timestamp"]))
    credible=[x for x in crossings if x["evidence_count"]>=2 and x["duration"]>=min_persistence_seconds]
    return {"crossings":crossings,"exits":exits,"initial_occupancy":initial_occupancy,"occupancy_count":len(occupancy),"has_credible_crossing":bool(credible),"credible_crossings":credible}

def generate_incident_report(scan: dict[str,Any], verification: dict[str,Any], motion: dict[str,Any] | None = None) -> dict[str,Any]:
    credible=verification.get("has_credible_crossing",False); uncertain=bool(motion and motion.get("zone_motion") and not credible); status="ALERT" if credible else ("REVIEW" if uncertain or verification.get("occupancy_count") else "CLEAR")
    return {"status":status,"alert":status=="ALERT","incidents":verification.get("crossings",[]),"reason":"Persistent outside-to-inside transition verified" if credible else ("Zone motion needs human review" if uncertain else "No verified crossing")}

Tool = Callable[..., dict[str,Any]]
class ToolRegistry:
    def __init__(self, tools: dict[str,Tool]): self.tools=tools; self.trace=[]
    def execute_tool(self, name: str, **kwargs: Any) -> dict[str,Any]:
        if name not in self.tools: raise KeyError(f"Unknown tool: {name}")
        call_id=str(uuid.uuid4()); started=time.perf_counter(); event={"call_id":call_id,"tool":name,"input":{k:v for k,v in kwargs.items() if k not in {"path"}},"started_at":time.time()}
        try:
            result=self.tools[name](**kwargs); event.update({"status":"success","duration_ms":round((time.perf_counter()-started)*1000,2),"result_summary":_summary(result)}); return result
        except Exception as exc:
            event.update({"status":"error","duration_ms":round((time.perf_counter()-started)*1000,2),"error":str(exc)}); raise
        finally: self.trace.append(event)

def _summary(result: Any) -> dict[str,Any]:
    if not isinstance(result,dict): return {"type":type(result).__name__}
    return {k:(len(v) if isinstance(v,(list,dict)) else v) for k,v in result.items() if k not in {"image","frames"} and not (isinstance(v,str) and v.startswith("data:image"))}

def run_agent(path: str, polygon: list[list[int]], max_frames: int=80, zones: list[dict[str, Any]] | None = None) -> dict[str,Any]:
    registry=ToolRegistry({"analyze_video":analyze_video,"extract_relevant_frames":extract_relevant_frames,"detect_motion":detect_motion,"track_target":track_target,"analyze_region":analyze_region,"verify_zone_crossing":verify_zone_crossing,"generate_incident_report":generate_incident_report})
    scan=registry.execute_tool("analyze_video",path=path,polygon=polygon,max_frames=max_frames,zones=zones); observations=scan["observations"]; timestamps=sorted({o["timestamp"] for o in observations if o["inside_zone"]})
    if timestamps:
        registry.trace[-1]["next_action"]="extract_relevant_frames"
        evidence=registry.execute_tool("extract_relevant_frames",path=path,timestamps=timestamps)
        registry.trace[-1]["next_action"]="verify_zone_crossing"
        zone_verifications={}
        scan_zones=scan.get("zones",[{"id":"zone-1","name":"Restricted zone","polygon":polygon}])
        for zone in scan_zones:
            zone_observations=[]
            for item in observations:
                membership=next((m for m in item.get("zones",[]) if m["zone_id"]==zone["id"]),{"inside":item["inside_zone"]})
                zone_observations.append({**item,"inside_zone":membership["inside"]})
            zone_verifications[zone["id"]]=registry.execute_tool("verify_zone_crossing",observations=zone_observations,fps=scan["video"]["fps"])
            registry.trace[-1]["next_action"]="verify_zone_crossing" if zone != scan_zones[-1] else "generate_incident_report"
        verification={"crossings":[{**crossing,"zone_id":zone_id} for zone_id,value in zone_verifications.items() for crossing in value["crossings"]],"occupancy_count":sum(value["occupancy_count"] for value in zone_verifications.values()),"has_credible_crossing":any(value["has_credible_crossing"] for value in zone_verifications.values()),"by_zone":zone_verifications}
        next_action="generate_incident_report"
    else:
        scan_zones=scan.get("zones",[{"id":"zone-1","name":"Restricted zone","polygon":polygon}])
        motion=registry.execute_tool("detect_motion",path=path,polygon=scan_zones[0]["polygon"],timestamps=[0,scan["video"]["duration"]/2]); registry.trace[-1]["next_action"]="analyze_region" if motion.get("zone_motion") else "generate_incident_report"
        if motion.get("zone_motion"):
            region=registry.execute_tool("analyze_region",path=path,polygon=polygon,timestamps=[0,scan["video"]["duration"]/2]); registry.trace[-1]["next_action"]="generate_incident_report"
            motion={**motion,"region":region}
        evidence={"count":0}; verification={"crossings":[],"occupancy_count":0,"has_credible_crossing":False}; next_action="generate_incident_report"
    report=registry.execute_tool(next_action,scan=scan,verification=verification,motion=locals().get("motion")); registry.trace[-1]["next_action"]="complete"
    for event in registry.trace:
        event.setdefault("next_action", next_action)
    return {"scan":scan,"evidence":evidence,"verification":verification,"report":report,"trace":registry.trace}
