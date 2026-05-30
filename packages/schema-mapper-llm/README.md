# @databridge/schema-mapper-llm

LLM-assisted schema-mapping suggester (deterministic-first; the LLM is only a
tie-breaker below the confidence threshold) plus the embedding index used for
nearest-neighbour field matching.

## Embedding backends

Two backends implement `EmbeddingBackend`:

- **`DeterministicHashEmbedding`** (default) — a reproducible character-n-gram
  feature-hash embedding. No model, no network; the default in tests, CI, and
  air-gapped environments.
- **`OnnxEmbedding`** — runs a real sentence-transformer (e.g.
  `all-MiniLM-L6-v2`): tokenise → `session.run` → mean-pool → L2-normalise.
  Falls back to the deterministic backend whenever the runtime, model, or
  tokeniser is unavailable, so a call never throws.

`selectEmbeddingBackendFromEnv()` returns the ONNX backend when
`DATABRIDGE_EMBEDDINGS_ONNX_PATH` points at a model file, otherwise the
deterministic one.

## Enabling real ONNX inference (production install)

The model and vocabulary files are **not** shipped in this repo (binary size).
To enable live inference on a host:

1. Install the optional runtime peer:
   ```sh
   pnpm add onnxruntime-node
   ```
2. Download the model and place the `.onnx` file on disk, then point the env
   var at it:
   ```sh
   export DATABRIDGE_EMBEDDINGS_ONNX_PATH=/opt/models/all-MiniLM-L6-v2.onnx
   ```
3. Supply a faithful WordPiece tokeniser (built from the model's `vocab.txt`)
   via `new OnnxEmbedding({ modelPath, tokeniser })`. The bundled
   `HashingTokeniser` is a dependency-free **stand-in** that keeps the pipeline
   runnable; it is not vocabulary-faithful to all-MiniLM and should be replaced
   for production parity.

The session, tokeniser, and output name are all injectable (`sessionFactory`,
`tokeniser`, `outputName`) so the inference path is unit-tested without the
real model present.
