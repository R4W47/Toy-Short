// ads.js — capa de anuncios de Toy Sort (SIN banner)
// Igual que Mallow Mind / Marshmallow Pals: en Android el juego habla con AdsManager.kt
// a través del objeto "AndroidAds" y, cuando el anuncio se cierra, Android llama a
// window.__adsDone(id, ok, motivo).
// En el navegador no hay anuncios: se muestra uno de prueba para poder probar todo.
//
// Uso desde el juego:
//   Ads.showRewarded(placement, onOk, onFail)  -> anuncio con recompensa ('double', 'revive', ...)
//   Ads.showInterstitial(onDone)               -> pantalla completa (solo entre niveles)
(function(){
  const bridge=window.AndroidAds;
  const IS_ANDROID=!!bridge;
  const INTERSTITIAL_MIN_GAP_MS=90000;   // nunca dos pantallas completas más seguido que esto

  let nextId=1, lastInterstitial=0;
  const pending=new Map();

  window.__adsDone=(id,ok,reason)=>{
    const resolve=pending.get(id);
    if(!resolve) return;
    pending.delete(id);
    resolve({ok:!!ok, reason:reason||''});
  };

  // Mientras se ve un anuncio, el juego puede pausar sonidos con Ads.onPause / Ads.onResume
  function request(call){
    Ads.onPause();
    return new Promise(resolve=>{
      const id=nextId++;
      pending.set(id,res=>{ Ads.onResume(); resolve(res); });
      try{ call(id); }
      catch(e){ pending.delete(id); Ads.onResume(); resolve({ok:false,reason:'unavailable'}); }
    });
  }
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  const Ads=window.Ads={
    IS_ANDROID,
    simSeconds:3,          // duración del anuncio de prueba en la web
    busy:false,
    onPause(){}, onResume(){},

    // onOk solo se llama si el jugador ganó la recompensa
    async showRewarded(placement,onOk,onFail){
      if(Ads.busy) return;
      Ads.busy=true;
      let ok=false;
      if(!IS_ANDROID) ok=await sim(true);
      else{
        // Si el anuncio no estaba cargado, AdsManager.kt lo empieza a cargar y responde
        // "unavailable": se reintenta unos segundos en vez de fallar a la primera.
        let res=await request(id=>bridge.showRewarded(placement||'reward',id));
        for(let i=0;i<4&&!res.ok&&res.reason==='unavailable';i++){
          await wait(1500);
          res=await request(id=>bridge.showRewarded(placement||'reward',id));
        }
        ok=res.ok;
      }
      Ads.busy=false;
      (ok?onOk:onFail||function(){})();
    },

    // El juego decide cuándo toca (cada N niveles); aquí solo se respeta el tiempo mínimo
    async showInterstitial(onDone){
      const done=onDone||function(){};
      const now=Date.now();
      if(Ads.busy||now-lastInterstitial<INTERSTITIAL_MIN_GAP_MS){ done(); return; }
      lastInterstitial=now;
      Ads.busy=true;
      if(!IS_ANDROID) await sim(false);
      else await request(id=>bridge.showInterstitial(id));
      Ads.busy=false;
      done();
    },

    // Botón "Privacidad" (Google lo exige donde hay que pedir consentimiento). Para cuando haya Ajustes.
    privacyRequired(){
      try{ return IS_ANDROID&&typeof bridge.privacyOptionsRequired==='function'&&!!bridge.privacyOptionsRequired(); }
      catch(e){ return false; }
    },
    showPrivacy(){
      try{ if(IS_ANDROID&&typeof bridge.showPrivacyOptions==='function') bridge.showPrivacyOptions(); }catch(e){}
    }
  };

  // ---------- Anuncio de prueba (solo navegador) ----------
  const es=(navigator.language||'en').toLowerCase().startsWith('es');
  const S=es?{ad:'Anuncio de prueba',wait:s=>'Recompensa en '+s+'…',claim:'Recibir premio',close:'Cerrar',inter:'Publicidad'}
            :{ad:'Test ad',wait:s=>'Reward in '+s+'…',claim:'Get reward',close:'Close',inter:'Advertisement'};
  const css=document.createElement('style');
  css.textContent=
    '#adSim{position:fixed;inset:0;z-index:200;background:#000d;display:grid;place-items:center;font-family:Fredoka,system-ui,sans-serif;color:#fff}'+
    '#adSim .box{width:min(86vw,340px);background:#1d1d1d;border-radius:18px;padding:22px;text-align:center;display:flex;flex-direction:column;gap:14px}'+
    '#adSim .tag{font-size:13px;letter-spacing:.1em;text-transform:uppercase;opacity:.6}'+
    '#adSim .fake{height:150px;border-radius:12px;background:linear-gradient(135deg,#4b6cb7,#182848);display:grid;place-items:center;font-size:22px;font-weight:700}'+
    '#adSim button{font:inherit;font-weight:700;font-size:16px;border:0;border-radius:12px;padding:12px;cursor:pointer;background:#9bd94a;color:#16300a}'+
    '#adSim button.x{background:transparent;color:#fff;border:2px solid #555}'+
    '#adSim button[disabled]{opacity:.4}';
  document.head.appendChild(css);

  // Devuelve una promesa: true si se ganó la recompensa
  function sim(rewarded){
    return new Promise(resolve=>{
      Ads.onPause();
      const el=document.createElement('div'); el.id='adSim';
      el.innerHTML='<div class="box"><div class="tag">'+(rewarded?S.ad:S.inter)+'</div><div class="fake">AD</div>'+
        '<div class="msg"></div><button class="ok" disabled></button><button class="x">'+S.close+'</button></div>';
      document.body.appendChild(el);
      const ok=el.querySelector('.ok'), x=el.querySelector('.x'), msg=el.querySelector('.msg');
      let left=Ads.simSeconds;
      if(!rewarded){ ok.remove(); x.disabled=true; }
      const tick=()=>{
        if(rewarded){ msg.textContent=left>0?S.wait(left):''; ok.textContent=S.claim; ok.disabled=left>0; }
        else{ msg.textContent=left>0?left+'…':''; x.disabled=left>0; }
      };
      tick();
      const iv=setInterval(()=>{ left--; tick(); if(left<=0) clearInterval(iv); },1000);
      const end=v=>{ clearInterval(iv); el.remove(); Ads.onResume(); resolve(v); };
      ok.onclick=()=>end(true);
      x.onclick=()=>end(false);
    });
  }
})();
