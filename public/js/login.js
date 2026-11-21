'use strict';
const form = document.getElementById('login-form');
const err = document.getElementById('login-error');
fetch('/api/auth/me').then(r => { if (r.ok) location.replace('/app'); }).catch(() => {});
form.addEventListener('submit', async (e) => {
  e.preventDefault(); err.hidden = true;
  const btn = form.querySelector('button'); btn.disabled = true;
  try {
    const r = await fetch('/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ppn' },
      body: JSON.stringify({ username: form.username.value, password: form.password.value }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Connexion impossible.');
    location.replace('/app');
  } catch (ex) { err.textContent = ex.message; err.hidden = false; form.password.value = ''; form.password.focus(); }
  finally { btn.disabled = false; }
});
