"""Probe real HTTP on OS-assigned loopback ports; never stop another service."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile

CHILD = r'''
import json, socket, sqlite3, threading, time
from pathlib import Path
from dataclasses import replace
import httpx, uvicorn
from backend.config import settings, ROOT
from backend.main import create_app
from backend.profiles import ProfileInput
assert ROOT == Path.cwd()
assert settings.database_path.is_relative_to(ROOT)
with sqlite3.connect((ROOT/'data/personalities.sqlite3').as_uri()+'?mode=ro',uri=True) as db:
    expected={'active_id':db.execute("select value from profile_settings where key='active'").fetchone()[0],
              'profiles':[{'id':pid,**ProfileInput.model_validate_json(payload).model_dump()} for pid,payload in db.execute('select id,payload from profiles order by rowid')]}
report={'network':'real loopback TCP', 'ports':[], 'original_snapshot_matches':False, 'restart_persistence':False}
synthetic_id=None
for restart in range(2):
    listener=socket.socket(); listener.bind(('127.0.0.1',0)); listener.listen(128)
    port=listener.getsockname()[1]; report['ports'].append(port)
    assert port != 8765
    server=uvicorn.Server(uvicorn.Config(create_app(replace(settings,port=port)),host='127.0.0.1',port=port,access_log=False,log_level='error'))
    thread=threading.Thread(target=server.run,kwargs={'sockets':[listener]},daemon=True)
    thread.start()
    try:
        for _ in range(100):
            if server.started: break
            if not thread.is_alive(): raise RuntimeError('HTTP server failed to start')
            time.sleep(.05)
        assert server.started
        with httpx.Client(base_url=f'http://127.0.0.1:{port}',timeout=10) as c:
            assert c.get('/api/health').json()['port']==port
            snapshot=c.get('/api/profiles').json()
            if not restart:
                assert snapshot==expected
                report['original_snapshot_matches']=True
                r=c.post('/api/profiles',json={'name':'Synthetic HTTP Probe','rules':'Only isolated data'})
                assert r.status_code==201; synthetic_id=r.json()['id']
                assert c.post(f'/api/profiles/{synthetic_id}/activate').status_code==200
                assert c.post('/api/memory/Synthetic-HTTP-Probe/notes',json={'text':'Synthetic isolated network note'}).status_code==201
            else:
                assert snapshot['active_id']==synthetic_id
                assert c.get('/api/memory/Synthetic-HTTP-Probe').json()['notes'][0]['text']=='Synthetic isolated network note'
                report['restart_persistence']=True
    finally:
        server.should_exit=True; thread.join(10); listener.close()
        assert not thread.is_alive()
print(json.dumps(report))
'''


def probe(source, copies, output):
    before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (copies/'personalities.sqlite3',copies/'personal_chat_ai.sqlite3')}
    with tempfile.TemporaryDirectory(prefix='pcai_http_isolated_') as folder:
        root=Path(folder)
        (root/'backend').mkdir(); (root/'data').mkdir()
        for path in (source/'backend').glob('*.py'): shutil.copy2(path,root/'backend'/path.name)
        for name in ('personalities.sqlite3','personal_chat_ai.sqlite3'):
            with closing(sqlite3.connect((copies/name).resolve().as_uri()+'?mode=ro',uri=True)) as src, closing(sqlite3.connect(root/'data'/name)) as dst:
                src.backup(dst)
                assert dst.execute('pragma quick_check').fetchone()[0]=='ok'
        (root/'probe.py').write_text(CHILD,encoding='utf-8')
        env=os.environ.copy()
        env.update(DATABASE_PATH=str(root/'data/personal_chat_ai.sqlite3'),KNOWLEDGE_PATH=str(root/'knowledge'),BACKEND_HOST='127.0.0.1',BACKEND_PORT='8765',LOG_LEVEL='ERROR',LM_STUDIO_BASE_URL='http://127.0.0.1:1234/v1',LM_STUDIO_MODEL='qwen/qwen3-4b-2507')
        result=subprocess.run([sys.executable,'probe.py'],cwd=root,env=env,capture_output=True,text=True,timeout=60)
        if result.returncode:
            raise RuntimeError(result.stderr[-3000:])
        report=json.loads(result.stdout.strip().splitlines()[-1])
    assert all(hashlib.sha256((copies/name).read_bytes()).hexdigest()==value for name,value in before.items())
    report['copied_inputs_unchanged']=True
    output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--copies',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    probe(args.source.resolve(),args.copies,args.output)
