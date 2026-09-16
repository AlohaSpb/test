export default function handler(req, res) {
  res.status(410).send('Устаревший endpoint. Откройте главную страницу и начните тест заново.');
}
