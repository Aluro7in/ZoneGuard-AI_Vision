import pytest
cv2 = pytest.importorskip('cv2')
from zoneguard.vision import associate_detections, bbox_iou, validate_polygon, verify_zone_crossing, run_agent

def test_association_is_one_to_one_and_expires_stale_tracks():
    tracks={1:{'bbox':[0,0,20,20],'missed':0,'last_frame':0}}
    matches,next_id=associate_detections([([1,1,20,20],.8),([100,100,20,20],.7)],tracks,2,1)
    assert len({m[0] for m in matches}) == 2
    for frame in range(2,6): associate_detections([],tracks,next_id,frame)
    assert 1 not in tracks

def test_polygon_and_transition_are_distinct():
    polygon=validate_polygon([[0,0],[99,0],[99,99],[0,99]],100,100)
    assert len(polygon)==4
    observations=[
        {'track_id':1,'timestamp':0.0,'inside_zone':False,'confidence':.8,'bbox':[110,10,10,10]},
        {'track_id':1,'timestamp':.5,'inside_zone':True,'confidence':.8,'bbox':[50,10,10,10]},
        {'track_id':1,'timestamp':1.0,'inside_zone':True,'confidence':.8,'bbox':[51,10,10,10]},
    ]
    result=verify_zone_crossing(observations,2)
    assert result['has_credible_crossing']
    assert result['crossings'][0]['duration'] == .5

def test_long_gap_does_not_become_continuous_dwell():
    observations=[
        {'track_id':1,'timestamp':0.0,'inside_zone':False,'confidence':.8,'bbox':[110,10,10,10]},
        {'track_id':1,'timestamp':.5,'inside_zone':True,'confidence':.8,'bbox':[50,10,10,10]},
        {'track_id':1,'timestamp':5.0,'inside_zone':True,'confidence':.8,'bbox':[51,10,10,10]},
    ]
    result=verify_zone_crossing(observations,2,max_gap_seconds=1)
    assert not result['has_credible_crossing']

def test_exit_and_initial_occupancy_are_not_entries():
    observations=[
        {'track_id':2,'timestamp':0.0,'inside_zone':True,'confidence':.8,'bbox':[50,10,10,10]},
        {'track_id':2,'timestamp':.5,'inside_zone':True,'confidence':.8,'bbox':[51,10,10,10]},
        {'track_id':2,'timestamp':1.0,'inside_zone':False,'confidence':.8,'bbox':[110,10,10,10]},
    ]
    result=verify_zone_crossing(observations,2)
    assert result['initial_occupancy'] and not result['crossings']
    assert result['exits'][0]['event_type']=='exit'

def test_iou_is_bounded(): assert 0 <= bbox_iou([0,0,10,10],[5,5,10,10]) <= 1

def test_controller_branches_from_real_tool_result(monkeypatch):
    import zoneguard.vision as vision
    base={'video':{'fps':2,'duration':2},'observations':[{'track_id':1,'timestamp':.5,'inside_zone':True,'confidence':.8,'bbox':[1,1,10,10]}], 'candidate_tracks':[1]}
    calls=[]
    monkeypatch.setattr(vision,'analyze_video',lambda **kwargs: calls.append('analyze_video') or base)
    monkeypatch.setattr(vision,'extract_relevant_frames',lambda **kwargs: calls.append('extract_relevant_frames') or {'frames':[],'count':0})
    monkeypatch.setattr(vision,'verify_zone_crossing',lambda **kwargs: calls.append('verify_zone_crossing') or {'crossings':[],'occupancy_count':1,'has_credible_crossing':False})
    monkeypatch.setattr(vision,'generate_incident_report',lambda **kwargs: calls.append('generate_incident_report') or {'status':'REVIEW','alert':False})
    result=run_agent('unused.mp4',[[0,0],[10,0],[10,10]])
    assert calls == ['analyze_video','extract_relevant_frames','verify_zone_crossing','generate_incident_report']
    assert [event['tool'] for event in result['trace']] == calls
