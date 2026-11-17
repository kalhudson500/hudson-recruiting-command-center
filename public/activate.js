const token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
history.replaceState(null,'',location.pathname);
const form=document.querySelector('#activateForm'),result=document.querySelector('#result');
if(!token){result.textContent='Open the complete setup link Mark shared with you.';form.querySelector('button').disabled=true}
form.onsubmit=async e=>{e.preventDefault();if(form.elements.password.value!==form.elements.confirm.value){result.textContent='Passwords must match.';return}const button=form.querySelector('button');button.disabled=true;try{const r=await fetch('/api/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password:form.elements.password.value})});const x=await r.json();if(!r.ok)throw Error(x.error||'Unable to set up login');form.reset();result.textContent='Your login is ready. Sign in with '+x.username+' and your new password.';}catch(e){result.textContent=e.message;button.disabled=false}};
