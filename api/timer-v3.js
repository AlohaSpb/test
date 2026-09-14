export default function handler(req,res){
  res.setHeader("Content-Type","application/javascript; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.status(200).send([
    "(function(){",
    "var root=document.querySelector('[data-timeout-url]');",
    "if(!root)return;",
    "var left=20,done=false;",
    "var seconds=document.getElementById('seconds');",
    "var bar=document.getElementById('timerbar');",
    "var form=document.getElementById('answerForm');",
    "function draw(){if(seconds)seconds.textContent=String(left);if(bar)bar.style.width=Math.max(0,left/20*100)+'%';}",
    "draw();",
    "var t=setInterval(function(){left--;draw();if(left<=0&&!done){done=true;clearInterval(t);window.location.replace(root.getAttribute('data-timeout-url'));}},1000);",
    "if(form){form.addEventListener('submit',function(){done=true;clearInterval(t);var b=document.getElementById('answerBtn');if(b){b.disabled=true;b.textContent='Отправка...';}});}",
    "})();"
  ].join(""));
}