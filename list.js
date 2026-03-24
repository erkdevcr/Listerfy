// list.js — Listerfy list view

var LIST_ID = new URLSearchParams(location.search).get('id');
window.currentUser = null;
window.categories = [];
window.members = [];
window.items = [];
window.listData = null;
window.selectedItemId = null;
window.longPressTimer = null;

var AVATAR_COLORS = ['#16a34a','#0284c7','#7c3aed','#db2777','#ea580c','#0891b2','#65a30d','#d97706'];
function avatarColor(s) { s=s||''; var h=0; for(var i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }
function avatarInitials(n) { n=n||''; return n.trim().split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2)||'?'; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Close add-panel when clicking outside
document.addEventListener('click', function(e) {
  var panel = document.getElementById('add-panel');
  var pill  = document.getElementById('add-pill');
  if (!panel || panel.classList.contains('hidden')) return;
  if (!panel.contains(e.target) && !pill.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

// Auto-start
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
    db.from('lists').select('*').eq('id', LIST_ID).single(),
    db.from('categories').select('*').order('is_default', { ascending: false }),
    db.from('list_members').select('user_id, role, profiles(display_name, email)').eq('list_id', LIST_ID),
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

window.renderTopbar = function() {
  document.getElementById('list-title').textContent = window.listData.name;
  var isOwner = window.listData.owner_id === window.currentUser.id;
  var avatars = window.members.slice(0,5).map(function(m) {
    var name = (m.profiles && m.profiles.display_name) || '?';
    return '<div class="avatar avatar-sm" style="background:' + avatarColor(name) + '">' + avatarInitials(name) + '</div>';
  }).join('');
  document.getElementById('topbar-actions').innerHTML =
    '<div class="avatar-stack">' + avatars + '</div>' +
    '<div class="dropdown-wrap" style="position:relative">' +
      '<button class="btn btn-ghost btn-icon" onclick="toggleListMenu()">⋮</button>' +
      '<div class="dropdown-menu hidden" id="list-menu" style="right:0;top:40px">' +
        '<button class="dropdown-item" onclick="openInviteModal()">👥 ' + t('share') + '</button>' +
        (isOwner ? '<button class="dropdown-item danger" onclick="confirmDeleteList()">🗑 ' + t('deleteList') + '</button>'
                 : '<button class="dropdown-item danger" onclick="confirmLeaveList()">🚪 ' + t('leaveList') + '</button>') +
      '</div>' +
    '</div>';
};

window.toggleListMenu = function() {
  var m = document.getElementById('list-menu');
  m.classList.toggle('hidden');
  if (!m.classList.contains('hidden')) {
    setTimeout(function() {
      document.addEventListener('click', function h() { m.classList.add('hidden'); document.removeEventListener('click', h); });
    }, 0);
  }
};

window.renderPage = function() {
  var unchecked = window.items.filter(function(i) { return (i.item_state||'unchecked') === 'unchecked'; });
  var below = window.items.filter(function(i) { return i.item_state === 'checked' || i.item_state === 'completed'; });
  var completed = window.items.filter(function(i) { return i.item_state === 'completed'; });
  var pct = window.items.length > 0 ? Math.round((below.length / window.items.length) * 100) : 0;
  var prog = document.getElementById('top-progress');
  if (prog) prog.style.width = pct + '%';

  var html = '';
  if (window.items.length === 0) {
    html = '<div class="empty-state"><div class="empty-icon">🛒</div><h3>' + t('noItems') + '</h3><p>' + t('noItemsHint') + '</p></div>';
  } else {
    html += unchecked.map(function(i) { return window.renderItem(i); }).join('');
    if (below.length > 0) {
      var label = '(' + below.length + ') ' + (window.currentLang === 'es' ? 'Completados' : 'Checked');
      html += '<div style="padding:10px 16px 8px;background:var(--bg-3);border-top:1px solid var(--border-2);border-bottom:1px solid var(--border-2);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3)">' + label + '</div>';
      html += below.map(function(i) { return window.renderItem(i); }).join('');
    }
    // Only show buttons if there are items below
    if (below.length > 0) {
      html += '<div style="display:flex;gap:10px;padding:16px;margin-top:8px">';
      if (completed.length > 0) {
        html += '<button class="btn btn-outline btn-full" onclick="clearCompleted()">' + t('clearCompleted') + '</button>';
      }
      html += '<button class="btn btn-danger btn-full" onclick="document.getElementById(\'modal-clear-all\').classList.remove(\'hidden\')">' + t('clearAll') + '</button>';
      html += '</div>';
    }
  }
  var el = document.getElementById('page-content');
  if (el) el.innerHTML = html;
};

window.renderItem = function(item) {
  var state = item.item_state || 'unchecked';
  var catIcon = (item.categories && item.categories.icon) ? item.categories.icon : '🛒';
  var circleClass = (state === 'checked' || state === 'completed') ? 'state-checked' : '';
  var nameStyle = 'cursor:pointer;';
  if (state === 'completed') nameStyle += 'text-decoration:line-through;text-decoration-color:#ef4444;text-decoration-thickness:2px;color:var(--completed-text);';
  return '<div class="item-row" id="row-' + item.id + '"' +
    ' ontouchstart="startLongPress(\'' + item.id + '\',event)" ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()"' +
    ' onmousedown="startLongPress(\'' + item.id + '\',event)" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()">' +
    '<div class="item-circle ' + circleClass + '" onclick="cycleState(\'' + item.id + '\')"></div>' +
    '<span class="item-name" style="' + nameStyle + '" onclick="cycleState(\'' + item.id + '\')">' + esc(item.name) +
      (item.quantity ? ' <span style="color:var(--text-3);font-size:var(--fs-xs)">' + esc(item.quantity) + '</span>' : '') +
    '</span>' +
    '<div class="item-cat-icon">' + catIcon + '</div>' +
  '</div>';
};

// unchecked(azul) -> checked(verde) -> completed(tachado rojo) -> checked(verde)
// Track last local change to avoid double-rendering from realtime
window._localChange = false;

window.cycleState = function(id) {
  var item = window.items.find(function(i) { return i.id === id; });
  if (!item) return;
  var state = item.item_state || 'unchecked';
  var next = state === 'unchecked' ? 'checked' : (state === 'checked' ? 'completed' : 'checked');
  item.item_state = next;
  // Block realtime echo for 2 seconds max to avoid self-reset
  window._localChange = true;
  clearTimeout(window._localChangeTimer);
  window._localChangeTimer = setTimeout(function() { window._localChange = false; }, 2000);
  window.renderPage();
  // Save to DB
  db.from('items').update({
    item_state: next,
    is_checked: next !== 'unchecked',
    checked_by: next !== 'unchecked' ? window.currentUser.id : null,
    checked_at: next !== 'unchecked' ? new Date().toISOString() : null
  }).eq('id', id).then(function() {
    window._localChange = false;
    clearTimeout(window._localChangeTimer);
  });
};

window.focusAddInput = function() { document.getElementById('add-panel').classList.remove('hidden'); setTimeout(function(){ document.getElementById('item-input').focus(); }, 50); };
window.toggleAddPanel = function() { document.getElementById('add-panel').classList.toggle('hidden'); if (!document.getElementById('add-panel').classList.contains('hidden')) setTimeout(function(){ document.getElementById('item-input').focus(); }, 50); };

window.addItem = function() {
  var name = document.getElementById('item-input').value.trim(); if (!name) return;
  var catId = document.getElementById('item-cat').value || null;
  var qty = document.getElementById('item-qty').value.trim() || null;
  var btn = document.getElementById('btn-add-item');
  btn.disabled = true; btn.textContent = t('adding');
  db.from('items').insert({ list_id: LIST_ID, name: name, quantity: qty, category_id: catId, added_by: window.currentUser.id, item_state: 'unchecked' }).then(function(res) {
    btn.disabled = false; btn.textContent = t('add');
    if (res.error) { showToast(t('errorGeneral'), 'error'); return; }
    document.getElementById('item-input').value = '';
    document.getElementById('item-qty').value = '';
    document.getElementById('item-input').focus();
  });
};

window.startLongPress = function(id) { window.longPressTimer = setTimeout(function() { window.selectItem(id); }, 600); };
window.cancelLongPress = function() { clearTimeout(window.longPressTimer); };

window.selectItem = function(id) {
  window.selectedItemId = id;
  document.getElementById('action-bar').classList.remove('hidden');
  document.getElementById('add-pill').classList.add('hidden');
  document.querySelectorAll('.item-row').forEach(function(r) { r.classList.remove('selected'); });
  var row = document.getElementById('row-' + id); if (row) row.classList.add('selected');
  var b = document.getElementById('back-btn'); b.textContent = '✕'; b.onclick = window.clearSelection;
};

window.clearSelection = function() {
  window.selectedItemId = null;
  document.getElementById('action-bar').classList.add('hidden');
  document.getElementById('add-pill').classList.remove('hidden');
  document.querySelectorAll('.item-row').forEach(function(r) { r.classList.remove('selected'); });
  var b = document.getElementById('back-btn'); b.textContent = '←'; b.onclick = function() { location.href='app.html'; };
};

window._lastEditId = null;
window.editSelected = function() {
  var item = window.items.find(function(i) { return i.id === window.selectedItemId; }); if (!item) return;
  window._lastEditId = window.selectedItemId;
  document.getElementById('edit-name').value = item.name;
  document.getElementById('edit-qty').value = item.quantity || '';
  window.renderCatOptions('edit-cat', item.category_id);
  document.getElementById('modal-edit').classList.remove('hidden');
  window.clearSelection();
};
window.saveEdit = function() {
  var name = document.getElementById('edit-name').value.trim(); if (!name) return;
  var qty = document.getElementById('edit-qty').value.trim() || null;
  var catId = document.getElementById('edit-cat').value || null;
  db.from('items').update({ name: name, quantity: qty, category_id: catId }).eq('id', window._lastEditId).then(function() {
    document.getElementById('modal-edit').classList.add('hidden');
  });
};

window.openCopyModal = function() {
  window._lastEditId = window.selectedItemId;
  db.from('list_members').select('list_id').eq('user_id', window.currentUser.id).then(function(res) {
    var ids = (res.data||[]).map(function(m){ return m.list_id; }).filter(function(id){ return id !== LIST_ID; });
    var sel = document.getElementById('copy-list-select');
    if (!ids.length) { sel.innerHTML = '<option>' + (currentLang==='es'?'No hay otras listas':'No other lists') + '</option>'; }
    else { db.from('lists').select('id, name').in('id', ids).then(function(r) { sel.innerHTML = (r.data||[]).map(function(l){ return '<option value="' + l.id + '">' + esc(l.name) + '</option>'; }).join(''); }); }
    document.getElementById('modal-copy').classList.remove('hidden');
    window.clearSelection();
  });
};
window.confirmCopy = function() {
  var targetId = document.getElementById('copy-list-select').value; if (!targetId) return;
  var item = window.items.find(function(i){ return i.id === window._lastEditId; }); if (!item) return;
  db.from('items').insert({ list_id: targetId, name: item.name, quantity: item.quantity, category_id: item.category_id, added_by: window.currentUser.id, item_state: 'unchecked' }).then(function() {
    document.getElementById('modal-copy').classList.add('hidden');
    showToast('✓', 'success');
  });
};

window.deleteSelected = function() { window._lastEditId = window.selectedItemId; document.getElementById('modal-del-item').classList.remove('hidden'); window.clearSelection(); };
window.confirmDeleteItem = function() { db.from('items').delete().eq('id', window._lastEditId).then(function() { document.getElementById('modal-del-item').classList.add('hidden'); }); };

window.clearCompleted = function() {
  var completedIds = window.items
    .filter(function(i) { return i.item_state === 'completed'; })
    .map(function(i) { return i.id; });
  if (!completedIds.length) return;

  // Update locally
  window.items.forEach(function(i) {
    if (i.item_state === 'completed') i.item_state = 'unchecked';
  });
  window.renderPage();

  // Block polling during updates to prevent revert, then update sequentially
  window._localChange = true;
  var chain = Promise.resolve();
  completedIds.forEach(function(id) {
    chain = chain.then(function() {
      return db.from('items')
        .update({ item_state: 'unchecked', is_checked: false, checked_by: null, checked_at: null })
        .eq('id', id);
    });
  });
  chain.then(function() {
    // All done — release lock so realtime/polling can resume
    window._localChange = false;
  });
};
window.doClearAll = function() {
  var allIds = window.items.map(function(i) { return i.id; });
  window.items.forEach(function(i) { i.item_state = 'unchecked'; });
  window.renderPage();
  document.getElementById('modal-clear-all').classList.add('hidden');
  // Block polling, update sequentially, release
  window._localChange = true;
  var chain = Promise.resolve();
  allIds.forEach(function(id) {
    chain = chain.then(function() {
      return db.from('items')
        .update({ item_state: 'unchecked', is_checked: false, checked_by: null, checked_at: null })
        .eq('id', id);
    });
  });
  chain.then(function() {
    window._localChange = false;
  });
};

window.openInviteModal = function() { document.getElementById('inv-email').value = ''; document.getElementById('modal-invite').classList.remove('hidden'); setTimeout(function(){ document.getElementById('inv-email').focus(); }, 100); applyTranslations(); };
window.sendInvite = function() {
  var email = document.getElementById('inv-email').value.trim().toLowerCase();
  if (!email || !email.includes('@')) return;
  var btn = document.getElementById('btn-inv'); var span = btn.querySelector('span');
  btn.disabled = true; span.textContent = t('sending');
  db.from('invitations').insert({ list_id: LIST_ID, invited_by: window.currentUser.id, invited_email: email }).then(function(res) {
    btn.disabled = false; span.textContent = t('sendInvite');
    if (res.error) { showToast(t('errorGeneral'), 'error'); return; }
    document.getElementById('modal-invite').classList.add('hidden');
    showToast(t('inviteSent'), 'success');
  });
};

window.confirmDeleteList = function() { if (!confirm(currentLang==='es'?'¿Eliminar esta lista?':'Delete this list?')) return; db.from('lists').delete().eq('id', LIST_ID).then(function() { location.href='app.html'; }); };
window.confirmLeaveList = function() { if (!confirm(currentLang==='es'?'¿Dejar esta lista?':'Leave this list?')) return; db.from('list_members').delete().eq('list_id', LIST_ID).eq('user_id', window.currentUser.id).then(function() { location.href='app.html'; }); };

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
    // Only re-render if something actually changed
    var changed = JSON.stringify(r.data.map(function(i){ return i.id + i.item_state; })) !==
                  JSON.stringify(window.items.map(function(i){ return i.id + i.item_state; }));
    if (changed) {
      window.items = r.data;
      window.renderPage();
    }
  });
}

window.subscribeRealtime = function() {
  // Realtime — fires instantly when another user makes a change
  db.channel('list-items:' + LIST_ID)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: 'list_id=eq.' + LIST_ID }, function() {
      if (window._localChange) return;
      reloadItemsFromDB();
    })
    .subscribe();

  // Polling fallback — scans every 5 seconds to catch any missed Realtime events
  window._pollInterval = setInterval(function() {
    if (window._localChange) return;
    reloadItemsFromDB();
  }, 5000);
};

// Stop polling when user leaves page
window.addEventListener('beforeunload', function() {
  clearInterval(window._pollInterval);
});

document.addEventListener('langchange', function() { window.renderCatOptions('item-cat'); window.renderCatOptions('edit-cat'); window.renderPage(); applyTranslations(); });
