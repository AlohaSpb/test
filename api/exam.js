import crypto from 'crypto';
import { banks } from './_lib/questions.js';
import { ensureSchema, getClient, getRequestIp, hashIp, normalizeName, shuffle, safeText } from './_lib/db.js';

const sameSet=(a,b)=>{const x=[...(a||[])].map(Number).sort((m,n)=>m-n);const y=[...(b||[])].map(Number).sort((m,n)=>m-n);return x.length===y.length&&x.every((v,i)=>v===y[i])};
const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function page(body,meta=''){
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${meta}<title>Академия ДПК</title>
  <style>
  *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#252936,#0b0d10 42%);color:#f4f6fa;font-family:Arial,sans-serif}.top{height:4px;background:linear-gradient(90deg,#fff 0 33%,#2563eb 33% 66%,#b91c1c 66%)}.wrap{max-width:850px;margin:auto;padding:18px}.head{display:flex;gap:14px;align-items:center;border-bottom:1px solid #2b3039;padding:18px 0}.logo{width:50px;height:50px;border-radius:12px;background:linear-gradient(145deg,#ddd,#555);display:grid;place-items:center;color:#111;font-weight:900}.tag{font-size:12px;color:#fca5a5;font-weight:800;letter-spacing:.1em}h1{font-size:21px;margin:3px 0}.panel{margin:20px 0;padding:24px;border:1px solid #2b3039;border-radius:18px;background:linear-gradient(180deg,#181b21,#111319);box-shadow:0 20px 60px #0007}.meta{color:#9ca3af;font-size:14px}.question{font-size:21px;font-weight:800;line-height:1.5;margin:18px 0}.opt{display:flex;gap:10px;padding:13px;border:1px solid #2a2f38;border-radius:10px;margin:10px 0;background:#0d0f13}.opt:hover{border-color:#666}.opt input{margin-top:3px}.timer{font-size:30px;font-weight:900;color:#fecaca;border:3px solid #b91c1c;border-radius:12px;padding:10px 14px;display:inline-block}.bar{height:7px;background:linear-gradient(90deg,#22c55e,#f59e0b,#ef4444);border-radius:99px;margin:14px 0}.btn{display:inline-block;border:0;border-radius:10px;padding:12px 18px;font-weight:800;color:white;background:linear-gradient(#d52c2c,#941c1c);cursor:pointer;text-decoration:none}.warn{border-left:4px solid #ef4444;background:#2a1111;padding:14px;border-radius:8px;color:#fecaca}.ok{color:#22c55e}.bad{color:#ef4444}.score{font-size:52px;font-weight:900;text-align:center}.center{text-align:center}.small{font-size:13px;color:#9ca3af}</style></head><body><div class="top"></div><main class="wrap"><div class="head"><div class="logo">РО</div><div><div class="tag">ДЕПАРТАМЕНТ ПОДГОТОВКИ КАДРОВ</div><h1>Академия стажёров</h1><div class="meta">Правительство РО • Онлайн-тестирование</div></div></div>${body}</main></body></html>`;
}

function renderQuestion(attempt,bank){
  const idx=Number(attempt.current_index);
  const qid=attempt.question_order[idx];
  const q=bank.questions.find(x=>x.id===qid);
  const optionOrder=attempt.option_orders[qid];
  const type=q.type==='multi'?'checkbox':'radio';
  const options=optionOrder.map((orig,display)=>`<label class="opt"><input type="${type}" name="selected" value="${display}"><span>${htmlEscape(q.o[orig])}</span></label>`).join('');
  const timeoutUrl=`/api/exam?attemptId=${encodeURIComponent(attempt.id)}&questionId=${encodeURIComponent(qid)}&timeout=1`;
  return page(`<section class="panel">
    <div style="display:flex;justify-content:space-between;gap:18px;align-items:center"><div><h2>${htmlEscape(bank.title)}</h2><div class="meta">Вопрос ${idx+1} из ${attempt.question_order.length}</div></div><div class="timer">20 сек.</div></div>
    <div class="bar"></div>
    <div class="question">${htmlEscape(q.q)}</div>
    ${q.type==='multi'?'<div class="small" style="color:#fca5a5">Можно выбрать несколько вариантов.</div>':''}
    <form method="post" action="/api/exam">
      <input type="hidden" name="mode" value="answer"><input type="hidden" name="attemptId" value="${attempt.id}"><input type="hidden" name="questionId" value="${qid}">
      ${options}
      <button class="btn" type="submit">Ответить и продолжить</button>
    </form>
    <p class="small">Через 20 секунд вопрос автоматически будет засчитан как пропущенный. Вернуться к предыдущему вопросу нельзя.</p>
  </section>`,`<meta http-equiv="refresh" content="20;url=${timeoutUrl}">`);
}

