# Neo4j Setup

Start Neo4j locally and apply the schema before beginning NLP work.

```powershell
docker exec lexnet-neo4j cypher-shell -u neo4j -p lexnet-neo4j-pass "RETURN 1 AS ok;"
docker exec lexnet-neo4j cypher-shell -u neo4j -p lexnet-neo4j-pass "SHOW CONSTRAINTS;"
docker exec lexnet-neo4j cypher-shell -u neo4j -p lexnet-neo4j-pass "SHOW INDEXES;"
```

Schema file:

- `neo4j/schema.cypher` creates the required LexNet constraints and indexes.
