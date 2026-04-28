# NLP Preflight

Use this module only after the pre-NLP checklist passes.

Host setup:

```powershell
cd nlp
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python scripts/download_models.py
python -c "import spacy; spacy.load('en_core_web_sm'); print('SPACY_OK')"
```

Docker setup:

```powershell
docker build -f docker/nlp.Dockerfile -t lexnet-nlp-preflight .
docker run --rm -v lexnet_nlp_models:/app/models --env-file nlp/.env lexnet-nlp-preflight python scripts/download_models.py
docker run --rm -p 5500:5500 -v lexnet_nlp_models:/app/models --env-file nlp/.env lexnet-nlp-preflight
```

Health check:

```powershell
curl.exe http://localhost:5500/nlp/health
```

Required runtime inputs:

- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- `IPFS_API_URL`
- `SPACY_MODEL`
- `NER_MODEL_PATH`
- `CONFLICT_MODEL_PATH`
- `TESSERACT_CMD`

Fine-tuned Legal-BERT NER model onboarding:

1. Place a fine-tuned Hugging Face token-classification checkpoint at the directory configured by `NER_MODEL_PATH`.
2. Ensure the checkpoint directory contains at least:
	- `config.json`
	- `tokenizer.json` (or `vocab.txt` + tokenizer config files)
	- `model.safetensors` (or `pytorch_model.bin`)
3. Keep the NER labels aligned with `data/ner_labels.json`.
4. BIO-prefixed label schemes like `B-PERSON` / `I-PERSON` are accepted.
5. Common alias labels are mapped automatically:
	- `PER -> PERSON`
	- `ORG -> ORGANISATION`
	- `MONEY -> MONETARY_VALUE`
	- `LAW -> LEGAL_SECTION`
	- `GPE` / `LOC` / `FAC -> JURISDICTION`

Docker runtime note:

- In Docker Compose, model files must exist inside `/app/models` because the `nlp_models` volume is mounted there.
- With the default `.env` value `NER_MODEL_PATH=./models/legal-bert`, place the checkpoint under `/app/models/legal-bert` in the container volume.

Validation:

- Start the NLP service and call `GET /nlp/health`.
- If the model cannot be loaded as token-classification, extraction still runs using spaCy + regex fallback.