async function discordResult({attempt,bank,correct,total,percent,passed,mistakes,sameIpRows,ipChanged}){
  const webhook=process.env.DISCORD_WEBHOOK_URL;if(!webhook)return false;
  const embeds=[];
  if(sameIpRows.length||ipChanged){
    const prior=sameIpRows.slice(0,10).map(x=>`• ${safeText(x.player_name,80)} | Static ID: ${safeText(x.static_id,40)} | ${new Date(x.started_at).toLocaleString('ru-RU')}`).join('\n')||'Других имён на этом IP не найдено, но IP изменился во время экзамена.';
    embeds.push({color:0xff0000,title:'⚠️⚠️⚠️ WARNING — ПОДОЗРЕНИЕ НА ПОДМЕНУ ЭКЗАМЕНУЕМОГО ⚠️⚠️⚠️',description:`**ОБНАРУЖЕНА ПОДОЗРИТЕЛЬНАЯ АКТИВНОСТЬ ПО IP**\n\nТекущий: **${safeText(attempt.player_name)}** | Static ID: **${safeText(attempt.static_id,50)}**\nIP: **${safeText(attempt.ip_address,80)}**${ipChanged?'\n\n**⚠️ IP изменился во время экзамена.**':''}\n\nЭтот IP ранее использовался с другими данными:\n${prior}\n\n**Совпадение IP не является доказательством подмены само по себе (общий Wi‑Fi/NAT/VPN), но требует ручной проверки ДПК.**`,timestamp:new Date().toISOString()});
  }
  const err=mistakes.slice(0,6).map((m,i)=>`**${i+1}. ${m.q}**\nОтвет: ${m.selected.length?m.selected.join('; '):'нет ответа / таймаут'}\nПравильно: ${m.correct.join('; ')}\nОснование: ${m.basis}`).join('\n\n');
  const result={color:passed?0x22c55e:0xef4444,title:passed?'✅ ТЕСТ СДАН':'❌ ТЕСТ НЕ СДАН',description:`**${bank.title}**`,fields:[
    {name:'👤 Сотрудник',value:safeText(attempt.player_name),inline:true},{name:'🆔 Static ID',value:safeText(attempt.static_id,50),inline:true},{name:'💬 Discord ID',value:safeText(attempt.discord_id||'не указан',50),inline:true},{name:'🌐 IP',value:safeText(attempt.ip_address,80),inline:true},{name:'📊 Результат',value:`${correct} / ${total} (${percent}%)`,inline:true},{name:'❌ Ошибок',value:String(total-correct),inline:true}],timestamp:new Date().toISOString(),footer:{text:'Департамент подготовки кадров • Правительство РО'}};
  if(mistakes.length)result.fields.push({name:`🔎 Ошибки (показано ${Math.min(6,mistakes.length)} из ${mistakes.length})`,value:err.slice(0,1000)});
  embeds.push(result);
  try{const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ДПК • Академия',embeds,allowed_mentions:{parse:[]}})});return r.ok}catch{return false}
}

async function processAnswer(req,res,attemptId,questionId,selected,forceTimeout=false){
  const sql=getClient();const rows=await sql`SELECT * FROM dpk_exam_attempts WHERE id=${attemptId} LIMIT 1`;if(!rows.length)return res.status(404).send(page('<section class="panel warn">Попытка не найдена.</section>'));
  const attempt=rows[0];if(attempt.completed_at)return res.status(409).send(page('<section class="panel warn">Экзамен уже завершён.</section>'));
  const bank=banks[attempt.test_id];const idx=Number(attempt.current_index);const expected=attempt.question_order[idx];if(expected!==questionId)return res.status(409).send(page('<section class="panel warn">Нарушена последовательность вопросов.</section>'));
  const nowIp=getRequestIp(req),nowHash=hashIp(nowIp),ipChanged=nowHash!==attempt.ip_hash;
  const elapsed=Date.now()-new Date(attempt.question_started_at).getTime();const timedOut=forceTimeout||elapsed>22000;
  const optionOrder=attempt.option_orders[questionId];const raw=timedOut?[]:(Array.isArray(selected)?selected:(selected===undefined?[]:[selected])).map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<optionOrder.length);const orig=raw.map(i=>optionOrder[i]);
  const answers={...(attempt.answers||{})};answers[questionId]=orig;const tos=[...(attempt.timed_out_questions||[])];if(timedOut&&!tos.includes(questionId))tos.push(questionId);
  const next=idx+1;
  if(next<attempt.question_order.length){
    await sql`UPDATE dpk_exam_attempts SET answers=${sql.json(answers)},timed_out_questions=${sql.json(tos)},current_index=${next},question_started_at=NOW(),ip_changed=ip_changed OR ${ipChanged} WHERE id=${attemptId}`;
    const nr=(await sql`SELECT * FROM dpk_exam_attempts WHERE id=${attemptId} LIMIT 1`)[0];res.setHeader('Cache-Control','no-store');return res.status(200).send(renderQuestion(nr,bank));
  }
  let correct=0;const mistakes=[];for(const qid of attempt.question_order){const q=bank.questions.find(x=>x.id===qid);const chosen=answers[qid]||[];if(sameSet(chosen,q.a))correct++;else mistakes.push({q:q.q,selected:chosen.map(i=>q.o[i]).filter(Boolean),correct:q.a.map(i=>q.o[i]),basis:q.basis})}
  const total=attempt.question_order.length,percent=Math.round(correct/total*100),passed=percent>=bank.passPercent;
  await sql`UPDATE dpk_exam_attempts SET answers=${sql.json(answers)},timed_out_questions=${sql.json(tos)},current_index=${next},completed_at=NOW(),score=${correct},total=${total},percent=${percent},passed=${passed},ip_changed=ip_changed OR ${ipChanged} WHERE id=${attemptId}`;
  const sameIp=await sql`SELECT player_name,static_id,started_at FROM dpk_exam_attempts WHERE ip_hash=${attempt.ip_hash} AND id<>${attemptId} AND started_at>NOW()-INTERVAL '30 days' AND (static_id<>${attempt.static_id} OR player_name_norm<>${attempt.player_name_norm}) ORDER BY started_at DESC LIMIT 10`;
  const sent=await discordResult({attempt,bank,correct,total,percent,passed,mistakes,sameIpRows:sameIp,ipChanged:Boolean(attempt.ip_changed||ipChanged)});
  return res.status(200).send(page(`<section class="panel center"><h2 class="${passed?'ok':'bad'}">${passed?'✅ ТЕСТ СДАН':'❌ ТЕСТ НЕ СДАН'}</h2><div class="score">${percent}%</div><p>Правильных ответов: ${correct} из ${total}. Ошибок: ${total-correct}.</p><p class="small">${sent?'Результат отправлен в Discord.':'Результат сохранён, но webhook Discord не отправлен.'}</p><a class="btn" href="/">На главную</a></section>`));
}

