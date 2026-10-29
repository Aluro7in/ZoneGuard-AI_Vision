from pathlib import Path

from zoneguard.main import RESULTS, UPLOADS, health
from zoneguard.vision import PersonDetector

ROOT=Path(__file__).resolve().parents[1]

def test_runtime_health_and_artifact_directories():
    result=health()
    assert result['ok'] is True
    assert result['opencv']['supported'] is True
    assert UPLOADS.is_dir() and RESULTS.is_dir()

def test_detector_model_is_available_and_hash_checked():
    detector=PersonDetector()
    assert detector.mode == 'opencv_zoo_yolox'

def test_docker_uses_configurable_port_and_excludes_runtime_artifacts():
    dockerfile=(ROOT/'Dockerfile').read_text()
    ignore=(ROOT/'.dockerignore').read_text()
    assert '${PORT:-8080}' in dockerfile
    assert 'data/uploads' in ignore and 'data/results' in ignore
