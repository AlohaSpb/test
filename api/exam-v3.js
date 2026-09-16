import crypto from 'crypto';
import { banks } from './_lib/questions.js';
import { ensureSchema, getClient, normalizeName, shuffle, safeText } from './_lib/db.js';

const sameSet=(a,b)=>{
  const x=[...(a||[])].map(Number).sort((m,n)=>m-n);
  const y=[...(b||[])].map(Number).sort((m,n)=>m-n);
  return x.length===y.length&&x.every((v,i)=>v===y[i]);
};
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

async function ensureOverrides(sql){
  await sql`CREATE TABLE IF NOT EXISTS dpk_question_overrides(
    test_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answers JSONB NOT NULL,
    basis TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(test_id,question_id)
  )`;
}
async function bankFor(sql,testId){
  const base=banks[testId];
  if(!base)return null;
  await ensureOverrides(sql);
  const rows=await sql`SELECT * FROM dpk_question_overrides WHERE test_id=${testId}`;
  const map=new Map(rows.map(r=>[r.question_id,r]));
  return {...base,questions:base.questions.map(q=>{
    const r=map.get(q.id);
    return r?{...q,q:r.question_text,o:r.options,a:r.correct_answers,basis:r.basis||q.basis}:q;
  })};
}
function page(body){
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Академия ДПК</title>
  <style>
  *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#252936,#0b0d10 42%);color:#f4f6fa;font-family:Arial,sans-serif}.top{height:4px;background:linear-gradient(90deg,#fff 0 33%,#2563eb 33% 66%,#b91c1c 66%)}.wrap{max-width:850px;margin:auto;padding:18px}.head{display:flex;gap:14px;align-items:center;border-bottom:1px solid #2b3039;padding:18px 0}.logo{width:50px;height:50px;border-radius:12px;background:linear-gradient(145deg,#ddd,#555);display:grid;place-items:center;color:#111;font-weight:900}.tag{font-size:12px;color:#fca5a5;font-weight:800;letter-spacing:.1em}h1{font-size:21px;margin:3px 0}.panel{margin:20px 0;padding:24px;border:1px solid #2b3039;border-radius:18px;background:linear-gradient(180deg,#181b21,#111319);box-shadow:0 20px 60px #0007}.meta,.small{color:#9ca3af;font-size:13px}.question{font-size:21px;font-weight:800;line-height:1.5;margin:18px 0}.opt{display:flex;gap:10px;padding:13px;border:1px solid #2a2f38;border-radius:10px;margin:10px 0;background:#0d0f13;cursor:pointer}.opt:hover{border-color:#666}.timer{font-size:28px;font-weight:900;color:#fecaca;border:3px solid #b91c1c;border-radius:12px;padding:10px 14px;min-width:105px;text-align:center}.bar{height:8px;background:#272b33;border-radius:999px;overflow:hidden;margin:14px 0 18px}.btn{display:inline-block;border:0;border-radius:10px;padding:12px 18px;font-weight:800;color:white;background:linear-gradient(#d52c2c,#941c1c);cursor:pointer;text-decoration:none}.btn.secondary{background:#252a33}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.warn{border-left:4px solid #ef4444;background:#2a1111;padding:14px;border-radius:8px;color:#fecaca}.ok{color:#22c55e}.bad{color:#ef4444}.score{font-size:52px;font-weight:900;text-align:center}.center{text-align:center}</style></head><body><div class="top"></div><main class="wrap"><div class="head"><div class="logo">РО</div><div><div class="tag">ДЕПАРТАМЕНТ ПОДГОТОВКИ КАДРОВ</div><h1>Академия стажёров</h1><div class="meta">Правительство РО • Онлайн-тестирование</div></div></div>${body}</main></body></html>`;
}
function questionPage(attempt,bank){
  const idx=Number(attempt.current_index),qid=attempt.question_order[idx];
  const q=bank.questions.find(x=>x.id===qid);
  if(!q)return page('<section class="panel warn">Вопрос не найден.<div class="actions"><a class="btn secondary" href="/">Главный экран</a></div></section>');
  const order=attempt.option_orders[qid]||q.o.map((_,i)=>i),type=q.type==='multi'?'checkbox':'radio';
  const opts=order.map((orig,i)=>`<label class="opt"><input type="${type}" name="selected" value="${i}"><span>${esc(q.o[orig])}</span></label>`).join('');
  const timeout=`/api/exam-v3?attemptId=${encodeURIComponent(attempt.id)}&questionId=${encodeURIComponent(qid)}&timeout=1`;
  return page(`<section class="panel" data-timeout-url="${esc(timeout)}"><div style="display:flex;justify-content:space-between;gap:18px;align-items:center"><div><h2>${esc(bank.title)}</h2><div class="meta">Вопрос ${idx+1} из ${attempt.question_order.length}</div></div><div class="timer"><span id="seconds">20</span> сек.</div></div><div class="bar"><div id="timerbar" style="height:100%;width:100%;background:linear-gradient(90deg,#22c55e,#f59e0b,#ef4444);transition:width .9s linear"></div></div><div class="question">${esc(q.q)}</div>${q.type==='multi'?'<div class="small" style="color:#fca5a5">Можно выбрать несколько вариантов.</div>':''}<form id="answerForm" method="post" action="/api/exam-v3"><input type="hidden" name="mode" value="answer"><input type="hidden" name="attemptId" value="${attempt.id}"><input type="hidden" name="questionId" value="${qid}">${opts}<div class="actions"><button id="answerBtn" class="btn" type="submit">Ответить и продолжить</button><a class="btn secondary" href="/">Вернуться на главный экран</a></div></form><p class="small">По истечении 20 секунд вопрос автоматически считается пропущенным.</p></section><script>(()=>{const root=document.querySelector('[data-timeout-url]'),seconds=document.getElementById('seconds'),bar=document.getElementById('timerbar'),form=document.getElementById('answerForm');if(!root)return;let left=20,done=false;const draw=()=>{if(seconds)seconds.textContent=String(left);if(bar)bar.style.width=Math.max(0,left/20*100)+'%'};draw();const timer=setInterval(()=>{left--;draw();if(left<=0&&!done){done=true;clearInterval(timer);location.replace(root.dataset.timeoutUrl)}},1000);form?.addEventListener('submit',()=>{done=true;clearInterval(timer);const button=document.getElementById('answerBtn');if(button){button.disabled=true;button.textContent='Отправка...'}})})()</script>`);
}
async function sendDiscord(attempt,bank,correct,total,percent,passed,mistakes){
  const webhook=process.env.DISCORD_WEBHOOK_URL;if(!webhook)return false;
  const embeds=[];
  const err=mistakes.slice(0,6).map((m,i)=>`**${i+1}. ${m.q}**\nОтвет: ${m.selected.length?m.selected.join('; '):'нет ответа / таймаут'}\nПравильно: ${m.correct.join('; ')}\nОснование: ${m.basis}`).join('\n\n');
  const result={color:passed?0x22c55e:0xef4444,title:passed?'✅ ТЕСТ СДАН':'❌ ТЕСТ НЕ СДАН',description:`**${bank.title}**`,fields:[{name:'👤 Сотрудник',value:safeText(attempt.player_name),inline:true},{name:'🆔 Static ID',value:safeText(attempt.static_id,50),inline:true},{name:'📊 Результат',value:`${correct}/${total} (${percent}%)`,inline:true}],timestamp:new Date().toISOString()};
  if(err)result.fields.push({name:'🔎 Ошибки',value:err.slice(0,1000)});
  embeds.push(result);
  try{const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ДПК • Академия',embeds,allowed_mentions:{parse:[]}})});return r.ok}catch{return false}
}
async function answer(req,res,id,qid,selected,forced=false){
  const sql=getClient(),rows=await sql`SELECT * FROM dpk_exam_attempts WHERE id=${id} LIMIT 1`;
  if(!rows.length)return res.status(404).send(page('<section class="panel warn">Попытка не найдена.</section>'));
  const a=rows[0];if(a.completed_at)return res.status(409).send(page('<section class="panel warn">Экзамен уже завершён.</section>'));
  const bank=await bankFor(sql,a.test_id),idx=Number(a.current_index),expected=a.question_order[idx];
  if(expected!==qid)return res.status(409).send(page('<section class="panel warn">Нарушена последовательность вопросов.</section>'));
  const elapsed=Date.now()-new Date(a.question_started_at).getTime(),timedOut=forced||elapsed>22000;
  const order=a.option_orders[qid],raw=timedOut?[]:(Array.isArray(selected)?selected:[selected]).filter(v=>v!==undefined).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<order.length),orig=raw.map(i=>order[i]);
  const answers={...(a.answers||{})};answers[qid]=orig;const tos=[...(a.timed_out_questions||[])];if(timedOut&&!tos.includes(qid))tos.push(qid);const next=idx+1;
  if(next<a.question_order.length){
    await sql`UPDATE dpk_exam_attempts SET answers=${sql.json(answers)},timed_out_questions=${sql.json(tos)},current_index=${next},question_started_at=NOW() WHERE id=${id}`;
    const n=(await sql`SELECT * FROM dpk_exam_attempts WHERE id=${id} LIMIT 1`)[0];
    return res.status(200).send(questionPage(n,bank));
  }
  let correct=0;const mistakes=[];
  for(const id2 of a.question_order){const q=bank.questions.find(x=>x.id===id2),chosen=answers[id2]||[];if(sameSet(chosen,q.a))correct++;else mistakes.push({q:q.q,selected:chosen.map(i=>q.o[i]).filter(Boolean),correct:q.a.map(i=>q.o[i]),basis:q.basis});}
  const total=a.question_order.length,percent=Math.round(correct/total*100),passed=percent>=bank.passPercent;
  await sql`UPDATE dpk_exam_attempts SET answers=${sql.json(answers)},timed_out_questions=${sql.json(tos)},current_index=${next},completed_at=NOW(),score=${correct},total=${total},percent=${percent},passed=${passed} WHERE id=${id}`;
  await sendDiscord(a,bank,correct,total,percent,passed,mistakes);
  return res.status(200).send(page(`<section class="panel center"><h2 class="${passed?'ok':'bad'}">${passed?'✅ ТЕСТ СДАН':'❌ ТЕСТ НЕ СДАН'}</h2><div class="score">${percent}%</div><p>Правильных ответов: ${correct} из ${total}.</p><div class="actions" style="justify-content:center"><a class="btn" href="/">Вернуться на главный экран</a></div></section>`));
}
export default async function handler(req,res){
  try{
    await ensureSchema();const sql=getClient();await ensureOverrides(sql);
    if(req.method==='GET'&&req.query.timeout==='1')return answer(req,res,String(req.query.attemptId||''),String(req.query.questionId||''),[],true);
    if(req.method!=='POST')return res.status(405).send(page('<section class="panel warn">Метод не поддерживается.</section>'));
    if(req.body?.mode==='answer')return answer(req,res,String(req.body.attemptId||''),String(req.body.questionId||''),req.body.selected,false);
    if(req.body?.mode!=='start')return res.status(400).send(page('<section class="panel warn">Некорректный запрос.</section>'));
    const testId=String(req.body.testId||''),bank=await bankFor(sql,testId),name=String(req.body.name||'').trim().slice(0,120),staticId=String(req.body.staticId||'').trim().slice(0,60),discordId=String(req.body.discordId||'').trim().slice(0,80);
    if(!bank||!name||!staticId)return res.status(400).send(page('<section class="panel warn">Заполните данные и выберите тест.</section>'));
    const recent=await sql`SELECT started_at FROM dpk_exam_attempts WHERE test_id=${testId} AND (static_id=${staticId} OR (${discordId}<>'' AND discord_id=${discordId})) AND started_at>NOW()-INTERVAL '15 minutes' ORDER BY started_at DESC LIMIT 1`;
    if(recent.length)return res.status(429).send(page('<section class="panel warn"><h2>⏳ Повторная сдача заблокирована</h2><p>Подождите 15 минут с начала предыдущей попытки.</p><a class="btn secondary" href="/">Главный экран</a></section>'));
    const id=crypto.randomUUID(),qo=shuffle(bank.questions.map(q=>q.id)),oo={};for(const q of bank.questions)oo[q.id]=shuffle(q.o.map((_,i)=>i));
    await sql`INSERT INTO dpk_exam_attempts(id,test_id,player_name,player_name_norm,static_id,discord_id,question_order,option_orders,answers,current_index,question_started_at) VALUES(${id},${testId},${name},${normalizeName(name)},${staticId},${discordId||null},${sql.json(qo)},${sql.json(oo)},${sql.json({})},0,NOW())`;
    const a=(await sql`SELECT * FROM dpk_exam_attempts WHERE id=${id} LIMIT 1`)[0];return res.status(200).send(questionPage(a,bank));
  }catch(e){console.error(e);return res.status(500).send(page(`<section class="panel warn"><h2>Ошибка экзамена</h2><p>${esc(String(e?.message||'Неизвестная ошибка').slice(0,300))}</p><a class="btn secondary" href="/">Главный экран</a></section>`))}
}
