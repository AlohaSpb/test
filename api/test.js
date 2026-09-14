import { banks } from './_lib/questions.js';

export default function handler(req, res) {
  const testId = String(req.query.testId || '');
  const bank = banks[testId];
  if (!bank) return res.status(404).json({ error: 'Тест не найден' });
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({
    id:testId,
    title:bank.title,
    passPercent:bank.passPercent,
    questions:bank.questions.map(q=>({id:q.id,type:q.type,q:q.q,o:q.o}))
  });
}
