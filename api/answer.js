import { banks } from './_lib/questions.js';
import { ensureSchema, getClient, getRequestIp, hashIp, safeText } from './_lib/db.js';

const sameSet = (a, b) => {
  const x = [...(a || [])].map(Number).sort((m,n)=>m-n);
  const y = [...(b || [])].map(Number).sort((m,n)=>m-n);
  return x.length === y.length && x.every((v,i)=>v===y[i]);
};

function nextPublicQuestion(bank, qid, optionOrders) {
  const q = bank.questions.find(x => x.id === qid);
  const order = optionOrders[qid];
  return { id:q.id, type:q.type, q:q.q, options:order.map(i=>q.o[i]) };
}

async function sendDiscordResult({ attempt, bank, correct, total, percent, passed, mistakes, sameIpRows, ipChanged }) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return false;

  const embeds = [];
  const suspicious = sameIpRows.length > 0 || ipChanged;

  if (suspicious) {
    const prior = sameIpRows.slice(0, 10).map(x =>
      `• ${safeText(x.player_name,80)} | Static ID: ${safeText(x.static_id,40)} | ${new Date(x.started_at).toLocaleString('ru-RU')}`
    ).join('\n') || 'Совпадений с другими именами не найдено, но IP изменился во время экзамена.';

    embeds.push({
      color: 0xff0000,
      title: '⚠️⚠️⚠️ WARNING — ВОЗМОЖНАЯ ПОДМЕНА ЭКЗАМЕНУЕМОГО ⚠️⚠️⚠️',
      description:
        '**СИСТЕМА ОБНАРУЖИЛА ПОДОЗРИТЕЛЬНУЮ АКТИВНОСТЬ ПО IP.**\n\n' +
        `Текущий экзаменуемый: **${safeText(attempt.player_name)}**\n` +
        `Static ID: **${safeText(attempt.static_id,50)}**\n` +
        `IP: **${safeText(attempt.ip_address,80)}**\n` +
        (ipChanged ? '\n**⚠️ IP-адрес изменился во время прохождения экзамена.**\n' : '') +
        '\nЭтот же IP ранее использовался другими данными экзаменуемого:\n' +
        prior +
        '\n\n**ВАЖНО:** совпадение IP само по себе не доказывает подмену (общий Wi‑Fi, NAT, VPN и т.п.), но требует ручной проверки сотрудником ДПК.',
      timestamp: new Date().toISOString()
    });
  }

  const errText = mistakes.slice(0, 6).map((m,i) =>
    `**${i+1}. ${m.q}**\nОтвет: ${m.selected.length ? m.selected.join('; ') : 'нет ответа / таймаут'}\nПравильно: ${m.correct.join('; ')}\nОснование: ${m.basis}`
  ).join('\n\n');

  const resultEmbed = {
    color: passed ? 0x22c55e : 0xef4444,
    title: passed ? '✅ ТЕСТ СДАН' : '❌ ТЕСТ НЕ СДАН',
    description: `**${bank.title}**`,
    fields: [
      {name:'👤 Сотрудник',value:safeText(attempt.player_name),inline:true},
      {name:'🆔 Static ID',value:safeText(attempt.static_id,50),inline:true},
      {name:'💬 Discord ID',value:safeText(attempt.discord_id || 'не указан',50),inline:true},
      {name:'🌐 IP',value:safeText(attempt.ip_address,80),inline:true},
      {name:'📊 Результат',value:`${correct} / ${total} (${percent}%)`,inline:true},
      {name:'❌ Ошибок',value:String(total-correct),inline:true}
    ],
    timestamp:new Date().toISOString(),
    footer:{text:'Департамент подготовки кадров • Правительство РО'}
  };

  if (mistakes.length) {
    resultEmbed.fields.push({
      name:`🔎 Ошибки (показано ${Math.min(6,mistakes.length)} из ${mistakes.length})`,
      value:errText.slice(0,1000)
    });
  }
  embeds.push(resultEmbed);

  try {
    const wr = await fetch(webhook, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        username:'ДПК • Академия',
        embeds,
        allowed_mentions:{parse:[]}
      })
    });
    return wr.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  try {
    await ensureSchema();
    const sql = getClient();
    const { attemptId, questionId, selected } = req.body || {};
    if (!attemptId || !questionId || !Array.isArray(selected)) {
      return res.status(400).json({error:'Некорректный ответ'});
    }

    const rows = await sql`SELECT * FROM dpk_exam_attempts WHERE id = ${attemptId} LIMIT 1`;
    if (!rows.length) return res.status(404).json({error:'Попытка не найдена'});
    const attempt = rows[0];
    if (attempt.completed_at) return res.status(409).json({error:'Экзамен уже завершён'});

    const bank = banks[attempt.test_id];
    if (!bank) return res.status(400).json({error:'Тест не найден'});

    const order = attempt.question_order;
    const currentIndex = Number(attempt.current_index);
    const expectedQid = order[currentIndex];
    if (expectedQid !== questionId) {
      return res.status(409).json({error:'Нарушена последовательность вопросов'});
    }

    const currentIp = getRequestIp(req);
    const currentIpHash = hashIp(currentIp);
    const ipChangedNow = currentIpHash !== attempt.ip_hash;

    const elapsedMs = Date.now() - new Date(attempt.question_started_at).getTime();
    const timedOut = elapsedMs > 22000; // интерфейс даёт ровно 20 секунд; 2 секунды сетевого допуска

    const q = bank.questions.find(x => x.id === questionId);
    const optionOrder = attempt.option_orders[questionId];
    const selectedDisplayed = timedOut ? [] : selected.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < optionOrder.length);
    const selectedOriginal = selectedDisplayed.map(displayIndex => optionOrder[displayIndex]);

    const answers = {...(attempt.answers || {})};
    answers[questionId] = selectedOriginal;
    const timedOutQuestions = [...(attempt.timed_out_questions || [])];
    if (timedOut && !timedOutQuestions.includes(questionId)) timedOutQuestions.push(questionId);

    const nextIndex = currentIndex + 1;
    const isFinished = nextIndex >= order.length;

    if (!isFinished) {
      await sql`
        UPDATE dpk_exam_attempts
        SET answers = ${sql.json(answers)},
            timed_out_questions = ${sql.json(timedOutQuestions)},
            current_index = ${nextIndex},
            question_started_at = NOW(),
            ip_changed = ip_changed OR ${ipChangedNow}
        WHERE id = ${attemptId}
      `;

      return res.status(200).json({
        finished:false,
        timedOut,
        questionIndex:nextIndex,
        total:order.length,
        secondsPerQuestion:20,
        question:nextPublicQuestion(bank, order[nextIndex], attempt.option_orders)
      });
    }

    let correct = 0;
    const mistakes = [];
    for (const qid of order) {
      const item = bank.questions.find(x => x.id === qid);
      const chosen = answers[qid] || [];
      if (sameSet(chosen, item.a)) correct++;
      else mistakes.push({
        q:item.q,
        selected:chosen.map(i=>item.o[i]).filter(Boolean),
        correct:item.a.map(i=>item.o[i]),
        basis:item.basis
      });
    }

    const total = order.length;
    const percent = Math.round(correct / total * 100);
    const passed = percent >= bank.passPercent;

    await sql`
      UPDATE dpk_exam_attempts
      SET answers = ${sql.json(answers)},
          timed_out_questions = ${sql.json(timedOutQuestions)},
          current_index = ${nextIndex},
          completed_at = NOW(),
          score = ${correct},
          total = ${total},
          percent = ${percent},
          passed = ${passed},
          ip_changed = ip_changed OR ${ipChangedNow}
      WHERE id = ${attemptId}
    `;

    const sameIpRows = await sql`
      SELECT player_name, static_id, started_at
      FROM dpk_exam_attempts
      WHERE ip_hash = ${attempt.ip_hash}
        AND id <> ${attemptId}
        AND started_at > NOW() - INTERVAL '30 days'
        AND (static_id <> ${attempt.static_id} OR player_name_norm <> ${attempt.player_name_norm})
      ORDER BY started_at DESC
      LIMIT 10
    `;

    const webhookSent = await sendDiscordResult({
      attempt,
      bank,
      correct,
      total,
      percent,
      passed,
      mistakes,
      sameIpRows,
      ipChanged: Boolean(attempt.ip_changed || ipChangedNow)
    });

    return res.status(200).json({
      finished:true,
      timedOut,
      correct,
      total,
      percent,
      passed,
      webhookSent,
      suspiciousIp:Boolean(sameIpRows.length || attempt.ip_changed || ipChangedNow)
    });
  } catch (e) {
    if (String(e?.message) === 'DATABASE_NOT_CONFIGURED') {
      return res.status(503).json({error:'База данных не настроена. Добавьте POSTGRES_URL или DATABASE_URL в Vercel.'});
    }
    console.error(e);
    return res.status(500).json({error:'Ошибка обработки ответа'});
  }
}
