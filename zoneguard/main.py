from pathlib import Path
import json, os, re, shutil, uuid
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .vision import run_agent, video_info, opencv5_status, render_annotated_video

ROOT=Path(__file__).resolve().parent.parent; UPLOADS=ROOT/'data'/'uploads'; RESULTS=ROOT/'data'/'results'; UPLOADS.mkdir(parents=True,exist_ok=True); RESULTS.mkdir(parents=True,exist_ok=True)
MAX_UPLOAD_BYTES=int(os.getenv('ZONEGUARD_MAX_UPLOAD_BYTES',str(1024*1024*1024))); ALLOWED_ORIGINS=[x.strip() for x in os.getenv('ZONEGUARD_CORS_ORIGINS','http://localhost:8080').split(',') if x.strip()]
app=FastAPI(title='ZoneGuard',version='0.3.0',description='Evidence-driven OpenCV 5 visual safety analysis API'); app.add_middleware(CORSMiddleware,allow_origins=ALLOWED_ORIGINS,allow_methods=['GET','POST'],allow_headers=['*']); app.mount('/static',StaticFiles(directory=ROOT/'static'),name='static')
ANALYSES={}; LATEST_BY_VIDEO={}
def persisted_analysis_for_video(video_id:str):
    candidates=[]
    for report_path in RESULTS.glob('*/report.json'):
        try:
            report=json.loads(report_path.read_text(encoding='utf-8'))
            if report.get('video_id')==video_id: candidates.append((report_path.stat().st_mtime,report_path.parent.name))
        except (OSError,json.JSONDecodeError):
            continue
    return max(candidates)[1] if candidates else None
class AnalyzeRequest(BaseModel):
    video_id:str=Field(min_length=1,pattern=r'^[a-f0-9]{32}$'); polygon:list[list[int]]=Field(min_length=3); zones:list[dict] | None=None; max_frames:int=Field(default=80,ge=1,le=240)
@app.get('/')
def index(): return FileResponse(ROOT/'static'/'index2.html')
@app.get('/api/health')
def health(): return {'ok':True,'opencv':opencv5_status()}
@app.post('/api/videos')
async def upload(file:UploadFile=File(...)):
    if Path(file.filename or '').suffix.lower() not in {'.mp4','.mov','.avi','.mkv','.webm','.gif'}: raise HTTPException(400,'Unsupported video type')
    ident=uuid.uuid4().hex; dest=UPLOADS/(ident+Path(file.filename).suffix.lower()); total=0
    with dest.open('wb') as out:
        while chunk:=await file.read(1024*1024):
            total+=len(chunk)
            if total>MAX_UPLOAD_BYTES: dest.unlink(missing_ok=True); raise HTTPException(413,'Video exceeds configured upload limit')
            out.write(chunk)
    try: info=video_info(str(dest))
    except ValueError as exc: dest.unlink(missing_ok=True); raise HTTPException(400,str(exc)) from exc
    return {'video_id':ident,'filename':file.filename,'info':info}
@app.post('/api/analyze')
def analyze(req:AnalyzeRequest):
    paths=list(UPLOADS.glob(req.video_id+'.*'))
    if not paths: raise HTTPException(404,'Video not found')
    try:
        analysis_id=uuid.uuid4().hex; run_dir=RESULTS / analysis_id; run_dir.mkdir(parents=True,exist_ok=False); ANALYSES[analysis_id]={'analysis_id':analysis_id,'video_id':req.video_id,'status':'running'}
        result=run_agent(str(paths[0]),req.polygon,req.max_frames,req.zones); result.update({'video_id':req.video_id,'analysis_id':analysis_id,'status':'complete'}); LATEST_BY_VIDEO[req.video_id]=analysis_id
        (run_dir/'report.json').write_text(json.dumps(result),encoding='utf-8'); render_annotated_video(str(paths[0]),result['scan'],str(run_dir/'annotated.mp4')); ANALYSES[analysis_id].update({'status':'complete','result':result})
        return result
    except ValueError as exc: raise HTTPException(422,str(exc)) from exc

@app.get('/api/analyses/{analysis_id}')
def analysis_status(analysis_id:str):
    if not re.fullmatch(r'[a-f0-9]{32}',analysis_id): raise HTTPException(400,'Invalid analysis ID')
    item=ANALYSES.get(analysis_id)
    if item: return {k:v for k,v in item.items() if k!='result'}
    path=RESULTS/analysis_id/'report.json'
    if path.is_file(): return {'analysis_id':analysis_id,'status':'complete'}
    raise HTTPException(404,'Analysis not found')

@app.get('/api/analyses/{analysis_id}/report')
def analysis_report(analysis_id:str):
    if not re.fullmatch(r'[a-f0-9]{32}',analysis_id): raise HTTPException(400,'Invalid analysis ID')
    path=RESULTS/analysis_id/'report.json'
    if not path.is_file(): raise HTTPException(404,'Analysis result not found')
    return FileResponse(path,media_type='application/json',filename=f'{analysis_id}-report.json')

@app.get('/api/analyses/{analysis_id}/annotated')
def annotated_analysis(analysis_id:str):
    if not re.fullmatch(r'[a-f0-9]{32}',analysis_id): raise HTTPException(400,'Invalid analysis ID')
    path=RESULTS/analysis_id/'annotated.mp4'
    if not path.is_file(): raise HTTPException(404,'Annotated video not found')
    return FileResponse(path,media_type='video/mp4',filename=f'{analysis_id}-annotated.mp4')

@app.get('/api/results/{video_id}/report')
def legacy_report(video_id:str):
    analysis_id=LATEST_BY_VIDEO.get(video_id) or persisted_analysis_for_video(video_id)
    if not analysis_id: raise HTTPException(404,'Analysis result not found')
    return analysis_report(analysis_id)

@app.get('/api/results/{video_id}/annotated')
def legacy_annotated(video_id:str):
    analysis_id=LATEST_BY_VIDEO.get(video_id) or persisted_analysis_for_video(video_id)
    if not analysis_id: raise HTTPException(404,'Annotated video not found')
    return annotated_analysis(analysis_id)
