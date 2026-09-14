export default function handler(req,res){
  res.status(410).json({error:'Устаревший endpoint. Ответы отправляются по одному через /api/answer.'});
}
