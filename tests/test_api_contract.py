import pytest
from fastapi import HTTPException

from zoneguard.main import app, analysis_status

def test_openapi_exposes_stable_analysis_contract():
    schema=app.openapi(); paths=schema['paths']
    assert '/api/health' in paths
    assert '/api/videos' in paths
    assert '/api/analyze' in paths
    assert '/api/analyses/{analysis_id}/report' in paths
    assert '/api/analyses/{analysis_id}/annotated' in paths

def test_invalid_analysis_id_is_rejected():
    with pytest.raises(HTTPException) as exc: analysis_status('not-a-run')
    assert exc.value.status_code == 400
