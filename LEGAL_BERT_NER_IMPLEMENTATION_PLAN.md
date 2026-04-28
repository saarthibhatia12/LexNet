# Legal-BERT NER Implementation Plan

## Summary
- Deliver this plan as a new root file named `LEGAL_BERT_NER_IMPLEMENTATION_PLAN.md`.
- Keep the work scoped to `nlp/`: build a reproducible Legal-BERT token-classification training/export flow, deploy the exported checkpoint to `NER_MODEL_PATH`, and make one runtime correction in `nlp/src/pipeline/ner.py` so OCR-style all-caps person names are not discarded.
- Keep external Flask contracts unchanged. Success is measured by `GET /nlp/health` showing `checks.legalBertModelPath.exists=true` and `checks.legalBertModelPath.loadedForTokenClassification=true`, plus passing the NER test suite and a small real-snippet validation pass.

## Implementation Changes
- Add minimal new NER assets under `nlp/`: `scripts/train_ner_model.py`, `data/ner_training/train.jsonl`, `validation.jsonl`, `test.jsonl`, `label_contract.json`, and export metadata written with the trained model. Track scripts and metadata in Git; ignore `nlp/models/` checkpoints and weights in `.gitignore`.
- Build a gold dataset from OCR-style sale deeds, land records, and court orders. Target 300-400 annotated sentences, split 70/15/15 at document level, with every split containing all 8 LexNet labels. Seed annotation with the current regexes in `nlp/src/pipeline/ner.py` for `PROPERTY_ID` and explicit `Survey No...` forms, then manually correct all spans.
- Lock the label contract before training: manual annotations use canonical non-BIO labels only, and the training script converts them to `O` plus BIO tags for the 8 labels in `nlp/data/ner_labels.json`. Alias labels such as `PER`, `ORG`, `MONEY`, `LAW`, `GPE`, `LOC`, and `FAC` may be normalized during dataset prep but must not appear in the exported `config.json`.
- Preserve the repo’s current label behavior: annotate `Sy.No...` forms as `PROPERTY_ID` to stay aligned with existing tests and fallback regexes; reserve `SURVEY_NUMBER` for explicit `Survey No...` phrasing unless the runtime contract is intentionally expanded later.
- Train `nlpaueb/legal-bert-base-uncased` with `AutoModelForTokenClassification`, `AutoTokenizer`, `DataCollatorForTokenClassification`, max length `512`, stride `128`, learning rate `3e-5`, batch size `8`, `5` epochs, and seed `42`. Select the best checkpoint by validation macro F1, require overall seqeval F1 of at least `0.75`, and reject any checkpoint with recall below `0.60` for `PROPERTY_ID`, `SURVEY_NUMBER`, or `LEGAL_SECTION`.
- Save training artifacts to a directory separate from `NER_MODEL_PATH`, then export the selected checkpoint with `save_pretrained()` into `nlp/models/legal-bert` on the host, which maps to `/app/models/legal-bert` in Docker via the `lexnet_nlp_models` volume.
- Update `nlp/scripts/download_models.py` so it never writes the unfine-tuned base model into `NER_MODEL_PATH`. Default it to spaCy bootstrap only, and make any base-model download use a separate explicit cache/output path.
- Update `nlp/src/pipeline/ner.py` only where needed for runtime correctness: keep `ner_labels.json`, BIO stripping, and fallback label normalization intact; relax the `PERSON` heuristic so 1-3 token uppercase OCR names such as `RAM KUMAR` pass if they contain letters plus optional `-` or `'`, and still reject noisy digit-heavy spans.
- Refresh `nlp/README.md` and `docker/README.md` so setup, export, Docker volume usage, and health verification all describe the fine-tuned checkpoint path rather than the raw base model path.

## Interfaces
- External API: no REST or health-response schema changes. `GET /nlp/health` remains the readiness source of truth; use `checks.legalBertModelPath.exists` and `checks.legalBertModelPath.loadedForTokenClassification` as the Legal-BERT acceptance fields, and read `runtimeReady` only after Tesseract, spaCy, and `conflict_model.pkl` are also present.
- Environment contract: keep `NER_MODEL_PATH=./models/legal-bert` in `nlp/.env.example`; do not add new required env vars for this feature.
- Dataset schema: each JSONL record contains `id`, `source_type`, `text`, and `entities`, where `entities` is a list of `{start, end, label}` char-span annotations using canonical non-BIO labels. `label_contract.json` is the single source of truth for alias normalization and label inventory.
- Training CLI: `python scripts/train_ner_model.py --dataset-dir ./data/ner_training --base-model nlpaueb/legal-bert-base-uncased --artifacts-dir ./models/legal-bert-training --export-dir ./models/legal-bert`. The script writes `metrics.json`, `label_report.json`, and `export_metadata.json`.
- Dependency updates: add explicit `torch`, `datasets`, `evaluate`, `seqeval`, and `accelerate` support in `nlp/requirements.txt` and `nlp/setup.py` so both local training and local token-classification loading are reproducible.

## Test Plan
- Extend `nlp/tests/test_ner.py` to cover BIO-labeled transformer output, uppercase OCR person names, preserved `Sy.No... -> PROPERTY_ID` behavior, explicit `Survey No... -> SURVEY_NUMBER` behavior, and fallback extraction when the transformer checkpoint is missing or invalid.
- Add a Flask app-factory health test that asserts a valid exported checkpoint produces `loadedForTokenClassification=true`, while a missing checkpoint or generic `LABEL_n` config produces `false` without breaking fallback extraction.
- Validate the final model on 2-3 real OCR snippets outside the gold splits and compare transformer output against the existing regex/spaCy fallback, with focused checks for `PROPERTY_ID`, `LEGAL_SECTION`, `MONETARY_VALUE`, and uppercase `PERSON`.
- Acceptance requires: the exported checkpoint loads offline from `NER_MODEL_PATH`, `GET /nlp/health` reports the model as loaded for token classification, the NER tests pass, and fallback extraction still works when the transformer path is intentionally unavailable.

## Assumptions
- The new root plan file will be `LEGAL_BERT_NER_IMPLEMENTATION_PLAN.md`.
- Model weights and training checkpoints are local runtime artifacts and should not be committed; code, dataset manifests, label-contract metadata, and metric summaries are tracked.
- This work stays inside the NLP module and does not change backend/frontend contracts or `nlp/data/ner_labels.json`.
