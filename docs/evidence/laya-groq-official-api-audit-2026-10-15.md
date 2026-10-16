# Laya and Groq official API audit — 2026-10-15

Scope: current first party package metadata, model artifacts, source code and provider documentation. No credentials were read, no package was installed/imported, and no inference was executed. The official PyPI wheel was downloaded into memory solely to inspect its source and compare hashes.

## Implementation decision

Use the **322M multilingual checkpoint** explicitly for Portuguese. It is an encoder plus decision head that scores supplied alternatives; it does not implement autoregressive chat or free text question answering. A `choice` question selects one alternative. For several independent labels, submit one binary question per label; do not put all independent labels into one mutually exclusive choice. Generic extraction of arbitrary text, JSON generation and tool calling belong to a generative model, not this interface. The multilingual card warns that probabilities are uncalibrated, `noul` can underreport positives, ordinal scores have position bias, and domain fine tuning may be necessary. Neutral `A`/`B` binary choices are an officially documented diagnostic alternative to `noul`. These are author reported limitations, not findings from local evaluation. [Multilingual model card](https://huggingface.co/convaiinnovations/laya-multilingual/blob/1720e3e3357cfe1e281542e223f8273b0890ca34/README.md)

## SDK version, installation and dependencies

At retrieval, **PyPI `laya==0.4.8`** is current, uploaded `2026-10-15T10:52:24.584506Z`. Python requirement: `>=3.10`. Mandatory dependencies: `torch>=2.0.0`, `transformers>=4.48.0`, `safetensors>=0.4.0`, `huggingface_hub>=0.20.0`, `numpy>=1.20.0`. These are broad minimums, not a tested lockfile. Extras are unnecessary for basic dictionary based inference; `[structured]` adds Pydantic, `[onnx]` adds ONNX tools, `[fast]` adds TileLang for CUDA, and `[serve]` adds HTTP serving dependencies. [PyPI version metadata](https://pypi.org/pypi/laya/0.4.8/json), [official package configuration](https://github.com/NandhaKishorM/laya/blob/4ac226d5ee88ed6df8db288a05c766d7a34ee682/pyproject.toml)

```sh
python3 -m pip install 'laya==0.4.8'
```

For CPU deployment, select a CPU PyTorch build before installing Laya using the linked official PyTorch instructions; a default dependency installation can otherwise acquire a different build. `USE_TF=0` is an official workaround for TensorFlow import deadlocks. The author's advertised GPU timing does not establish latency on this machine. [Official installation guidance](https://github.com/NandhaKishorM/laya/blob/4ac226d5ee88ed6df8db288a05c766d7a34ee682/README.md#installation-details)

The inspected wheel is `laya-0.4.8-py3-none-any.whl`, 405,303 bytes, SHA-256 `05064d8b949803af8cb173561ed0b24d6be5b62cb86d8d319321577c630d0288`. Its `agent.py`, `common.py` and `revisions.py` are byte identical to the corresponding files at GitHub commit `4ac226d5ee88ed6df8db288a05c766d7a34ee682`. This establishes the inspected artifact/source correspondence, not a comprehensive security audit. [PyPI artifact digest](https://pypi.org/pypi/laya/0.4.8/json), [official source commit](https://github.com/NandhaKishorM/laya/tree/4ac226d5ee88ed6df8db288a05c766d7a34ee682)

## Exact CPU API

An integration example derived from the inspected API:

```python
import laya

agent = laya.load(
    "convaiinnovations/laya-multilingual",
    device="cpu",
    backend="eager",
    revision="1720e3e3357cfe1e281542e223f8273b0890ca34",
    expected_sha256=ARTIFACT_SHA256,  # complete map below
)
questions = {
    "wants_refund": {
        "type": "choice",
        "instructions": "O remetente solicita devolução de dinheiro?",
        "criteria": {
            "A": "Sim, solicita devolução de dinheiro.",
            "B": "Não solicita devolução de dinheiro.",
        },
    },
    "mentions_delay": {
        "type": "choice",
        "instructions": "O remetente relata atraso?",
        "criteria": {"A": "Sim, relata atraso.", "B": "Não relata atraso."},
    },
}
result = agent.predict({"body": "Paguei duas vezes. Quero meu dinheiro de volta."}, questions)
answer = result["answers"]["wants_refund"]
selected_key = answer["choice"]
probability = answer["probabilities"][selected_key]
```

`predict` aliases `system_one`. Accepted state types are string, dictionary or conversation list. Each choice answer includes `choice`, `probabilities`, `confidence`, `answer_confidence` and `action.act_probability`. Prefer the selected option probability or `answer_confidence` when recording probabilities: choice `confidence` uses normalized entropy. `noul` returns numerical `P(true)`, not a Boolean. `score` returns an expected level index. `predict_batch(states, questions, batch_size=...)` handles many states. Calls accept `max_len`, `head_max_len` and `min_confidence`. `usage.truncated` reports truncation. Standard CPU execution defaults to float32; CPU autocast is separately opt in. [Inspected loader and answer decoder](https://github.com/NandhaKishorM/laya/blob/4ac226d5ee88ed6df8db288a05c766d7a34ee682/laya/agent.py)

The multilingual checkpoint config uses `max_len=1024`, `head_max_len=256`; its encoder supports 8,192 positions. Explicit `max_len=8192` expands the request limit, with greater compute and no implied long document accuracy guarantee. Question text and options consume the same sequence budget. [Pinned agent config](https://huggingface.co/convaiinnovations/laya-multilingual/blob/1720e3e3357cfe1e281542e223f8273b0890ca34/rl_agent_config.json), [pinned encoder config](https://huggingface.co/convaiinnovations/laya-multilingual/blob/1720e3e3357cfe1e281542e223f8273b0890ca34/encoder/config.json)

## Downloads and artifact pins

The repositories are public and ungated at retrieval. The SDK downloads only `rl_agent_config.json`, `model.safetensors`, `tokenizer/*` and `encoder/*` for the requested checkpoint/subfolder, rather than all bundled models. [Official Hub multilingual metadata](https://huggingface.co/api/models/convaiinnovations/laya-multilingual?blobs=true), [official Hub English metadata](https://huggingface.co/api/models/convaiinnovations/laya?blobs=true)

| Checkpoint | Current retrieved Hub revision | Parameters | Weights | Tokenizer JSON |
|---|---|---:|---:|---:|
| `convaiinnovations/laya-multilingual` | `1720e3e3357cfe1e281542e223f8273b0890ca34` | 322M | 643,835,514 bytes | 34,363,188 bytes |
| `convaiinnovations/laya` root | `7b928d828b7b0e022f929d9bd2e44165aa270148` | 421M | 842,609,210 bytes | 3,583,228 bytes |

Parameter counts are model card declarations; byte sizes are official Hub file metadata. Multilingual inference files total **678,201,614 bytes** including the three small configs, approximately 647 MiB. This excludes dependencies and runtime RAM. Float32 model parameters alone require roughly 1.29 GB by arithmetic; actual peak RAM also includes loading, tokenizer, activations and allocator overhead, and has not been measured here. [Family model card](https://huggingface.co/convaiinnovations/laya/blob/7b928d828b7b0e022f929d9bd2e44165aa270148/README.md), [multilingual file metadata](https://huggingface.co/api/models/convaiinnovations/laya-multilingual?blobs=true)

Complete multilingual inference digest map for the pinned revision:

```python
ARTIFACT_SHA256 = {
    "model.safetensors": "9d628fd971b700382ac6f65920a86f149777b2e748e0c955fb3b19695aa8f204",
    "tokenizer/tokenizer.json": "609d8f4c067cd3950f88594c5a802616cea245823836ef5848ee4fc40aab5b6f",
    "rl_agent_config.json": "25061739243b617ad88d1219ba6f8a9c86c5881ca28df024fa2d9b3b2fcc30c6",
    "encoder/config.json": "83f6916d13ef0f556ac461f28308dc2bffa7ebeadee8ec9e2db5812020ea5bb4",
    "tokenizer/tokenizer_config.json": "424b69444bf7b5809dc2cd2e36d0bd71b8055124dd24274d6db3c655d38205e7",
}
```

The two large file digests come from official Hub LFS SHA-256 metadata; the three config digests were calculated from bytes fetched at the immutable revision above. No model weights were downloaded during research. [Hub LFS metadata](https://huggingface.co/api/models/convaiinnovations/laya-multilingual?blobs=true), [pinned files](https://huggingface.co/convaiinnovations/laya-multilingual/tree/1720e3e3357cfe1e281542e223f8273b0890ca34)

## Trust boundary and commercial reuse

`expected_sha256` validates only listed files and fails on missing files/digest mismatch; it is opt in. Revision is also opt in: absent an argument/environment override, the loader follows the Hub default. `revision="reviewed"` selects the SDK's older maintained pin, which differs from the current revision recorded above; these must not be silently conflated. Pin package versions, dependency resolution and checkpoint independently. [Revision and integrity implementation](https://github.com/NandhaKishorM/laya/blob/4ac226d5ee88ed6df8db288a05c766d7a34ee682/laya/revisions.py)

The standard inference path uses `safetensors` and built in Transformers `AutoTokenizer`, `AutoConfig` and `AutoModel`; it does **not** set `trust_remote_code=True`, and `laya.load` has no such argument. The pinned model contains data/config files, no repository Python module. Complete encoder/tokenizer assets prevent fallback fetches of the base encoder. This does not remove trust in the installed Python SDK, Transformers, Torch or native dependencies. [Model construction implementation](https://github.com/NandhaKishorM/laya/blob/4ac226d5ee88ed6df8db288a05c766d7a34ee682/laya/common.py), [loader implementation](https://github.com/NandhaKishorM/laya/blob/4ac226d5ee88ed6df8db288a05c766d7a34ee682/laya/agent.py)

The loader takes `token=` or falls back to `HF_TOKEN` when set; Hugging Face Hub can also use cached implicit authentication. An anonymous download process must intentionally avoid inherited token state. After provisioning a complete snapshot, a local directory and offline Hub/Transformers settings can keep inference independent of network fetching. [Loader](https://github.com/NandhaKishorM/laya/blob/4ac226d5ee88ed6df8db288a05c766d7a34ee682/laya/agent.py), [Hugging Face environment variables](https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables)

Both model cards declare **Apache 2.0**; the SDK repository includes that license and PyPI reports `Apache-2.0`. The license grants use, reproduction, modification and distribution, including commercial use. Redistribution obligations include license preservation, relevant notices and stating modified files; it does not grant trademark rights and disclaims warranty. No separate proprietary model terms or gated acceptance were present in these model repositories at retrieval. [Multilingual license declaration](https://huggingface.co/convaiinnovations/laya-multilingual/blob/1720e3e3357cfe1e281542e223f8273b0890ca34/README.md), [SDK Apache license](https://github.com/NandhaKishorM/laya/blob/4ac226d5ee88ed6df8db288a05c766d7a34ee682/LICENSE)

Documentation freshness caveat: the family card still advertises SDK `0.3.20`, and `SECURITY.md` lists `0.3.x` as current although PyPI and package configuration are `0.4.8`. Source and published wheel are the authoritative API evidence for this audit. [Family card](https://huggingface.co/convaiinnovations/laya/blob/7b928d828b7b0e022f929d9bd2e44165aa270148/README.md), [security policy](https://github.com/NandhaKishorM/laya/blob/4ac226d5ee88ed6df8db288a05c766d7a34ee682/SECURITY.md)

## Groq GPT OSS 20B structured output

Endpoint: `POST https://api.groq.com/openai/v1/chat/completions`; model ID: `openai/gpt-oss-20b`. Use `max_completion_tokens`; `max_tokens` is deprecated. `reasoning_effort` supports `low`, `medium` and `high`, with `medium` default. `reasoning_format="hidden"` controls presentation, not whether reasoning occurs. Response text is `choices[0].message.content`, and `usage` includes prompt/completion/total token counts. [Groq API reference](https://console.groq.com/docs/api-reference)

The current model page lists a **131,072 token context** and **65,536 maximum output tokens**; input and generated tokens together must respect the context limit. These are service capabilities, not a recommendation to allocate the maximum. [Official Groq model page](https://console.groq.com/docs/model/openai/gpt-oss-20b)

```json
{
  "model": "openai/gpt-oss-20b",
  "messages": [{"role": "user", "content": "Classifique o relato fornecido."}],
  "stream": false,
  "max_completion_tokens": 1024,
  "reasoning_effort": "low",
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "classification",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {"label": {"type": "string", "enum": ["A", "B"]}},
        "required": ["label"],
        "additionalProperties": false
      }
    }
  }
}
```

GPT OSS 20B currently supports `strict: true` with constrained decoding. Every property must be required, every object needs `additionalProperties: false`; represent optional values with required nullable fields. Structured Outputs currently excludes streaming and tools. Schema compliance does not establish factual correctness: still handle provider errors, refusals, empty content, non-success finish reasons and token exhaustion before accepting an experiment result. The final sentence is integration guidance inferred from API response/error boundaries. [Official structured output documentation](https://console.groq.com/docs/structured-outputs), [API response schema](https://console.groq.com/docs/api-reference)
