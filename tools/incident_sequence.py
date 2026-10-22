"""Synthetic reproduction of two automatic greetings; never uses a real alias."""
import argparse
import asyncio
import hashlib
import json
import logging
import tempfile
import time
from dataclasses import replace
from pathlib import Path

import httpx

from backend.config import Settings
from backend.main import create_app
from tools.benchmark_local import SyntheticTraceClient


async def run(rounds, output, shared_alias=False):
    logging.getLogger().setLevel(logging.ERROR)
    report = {'synthetic_only': True, 'model': 'qwen/qwen3-4b-2507', 'shared_alias': shared_alias, 'records': []}
    fingerprint = hashlib.sha256()
    for path in sorted([*Path('backend').glob('*.py'), *Path('extension').glob('*.js')]):
        fingerprint.update(path.as_posix().encode()); fingerprint.update(path.read_bytes())
    report['source_sha256'] = fingerprint.hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='pcai_incident_') as folder:
        cfg = replace(Settings(), database_path=Path(folder)/'notes.sqlite3', knowledge_path=Path(folder)/'knowledge', lm_studio_model=report['model'])
        llm = SyntheticTraceClient(cfg.lm_studio_base_url, model=cfg.lm_studio_model, max_tokens=cfg.lm_studio_output_tokens)
        app = create_app(cfg, llm=llm)
        if report['model'] not in await llm.models():
            raise RuntimeError('Required model unavailable')
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            for index in range(rounds):
                alias = 'Synthetic-Incident-' + ('shared' if shared_alias else str(index))
                for stage, target in enumerate(('Hey daddy, how are you today?', 'I missed talking to you, daddy.')):
                    llm.trace.clear()
                    payload = {'message': target, 'target_message': target, 'interlocutor': alias,
                               'configured_mode': 'auto', 'generation_trigger': 'automatic',
                               'conversation_id': alias, 'target_message_id': f'message-{index}-{stage}', 'target_is_incoming': True,
                               'context': '- Interlocutor: Hey daddy, how are you today?' if stage else ''}
                    started = time.perf_counter()
                    response = await client.post('/api/suggestions', json=payload)
                    body = response.json()
                    body.get('diagnostics', {}).pop('translation_retry_token', None)
                    row = {'case': f'{index}-{stage}', 'input': payload, 'status': response.status_code,
                           'seconds': round(time.perf_counter()-started, 3), 'body': body, 'trace': list(llm.trace)}
                    report['records'].append(row)
                    output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
                    print(row['case'], row['status'], body.get('error', {}).get('reason_code'), flush=True)
    report['completed'] = True
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rounds', type=int, default=3, choices=range(1, 11))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--shared-alias', action='store_true')
    args = parser.parse_args()
    asyncio.run(run(args.rounds, args.output, args.shared_alias))
