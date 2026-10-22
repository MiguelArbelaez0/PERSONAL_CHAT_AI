"""Repeatable local integration benchmark. Uses synthetic data and temporary stores only.

Run from the repository root: python -m tools.benchmark_local --rounds 3 --output data/benchmark.json
"""
import argparse
import hashlib
import asyncio
import json
import logging
import math
import statistics
import subprocess
import tempfile
import time
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

import httpx

from backend.config import Settings
from backend.language import classify_language, has_language_conflict
from backend.main import create_app
from backend.lm_studio import LMStudioClient


class SyntheticTraceClient(LMStudioClient):
    """Opt-in benchmark only: never install this client in the application."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trace = []

    async def _chat(self, messages, count, max_tokens, temperature=0.8, operation="chat"):
        answers = await super()._chat(messages, count, max_tokens, temperature, operation)
        self.trace.append({"operation": operation, "answers": answers})
        return answers


async def benchmark(rounds: int, output: Path, extended: bool = True, previous_failures: bool = False):
    logging.getLogger().setLevel(logging.ERROR)
    report = {"schema_version": 1, "synthetic_only": True,
              "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
              "started_utc": datetime.now(timezone.utc).isoformat(), "model": "qwen/qwen3-4b-2507",
              "records": [], "fidelity_assessment": "Manual review required; model approval is not ground truth."}
    fingerprint = hashlib.sha256()
    for path in sorted([*Path('backend').glob('*.py'), *Path('extension').glob('*.js')]):
        fingerprint.update(path.as_posix().encode())
        fingerprint.update(path.read_bytes())
    report['source_sha256'] = fingerprint.hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)

    def save():
        records = report["records"]
        generation = [row for row in records if row["operation"] == "generation"]
        accepted = [row for row in generation if row["status"] == 200]
        latencies = sorted(row["latency_seconds"] for row in records)
        report["metrics"] = {
            "generation_total": len(generation), "generation_accepted": len(accepted),
            "generation_rejected": len(generation) - len(accepted),
            "acceptance_rate": len(accepted) / len(generation) if generation else None,
            "translation_available": sum(bool(row["body"].get("spanish_translation")) for row in accepted),
            "detected_inconsistencies": sum(bool(row["invariant_failures"]) for row in records),
            "median_latency_seconds": statistics.median(latencies) if latencies else None,
            "p95_latency_seconds": latencies[max(0, math.ceil(len(latencies) * .95) - 1)] if latencies else None,
        }
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    async def exercise(client, operation, case, payload, expected, forbidden=()):
        started = time.perf_counter()
        traced.trace.clear()
        path = "/api/suggestions" if operation == "generation" else "/api/translation/retry"
        response = await client.post(path, json=payload)
        body = response.json()
        failures = []
        if response.status_code == 200 and operation == "generation":
            original = body.get("original_response", "")
            if body.get("language") != expected or classify_language(original)[0] != expected or has_language_conflict(original, expected):
                failures.append("language")
            if expected == "es" and body.get("spanish_translation"):
                failures.append("redundant_translation")
            if body.get("conversation_id") != payload.get("conversation_id") or body.get("target_message_id") != payload.get("target_message_id"):
                failures.append("target_identity")
            if any(word.casefold() in original.casefold() for word in forbidden):
                failures.append("cross_alias_fact")
        row = {"case": case, "operation": operation, "input": payload, "expected_language": expected,
               "status": response.status_code, "latency_seconds": round(time.perf_counter() - started, 3),
               "body": body, "invariant_failures": failures, "manual_fidelity": "pending", "synthetic_model_trace": list(traced.trace)}
        report["records"].append(row)
        save()
        print(json.dumps({"case": case, "status": response.status_code, "seconds": row["latency_seconds"],
                          "reason": body.get("error", {}).get("reason_code", body.get("error", {}).get("code")), "invariant_failures": failures}), flush=True)

    with tempfile.TemporaryDirectory(prefix="pcai_synthetic_") as folder:
        cfg = replace(Settings(), database_path=Path(folder) / "notes.sqlite3", knowledge_path=Path(folder) / "knowledge",
                      lm_studio_model=report["model"])
        traced = SyntheticTraceClient(cfg.lm_studio_base_url, model=cfg.lm_studio_model, timeout=cfg.lm_studio_timeout, max_tokens=cfg.lm_studio_output_tokens)
        app = create_app(cfg, llm=traced)
        try:
            models = await app.state.llm.models()
            if report["model"] not in models:
                raise RuntimeError("Required local model is not available")
        except Exception as exc:
            report["unavailable"] = type(exc).__name__
            save()
            print("Local model unavailable; no generation benchmark executed.", flush=True)
            return
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=600) as client:
            samples = [
                ("greeting", "en", "Hey daddy, how are you today?"),
                ("reconnect", "en", "I missed talking to you."),
                ("french", "fr", "Bonsoir, tu vas bien ? J'aimerais apprendre à mieux te connaître."),
                ("portuguese", "pt", "Oi, tudo bem? Gostaria de conhecer você melhor."),
                ("spanish", "es", "Hola, ¿cómo estás?"),
            ]
            for iteration in range(rounds):
                for name, language, message in samples:
                    identity = f"Synthetic-{language}-{iteration}"
                    payload = {"message": message, "interlocutor": identity, "conversation_id": identity,
                               "target_message_id": f"message-{name}-{iteration}", "configured_mode": "manual"}
                    if name == "reconnect":
                        payload["context"] = "- Interlocutor: Hey daddy, how are you today?"
                    await exercise(client, "generation", f"{name}-{iteration}", payload, language)
            if extended:
                extras = [
                    ("ambiguous", "😏", "- Interlocutor: Bonjour, comment vas-tu ?", "fr"),
                    ("language_switch", "Olá, como você está hoje?", "- Interlocutor: Hello, how are you?", "pt"),
                    ("topic_change", "Let's talk about music instead.", "- Interlocutor: How was your day?", "en"),
                    ("perspective", "You made me laugh.", "- Usuario: That was a silly joke.", "en"),
                ]
                for name, message, context, language in extras:
                    await exercise(client, "generation", name, {"message": message, "context": context,
                                   "interlocutor": "Synthetic-Extras", "conversation_id": "Synthetic-Extras", "target_message_id": name}, language)
                app.state.memory.add_note("Synthetic-Memory", "Explicit viewer preference: favorite color is cobalt-731.")
                for name, alias, forbidden in [("memory", "Synthetic-Memory", ()), ("isolation", "Synthetic-Isolated", ("cobalt-731",))]:
                    await exercise(client, "generation", name, {"message": "Which color do I like?", "interlocutor": alias,
                                   "conversation_id": alias, "target_message_id": name}, "en", forbidden)
                for index in range(2):
                    await exercise(client, "generation", f"regenerate-{index}", {"message": "Thanks for listening.",
                                   "interlocutor": "Synthetic-Regenerate", "conversation_id": "Synthetic-Regenerate", "target_message_id": "same-target"}, "en")
                for name, language, original in [
                    ("gold_fr", "fr", "Bonsoir ! Je vais bien, merci."),
                    ("gold_pt", "pt", "Estou bem, obrigado."),
                    ("gold_negation", "fr", "Je ne veux pas de promesses."),
                    ("gold_perspective", "pt", "Você me fez rir."),
                ]:
                    await exercise(client, "translation", name, {"original_response": original, "language": language}, "es")
            if previous_failures:
                prior = json.loads(Path('docs/benchmarks/final.json').read_text(encoding='utf-8'))
                for row in prior['records']:
                    body = row['body']
                    if row['operation'] == 'generation' and row['status'] == 200 and body.get('language') != 'es' and not body.get('spanish_translation'):
                        await exercise(client, 'translation', 'previous-failure-' + row['case'],
                                       {'original_response': body['original_response'], 'language': body['language']}, 'es')
                # Exercise the actual manual retry endpoint, with the exact
                # original and opaque state, for every current failed translation.
                for row in list(report['records']):
                    body = row['body']
                    original = body.get('original_response') or row['input'].get('original_response')
                    language = body.get('language') or row['input'].get('language')
                    if row['status'] == 200 and original and language != 'es' and not body.get('spanish_translation'):
                        token = body.get('retry_token') or body.get('diagnostics', {}).get('translation_retry_token')
                        await exercise(client, 'manual_translation_retry', 'manual-retry-' + row['case'],
                                       {'original_response': original, 'language': language, 'retry_token': token}, 'es')
    report["finished_utc"] = datetime.now(timezone.utc).isoformat()
    save()
    print(json.dumps(report["metrics"], indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--basic-only", action="store_true")
    parser.add_argument("--previous-failures", action="store_true", help="Also translate the four exact prior failed originals and exercise failed translation retries")
    args = parser.parse_args()
    if not 1 <= args.rounds <= 10:
        parser.error("rounds must be between 1 and 10")
    asyncio.run(benchmark(args.rounds, args.output, not args.basic_only, args.previous_failures))
