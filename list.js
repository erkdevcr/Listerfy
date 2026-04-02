// list.js — Listerfy list view
(function() {
  var s = document.createElement('style');
  s.textContent = [
    '@keyframes item-tap-glow {',
    '  0%   { background: rgba(52,176,128,0);    box-shadow: inset 0 0 0 0px rgba(52,176,128,0); }',
    '  40%  { background: rgba(52,176,128,0.13); box-shadow: inset 0 0 0 2px rgba(52,176,128,0.35); }',
    '  100% { background: rgba(52,176,128,0);    box-shadow: inset 0 0 0 0px rgba(52,176,128,0); }',
    '}',
    '@keyframes item-tap-glow-red {',
    '  0%   { background: rgba(239,68,68,0);    box-shadow: inset 0 0 0 0px rgba(239,68,68,0); }',
    '  40%  { background: rgba(239,68,68,0.11); box-shadow: inset 0 0 0 2px rgba(239,68,68,0.28); }',
    '  100% { background: rgba(239,68,68,0);    box-shadow: inset 0 0 0 0px rgba(239,68,68,0); }',
    '}',
    '.item-row.item-tapping {',
    '  animation: item-tap-glow 0.22s ease-out forwards;',
    '  border-radius: 10px;',
    '}',
    '.item-row.item-tapping-red {',
    '  animation: item-tap-glow-red 0.22s ease-out forwards;',
    '  border-radius: 10px;',
    '}'
  ].join('');
  document.head.appendChild(s);
})();

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
  var avatars = window.members.filter(function(m) { return m.user_id !== window.currentUser.id; }).slice(0,5).map(function(m) {
    var name = (m.profiles && m.profiles.display_name) || '?';
    return '<div class="avatar avatar-sm" style="background:' + avatarColor(name) + '">' + avatarInitials(name) + '</div>';
  }).join('');
  document.getElementById('topbar-actions').innerHTML =
    '<div class="avatar-stack" onclick="openMembersModal()" style="cursor:pointer">' + avatars + '</div>' +
    '<div class="dropdown-wrap" style="position:relative">' +
      '<button class="btn btn-ghost btn-icon" onclick="toggleListMenu()">⋮</button>' +
      '<div class="dropdown-menu hidden" id="list-menu" style="right:0;top:40px">' +
        '<button class="dropdown-item" onclick="openInviteModal()"><svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M11 6C12.6569 6 14 4.65685 14 3C14 1.34315 12.6569 0 11 0C9.34315 0 8 1.34315 8 3C8 3.22371 8.02449 3.44169 8.07092 3.65143L4.86861 5.65287C4.35599 5.24423 3.70652 5 3 5C1.34315 5 0 6.34315 0 8C0 9.65685 1.34315 11 3 11C3.70652 11 4.35599 10.7558 4.86861 10.3471L8.07092 12.3486C8.02449 12.5583 8 12.7763 8 13C8 14.6569 9.34315 16 11 16C12.6569 16 14 14.6569 14 13C14 11.3431 12.6569 10 11 10C10.2935 10 9.644 10.2442 9.13139 10.6529L5.92908 8.65143C5.97551 8.44169 6 8.22371 6 8C6 7.77629 5.97551 7.55831 5.92908 7.34857L9.13139 5.34713C9.644 5.75577 10.2935 6 11 6Z" fill="#436e60"/></svg> ' + t('share') + '</button>' +
        (isOwner
          ? '<button class="dropdown-item danger" onclick="confirmDeleteList()"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6M14 10V17M10 10V17" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + t('deleteList') + '</button>'
          : '<button class="dropdown-item danger" onclick="confirmLeaveList()"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15M10 17L15 12M15 12L10 7M15 12H3" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + t('leaveList') + '</button>') +
      '</div>' +
    '</div>';
};

window.toggleListMenu = function() {
  var m = document.getElementById('list-menu'); m.classList.toggle('hidden');
  if (!m.classList.contains('hidden')) {
    setTimeout(function() { document.addEventListener('click', function h() { m.classList.add('hidden'); document.removeEventListener('click', h); }); }, 0);
  }
};

