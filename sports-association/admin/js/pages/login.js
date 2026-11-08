import { ready } from '../firebase.js';
import { loginWithGoogle, currentAdmin, authErrorMessage, DeniedError } from '../auth.js';

const $ = id => document.getElementById(id);
const btn = $('login-btn');
const label = $('login-label');

function showError(msg) {
  $('form-error').textContent = msg;
  $('form-error').hidden = !msg;
}

// บัญชีไม่มีสิทธิ์: แสดง UID ให้ส่งต่อผู้ดูแลไปเพิ่มใน admins/{uid}
function showDenied(uid, email) {
  showError(`บัญชีนี้ไม่มีสิทธิ์${email ? ` (${email})` : ''}`);
  $('denied-uid').textContent = uid;
  $('denied-info').hidden = !uid;
}

$('copy-uid').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('denied-uid').textContent);
    $('copy-uid').textContent = 'คัดลอกแล้ว';
  } catch {
    $('copy-uid').textContent = 'คัดลอกไม่ได้';
  }
});

if (!ready) {
  $('setup-banner').hidden = false;
  btn.disabled = true;
} else {
  const denied = new URLSearchParams(location.search).get('denied');
  if (denied) showDenied(denied, '');
  currentAdmin().then(s => { if (s) location.replace('index.html'); }).catch(() => {});
}

btn.addEventListener('click', async () => {
  if (!ready) return;
  showError('');
  $('denied-info').hidden = true;
  btn.disabled = true;
  label.textContent = 'กำลังเข้าสู่ระบบ…';
  try {
    await loginWithGoogle();
    location.replace('index.html');
  } catch (err) {
    if (err instanceof DeniedError) showDenied(err.uid, err.email);
    else showError(authErrorMessage(err));
    btn.disabled = false;
    label.textContent = 'เข้าสู่ระบบด้วย Google';
  }
});
