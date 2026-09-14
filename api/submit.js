import { banks } from './_lib/questions.js';

const sameSet=(a,b)=>{
  const x=[...(a||[])].map(Number).sort((m,n)=>m-n);
  const y=[...(b||[])].map(Number).sort((m,n)=>m-n);
  return x.length===y.length && x.every((v,i)=>v===y[i]);
};
const safe=(s,max=180)=>String(s||'').replace(/[@`]/g,'').trim().slice(0,max);

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {testId,name,staticId,discordId,answers,attempt}=req.body||{};
  const bank=banks[String(testId||'')];
  if(!bank) return res.status(400).json({error:'Неизвестный тест'});
  if(!name||!staticId||!answers) return res.status(400).json({error:'Не заполнены обязательные поля'});

  let correct=0; const mistakes=[];
  for(const q of bank.questions){
    const selected=Array.isArray(answers[q.id])?answers[q.id]:[];
    if(sameSet(selected,q.a)) correct++;
    else mistakes.push({q:q.q, selected:selected.map(i=>q.o[i]).filter(Boolean), correct:q.a.map(i=>q.o[i]), basis:q.basis});
  }
  const total=bank.questions.length;
  const percent=Math.round(correct/total*100);
  const passed=percent>=bank.passPercent;
  let webhookSent=false;
  const webhook=process.env.DISCORD_WEBHOOK_URL;

  if(webhook){
    const errText=mistakes.slice(0,6).map((m,i)=>`**${i+1}. ${m.q}**\nОтвет: ${m.selected.length?m.selected.join('; '):'нет ответа'}\nПравильно: ${m.correct.join('; ')}\nОснование: ${m.basis}`).join('\n\n');
    const embed={
      title: passed?'✅ ТЕСТ СДАН':'❌ ТЕСТ НЕ СДАН',
      description:`**${bank.title}**`,
      fields:[
        {name:'👤 Сотрудник',value:safe(name),inline:true},
        {name:'🆔 Static ID',value:safe(staticId,50),inline:true},
        {name:'💬 Discord ID',value:safe(discordId||'не указан',50),inline:true},
        {name:'📊 Результат',value:`${correct} / ${total} (${percent}%)`,inline:true},
        {name:'❌ Ошибок',value:String(total-correct),inline:true},
        {name:'🔁 Попытка',value:String(Number(attempt)||1),inline:true}
      ],
      timestamp:new Date().toISOString(),
      footer:{text:'Департамент подготовки кадров • Правительство РО'}
    };
    if(mistakes.length) embed.fields.push({name:`🔎 Ошибки (показано ${Math.min(6,mistakes.length)} из ${mistakes.length})`,value:errText.slice(0,1000)});
    try{
      const wr=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ДПК • Академия',embeds:[embed],allowed_mentions:{parse:[]}})});
      webhookSent=wr.ok;
    }catch(e){}
  }
  res.status(200).json({ok:true,correct,total,percent,passed,webhookSent});
}
