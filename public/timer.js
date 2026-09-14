(function(){
  var root=document.querySelector('[data-timeout-url]');
  if(!root)return;
  var left=20;
  var seconds=document.getElementById('seconds');
  var bar=document.getElementById('timerbar');
  var form=document.getElementById('answerForm');
  var done=false;
  function draw(){
    if(seconds)seconds.textContent=String(left);
    if(bar)bar.style.width=Math.max(0,left/20*100)+'%';
  }
  draw();
  var timer=setInterval(function(){
    left-=1;
    draw();
    if(left<=0&&!done){
      done=true;
      clearInterval(timer);
      window.location.replace(root.getAttribute('data-timeout-url'));
    }
  },1000);
  if(form){
    form.addEventListener('submit',function(){
      done=true;
      clearInterval(timer);
      var btn=document.getElementById('answerBtn');
      if(btn){btn.disabled=true;btn.textContent='Отправка...';}
    });
  }
})();