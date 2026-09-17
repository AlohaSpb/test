let all = [];
let kind = 'all';

const koapMeasures = {
  '5.4': '★★ · штраф / адм. арест до 20 суток',
  '6.1': '★★ · штраф / адм. арест до 20 суток',
  '6.2': '★★ · штраф / адм. арест до 15 суток',
  '6.3': '★★ · штраф / адм. арест до 20 суток',
  '7.1': '★ · штраф / адм. арест до 10 суток',
  '8.15': '★★ · штраф / адм. арест до 20 суток',
  '9.4': '★★ · штраф / адм. арест до 20 суток',
  '10.1': '★★ · штраф / адм. арест до 15 суток',
  '10.2': '★★ · штраф / адм. арест до 20 суток',
  '11.1': '★★ · штраф / адм. арест до 15 суток',
  '11.4': '★★ · штраф / адм. арест',
  '11.5': '★ · штраф / адм. арест до 10 суток',
  '11.6': '★ · предупреждение / штраф / адм. арест до 10 суток',
  '11.7': '★★ · предупреждение / штраф / адм. арест до 15 суток',
  '11.8': '★★★ · штраф / адм. арест до 24 суток'
};

const extraKoapArticles = [
  ['8.19', 'Нарушение обязанностей пассажиров и водителей, не урегулированное иными статьями', 'штраф 1 500–20 000 ₽', 'Штраф'],
  ['8.20', 'Нарушение обязанностей пешеходов и велосипедистов, не урегулированное иными статьями', 'штраф 1 500–8 000 ₽', 'Штраф'],
  ['8.21', 'Нарушение правил расположения ТС на проезжей части, не урегулированное иными статьями', 'штраф 1 500–10 000 ₽ и/или эвакуация ТС', 'Штраф / эвакуация'],
  ['8.22', 'Нарушение правил обгона и схожих манёвров, не урегулированное иными статьями', 'штраф 1 500–15 000 ₽ и/или лишение права управления ТС', 'Штраф / лишение ВУ'],
  ['8.23', 'Нарушение правил остановки и стоянки, не урегулированное иными статьями', 'штраф 1 500–10 000 ₽ и/или эвакуация ТС', 'Штраф / эвакуация'],
  ['8.24', 'Нарушение правил проезда перекрёстков, не урегулированное иными статьями', 'штраф 1 500–25 000 ₽', 'Штраф'],
  ['8.25', 'Иные нарушения ПДД, не установленные отдельными статьями кодекса', 'штраф 1 500–20 000 ₽', 'Штраф']
];

const koapPartMeasures = {
  '8.5 ч.2': '★★ · штраф / адм. арест до 15 суток',
  '9.1 ч.1': '★★ · штраф / адм. арест до 15 суток',
  '9.2 ч.1': '★★ · штраф / адм. арест до 15 суток',
  '11.2 ч.3': '★★ · штраф / адм. арест до 20 суток',
  '11.4 ч.1': '★★ · штраф / адм. арест до 20 суток',
  '11.4 ч.2': '★★ · штраф / адм. арест до 20 суток',
  '11.4 ч.3': '★★ · штраф / адм. арест до 15 суток'
};

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function parseCsv(text) {
  const rows = [], row = [];
  let value = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value); if (row.some(Boolean)) rows.push(row.splice(0)); value = '';
    } else value += char;
  }
  row.push(value); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function render() {
  const query = document.querySelector('#search').value.trim().toLowerCase();
  const visible = all.filter(item => (kind === 'all' || item.kind === kind) && (!query || Object.values(item).join(' ').toLowerCase().includes(query)));
  document.querySelector('#rows').innerHTML = visible.map(item => `<tr><td><b>${item.kind === 'uk' ? 'УК' : 'КоАП'}</b></td><td>${escapeHtml(item.article)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.punishment)}</td><td class="stars">${escapeHtml(item.stars || '—')}</td><td class="fine">${escapeHtml(item.notes || '—')}</td></tr>`).join('');
  document.querySelector('#stats').textContent = `Найдено статей: ${visible.length}`;
}

fetch('/api/spravochnik-data').then(response => {
  if (!response.ok) throw new Error('Reference data request failed');
  return response.text();
}).then(text => {
  for (const row of parseCsv(text)) {
    if (/^\d/.test((row[1] || '').trim()) && row[2] && row[3]) all.push({ kind: 'uk', article: row[1], name: row[2], punishment: row[3], stars: row[4], notes: [row[5], row[6]].filter(Boolean).join(' ') });
    if (/^\d/.test((row[8] || '').trim()) && row[9] && row[10]) {
      const article = row[8];
      const key = article.match(/^\d+\.\d+/)?.[0];
      const measure = koapPartMeasures[article.replace(/ 🧱| 🪪/g, '')] || koapMeasures[key] || (article.includes('🧱') ? 'Адм. арест' : article.includes('🪪') ? 'Лишение ВУ' : 'Штраф');
      all.push({ kind: 'koap', article, name: row[9], punishment: row[10], stars: measure, notes: '' });
    }
  }
  const existing = new Set(all.filter(item => item.kind === 'koap').map(item => item.article.match(/^\d+\.\d+/)?.[0]));
  for (const [article, name, punishment, stars] of extraKoapArticles) {
    if (!existing.has(article)) all.push({ kind: 'koap', article, name, punishment, stars, notes: '' });
  }
  render();
}).catch(() => {
  document.querySelector('#stats').innerHTML = 'Не удалось загрузить данные. <a href="https://docs.google.com/spreadsheets/d/1XsuwvgvFXm9UEXgxUxVfBdrZKwTHVHv5LityUtkikBo/edit?gid=0#gid=0" target="_blank">Открыть исходную таблицу</a>.';
});

document.querySelector('#search').addEventListener('input', render);
document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
  kind = button.dataset.type;
  document.querySelectorAll('[data-type]').forEach(item => item.classList.toggle('active', item === button));
  render();
}));
