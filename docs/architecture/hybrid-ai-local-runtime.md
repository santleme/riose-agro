# Local hybrid AI runtime

Product: `/scenario-lab.html`. Groq plans strict input-only drafts and selects evidence/results to inspect. Scientific prose, differences and values are rendered from fixed model evidence and computed summaries. The registered BR-CORTE module and FarmEngine execute only after a separate explicit confirmation. FarmEngine remains demonstrative; BR-CORTE ADG remains an input; behavioral generation remains NO-GO.

## Starting the application in T3 / WSL

Open a terminal **in the Riose checkout**. Enter credentials at the hidden prompts, not in command arguments or source files:

```bash
read -rsp 'Groq API key: ' GROQ_API_KEY; printf '\n'
read -rsp 'Hugging Face token: ' HF_TOKEN; printf '\n'
export GROQ_API_KEY HF_TOKEN
export LLM_PROVIDER=groq
export GROQ_MODEL=openai/gpt-oss-20b
npm start
```

The secret input is not echoed and is not part of shell history. The variables last for that shell and its children; no credential file is created. Stop an existing server before restarting it in this terminal. Exporting variables in another terminal, or after Node has started, does not update that running Node process. T3/harness commands can have a different environment from the Node server. Verify through an actual provider response in the application; never dump the environment or authentication headers.

The live validation session used a hidden-input launcher that passed these variables to a local Node watcher in memory. `LLM_MODEL`, if configured, overrides the provider-specific model. Hugging Face chat inference requires a separately verified `HF_MODEL`; its model/provider compatibility is not established by a successful Hub login. The current HF role is authenticated Hub access plus distribution of the public pinned Laya weights.

The local API uses finite token/time/response-size limits, no automatic provider retries, independent server/client validation, and explicit fallback attribution. Its 10 requests/minute/address abuse limiter is process-local. P3-007's production shared monetary ceiling remains blocked; this manual test authorization does not approve production use.

## Reproducing the CPU Laya experiment

Create an isolated venv outside the project. On this tested Linux/WSL Python 3.12 setup:

```bash
python3 -m venv "$HOME/.cache/riose-laya/venv"
source "$HOME/.cache/riose-laya/venv/bin/activate"
python -m pip install 'torch==2.14.1+cpu' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r scripts/ai/laya-cpu-environment.txt
python scripts/ai/laya_intent_worker.py \
  --evaluate tests/fixtures/intent-routing-v1.json \
  --output /tmp/riose-laya-reproduced.json
```

The first run downloads only the multilingual checkpoint's five pinned files (~678 MB) from Hugging Face. The worker intentionally omits credentials because this checkpoint is public. It verifies model revision and all five SHA-256 digests before loading safetensors with the official SDK in eager CPU mode, four threads. It has no execution tools or generative chat interface. The `--serve` option accepts strictly bounded JSON requests `{ "prompt": "..." }` over stdin and returns one structured classification per line. It is a local research interface and is not enabled in Product routing.

SDK 0.4.8 normalizes `tokenizer_config.json` after integrity verification and can leave its shared Hub snapshot changed. The worker keeps that normalization in a private temporary copy; large artifacts are linked, not copied. An already changed tokenizer config is recovered from the exact public revision, verified against the original checksum, and cached as original data outside Git. Checksums are never relaxed. The SDK's deterministic compatibility normalization is unchanged from the first evaluation.

After initial acquisition, this invocation was also tested successfully:

```bash
printf '%s\n' '{"prompt":"Compare três estratégias de suplementação utilizando os modelos disponíveis."}' |
  HF_HUB_OFFLINE=1 python scripts/ai/laya_intent_worker.py --serve
```

For the optional manual Groq classification comparison, use an authorized shell with `GROQ_API_KEY` inherited, then `node scripts/ai/evaluate-routing.mjs --live`. It performs at most 16 final-case calls, paces requests and does not retry; authentication/rate/quota failures stop the run. `node scripts/ai/evaluate-deterministic-routing.mjs` and `python3 scripts/ai/summarize_routing_evaluation.py` reproduce the local baseline and comparison from saved raw outputs. The fixture is now inspected and must not become a tuning set for a future candidate claiming independent confirmation.

## Verification commands

With the application running on port 8000:

```bash
npm test
npm run test:laya-router
npm run test:e2e:product
npm run test:e2e:scenario-lab
npm run test:e2e:scenario-lab-ai
npm run test:e2e:decision-assistant
npm run test:parity
```

Those regression scripts use deterministic mode or explicit provider fixtures. They do not require credentials or call remote inference. Real-provider browser tests are separate, manual opt-in commands:

```bash
RIOSE_LIVE_AI=1 npm run test:e2e:decision-assistant:live
RIOSE_LIVE_AI=1 node scripts/e2e/decision-scientific-live.mjs
```

Reports contain public test prompts, validated plans, status, model, latency and token counts. They contain no credentials or raw authorization headers. Screenshots and actual observed measurements are linked in the [live validation report](../evidence/hybrid-ai-live-validation-2026-10-15.md).
