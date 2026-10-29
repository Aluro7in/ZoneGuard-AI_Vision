# ZoneGuard detector asset

Primary detector: `object_detection_yolox_2022nov_int8bq.onnx`, downloaded from the OpenCV Zoo model repository's YOLOX object-detection model card.

- Source: https://huggingface.co/opencv/opencv_zoo/tree/main/models/object_detection_yolox
- License: Apache-2.0, as stated by the model card.
- Runtime: OpenCV DNN, OpenCV 5.0.0.
- SHA-256: `DCAAE0AAA2FEA4167F89235EE340EB869D3707B25712218D4C7CE921AC90E2BA`

The model is COCO-trained. ZoneGuard filters class `person` (class 0), computes YOLOX objectness × class score, reverses the 640×640 letterbox scale, clips boxes to the source frame, and applies NMS. The score is detector confidence, not a calibrated probability of a safety incident.
