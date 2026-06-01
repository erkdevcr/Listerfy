// list.js — Listerfy list view
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
(function() {
  // Logo SVG como CSS mask — se define UNA vez, el navegador lo aplica via CSS
  // sin repetir el path en cada ítem del DOM (100+ ítems no afectan el rendimiento)
  var logoSVG = '<svg viewBox="0 0 377.87 347.58" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M154.2,211.57c-35.21-34.4-68.39-71.02-103.88-105.16l96.8,173.21c5.26,9.01,' +
    '18.37,10.12,25.07,2.13L377.87,9.71c-.29,2.45-1.62,4.98-2.6,7.27-12.8,30.03-27.84,' +
    '59.22-40.8,89.19,28.97,70.14,9.77,151.17-47.84,200.13-82.99,70.53-209.83,47.79,' +
    '-263.68-46.2C-24.9,176.57,4.67,70.26,87.56,22.79,163.68-20.82,262.52-.2,313.73,' +
    '70.67l-154.51,144.37c-2.46,1.18-3.6-2.07-5.03-3.47Z"/></svg>';
  var lm = 'url("data:image/svg+xml,' + encodeURIComponent(logoSVG) + '") center/78% no-repeat';
  var s = document.createElement('style');
  s.textContent =
    '@keyframes item-tap-glow{0%{background:rgba(52,176,128,0);box-shadow:inset 0 0 0 0px rgba(52,176,128,0)}' +
    '40%{background:rgba(52,176,128,0.13);box-shadow:inset 0 0 0 2px rgba(52,176,128,0.35)}' +
    '100%{background:rgba(52,176,128,0);box-shadow:inset 0 0 0 0px rgba(52,176,128,0)}}' +
    '@keyframes item-tap-glow-red{0%{background:rgba(239,68,68,0);box-shadow:inset 0 0 0 0px rgba(239,68,68,0)}' +
    '40%{background:rgba(239,68,68,0.11);box-shadow:inset 0 0 0 2px rgba(239,68,68,0.28)}' +
    '100%{background:rgba(239,68,68,0);box-shadow:inset 0 0 0 0px rgba(239,68,68,0)}}' +
    '.item-row.item-tapping{animation:item-tap-glow 0.22s ease-out forwards;border-radius:10px}' +
    '.item-row.item-tapping-red{animation:item-tap-glow-red 0.22s ease-out forwards;border-radius:10px}' +
    // Checked (verde): logo verde
    '.item-circle.state-checked{background-color:var(--brand);border-color:transparent;' +
    '-webkit-mask:' + lm + ';mask:' + lm + ';transform:scale(1.22)}' +
    // Completed (rojo): logo rojo
    '.item-circle.state-completed{background-color:#ef4444;border-color:transparent;' +
    '-webkit-mask:' + lm + ';mask:' + lm + ';transform:scale(1.22)}' +
    // Ocultar el check blanco nativo que viene de style.css
    '.item-circle.state-checked::after,.item-circle.state-completed::after{display:none}';
  document.head.appendChild(s);
})();


// ═══════════════════════════════════════════════════════════
// OFFLINE SYNC SYSTEM
// Cola de operaciones pendientes + merge por timestamp
// ═══════════════════════════════════════════════════════════
var QUEUE_KEY = 'listerfy_pending_' + (new URLSearchParams(location.search).get('id') || '');
window._isOnline = navigator.onLine;

window.addEventListener('online',  function() { window._isOnline = true;  flushQueue(); });
window.addEventListener('offline', function() { window._isOnline = false; });

function queueOp(op) {
  op._ts = new Date().toISOString();
  op._id = Math.random().toString(36).slice(2);
  var q = getQueue();
  // Deduplicar: si ya hay una op del mismo tipo + itemId, reemplazar
  if (op.itemId) {
    q = q.filter(function(x) { return !(x.type === op.type && x.itemId === op.itemId); });
  }
  q.push(op);
  saveQueue(q);
}
function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch(e) { return []; }
}
function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch(e) {}
}
function clearQueue() { localStorage.removeItem(QUEUE_KEY); }

async function flushQueue() {
  if (!window._isOnline) return;
  var q = getQueue();
  if (!q.length) return;
  var sent = [];
  for (var i = 0; i < q.length; i++) {
    var op = q[i];
    try {
      if (op.type === 'update_item_state') {
        // Comparar timestamp: solo actualizar si nuestro cambio es más reciente
        var res = await db.from('items').select('updated_at').eq('id', op.itemId).single();
        if (!res.data || new Date(op._ts) >= new Date(res.data.updated_at || 0)) {
          await db.from('items').update({
            item_state: op.data.item_state,
            is_checked: op.data.is_checked,
            checked_by: op.data.checked_by,
            checked_at: op.data.checked_at
          }).eq('id', op.itemId);
        }
        sent.push(op._id);
      } else if (op.type === 'update_items_batch') {
        // Clear completed / clear all — actualizar los que tenemos timestamp más reciente
        for (var j = 0; j < op.ids.length; j++) {
          var res2 = await db.from('items').select('updated_at').eq('id', op.ids[j]).single();
          if (!res2.data || new Date(op._ts) >= new Date(res2.data.updated_at || 0)) {
            await db.from('items').update(op.data).eq('id', op.ids[j]);
          }
        }
        sent.push(op._id);
      } else if (op.type === 'insert_item') {
        await db.from('items').insert(op.data);
        sent.push(op._id);
      } else if (op.type === 'delete_item') {
        await db.from('items').delete().eq('id', op.itemId);
        sent.push(op._id);
      }
    } catch(e) {
      // Sin conexión o error → dejar en cola
    }
  }
  if (sent.length) {
    var remaining = getQueue().filter(function(x) { return !sent.includes(x._id); });
    saveQueue(remaining);
    // Recargar desde DB para sincronizar
    if (sent.length) reloadItemsFromDB();
  }
}

// Merge inteligente: respeta cambios locales pendientes
function mergeWithLocal(dbItems) {
  var q = getQueue();
  if (!q.length) return dbItems;

  // Mapa de cambios por itemId (para update_item_state)
  var localChanges = {};
  q.forEach(function(op) {
    if (op.itemId) localChanges[op.itemId] = op;
  });

  // Mapa de batch ops: id → data (para update_items_batch)
  var batchChanges = {};
  q.forEach(function(op) {
    if (op.type === 'update_items_batch' && op.ids) {
      op.ids.forEach(function(id) {
        // Si aún no hay un cambio individual más reciente, aplicar batch
        if (!batchChanges[id] || new Date(op._ts) > new Date(batchChanges[id]._ts)) {
          batchChanges[id] = op;
        }
      });
    }
  });

  return dbItems.map(function(dbItem) {
    var dbTs = new Date(dbItem.updated_at || 0);

    // Primero revisar cambio individual (más específico)
    var localOp = localChanges[dbItem.id];
    if (localOp && new Date(localOp._ts) > dbTs) {
      var merged = Object.assign({}, dbItem);
      Object.assign(merged, localOp.data);
      return merged;
    }

    // Luego revisar batch
    var batchOp = batchChanges[dbItem.id];
    if (batchOp && new Date(batchOp._ts) > dbTs) {
      return Object.assign({}, dbItem, batchOp.data);
    }

    return dbItem; // DB ganó
  });
}