export default async function handler(req,res){
  try{
    await ensureSchema();const sql=getClient();
    if(req.method==='GET'&&req.query.timeout==='1')return processAnswer(req,res,String(req.query.attemptId||''),String(req.query.questionId||''),[],true);
    if(req.method!=='POST')return res.status(405).send(page('<section class="panel warn">Метод не поддерживается.</section>'));
    const mode=String(req.body?.mode||'');
    if(mode==='answer')return processAnswer(req,res,String(req.body.attemptId||''),String(req.body.questionId||''),req.body.selected,false);
    if(mode!=='start')return res.status(400).send(page('<section class="panel warn">Некорректный запрос.</section>'));
    const testId=String(req.body.testId||''),bank=banks[testId],name=String(req.body.name||'').trim().slice(0,120),staticId=String(req.body.staticId||'').trim().slice(0,60),discordId=String(req.body.discordId||'').trim().slice(0,80);
    if(!bank||!name||!staticId)return res.status(400).send(page('<section class="panel warn">Заполните Имя Фамилия, Static ID и выберите тест.</section>'));
    const recent=await sql`SELECT started_at FROM dpk_exam_attempts WHERE test_id=${testId} AND (static_id=${staticId} OR (${discordId}<>'' AND discord_id=${discordId})) AND started_at>NOW()-INTERVAL '5 minutes' ORDER BY started_at DESC LIMIT 1`;
    if(recent.length){const elapsed=Date.now()-new Date(recent[0].started_at).getTime(),left=Math.max(1,Math.ceil((300000-elapsed)/1000)),m=Math.floor(left/60),s=left%60;return res.status(429).send(page(`<section class="panel warn"><h2>⏳ Повторная сдача заблокирована</h2><p>До следующей попытки: <b>${m}:${String(s).padStart(2,'0')}</b>.</p><a class="btn" href="/">Назад</a></section>`))}
    const ip=getRequestIp(req),id=crypto.randomUUID(),qo=shuffle(bank.questions.map(q=>q.id)),oo={};for(const q of bank.questions)oo[q.id]=shuffle(q.o.map((_,i)=>i));
    await sql`INSERT INTO dpk_exam_attempts(id,test_id,player_name,player_name_norm,static_id,discord_id,ip_address,ip_hash,question_order,option_orders,answers,current_index,question_started_at) VALUES(${id},${testId},${name},${normalizeName(name)},${staticId},${discordId||null},${ip},${hashIp(ip)},${sql.json(qo)},${sql.json(oo)},${sql.json({})},0,NOW())`;
    const attempt=(await sql`SELECT * FROM dpk_exam_attempts WHERE id=${id} LIMIT 1`)[0];res.setHeader('Cache-Control','no-store');return res.status(200).send(renderQuestion(attempt,bank));
  }catch(e){console.error(e);if(String(e?.message)==='DATABASE_NOT_CONFIGURED')return res.status(503).send(page('<section class="panel warn"><h2>База данных не подключена</h2><p>Добавьте POSTGRES_URL или DATABASE_URL в Vercel.</p></section>'));return res.status(500).send(page('<section class="panel warn">Внутренняя ошибка экзамена.</section>'))}
}