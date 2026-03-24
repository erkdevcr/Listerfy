// =============================================
// LISTERFY — Supabase client & core helpers
// =============================================

const SUPABASE_URL  = 'https://onbexzwvbnumwuawesuu.supabase.co';
const SUPABASE_ANON = 'sb_publishable_ez03kD82qJwruoL1Pojxhw_v8pSLdlR';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

async function getSession() {
  const { data } = await db.auth.getSession();
  return data.session;
}

async function requireAuth() {
  const session = await getSession();
  if (!session) { window.location.href = 'index.html'; return null; }
  return session.user;
}

function showToast(message, type, duration) {
  type = type || 'info'; duration = duration || 3500;
  var container = document.getElementById('toast-container');
  if (!container) return;
  var icons = { success: '✓', error: '✕', info: 'ℹ' };
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML = '<span>' + (icons[type]||'') + '</span><span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(function() {
    toast.classList.add('hiding');
    toast.addEventListener('animationend', function() { toast.remove(); });
  }, duration);
}

function timeAgo(dateStr) {
  var lang = localStorage.getItem('lang') || 'es';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff/60000), hours = Math.floor(diff/3600000), days = Math.floor(diff/86400000);
  if (lang === 'es') {
    if (mins < 1) return 'ahora mismo';
    if (mins < 60) return 'hace ' + mins + ' min';
    if (hours < 24) return 'hace ' + hours + ' h';
    return 'hace ' + days + ' d';
  } else {
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (hours < 24) return hours + 'h ago';
    return days + 'd ago';
  }
}
