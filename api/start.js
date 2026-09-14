import crypto from 'crypto';
import { banks } from './_lib/questions.js';
import { ensureSchema, getClient, getRequestIp, hashIp, normalizeName, shuffle } from './_lib/db.js';

function publicQuestion(bank, qid, optionOrders) {
  const q = bank.questions.find(x => x.id === qid);
  const order = optionOrders[qid];
  return {
    id: q.id,
    type: q.type,
    q: q.q,
    options: order.map(i => q.o[i])
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureSchema();
    const sql = getClient();
    const { testId, name, staticId, discordId } = req.body || {};
    const bank = banks[String(testId || '')];

    if (!bank) return res.status(400).json({ error: 'Неизвестный тест' });
    if (!String(name || '').trim() || !String(staticId || '').trim()) {
      return res.status(400).json({ error: 'Заполните Имя Фамилия и Static ID' });
    }

    const cleanName = String(name).trim().slice(0, 120);
    const cleanStatic = String(staticId).trim().slice(0, 60);
    const cleanDiscord = String(discordId || '').trim().slice(0, 80);
    const nameNorm = normalizeName(cleanName);
    const ip = getRequestIp(req);
    const ipHash = hashIp(ip);

    const recent = await sql`
      SELECT started_at
      FROM dpk_exam_attempts
      WHERE test_id = ${testId}
        AND (
          static_id = ${cleanStatic}
          OR (${cleanDiscord} <> '' AND discord_id = ${cleanDiscord})
        )
        AND started_at > NOW() - INTERVAL '5 minutes'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    if (recent.length) {
      const elapsed = Date.now() - new Date(recent[0].started_at).getTime();
      const retryAfterSeconds = Math.max(1, Math.ceil((5 * 60 * 1000 - elapsed) / 1000));
      return res.status(429).json({
        error: 'Повторная сдача доступна не раньше чем через 5 минут после начала предыдущей попытки.',
        retryAfterSeconds
      });
    }

    const questionOrder = shuffle(bank.questions.map(q => q.id));
    const optionOrders = {};
    for (const q of bank.questions) optionOrders[q.id] = shuffle(q.o.map((_, i) => i));

    const id = crypto.randomUUID();

    await sql`
      INSERT INTO dpk_exam_attempts (
        id, test_id, player_name, player_name_norm, static_id, discord_id,
        ip_address, ip_hash, question_order, option_orders, answers,
        current_index, question_started_at
      ) VALUES (
        ${id}, ${testId}, ${cleanName}, ${nameNorm}, ${cleanStatic}, ${cleanDiscord || null},
        ${ip}, ${ipHash}, ${sql.json(questionOrder)}, ${sql.json(optionOrders)}, ${sql.json({})},
        0, NOW()
      )
    `;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      attemptId: id,
      title: bank.title,
      passPercent: bank.passPercent,
      total: questionOrder.length,
      questionIndex: 0,
      secondsPerQuestion: 20,
      question: publicQuestion(bank, questionOrder[0], optionOrders)
    });
  } catch (e) {
    if (String(e?.message) === 'DATABASE_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'База данных не настроена. Добавьте POSTGRES_URL или DATABASE_URL в Vercel.' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Не удалось начать экзамен' });
  }
}
