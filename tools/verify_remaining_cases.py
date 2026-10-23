"""Reproducible synthetic checks of the three remaining blockers.

Initial translation timeouts/wrong-perspective candidates and the Portuguese draft are fixtures; subsequent
translation/review calls use the actual Qwen server. Never count fixtures as real generation.
"""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
from dataclasses import replace
import httpx

PT_SOURCE="Oi! Tudo bem, obrigado por querer conhecer melhor. Fico feliz em conversar com você."
PT_INCOMING="Oi, tudo bem? Gostaria de conhecer você melhor."
FR="Bonsoir, tu vas bien ? J'aimerais apprendre à mieux te connaître."


def sanitized(value):
    if isinstance(value,dict): return {key:sanitized(item) for key,item in value.items() if key not in {'retry_token','translation_retry_token'}}
    if isinstance(value,list): return [sanitized(item) for item in value]
    return value


async def exercise(output, folder):
    from backend.config import Settings
    from backend.main import create_app
    from tools.benchmark_local import SyntheticTraceClient
    from backend.lm_studio import LMStudioError

    class Client(SyntheticTraceClient):
        fixed=False
        bad=0
        bad_kind="timeout"
        async def chat(self,messages,count):
            if self.fixed:
                return [json.dumps({'responses':[PT_SOURCE],'checks':[{'on_topic':True,'correct_language':True,'perspective_consistent':True,'unrequested_money':False,'unsupported_adult_or_domination':False,'unsupported_claim':False}]})]
            return await super().chat(messages,count)
        async def review_generation(self,messages):
            if self.fixed:
                return [json.dumps({'supported':True,'perspective_consistent':True,'answers_target':True,'repeated_idea':False,'repetitive_question':False,'personal_claims':[]})]
            return await super().review_generation(messages)
        async def translate(self,messages):
            if self.bad:
                self.bad-=1
                if self.bad_kind=='perspective':
                    return [json.dumps({'translation':'¡Hola! Todo bien, gracias por desear conocerte mejor. Me alegra conversar contigo.','faithful':True,'adds_or_omits_information':False})]
                raise LMStudioError('Injected initial timeout for retry state',reason_code='timeout')
            return await super().translate(messages)

    cfg=replace(Settings(),database_path=folder/'notes.sqlite3',knowledge_path=folder/'knowledge',lm_studio_model='qwen/qwen3-4b-2507')
    llm=Client(cfg.lm_studio_base_url,model=cfg.lm_studio_model,max_tokens=cfg.lm_studio_output_tokens)
    if cfg.lm_studio_model not in await llm.models(): raise RuntimeError('Required Qwen model unavailable')
    app=create_app(cfg,llm=llm)
    fingerprint=hashlib.sha256()
    for path in sorted([*Path('backend').glob('*.py'),*Path('extension').glob('*.js')]):fingerprint.update(path.as_posix().encode());fingerprint.update(path.read_bytes())
    report={'synthetic_only':True,'source_sha256':fingerprint.hexdigest(),'model':cfg.lm_studio_model,'records':[]}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://synthetic') as c:
        async def call(case,path,payload,fixture=False):
            llm.trace.clear();start=time.perf_counter();response=await c.post(path,json=payload);body=response.json()
            row={'case':case,'path':path,'fixture_generation_and_audit':fixture,'injected_initial_translation_timeouts':2 if case=='portuguese_initial_fixture' else 0,'injected_wrong_perspective_candidates':2 if case=='portuguese_perspective_fixture' else 0,'input':payload,'status':response.status_code,'seconds':round(time.perf_counter()-start,3),'body':body,'trace':list(llm.trace)}
            report['records'].append(sanitized(row));output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print(case,response.status_code,body.get('available',body.get('diagnostics',{}).get('translation_status')),flush=True)
            return body
        cases=[('unknown_preference','Which color do I like?',''),('emoji','😏','- Interlocutor: Bonjour, comment vas-tu ?'),
               *[(f'french_{i}',FR,'') for i in range(3)],('natural_question','What kind of music should we talk about?',''),('requested_guess','Guess my favorite color!','')]
        for case,message,context in cases:
            await call(case,'/api/suggestions',{'message':message,'context':context,'interlocutor':'Synthetic-'+case})
        app.state.memory.add_note('Synthetic-Grounded','Explicit viewer preference: favorite color is cobalt-731.')
        await call('grounded_preference','/api/suggestions',{'message':'Which color do I like?','interlocutor':'Synthetic-Grounded'})
        llm.fixed=True;llm.bad=2
        failed=await call('portuguese_initial_fixture','/api/suggestions',{'message':PT_INCOMING,'interlocutor':'Synthetic-PT'},True)
        if failed.get('original_response')==PT_SOURCE and failed.get('diagnostics',{}).get('translation_retry_token'):
            await call('portuguese_manual_real_translation','/api/translation/retry',{'original_response':PT_SOURCE,'language':'pt','retry_token':failed['diagnostics']['translation_retry_token']},True)
        llm.bad=2;llm.bad_kind='perspective'
        failed=await call('portuguese_perspective_fixture','/api/suggestions',{'message':PT_INCOMING,'interlocutor':'Synthetic-PT-Perspective'},True)
        if failed.get('original_response')==PT_SOURCE and failed.get('diagnostics',{}).get('translation_retry_token'):
            await call('portuguese_perspective_manual_real','/api/translation/retry',{'original_response':PT_SOURCE,'language':'pt','retry_token':failed['diagnostics']['translation_retry_token']},True)
    report['completed']=True;output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='pcai_remaining_') as folder:
        # Prevent backend.main's default app from opening the real project DB.
        os.environ['DATABASE_PATH']=str(Path(folder)/'global.sqlite3')
        os.environ['KNOWLEDGE_PATH']=str(Path(folder)/'knowledge')
        asyncio.run(exercise(args.output,Path(folder)))
