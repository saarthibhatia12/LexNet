# Docker Preflight

For the pre-NLP stage, only Neo4j, IPFS, and the NLP runtime need to be ready.

```powershell
cd docker
docker compose up -d neo4j ipfs
```

Apply the schema after Neo4j is up:

```powershell
docker exec lexnet-neo4j cypher-shell -u neo4j -p lexnet-neo4j-pass "SHOW CONSTRAINTS;"
```

Build or run the NLP runtime separately when you are ready to start NLP work:

```powershell
docker build -f docker/nlp.Dockerfile -t lexnet-nlp-preflight ..
docker run --rm -v lexnet_nlp_models:/app/models --env-file ..\nlp\.env lexnet-nlp-preflight python scripts/download_models.py
```

Fine-tuned Legal-BERT deployment notes:

- `NER_MODEL_PATH` stays `./models/legal-bert` on the host and resolves to `/app/models/legal-bert` inside the container.
- Keep the raw base model and training checkpoints outside the runtime export directory, for example `/app/models/legal-bert-base-cache` and `/app/models/legal-bert-training`.
- After exporting with `save_pretrained()`, the runtime checkpoint directory mounted at `/app/models/legal-bert` must include `config.json`, tokenizer files, and model weights.
- Verify the containerized runtime with `curl.exe http://localhost:5500/nlp/health` and confirm `checks.legalBertModelPath.loadedForTokenClassification` is `true`.