var LIST_ID = new URLSearchParams(location.search).get('id');
window.currentUser = null;
window.categories = [];
window.members = [];
window.items = [];
window.listData = null;
window.selectedItemId = null;
window.selectedItemIds = [];
window.longPressTimer = null;
var AVATAR_COLORS = ['#16a34a','#0284c7','#7c3aed','#db2777','#ea580c','#0891b2','#65a30d','#d97706'];
function avatarColor(s) { s=s||''; var h=0; for(var i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }
function avatarInitials(n) { n=n||''; return n.trim().split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2)||'?'; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

document.addEventListener('click', function(e) {
  var panel = document.getElementById('add-panel');
  var pill = document.getElementById('add-pill');
  if (!panel || panel.classList.contains('hidden')) return;
  if (!panel.contains(e.target) && !pill.contains(e.target)) {
    e.stopPropagation(); e.preventDefault();
    panel.classList.add('hidden'); pill.classList.remove('hidden');
  }
}, true);

setTimeout(function() {
  if (!LIST_ID) { location.href='app.html'; return; }
  requireAuth().then(function(user) {
    if (!user) return;
    window.currentUser = user;
    applyTranslations();
    window.loadAll();
  });
}, 100);

window.loadAll = function() {
  return Promise.all([
    db.from('lists').select('*').eq('id', LIST_ID).is('deleted_at', null).single(),
    db.from('categories').select('*').order('is_default', { ascending: false }),
    db.from('list_members').select('user_id, role, profiles(display_name, email, avatar_url)').eq('list_id', LIST_ID),
    db.from('items').select('*, categories(name_es, name_en, icon)').eq('list_id', LIST_ID).order('created_at', { ascending: true })
  ]).then(function(results) {
    var list = results[0].data;
    if (!list) { location.href='app.html'; return; }
    window.listData = list;
    window.categories = results[1].data || [];
    window.members = results[2].data || [];
    window.items = results[3].data || [];
    document.title = 'Listerfy — ' + list.name;
    window.renderTopbar();
    window.renderCatOptions('item-cat');
    window.renderCatOptions('edit-cat');
    window.renderPage();
    window.subscribeRealtime();
  });
};

window.updateListSubtitle = function() {
  var sub = document.getElementById('list-subtitle');
  if (!sub || !window.items) return;
  var total = window.items.length;
  var checked = window.items.filter(function(i) { return i.item_state === 'checked'; }).length;
  var completed = window.items.filter(function(i) { return i.item_state === 'completed'; }).length;
  if (total === 0) { sub.innerHTML = ''; return; }
  var html = total + ' ' + t('items');
  if (checked > 0 || completed > 0) {
    html += ' (<span style="color:var(--brand);font-weight:700">' + checked + '</span>'
          + '/<span style="color:var(--red);font-weight:700">' + completed + '</span>)';
  }
  sub.innerHTML = html;
};

window.renderTopbar = function() {
  document.getElementById('list-title').textContent = window.listData.name;
  var isOwner = window.listData.owner_id === window.currentUser.id;
  var avatars = window.members.filter(function(m) { return m.user_id !== window.currentUser.id; }).slice(0,5).map(function(m) {
    var name = (m.profiles && m.profiles.display_name) || '?';
    var url = m.profiles && m.profiles.avatar_url;
    if (url) return '<div class="avatar avatar-sm" style="background:' + avatarColor(name) + ';padding:0;overflow:hidden"><img src="' + url + '" width="100%" height="100%" style="object-fit:cover;border-radius:50%;display:block"></div>';
    return '<div class="avatar avatar-sm" style="background:' + avatarColor(name) + '">' + avatarInitials(name) + '</div>';
  }).join('');
  var sortActive = window._sortMode !== 'alpha';
  var sortSVG = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M3 7H21M6 12H18M10 17H14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var chk = '<span style="color:var(--brand);margin-right:4px">✓</span>';
  var nochk = '<span style="margin-right:4px;opacity:0">✓</span>';
  document.getElementById('topbar-actions').innerHTML =
    '<div class="avatar-stack" onclick="openMembersModal()" style="cursor:pointer">' + avatars + '</div>' +
    '<div class="dropdown-wrap" style="position:relative">' +
      '<button class="btn btn-ghost btn-icon" id="btn-sort" onclick="toggleSortMenu()" style="padding:8px' + (sortActive ? ';color:var(--brand)' : '') + '">' + sortSVG + '</button>' +
      '<div class="dropdown-menu hidden" id="sort-menu" style="right:0;top:40px;min-width:160px">' +
        '<button class="dropdown-item" onclick="setSortMode(\'alpha\')">' + (window._sortMode === 'alpha' ? chk : nochk) + t('sortAlpha') + '</button>' +
        '<button class="dropdown-item" onclick="setSortMode(\'category\')">' + (window._sortMode === 'category' ? chk : nochk) + t('sortByCategory') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="dropdown-wrap" style="position:relative">' +
      '<button class="btn btn-ghost btn-icon" onclick="toggleListMenu()">⋮</button>' +
      '<div class="dropdown-menu hidden" id="list-menu" style="right:0;top:40px">' +
        '<button class="dropdown-item" onclick="openInviteModal()"><svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M11 6C12.6569 6 14 4.65685 14 3C14 1.34315 12.6569 0 11 0C9.34315 0 8 1.34315 8 3C8 3.22371 8.02449 3.44169 8.07092 3.65143L4.86861 5.65287C4.35599 5.24423 3.70652 5 3 5C1.34315 5 0 6.34315 0 8C0 9.65685 1.34315 11 3 11C3.70652 11 4.35599 10.7558 4.86861 10.3471L8.07092 12.3486C8.02449 12.5583 8 12.7763 8 13C8 14.6569 9.34315 16 11 16C12.6569 16 14 14.6569 14 13C14 11.3431 12.6569 10 11 10C10.2935 10 9.644 10.2442 9.13139 10.6529L5.92908 8.65143C5.97551 8.44169 6 8.22371 6 8C6 7.77629 5.97551 7.55831 5.92908 7.34857L9.13139 5.34713C9.644 5.75577 10.2935 6 11 6Z" fill="#436e60"/></svg> ' + t('share') + '</button>' +
        (isOwner
          ? '<button class="dropdown-item danger" onclick="confirmDeleteList()"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6M14 10V17M10 10V17" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + t('deleteList') + '</button>'
          : '<button class="dropdown-item danger" onclick="confirmLeaveList()"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15M10 17L15 12M15 12L10 7M15 12H3" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + t('leaveList') + '</button>') +
      '</div>' +
    '</div>';
  window.updateListSubtitle();
};

window.toggleListMenu = function() {
  var m = document.getElementById('list-menu'); m.classList.toggle('hidden');
  if (!m.classList.contains('hidden')) {
    setTimeout(function() { document.addEventListener('click', function h() { m.classList.add('hidden'); document.removeEventListener('click', h); }); }, 0);
  }
};

window._sortMode = localStorage.getItem('sortMode') || 'alpha';

window._demoTimer = null;
window.runDemoAnimation = function() {
  // Reset all 3 circles to blue
  for (var n = 1; n <= 3; n++) {
    var c = document.getElementById('demo-circle-' + n);
    var r = document.getElementById('demo-row-' + n);
    if (!c || !r) continue;
    c.className = 'item-circle';
    c.style.opacity = '1';
    c.style.transform = '';
    r.style.animation = 'none';
    void c.offsetWidth;
  }

  function animateRow(n) {
    var circle = document.getElementById('demo-circle-' + n);
    var row = document.getElementById('demo-row-' + n);
    if (!circle || !row) return;

    row.style.animation = 'item-tap-glow-slow 0.55s ease-out forwards';
    circle.classList.add('state-checked');
    void circle.offsetWidth;
    circle.classList.add('demo-circle-popping');

    window._demoTimer = setTimeout(function() {
      circle.classList.remove('demo-circle-popping');
      circle.style.opacity = '1';
      circle.style.transform = 'scale(1.22)';
      if (n < 3) {
        window._demoTimer = setTimeout(function() { animateRow(n + 1); }, 350);
      }
    }, 750);
  }

  window._demoTimer = setTimeout(function() { animateRow(1); }, 500);
};

window._shoppingMode = false;
window.toggleShoppingMode = function() {
  if (!window._shoppingMode) {
    // Verificar si hay ítems marcados antes de activar
    var hasMarked = window.items.some(function(i) {
      return i.item_state === 'checked' || i.item_state === 'completed';
    });
    if (!hasMarked) {
      document.getElementById('modal-shopping-empty').classList.remove('hidden');
      clearTimeout(window._demoTimer);
      requestAnimationFrame(window.runDemoAnimation);
      return;
    }
  }
  window._shoppingMode = !window._shoppingMode;
  var btn = document.getElementById('btn-shopping-mode');
  if (btn) {
    btn.classList.toggle('active', window._shoppingMode);
    var btnLabel = btn.querySelector('[data-i18n]');
    if (btnLabel) btnLabel.textContent = window._shoppingMode ? t('shoppingModeExit') : t('shoppingMode');
  }
  var pill = document.getElementById('add-pill');
  if (pill) pill.classList.toggle('hidden', window._shoppingMode);
  if (window._shoppingMode) {
    var panel = document.getElementById('add-panel');
    if (panel && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      if (pill) pill.classList.add('hidden');
    }
  }
  // Curtain cubre toda la pantalla → render + scroll → curtain desaparece
  var curtain = document.getElementById('mode-curtain');
  if (curtain) {
    curtain.style.opacity = '1';
    curtain.style.pointerEvents = 'all';
    setTimeout(function() {
      window._skipFlip = true;
      window.renderPage();
      // Esperar al siguiente frame (después del layout del browser) para resetear scroll
      requestAnimationFrame(function() {
        var pc = document.getElementById('page-content');
        var page = document.querySelector('.page');
        if (pc) pc.scrollTop = 0;
        if (page) page.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.scrollTo(0, 0);
        curtain.style.opacity = '0';
        curtain.style.pointerEvents = 'none';
      });
    }, 160);
  } else {
    window._skipFlip = true;
    window.renderPage();
  }
};

window.toggleSortMenu = function() {
  var m = document.getElementById('sort-menu'); if (!m) return;
  m.classList.toggle('hidden');
  if (!m.classList.contains('hidden')) {
    setTimeout(function() { document.addEventListener('click', function h() { m.classList.add('hidden'); document.removeEventListener('click', h); }); }, 0);
  }
};
window.setSortMode = function(mode) {
  window._sortMode = mode;
  localStorage.setItem('sortMode', mode);
  var m = document.getElementById('sort-menu'); if (m) m.classList.add('hidden');
  window.renderTopbar();
  window.renderPage();
};

function renderItemsList(items) {
  if (window._sortMode !== 'category') {
    return items.map(function(i) { return window.renderItem(i); }).join('');
  }
  var html = '';
  var lastCat = undefined;
  items.forEach(function(i) {
    var catName = i.categories ? (currentLang === 'es' ? i.categories.name_es : i.categories.name_en) : t('uncategorized');
    var catIcon = i.categories ? i.categories.icon : '';
    if (catName !== lastCat) {
      html += '<div style="padding:7px 16px 3px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3)">' + (catIcon ? catIcon + ' ' : '') + esc(catName) + '</div>';
      lastCat = catName;
    }
    html += window.renderItem(i);
  });
  return html;
}

window.renderPage = function() {
  var sortedItems = window.items.slice().sort(window._sortMode === 'category'
    ? function(a, b) {
        var catA = a.categories ? (currentLang === 'es' ? a.categories.name_es : a.categories.name_en) : '￿';
        var catB = b.categories ? (currentLang === 'es' ? b.categories.name_es : b.categories.name_en) : '￿';
        var cmp = catA.localeCompare(catB, undefined, {sensitivity:'base'});
        return cmp !== 0 ? cmp : (a.name||'').localeCompare(b.name||'', undefined, {sensitivity:'base'});
      }
    : function(a, b) { return (a.name||'').localeCompare(b.name||'', undefined, {sensitivity:'base'}); }
  );
  var unchecked  = sortedItems.filter(function(i) { return (i.item_state||'unchecked') === 'unchecked'; });
  var checked    = sortedItems.filter(function(i) { return i.item_state === 'checked'; });
  var completed  = sortedItems.filter(function(i) { return i.item_state === 'completed'; });
  // Verdes primero (alfabético), tachados al final (alfabético)
  var below = checked.concat(completed);
  var pct = window.items.length > 0 ? Math.round((below.length / window.items.length) * 100) : 0;
  var prog = document.getElementById('top-progress');
  if (prog) {
    var checkedOnlyCount = below.length - completed.length;
    if (pct === 0) {
      // Vacío
      prog.style.cssText = 'display:none';
      prog.innerHTML = '';
    } else if (completed.length === 0) {
      // Solo verde — derecha redondeada (izquierda la maneja el contenedor)
      prog.style.cssText = 'display:block;width:' + pct + '%;background:var(--brand);border-radius:0 9999px 9999px 0';
      prog.innerHTML = '';
    } else if (checkedOnlyCount === 0) {
      // Solo rojo — derecha redondeada
      var _red = document.body.classList.contains('light') ? '#d83838' : '#c04040';
      prog.style.cssText = 'display:block;width:' + pct + '%;background:' + _red + ';border-radius:0 9999px 9999px 0';
      prog.innerHTML = '';
    } else {
      // Dos segmentos: verde derecha redondeada + rojo ambos lados redondeados
      prog.style.cssText = 'display:flex;width:' + pct + '%;height:100%;background:none;border-radius:0';
      prog.innerHTML =
        '<div style="flex:' + checkedOnlyCount + ';background:var(--brand);border-radius:0 9999px 9999px 0"></div>' +
        '<div style="flex:' + completed.length + ';background:' + (document.body.classList.contains('light') ? '#d83838' : '#c04040') + ';border-radius:9999px"></div>';
    }
  }
  var html = '';
  if (window._shoppingMode && below.length === 0) {
    // Salir del modo compras silenciosamente si ya no quedan marcados
    window._shoppingMode = false;
    var _smBtn = document.getElementById('btn-shopping-mode');
    if (_smBtn) {
      _smBtn.classList.remove('active');
      var _smLabel = _smBtn.querySelector('[data-i18n]');
      if (_smLabel) _smLabel.textContent = t('shoppingMode');
    }
    var _smPill = document.getElementById('add-pill');
    if (_smPill) _smPill.classList.remove('hidden');
  }
  if (window._shoppingMode) {
    // Modo compras: solo verdes y rojos
    html += renderItemsList(below);
    html += '<div style="display:flex;gap:10px;padding:16px;margin-top:8px">';
    if (completed.length > 0) html += '<button class="btn btn-outline btn-full" onclick="document.getElementById(\'modal-clear-completed\').classList.remove(\'hidden\')">' + t('clearCompleted') + '</button>';
    html += '<button class="btn btn-danger btn-full" onclick="document.getElementById(\'modal-clear-all\').classList.remove(\'hidden\')">' + t('clearAll') + '</button>';
    html += '</div>';
  } else if (window.items.length === 0) {
    html = '<div class="empty-state"><div class="empty-icon">🛒</div><h3>' + t('noItems') + '</h3><p>' + t('noItemsHint') + '</p></div>';
  } else {
    html += renderItemsList(unchecked);
    if (below.length > 0) {
      html += '<div style="padding:10px 16px 8px;background:var(--bg-3);border-top:1px solid var(--border-2);border-bottom:1px solid var(--border-2);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3)">(' + below.length + ') ' + t('checkedItems') + '</div>';
      html += renderItemsList(below);
    }
    if (below.length > 0) {
      html += '<div style="display:flex;gap:10px;padding:16px;margin-top:8px">';
      if (completed.length > 0) html += '<button class="btn btn-outline btn-full" onclick="document.getElementById(\'modal-clear-completed\').classList.remove(\'hidden\')">' + t('clearCompleted') + '</button>';
      html += '<button class="btn btn-danger btn-full" onclick="document.getElementById(\'modal-clear-all\').classList.remove(\'hidden\')">' + t('clearAll') + '</button>';
      html += '</div>';
    }
  }
  // FLIP Step 1: capturar posiciones actuales antes de reemplazar DOM
  var _flipPos = {};
  if (!window._skipFlip) {
    document.querySelectorAll('#page-content .item-row[id]').forEach(function(r) {
      if (!r.classList.contains('fading-out')) {
        _flipPos[r.id] = r.getBoundingClientRect().top;
      }
    });
  }
  window._skipFlip = false;

  var el = document.getElementById('page-content'); if (el) el.innerHTML = html;

  // FLIP Step 2: animar ítems que cambiaron de posición
  document.querySelectorAll('#page-content .item-row[id]').forEach(function(r) {
    if (_flipPos[r.id] !== undefined) {
      var delta = _flipPos[r.id] - r.getBoundingClientRect().top;
      if (Math.abs(delta) > 1) {
        r.style.transform = 'translateY(' + delta + 'px)';
        r.style.transition = 'none';
        requestAnimationFrame(function() { requestAnimationFrame(function() {
          r.style.transition = 'transform 0.28s ease';
          r.style.transform = '';
        }); });
      }
    }
  });
  window.updateListSubtitle();
};

window.renderItem = function(item) {
  var state = item.item_state || 'unchecked';
  var catIcon = (item.categories && item.categories.icon) ? item.categories.icon : '🛒';
  var circleClass = state === 'completed' ? 'state-completed' : (state === 'checked' ? 'state-checked' : '');
  var nameStyle = 'cursor:pointer;';
  var innerStyle = '';
  if (state === 'completed') {
    nameStyle += 'color:var(--completed-text);';
    innerStyle = 'text-decoration:line-through;text-decoration-color:#ef4444;text-decoration-thickness:2px;';
  }
  return '<div class="item-row" id="row-' + item.id + '"' +
    ' ontouchstart="startLongPress(\'' + item.id + '\',event)" ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()"' +
    ' onmousedown="startLongPress(\'' + item.id + '\',event)" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()">' +
    '<div class="item-circle ' + circleClass + '" onclick="if(window._longPressFired){window._longPressFired=false;return;} window._multiSelectMode ? selectItem(\'' + item.id + '\') : cycleState(\'' + item.id + '\')" ></div>' +
    '<span class="item-name" style="' + nameStyle + '" onclick="if(window._longPressFired){window._longPressFired=false;return;} window._multiSelectMode ? selectItem(\'' + item.id + '\') : cycleState(\'' + item.id + '\')">' +
      '<span class="item-text-inner" style="' + innerStyle + '">' + esc(item.name) + '</span>' + (item.quantity ? ' <span style="color:var(--text-3);font-size:var(--fs-xs)">' + esc(item.quantity) + '</span>' : '') +
    '</span>' +
    '<div class="item-cat-icon" onclick="if(window._longPressFired)return;event.stopPropagation();openCatPicker(\'' + item.id + '\')">' + catIcon + '</div>' +
    '</div>';
};

window._localChange = false;
window.cycleState = function(id) {
  var item = window.items.find(function(i) { return i.id === id; }); if (!item) return;
  var state = item.item_state || 'unchecked';
  var next = state === 'unchecked' ? 'checked' : (state === 'checked' ? 'completed' : 'checked');

  function applyStateChange() {
    var ts = new Date().toISOString();
    var payload = {
      item_state: next,
      is_checked: next !== 'unchecked',
      checked_by: next !== 'unchecked' ? window.currentUser.id : null,
      checked_at: next !== 'unchecked' ? ts : null
    };
    // Actualizar local inmediatamente
    item.item_state = next;
    item._localTs = ts;
    window._localChange = true; clearTimeout(window._localChangeTimer);
    window._localChangeTimer = setTimeout(function() { window._localChange = false; }, 2000);
    window.renderPage();
    // Encolar operación
    queueOp({ type: 'update_item_state', itemId: id, data: payload });
    // Intentar enviar
    if (window._isOnline) {
      db.from('items').update(payload).eq('id', id).then(function(res) {
        window._localChange = false; clearTimeout(window._localChangeTimer);
        if (!res.error) {
          // Limpiar de la cola si se envió correctamente
          var q = getQueue().filter(function(x) { return !(x.type === 'update_item_state' && x.itemId === id); });
          saveQueue(q);
        }
      });
    } else {
      window._localChange = false;
    }
  }

  // Solo aplicar efecto visual al tocar ítems azules (unchecked → checked)
  if (state === 'unchecked') {
    var row = document.getElementById('row-' + id);
    var circle = row ? row.querySelector('.item-circle') : null;
    // Glow verde en el row
    if (row) {
      row.classList.remove('item-tapping');
      void row.offsetWidth;
      row.classList.add('item-tapping');
    }
    // Círculo se convierte en logo verde con efecto pop
    if (circle) {
      circle.classList.add('state-checked');
      circle.classList.add('icon-popping');
    }
    // Después del glow, fade + colapso de altura
    setTimeout(function() {
      var r = document.getElementById('row-' + id);
      if (r) {
        r.style.height = r.offsetHeight + 'px';
        r.style.overflow = 'hidden';
        r.classList.remove('item-tapping');
        void r.offsetWidth;
        r.classList.add('fading-out');
        requestAnimationFrame(function() { requestAnimationFrame(function() {
          r.style.transition = 'height 0.32s ease, padding-top 0.32s ease, padding-bottom 0.32s ease, border-bottom-width 0.32s ease';
          r.style.height = '0'; r.style.paddingTop = '0'; r.style.paddingBottom = '0'; r.style.borderBottomWidth = '0';
        }); });
      }
      setTimeout(applyStateChange, 340);
    }, 210);
  } else if (state === 'checked') {
    var row = document.getElementById('row-' + id);
    var circle = row ? row.querySelector('.item-circle') : null;
    var textEl = row ? row.querySelector('.item-text-inner') : null;
    if (row) { row.classList.remove('item-tapping-red'); void row.offsetWidth; row.classList.add('item-tapping-red'); }
    if (circle) { circle.classList.remove('state-checked'); circle.classList.add('state-completed'); circle.classList.add('icon-popping'); }
    if (textEl) { textEl.classList.add('striking'); }
    // Después del tachado, fade + colapso de altura
    setTimeout(function() {
      var r = document.getElementById('row-' + id);
      if (r) {
        r.style.height = r.offsetHeight + 'px';
        r.style.overflow = 'hidden';
        r.classList.remove('item-tapping-red');
        void r.offsetWidth;
        r.classList.add('fading-out');
        requestAnimationFrame(function() { requestAnimationFrame(function() {
          r.style.transition = 'height 0.32s ease, padding-top 0.32s ease, padding-bottom 0.32s ease, border-bottom-width 0.32s ease';
          r.style.height = '0'; r.style.paddingTop = '0'; r.style.paddingBottom = '0'; r.style.borderBottomWidth = '0';
        }); });
      }
      setTimeout(applyStateChange, 340);
    }, 210);
  } else {
    // completed → checked
    var row = document.getElementById('row-' + id);
    var circle = row ? row.querySelector('.item-circle') : null;
    var textEl = row ? row.querySelector('.item-text-inner') : null;
    if (row) { row.classList.remove('item-tapping'); void row.offsetWidth; row.classList.add('item-tapping'); }
    if (circle) { circle.classList.remove('state-completed'); circle.classList.add('state-checked'); circle.classList.add('icon-popping'); }
    if (textEl) { textEl.style.textDecoration = 'none'; textEl.style.color = ''; textEl.classList.add('unstriking'); }
    // Después del destachado, fade + colapso de altura
    setTimeout(function() {
      var r = document.getElementById('row-' + id);
      if (r) {
        r.style.height = r.offsetHeight + 'px';
        r.style.overflow = 'hidden';
        r.classList.remove('item-tapping');
        void r.offsetWidth;
        r.classList.add('fading-out');
        requestAnimationFrame(function() { requestAnimationFrame(function() {
          r.style.transition = 'height 0.32s ease, padding-top 0.32s ease, padding-bottom 0.32s ease, border-bottom-width 0.32s ease';
          r.style.height = '0'; r.style.paddingTop = '0'; r.style.paddingBottom = '0'; r.style.borderBottomWidth = '0';
        }); });
      }
      setTimeout(applyStateChange, 340);
    }, 210);
  }
};

window.closeAddPanel = function() { document.getElementById('add-panel').classList.add('hidden'); document.getElementById('add-pill').classList.remove('hidden'); };
window.toggleAddPanel = function() {
  var panel = document.getElementById('add-panel'); var pill = document.getElementById('add-pill');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) { pill.classList.add('hidden'); setTimeout(function(){ document.getElementById('item-input').focus(); }, 50); }
  else { pill.classList.remove('hidden'); }
};

window.addItem = function() {
  var name = document.getElementById('item-input').value.trim(); if (!name) return;
  var catId = document.getElementById('item-cat').value || null;
  var qty = document.getElementById('item-qty').value.trim() || null;
  var btn = document.getElementById('btn-add-item'); btn.disabled = true; btn.textContent = t('adding');
  db.from('items').insert({ list_id: LIST_ID, name: name, quantity: qty, category_id: catId, added_by: window.currentUser.id, item_state: 'unchecked' }).then(function(res) {
    btn.disabled = false; btn.textContent = t('add');
    if (res.error) { showToast(t('errorGeneral'), 'error'); return; }
    document.getElementById('item-input').value = ''; document.getElementById('item-qty').value = '';
    document.getElementById('item-input').focus();
  });
};

window._longPressFired = false;
window.startLongPress = function(id) { window._longPressFired = false; window.longPressTimer = setTimeout(function() { window._longPressFired = true; window.selectItem(id); }, 600); };
window.cancelLongPress = function() { clearTimeout(window.longPressTimer); };

window.selectItem = function(id) {
  if (window.selectedItemIds.length === 0) {
    document.getElementById('action-bar').classList.remove('hidden');
    document.getElementById('add-pill').classList.add('hidden');
    document.getElementById('btn-action-edit').style.display = '';
    document.getElementById('btn-action-edit').textContent = t('edit');
    document.getElementById('action-bar-info').textContent = '';
    var b = document.getElementById('back-btn'); b.textContent = '✕'; b.onclick = window.clearSelection;
    window._multiSelectMode = true;
  }
  var idx = window.selectedItemIds.indexOf(id);
  if (idx === -1) { window.selectedItemIds.push(id); var row = document.getElementById('row-' + id); if (row) row.classList.add('selected'); }
  else { window.selectedItemIds.splice(idx, 1); var row = document.getElementById('row-' + id); if (row) row.classList.remove('selected'); }
  window.selectedItemId = window.selectedItemIds[0] || null;
  var count = window.selectedItemIds.length;
  var info = document.getElementById('action-bar-info'); var editBtn = document.getElementById('btn-action-edit');
  if (count === 0) { window.clearSelection(); return; }
  else if (count === 1) { info.textContent = '1 ' + t('selected1'); editBtn.style.display = ''; editBtn.textContent = t('edit'); }
  else { info.textContent = count + ' ' + t('selectedN'); editBtn.style.display = ''; editBtn.textContent = t('editCategory'); }
};

window.clearSelection = function() {
  window.selectedItemId = null; window.selectedItemIds = []; window._multiSelectMode = false;
  document.getElementById('action-bar').classList.add('hidden');
  document.getElementById('add-pill').classList.remove('hidden');
  document.querySelectorAll('.item-row').forEach(function(r) { r.classList.remove('selected'); });
  var b = document.getElementById('back-btn');
  b.innerHTML = '<svg viewBox="0 0 492 492" xmlns="http://www.w3.org/2000/svg" fill="#436e60" width="26" height="26"><path d="M7.86,265.12l177.68,177.68c5.07,5.07,11.83,7.86,19.04,7.86s13.97-2.79,19.04-7.86l16.13-16.14c5.07-5.06,7.86-11.83,7.86-19.04s-2.79-14.2-7.86-19.26l-103.66-103.88h329.32c14.85,0,26.58-11.62,26.58-26.48v-22.81c0-14.85-11.73-27.65-26.58-27.65H134.93l104.83-104.46c5.07-5.07,7.86-11.65,7.86-18.86s-2.79-13.88-7.86-18.95l-16.13-16.08c-5.07-5.07-11.83-7.84-19.04-7.84s-13.97,2.8-19.04,7.87L7.86,226.9C2.78,231.99-.02,238.78,0,246c-.02,7.24,2.78,14.04,7.86,19.12Z"/></svg>';
  b.onclick = function() { if (window._shoppingMode) { toggleShoppingMode(); } else { location.href='app.html'; } };
};

window._catEmojis = [
  '🛒','🍎','🍊','🍋','🍇','🍓','🫐','🍒','🍑','🥝','🍅','🥑',
  '🥦','🥕','🌽','🧅','🧄','🥔','🍆','🥒','🌶️','🫛',
  '🥩','🍗','🐟','🥚','🧀','🥛','🧈','🍞','🥐','🥫','🧆',
  '🍝','🍜','🍕','🍔','🌮','🥗','🍣','🍱','🧃','🥤','🍵','☕','🧋',
  '🍷','🍺','🥃','🧊','🫙','🧂','🍯',
  '🏠','🛁','🚿','🪥','🧴','🧼','🫧','🧽','🧹','🧺','🧻','🪣',
  '💡','🔌','🛋️','🪑','🛏️','🪴','🖼️','🧸',
  '💊','💉','🩺','🩹','🌡️',
  '👕','👗','👟','👜','🧢','🧣','🧤','👓',
  '📱','💻','🎮','🖨️','📷','🎧','🔋',
  '📚','✏️','📝','🗂️','🖊️',
  '🔧','🪛','🔨','🪚','🔑','🪝',
  '🚗','⛽','🚲','✈️','🛺',
  '🐕','🐈','🐠','🌱','🌸','🌿','🌙','⭐','🌈',
  '💰','🏷️','🎁','🎵','🏃','🏋️','⚽','🎨','🎂','🕯️'
];
window._selectedCatEmoji = '';
window._catPickerItemId = null;
window.openCatPicker = function(itemId) {
  window._catPickerItemId = itemId;
  // Show grid, hide form
  var grid = document.getElementById('cat-picker-grid');
  var form = document.getElementById('cat-picker-form');
  var title = document.getElementById('cat-picker-title');
  var footer = document.getElementById('cat-picker-footer');
  grid.style.display = 'grid';
  form.style.display = 'none';
  title.textContent = t('category');
  footer.innerHTML = '<button class="btn btn-outline btn-full" onclick="document.getElementById(\'modal-cat-picker\').classList.add(\'hidden\')">' + t('cancel') + '</button>';

  var item = window.items.find(function(i) { return i.id === itemId; });
  grid.innerHTML = window.categories.map(function(c) {
    var name = currentLang === 'es' ? c.name_es : c.name_en;
    var sel = item && item.category_id === c.id;
    return '<button onclick="changeCatQuick(\'' + c.id + '\',this)" style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 4px;border-radius:10px;border:2px solid ' + (sel ? 'var(--brand)' : 'transparent') + ';background:' + (sel ? 'rgba(52,176,128,0.12)' : 'var(--bg-2)') + ';cursor:pointer;width:100%;box-sizing:border-box">' +
      '<span style="font-size:1.7rem;line-height:1">' + c.icon + '</span>' +
      '<span style="font-size:10px;font-weight:600;color:var(--text-3);text-align:center;line-height:1.2;word-break:break-word">' + esc(name) + '</span>' +
      '</button>';
  }).join('') +
  '<button onclick="openNewCatForm()" style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 4px;border-radius:10px;border:2px dashed var(--border-2);background:transparent;cursor:pointer;width:100%;box-sizing:border-box">' +
    '<span style="font-size:1.7rem;line-height:1;color:var(--text-3)">+</span>' +
    '<span style="font-size:10px;font-weight:600;color:var(--text-3);text-align:center;line-height:1.2">' + t('addCategory') + '</span>' +
  '</button>';
  document.getElementById('modal-cat-picker').classList.remove('hidden');
};

window.openNewCatForm = function() {
  document.getElementById('cat-picker-grid').style.display = 'none';
  document.getElementById('cat-picker-form').style.display = 'block';
  document.getElementById('cat-picker-title').textContent = t('addCategory');
  document.getElementById('cat-picker-footer').innerHTML =
    '<button class="btn btn-outline" onclick="openCatPicker(window._catPickerItemId)">' + t('back') + '</button>' +
    '<button class="btn btn-brand" id="btn-save-new-cat" onclick="saveNewCat()">' + t('save') + '</button>';
  window._selectedCatEmoji = '';
  document.getElementById('new-cat-name').value = '';
  // Populate emoji grid
  document.getElementById('emoji-grid').innerHTML = window._catEmojis.map(function(em) {
    return '<button data-emoji="' + em + '" onclick="selectCatEmoji(this)" style="font-size:1.45rem;padding:5px;border-radius:8px;border:2px solid transparent;background:transparent;cursor:pointer;line-height:1;aspect-ratio:1;display:flex;align-items:center;justify-content:center">' + em + '</button>';
  }).join('');
  setTimeout(function() { document.getElementById('new-cat-name').focus(); }, 80);
};

window.selectCatEmoji = function(btn) {
  window._selectedCatEmoji = btn.dataset.emoji;
  document.querySelectorAll('#emoji-grid button').forEach(function(b) {
    b.style.border = '2px solid transparent';
    b.style.background = 'transparent';
  });
  btn.style.border = '2px solid var(--brand)';
  btn.style.background = 'rgba(52,176,128,0.18)';
};

window.saveNewCat = function() {
  var icon = window._selectedCatEmoji;
  var name = document.getElementById('new-cat-name').value.trim();
  if (!icon || !name) return;
  var btn = document.getElementById('btn-save-new-cat');
  if (btn) { btn.disabled = true; btn.textContent = t('saving'); }
  db.from('categories').insert({ icon: icon, name_es: name, name_en: name }).select().single().then(function(res) {
    if (btn) { btn.disabled = false; btn.textContent = t('save'); }
    if (res.error) { showToast(t('errorGeneral'), 'error'); return; }
    window.categories.unshift(res.data);
    window.renderCatOptions('item-cat');
    window.renderCatOptions('edit-cat');
    window.changeCatQuick(res.data.id, null);
  });
};

window.changeCatQuick = function(catId, btn) {
  if (btn) { btn.classList.add('cat-btn-tapping'); }
  var cat = window.categories.find(function(c) { return c.id === catId; });
  var catObj = cat ? { name_es: cat.name_es, name_en: cat.name_en, icon: cat.icon } : null;
  var ids = (window._catPickerMultiIds && window._catPickerMultiIds.length > 0)
    ? window._catPickerMultiIds.slice()
    : (window._catPickerItemId ? [window._catPickerItemId] : []);
  window._catPickerMultiIds = null;
  ids.forEach(function(id) {
    var item = window.items.find(function(i) { return i.id === id; });
    if (!item) return;
    item.category_id = catId;
    item.categories = catObj;
  });
  setTimeout(function() {
    document.getElementById('modal-cat-picker').classList.add('hidden');
    window.clearSelection();
    window.renderPage();
    window._localChange = true;
    clearTimeout(window._localChangeTimer);
    Promise.all(ids.map(function(id) {
      return db.from('items').update({ category_id: catId }).eq('id', id);
    })).then(function() {
      window._localChange = false;
      clearTimeout(window._localChangeTimer);
    });
    window._localChangeTimer = setTimeout(function() { window._localChange = false; }, 4000);
  }, 240);
};

window._lastEditId = null;
window.editSelected = function() {
  if (window.selectedItemIds.length > 1) {
    // Multi-select: open cat picker to change category for all selected items
    window._catPickerMultiIds = window.selectedItemIds.slice();
    window._catPickerItemId = null;
    window.openCatPicker(null);
    return;
  }
  var item = window.items.find(function(i) { return i.id === window.selectedItemId; }); if (!item) return;
  window._lastEditId = window.selectedItemId;
  document.getElementById('edit-name').value = item.name; document.getElementById('edit-qty').value = item.quantity || '';
  window.renderCatOptions('edit-cat', item.category_id);
  document.getElementById('modal-edit').classList.remove('hidden'); window.clearSelection();
};
window.saveEdit = function() {
  var name = document.getElementById('edit-name').value.trim(); if (!name) return;
  var qty = document.getElementById('edit-qty').value.trim() || null;
  var catId = document.getElementById('edit-cat').value || null;
  var id = window._lastEditId;
  // Actualizar local inmediatamente
  var item = window.items.find(function(i) { return i.id === id; });
  if (item) {
    item.name = name;
    item.quantity = qty;
    item.category_id = catId;
    var cat = window.categories.find(function(c) { return c.id === catId; });
    item.categories = cat ? { name_es: cat.name_es, name_en: cat.name_en, icon: cat.icon } : null;
    window._localChange = true;
    window.renderPage();
  }
  document.getElementById('modal-edit').classList.add('hidden');
  // Enviar a DB
  db.from('items').update({ name: name, quantity: qty, category_id: catId }).eq('id', id).then(function() {
    window._localChange = false;
  });
};

window.openCopyModal = function() {
  window._lastEditId = window.selectedItemId;
  db.from('list_members').select('list_id').eq('user_id', window.currentUser.id).then(function(res) {
    var ids = (res.data||[]).map(function(m){ return m.list_id; }).filter(function(id){ return id !== LIST_ID; });
    var sel = document.getElementById('copy-list-select');
    if (!ids.length) { sel.innerHTML = '<option>' + t('noMembers') + '</option>'; }
    else { db.from('lists').select('id, name').in('id', ids).is('deleted_at', null).then(function(r) { sel.innerHTML = (r.data||[]).map(function(l){ return '<option value="' + l.id + '">' + esc(l.name) + '</option>'; }).join(''); }); }
    document.getElementById('modal-copy').classList.remove('hidden'); window.clearSelection();
  });
};
window.confirmCopy = function() {
  var targetId = document.getElementById('copy-list-select').value; if (!targetId) return;
  if (window._pendingCopyIds && window._pendingCopyIds.length > 1) {
    var ids = window._pendingCopyIds; window._pendingCopyIds = null;
    var chain = Promise.resolve();
    ids.forEach(function(id) { var item = window.items.find(function(i){ return i.id === id; }); if (!item) return; chain = chain.then(function() { return db.from('items').insert({ list_id: targetId, name: item.name, quantity: item.quantity, category_id: item.category_id, added_by: window.currentUser.id, item_state: 'unchecked' }); }); });
    chain.then(function() { document.getElementById('modal-copy').classList.add('hidden'); showToast('✓', 'success'); }); return;
  }
  window._pendingCopyIds = null;
  var item = window.items.find(function(i){ return i.id === window._lastEditId; }); if (!item) return;
  db.from('items').insert({ list_id: targetId, name: item.name, quantity: item.quantity, category_id: item.category_id, added_by: window.currentUser.id, item_state: 'unchecked' }).then(function() { document.getElementById('modal-copy').classList.add('hidden'); showToast('✓', 'success'); });
};

window.deleteSelected = function() { window._lastEditId = window.selectedItemId; document.getElementById('modal-del-item').classList.remove('hidden'); window.clearSelection(); };
window.deleteSelectedItems = function() {
  if (window.selectedItemIds.length === 0) return;
  if (window.selectedItemIds.length === 1) { window._lastEditId = window.selectedItemIds[0]; window.clearSelection(); document.getElementById('modal-del-item').classList.remove('hidden'); return; }
  var ids = window.selectedItemIds.slice(); window.clearSelection(); window._localChange = true;
  var chain = Promise.resolve();
  ids.forEach(function(id) { chain = chain.then(function() { return db.from('items').delete().eq('id', id); }); });
  chain.then(function() { window._localChange = false; });
};
window.copySelectedItems = function() {
  if (window.selectedItemIds.length === 0) return;
  if (window.selectedItemIds.length === 1) { window._lastEditId = window.selectedItemIds[0]; window.clearSelection(); window.openCopyModal(); return; }
  var ids = window.selectedItemIds.slice(); window._pendingCopyIds = ids; window.clearSelection();
  db.from('list_members').select('list_id').eq('user_id', window.currentUser.id).then(function(res) {
    var listIds = (res.data||[]).map(function(m){ return m.list_id; }).filter(function(id){ return id !== LIST_ID; });
    var sel = document.getElementById('copy-list-select');
    if (!listIds.length) { sel.innerHTML = '<option>' + t('noMembers') + '</option>'; }
    else { db.from('lists').select('id, name').in('id', listIds).is('deleted_at', null).then(function(r) { sel.innerHTML = (r.data||[]).map(function(l){ return '<option value="' + l.id + '">' + l.name + '</option>'; }).join(''); }); }
    document.getElementById('modal-copy').classList.remove('hidden');
  });
};
window.confirmDeleteItem = function() { db.from('items').delete().eq('id', window._lastEditId).then(function() { document.getElementById('modal-del-item').classList.add('hidden'); }); };

window.clearCompleted = function() {
  var completedIds = window.items
    .filter(function(i) { return i.item_state === 'completed'; })
    .map(function(i) { return i.id; });
  if (!completedIds.length) return;
  // Actualizar local inmediatamente
  window.items.forEach(function(i) { if (i.item_state === 'completed') i.item_state = 'unchecked'; });
  window.renderPage();
  window._localChange = true;
  var clearPayload = { item_state: 'unchecked', is_checked: false, checked_by: null, checked_at: null };
  db.from('items')
    .update(clearPayload)
    .eq('list_id', LIST_ID)
    .eq('item_state', 'completed')
    .then(function(res) {
      window._localChange = false;
      if (res.error) console.error('clearCompleted error:', res.error);
    });
};

window.doClearAll = function() {
  if (!window.items.length) return;
  // Capturar IDs ANTES de mutar el estado local
  var checkedIds = window.items.filter(function(i) { return i.item_state === 'checked'; }).map(function(i) { return i.id; });
  var completedIds = window.items.filter(function(i) { return i.item_state === 'completed'; }).map(function(i) { return i.id; });
  // Actualizar local inmediatamente
  window.items.forEach(function(i) { i.item_state = 'unchecked'; i.is_checked = false; });
  window.renderPage();
  document.getElementById('modal-clear-all').classList.add('hidden');
  window._localChange = true;
  var allPayload = { item_state: 'unchecked', is_checked: false, checked_by: null, checked_at: null };
  Promise.all([
    checkedIds.length
      ? db.from('items').update(allPayload).eq('list_id', LIST_ID).eq('item_state', 'checked')
      : Promise.resolve({ error: null }),
    completedIds.length
      ? db.from('items').update(allPayload).eq('list_id', LIST_ID).eq('item_state', 'completed')
      : Promise.resolve({ error: null })
  ]).then(function(results) {
    window._localChange = false;
    results.forEach(function(r) { if (r.error) console.error('doClearAll error:', r.error); });
  });
};

window.openInviteModal = function() { document.getElementById('inv-email').value = ''; document.getElementById('modal-invite').classList.remove('hidden'); setTimeout(function(){ document.getElementById('inv-email').focus(); }, 100); applyTranslations(); };
window.sendInvite = function() {
  var email = document.getElementById('inv-email').value.trim().toLowerCase(); if (!email || !email.includes('@')) return;
  var btn = document.getElementById('btn-inv'); var span = btn.querySelector('span'); btn.disabled = true; span.textContent = t('sending');
  db.from('invitations').insert({ list_id: LIST_ID, invited_by: window.currentUser.id, invited_email: email }).then(function(res) {
    btn.disabled = false; span.textContent = t('sendInvite');
    if (res.error) { showToast(t('errorGeneral'), 'error'); return; }
    document.getElementById('modal-invite').classList.add('hidden'); showToast(t('inviteSent'), 'success');
  });
};

// SOFT DELETE — manda a papelera
window.confirmDeleteList = function() {
  if (!confirm(currentLang==='es'?'¿Mover esta lista a la papelera?':'Move this list to trash?')) return;
  db.from('lists').update({ deleted_at: new Date().toISOString(), deleted_by: window.currentUser.id }).eq('id', LIST_ID).then(function() {
    showToast(t('sentToTrash'), 'success');
    setTimeout(function() { location.href='app.html'; }, 800);
  });
};
window.confirmLeaveList = function() {
  if (!confirm(currentLang==='es'?'¿Dejar esta lista?':'Leave this list?')) return;
  db.from('list_members').delete().eq('list_id', LIST_ID).eq('user_id', window.currentUser.id).then(function() { location.href='app.html'; });
};

window.openMembersModal = function() {
  var modal = document.getElementById('modal-members'); var list = document.getElementById('modal-members-list');
  if (!modal || !list) return;
  var html = window.members.map(function(m) {
    var name = (m.profiles && m.profiles.display_name) || '?'; var email = (m.profiles && m.profiles.email) || '';
    var isMe = m.user_id === window.currentUser.id;
    var COLORS = ['#16a34a','#0284c7','#7c3aed','#db2777','#ea580c','#0891b2','#65a30d','#d97706'];
    var h = 0; for (var i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h<<5)-h);
    var color = COLORS[Math.abs(h) % COLORS.length];
    var initials = name.trim().split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2)||'?';
    var url = m.profiles && m.profiles.avatar_url;
    var avatarHtml = url
      ? '<div class="avatar" style="background:' + color + ';flex-shrink:0;padding:0;overflow:hidden"><img src="' + url + '" width="100%" height="100%" style="object-fit:cover;border-radius:50%;display:block"></div>'
      : '<div class="avatar" style="background:' + color + ';flex-shrink:0">' + initials + '</div>';
    return '<div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--border)">' +
      avatarHtml +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:700;color:var(--text-1);font-size:var(--fs-base)">' + name + (isMe ? ' <span style="font-size:var(--fs-xs);color:var(--brand);font-weight:600">(' + t('you') + ')</span>' : '') + '</div>' +
        '<div style="font-size:var(--fs-sm);color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + email + '</div>' +
      '</div></div>';
  }).join('');
  list.innerHTML = html || '<p style="padding:20px;text-align:center;color:var(--text-3)">' + t('noMembers') + '</p>';
  modal.classList.remove('hidden');
};