window.renderPage = function() {
  var sortedItems = window.items.slice().sort(function(a, b) { return (a.name||'').localeCompare(b.name||'', undefined, {sensitivity:'base'}); });
  var unchecked = sortedItems.filter(function(i) { return (i.item_state||'unchecked') === 'unchecked'; });
  var below = sortedItems.filter(function(i) { return i.item_state === 'checked' || i.item_state === 'completed'; });
  var completed = sortedItems.filter(function(i) { return i.item_state === 'completed'; });
  var pct = window.items.length > 0 ? Math.round((below.length / window.items.length) * 100) : 0;
  var prog = document.getElementById('top-progress'); if (prog) prog.style.width = pct + '%';
  var html = '';
  if (window.items.length === 0) {
    html = '<div class="empty-state"><div class="empty-icon">🛒</div><h3>' + t('noItems') + '</h3><p>' + t('noItemsHint') + '</p></div>';
  } else {
    html += unchecked.map(function(i) { return window.renderItem(i); }).join('');
    if (below.length > 0) {
      html += '<div style="padding:10px 16px 8px;background:var(--bg-3);border-top:1px solid var(--border-2);border-bottom:1px solid var(--border-2);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3)">(' + below.length + ') ' + t('checkedItems') + '</div>';
      html += below.map(function(i) { return window.renderItem(i); }).join('');
    }
    if (below.length > 0) {
      html += '<div style="display:flex;gap:10px;padding:16px;margin-top:8px">';
      if (completed.length > 0) html += '<button class="btn btn-outline btn-full" onclick="clearCompleted()">' + t('clearCompleted') + '</button>';
      html += '<button class="btn btn-danger btn-full" onclick="document.getElementById(\'modal-clear-all\').classList.remove(\'hidden\')">' + t('clearAll') + '</button>';
      html += '</div>';
    }
  }
  var el = document.getElementById('page-content'); if (el) el.innerHTML = html;
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
    '<div class="item-circle ' + circleClass + '" onclick="if(window._longPressFired){window._longPressFired=false;return;} window._multiSelectMode ? selectItem(\'' + item.id + '\') : cycleState(\'' + item.id + '\')" ></div>' +
    '<span class="item-name" style="' + nameStyle + '" onclick="if(window._longPressFired){window._longPressFired=false;return;} window._multiSelectMode ? selectItem(\'' + item.id + '\') : cycleState(\'' + item.id + '\')">' +
      esc(item.name) + (item.quantity ? ' <span style="color:var(--text-3);font-size:var(--fs-xs)">' + esc(item.quantity) + '</span>' : '') +
    '</span>' +
    '<div class="item-cat-icon">' + catIcon + '</div>' +
    '</div>';
};

