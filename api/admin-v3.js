import crypto from 'crypto';
import { banks } from './_lib/questions.js';
import { ensureSchema, getClient } from './_lib/db.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const sessionSecret=()=>process.env.ADMIN_PASSWORD||'';
const token=()=>crypto.createHmac('sha256',sessionSecret()).update('dpk-admin-v3').digest('hex');

function parseCookies(req){
  const out={};
  for(const part of String(req.headers.cookie||'').split(';')){
    const p=part.trim(); if(!p) continue;
    const i=p.indexOf('='); if(i>0) out[p.slice(0,i)]=decodeURIComponent(p.slice(i+1));
  }
  return out;
}
const authed=req=>Boolean(sessionSecret())&&parseCookies(req).dpk_admin===token();

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
async function questions(sql,testId){
  const rows=await sql`SELECT * FROM dpk_question_overrides WHERE test_id=${testId}`;
  const map=new Map(rows.map(r=>[r.question_id,r]));
  return banks[testId].questions.map(q=>{
    const r=map.get(q.id);
    return r?{...q,q:r.question_text,o:r.options,a:r.correct_answers,basis:r.basis||q.basis,changed:true}:{...q,changed:false};
  });
}
function shell(body){
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Админ ДПК</title>
  <style>*{box-sizing:border-box}body{margin:0;background:#0b0d10;color:#f5f7fb;font-family:Arial,sans-serif}.wrap{max-width:1100px;margin:auto;padding:24px}.panel,.card{background:#15181e;border:1px solid #2b3039;border-radius:16px;padding:20px;margin:18px 0}.card{background:#0f1116}.top{display:flex;justify-content:space-between;gap:14px;align-items:center}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.answers{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}label{display:block;margin:10px 0 5px;color:#cdd2da}input[type=text],input[type=password],textarea,select{width:100%;padding:10px;border-radius:8px;border:1px solid #39404b;background:#0a0c10;color:#fff}textarea{min-height:90px}.btn{display:inline-block;padding:10px 14px;border-radius:8px;border:0;background:#a91f1f;color:#fff;font-weight:700;cursor:pointer;text-decoration:none}.btn.secondary{background:#272c35}.muted{color:#9ca3af;font-size:13px}.ok{color:#86efac}.badge{font-size:12px;padding:3px 8px;border-radius:999px;background:#292d35;color:#d1d5db}@media(max-width:700px){.grid,.answers{grid-template-columns:1fr}}</style></head><body><main class="wrap">${body}</main></body></html>`;
}
function login(msg=''){
  return shell(`<section class="panel"><h1>Администратор тестов ДПК</h1><p class="muted">Редактирование вопросов и ответов.</p>${msg?`<p style="color:#fca5a5">${esc(msg)}</p>`:''}<form method="post"><input type="hidden" name="action" value="login"><label>Пароль</label><input type="password" name="password" required><button class="btn" style="margin-top:12px">Войти</button></form><p><a class="btn secondary" href="/">Главный экран</a></p></section>`);
}

export default async function handler(req,res){
  try{
    await ensureSchema();
    const sql=getClient();
    await ensureOverrides(sql);
    const action=String(req.body?.action||'');

    if(!sessionSecret()) return res.status(503).send(shell('<section class="panel"><h2>Админ-пароль не настроен</h2><p>Добавьте ADMIN_PASSWORD в Vercel Environment Variables.</p></section>'));

    if(req.method==='POST'&&action==='login'){
      if(String(req.body.password||'')!==sessionSecret()) return res.status(401).send(login('Неверный пароль'));
      res.setHeader('Set-Cookie',`dpk_admin=${token()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);
      res.statusCode=303; res.setHeader('Location','/api/admin-v3'); return res.end();
    }

    if(!authed(req)) return res.status(200).send(login());

    if(req.method==='POST'&&action==='logout'){
      res.setHeader('Set-Cookie','dpk_admin=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
      res.statusCode=303; res.setHeader('Location','/api/admin-v3'); return res.end();
    }

    if(req.method==='POST'&&action==='save'){
      const testId=String(req.body.testId||''),qid=String(req.body.questionId||'');
      const qtext=String(req.body.questionText||'').trim(),basis=String(req.body.basis||'').trim();
      if(!banks[testId]||!banks[testId].questions.some(q=>q.id===qid)) return res.status(400).send(shell('<section class="panel">Вопрос не найден.</section>'));
      const opts=[0,1,2,3].map(i=>String(req.body['opt'+i]||'').trim());
      if(!qtext||opts.some(x=>!x)) return res.status(400).send(shell('<section class="panel">Заполните вопрос и все 4 варианта.</section>'));
      const raw=req.body.correct;
      const correct=(Array.isArray(raw)?raw:[raw]).filter(x=>x!==undefined).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<4);
      if(!correct.length) return res.status(400).send(shell('<section class="panel">Укажите правильный ответ.</section>'));
      await sql`INSERT INTO dpk_question_overrides(test_id,question_id,question_text,options,correct_answers,basis,updated_at)
        VALUES(${testId},${qid},${qtext},${sql.json(opts)},${sql.json(correct)},${basis},NOW())
        ON CONFLICT(test_id,question_id) DO UPDATE SET question_text=EXCLUDED.question_text,options=EXCLUDED.options,correct_answers=EXCLUDED.correct_answers,basis=EXCLUDED.basis,updated_at=NOW()`;
      res.statusCode=303; res.setHeader('Location',`/api/admin-v3?testId=${encodeURIComponent(testId)}&saved=${encodeURIComponent(qid)}`); return res.end();
    }

    if(req.method==='POST'&&action==='reset'){
      const testId=String(req.body.testId||''),qid=String(req.body.questionId||'');
      await sql`DELETE FROM dpk_question_overrides WHERE test_id=${testId} AND question_id=${qid}`;
      res.statusCode=303; res.setHeader('Location',`/api/admin-v3?testId=${encodeURIComponent(testId)}`); return res.end();
    }

    const testId=banks[String(req.query.testId||'')]?String(req.query.testId):'day1';
    const saved=String(req.query.saved||''),qs=await questions(sql,testId);
    const cards=qs.map((q,i)=>`<form class="card" method="post"><input type="hidden" name="action" value="save"><input type="hidden" name="testId" value="${esc(testId)}"><input type="hidden" name="questionId" value="${esc(q.id)}"><div class="top"><b>${i+1}. ${esc(q.id)} ${q.changed?'<span class="badge">изменён</span>':''}</b>${saved===q.id?'<span class="ok">Сохранено ✓</span>':''}</div><label>Вопрос</label><textarea name="questionText" required>${esc(q.q)}</textarea><div class="grid">${[0,1,2,3].map(n=>`<div><label>Вариант ${n+1}</label><input type="text" name="opt${n}" value="${esc(q.o[n])}" required></div>`).join('')}</div><label>Правильный ответ / ответы</label><div class="answers">${[0,1,2,3].map(n=>`<label><input type="checkbox" name="correct" value="${n}" ${q.a.includes(n)?'checked':''}> Вариант ${n+1}</label>`).join('')}</div><label>Основание / статья</label><input type="text" name="basis" value="${esc(q.basis||'')}"><div style="margin-top:12px"><button class="btn">Сохранить</button></div></form>${q.changed?`<form method="post"><input type="hidden" name="action" value="reset"><input type="hidden" name="testId" value="${esc(testId)}"><input type="hidden" name="questionId" value="${esc(q.id)}"><button class="btn secondary">Вернуть исходный</button></form>`:''}`).join('');

    return res.status(200).send(shell(`<div class="top"><div><h1>Администратор тестов ДПК</h1><p class="muted">Изменения сохраняются в PostgreSQL.</p></div><div><a class="btn secondary" href="/">Главный экран</a> <form method="post" style="display:inline"><input type="hidden" name="action" value="logout"><button class="btn secondary">Выйти</button></form></div></div><section class="panel"><form method="get"><label>Тест</label><select name="testId" onchange="this.form.submit()"><option value="day1" ${testId==='day1'?'selected':''}>День 1</option><option value="day2" ${testId==='day2'?'selected':''}>День 2</option><option value="final" ${testId==='final'?'selected':''}>Итоговый</option></select></form></section>${cards}`));
  }catch(e){
    console.error(e);
    return res.status(500).send(shell('<section class="panel"><h2>Ошибка панели администратора</h2><p class="muted">Проверьте логи Vercel.</p></section>'));
  }
}