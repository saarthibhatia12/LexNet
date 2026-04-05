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
