export default function handler(req,res){
  res.status(410).json({error:'Устаревший endpoint. Используйте /api/start и /api/answer.'});
}
