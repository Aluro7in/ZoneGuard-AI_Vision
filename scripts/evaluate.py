"""Evaluate event reports against manually labelled JSON annotations."""
from __future__ import annotations
import argparse, json, time
from pathlib import Path

EVENT_TYPES={"entry","exit","dwell"}
def load(path: Path):
    data=json.loads(path.read_text(encoding="utf-8")); required={"video_id","fps","duration","events","ignore_intervals"}
    missing=required-set(data)
    if missing: raise ValueError(f"{path}: missing {sorted(missing)}")
    if data["fps"]<=0 or data["duration"]<0: raise ValueError(f"{path}: invalid timing")
    for event in data["events"]:
        if event.get("event_type") not in EVENT_TYPES or event.get("start",-1)<0: raise ValueError(f"{path}: invalid event")
    return data
def ignored(event, intervals):
    return any(event.get("start",event.get("timestamp",0)) <= i["end"] and event.get("end",event.get("start",event.get("timestamp",0))) >= i["start"] for i in intervals)
def evaluate(annotation, prediction, tolerance):
    truth=[e for e in annotation["events"] if not e.get("uncertain",False) and not ignored(e,annotation["ignore_intervals"])]
    predicted=[e for e in prediction.get("report",prediction).get("incidents",[]) if e.get("event_type","entry") in EVENT_TYPES]
    predicted=[e for e in predicted if not ignored(e,annotation["ignore_intervals"])]
    used=set(); tp=0
    for actual in truth:
        match=next((i for i,e in enumerate(predicted) if i not in used and e.get("event_type","entry")==actual["event_type"] and e.get("zone_id",actual.get("zone_id"))==actual.get("zone_id") and abs(e.get("start",e.get("timestamp",0))-actual["start"])<=tolerance),None)
        if match is not None: used.add(match); tp+=1
    fp=len(predicted)-len(used); fn=len(truth)-tp; precision=tp/(tp+fp) if tp+fp else None; recall=tp/(tp+fn) if tp+fn else None; f1=2*precision*recall/(precision+recall) if precision is not None and recall is not None and precision+recall else None
    return {"tp":tp,"fp":fp,"fn":fn,"precision":precision,"recall":recall,"f1":f1,"valid_events":len(truth),"predicted_events":len(predicted)}
def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--annotations",type=Path,required=True); parser.add_argument("--predictions",type=Path,required=True); parser.add_argument("--output",type=Path,required=True); parser.add_argument("--tolerance",type=float,default=.75); args=parser.parse_args(); started=time.perf_counter(); rows=[]
    for annotation_path in sorted(args.annotations.glob("*.json")):
        annotation=load(annotation_path); prediction_path=args.predictions/f"{annotation['video_id']}.json"; prediction=json.loads(prediction_path.read_text()) if prediction_path.exists() else {"report":{"incidents":[]}}
        row={"video_id":annotation["video_id"],**evaluate(annotation,prediction,args.tolerance),"duration_seconds":annotation["duration"]}; row["false_alerts_per_video_minute"]=row["fp"]/(annotation["duration"]/60) if annotation["duration"] else None; rows.append(row)
    valid=sum(r["valid_events"] for r in rows); summary={"status":"ok" if rows and valid else "insufficient_data","videos":len(rows),"rows":rows,"elapsed_seconds":round(time.perf_counter()-started,4),"matching":{"timestamp_tolerance":args.tolerance,"event_key":"zone_id + event_type + start"}}
    args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_text(json.dumps(summary,indent=2),encoding="utf-8"); print(json.dumps(summary,indent=2))
if __name__=="__main__": main()
