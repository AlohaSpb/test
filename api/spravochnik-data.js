const sourceUrl = 'https://docs.google.com/spreadsheets/d/1XsuwvgvFXm9UEXgxUxVfBdrZKwTHVHv5LityUtkikBo/gviz/tq?tqx=out:csv&gid=0';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'DPK-reference/1.0' } });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    const csv = await response.text();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Reference data fetch failed', error);
    return res.status(502).json({ error: 'Не удалось загрузить справочник' });
  }
}