window.renderCatOptions = function(selectId, selectedId) {
  var sel = document.getElementById(selectId); if (!sel) return;
  sel.innerHTML = window.categories.map(function(c) {
    var name = currentLang === 'es' ? c.name_es : c.name_en;
    return '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + c.icon + ' ' + name + '</option>';
  }).join('') + '<option value="">' + t('category') + '...</option>';
};

function reloadItemsFromDB() {
  db.from('items').select('*, categories(name_es, name_en, icon)').eq('list_id', LIST_ID).order('created_at', { ascending: true }).then(function(r) {
    if (!r.data) return;
    // Merge con cambios locales pendientes (offline sync)
    var merged = mergeWithLocal(r.data);
    var changed = JSON.stringify(merged.map(function(i){ return i.id + i.item_state; })) !== JSON.stringify(window.items.map(function(i){ return i.id + i.item_state; }));
    if (changed) { window.items = merged; window.renderPage(); }
    // Si hay ops pendientes, intentar enviarlas
    if (getQueue().length && window._isOnline) flushQueue();
  });
}

window.subscribeRealtime = function() {
  db.channel('list-items:' + LIST_ID)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: 'list_id=eq.' + LIST_ID }, function() { if (window._localChange) return; reloadItemsFromDB(); })
    .subscribe();
  window._pollInterval = setInterval(function() { if (window._localChange) return; reloadItemsFromDB(); }, 5000);
};

window.addEventListener('beforeunload', function() { clearInterval(window._pollInterval); });
document.addEventListener('langchange', function() { window.renderCatOptions('item-cat'); window.renderCatOptions('edit-cat'); window.renderPage(); applyTranslations(); });