window._localChange = false;
window.cycleState = function(id) {
  var item = window.items.find(function(i) { return i.id === id; }); if (!item) return;
  var state = item.item_state || 'unchecked';
  var next = state === 'unchecked' ? 'checked' : (state === 'checked' ? 'completed' : 'checked');

  function applyStateChange() {
    item.item_state = next;
    window._localChange = true; clearTimeout(window._localChangeTimer);
    window._localChangeTimer = setTimeout(function() { window._localChange = false; }, 2000);
    window.renderPage();
    db.from('items').update({
      item_state: next,
      is_checked: next !== 'unchecked',
      checked_by: next !== 'unchecked' ? window.currentUser.id : null,
      checked_at: next !== 'unchecked' ? new Date().toISOString() : null
    }).eq('id', id).then(function() { window._localChange = false; clearTimeout(window._localChangeTimer); });
  }

  // Solo aplicar efecto visual al tocar ítems azules (unchecked → checked)
  if (state === 'unchecked') {
    var row = document.getElementById('row-' + id);
    if (row) {
      row.classList.remove('item-tapping');
      void row.offsetWidth;
      row.classList.add('item-tapping');
    }
    setTimeout(applyStateChange, 200);
  } else if (state === 'checked') {
    var row = document.getElementById('row-' + id);
    if (row) {
      row.classList.remove('item-tapping-red');
      void row.offsetWidth;
      row.classList.add('item-tapping-red');
    }
    setTimeout(applyStateChange, 200);
  } else {
    // completed → checked: glow verde suave
    var row = document.getElementById('row-' + id);
    if (row) {
      row.classList.remove('item-tapping');
      void row.offsetWidth;
      row.classList.add('item-tapping');
    }
    setTimeout(applyStateChange, 200);
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
    document.getElementById('btn-action-edit').style.display = 'block';
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
  else if (count === 1) { info.textContent = '1 ' + t('selected1'); editBtn.style.display = 'block'; }
  else { info.textContent = count + ' ' + t('selectedN'); editBtn.style.display = 'none'; }
};

window.clearSelection = function() {
  window.selectedItemId = null; window.selectedItemIds = []; window._multiSelectMode = false;
  document.getElementById('action-bar').classList.add('hidden');
  document.getElementById('add-pill').classList.remove('hidden');
  document.querySelectorAll('.item-row').forEach(function(r) { r.classList.remove('selected'); });
  var b = document.getElementById('back-btn');
  b.innerHTML = '<svg viewBox="0 0 492 492" xmlns="http://www.w3.org/2000/svg" fill="#436e60" width="26" height="26"><path d="M7.86,265.12l177.68,177.68c5.07,5.07,11.83,7.86,19.04,7.86s13.97-2.79,19.04-7.86l16.13-16.14c5.07-5.06,7.86-11.83,7.86-19.04s-2.79-14.2-7.86-19.26l-103.66-103.88h329.32c14.85,0,26.58-11.62,26.58-26.48v-22.81c0-14.85-11.73-27.65-26.58-27.65H134.93l104.83-104.46c5.07-5.07,7.86-11.65,7.86-18.86s-2.79-13.88-7.86-18.95l-16.13-16.08c-5.07-5.07-11.83-7.84-19.04-7.84s-13.97,2.8-19.04,7.87L7.86,226.9C2.78,231.99-.02,238.78,0,246c-.02,7.24,2.78,14.04,7.86,19.12Z"/></svg>';
  b.onclick = function() { location.href='app.html'; };
};

window._lastEditId = null;
window.editSelected = function() {
  var item = window.items.find(function(i) { return i.id === window.selectedItemId; }); if (!item) return;
  window._lastEditId = window.selectedItemId;
  document.getElementById('edit-name').value = item.name; document.getElementById('edit-qty').value = item.quantity || '';
  window.renderCatOptions('edit-cat', item.category_id);
  document.getElementById('modal-edit').classList.remove('hidden'); window.clearSelection();
};
window.saveEdit = function() {
  var name = document.getElementById('edit-name').value.trim(); if (!name) return;
  var qty = document.getElementById('edit-qty').value.trim() || null; var catId = document.getElementById('edit-cat').value || null;
  db.from('items').update({ name: name, quantity: qty, category_id: catId }).eq('id', window._lastEditId).then(function() { document.getElementById('modal-edit').classList.add('hidden'); });
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
  var hasCompleted = window.items.some(function(i) { return i.item_state === 'completed'; });
  if (!hasCompleted) return;
  // Update local state immediately
  window.items.forEach(function(i) { if (i.item_state === 'completed') i.item_state = 'unchecked'; });
  window.renderPage();
  window._localChange = true;
  // Filter by list_id + item_state — RLS-safe single query
  db.from('items')
    .update({ item_state: 'unchecked', is_checked: false, checked_by: null, checked_at: null })
    .eq('list_id', LIST_ID)
    .eq('item_state', 'completed')
    .then(function(res) {
      window._localChange = false;
      if (res.error) console.error('clearCompleted error:', res.error);
    });
};

window.doClearAll = function() {
  if (!window.items.length) return;
  // Update local state immediately
  window.items.forEach(function(i) { i.item_state = 'unchecked'; i.is_checked = false; });
  window.renderPage();
  document.getElementById('modal-clear-all').classList.add('hidden');
  window._localChange = true;
  // Update checked items first, then completed — both filter by list_id (RLS-safe)
  Promise.all([
    db.from('items')
      .update({ item_state: 'unchecked', is_checked: false, checked_by: null, checked_at: null })
      .eq('list_id', LIST_ID)
      .eq('item_state', 'checked'),
    db.from('items')
      .update({ item_state: 'unchecked', is_checked: false, checked_by: null, checked_at: null })
      .eq('list_id', LIST_ID)
      .eq('item_state', 'completed')
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
    return '<div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--border)">' +
      '<div class="avatar" style="background:' + color + ';flex-shrink:0">' + initials + '</div>' +
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
    var changed = JSON.stringify(r.data.map(function(i){ return i.id + i.item_state; })) !== JSON.stringify(window.items.map(function(i){ return i.id + i.item_state; }));
    if (changed) { window.items = r.data; window.renderPage(); }
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
