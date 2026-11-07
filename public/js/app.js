// Small progressive enhancement for the demo UI.
document.querySelectorAll("form").forEach(form=>{
  form.addEventListener("submit",()=>{
    const btn=form.querySelector('button[type="submit"],button:not([type])');
    if(btn){btn.dataset.oldText=btn.textContent;btn.textContent="Please wait…";btn.disabled=true;}
  });
});
