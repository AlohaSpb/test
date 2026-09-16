import { banks } from './_lib/questions.js';
import { ensureSchema, getClient, getPassPercent, getTestTitle } from './_lib/db.js';

const descriptions={
  day1:'IC/RP-логика, полномочия, режимные территории.',
  day2:'УПК, доказательства, адвокат, задержание.',
  final:'Ситуационные задачи по всей программе.'
};

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    await ensureSchema();
    const sql=getClient();
    const custom=await sql`SELECT test_id,title,questions FROM dpk_custom_tests ORDER BY created_at ASC`;
    const base=[...Object.entries(banks).map(([id,bank])=>({id,title:bank.title,questions:bank.questions,description:descriptions[id]||''})),...custom.map(row=>({id:row.test_id,title:row.title,questions:row.questions,description:'Пользовательский тест.'}))];
    const tests=await Promise.all(base.map(async test=>({
      id:test.id,
      title:await getTestTitle(sql,test.id,test.title),
      total:Array.isArray(test.questions)?test.questions.length:0,
      description:test.description,
      passPercent:await getPassPercent(sql,test.id,80)
    })));
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({tests:tests.filter(test=>test.total>0)});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:'Не удалось загрузить список тестов'});
  }
}
