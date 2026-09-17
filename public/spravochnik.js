let all = [];
let kind = 'all';

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
    if (/^\d/.test((row[8] || '').trim()) && row[9] && row[10]) all.push({ kind: 'koap', article: row[8], name: row[9], punishment: row[10], stars: '—', notes: '' });
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
