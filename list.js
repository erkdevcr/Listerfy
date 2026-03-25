// list.js — Listerfy list view

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

// Close add-panel when clicking outside
document.addEventListener('click', function(e) {
  var panel = document.getElementById('add-panel');
  var pill  = document.getElementById('add-pill');
  if (!panel || panel.classList.contains('hidden')) return;
  if (!panel.contains(e.target) && !pill.contains(e.target)) {
    panel.classList.add('hidden');
    pill.classList.remove('hidden');
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
        '<button class="dropdown-item" onclick="openInviteModal()"><svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M11 6C12.6569 6 14 4.65685 14 3C14 1.34315 12.6569 0 11 0C9.34315 0 8 1.34315 8 3C8 3.22371 8.02449 3.44169 8.07092 3.65143L4.86861 5.65287C4.35599 5.24423 3.70652 5 3 5C1.34315 5 0 6.34315 0 8C0 9.65685 1.34315 11 3 11C3.70652 11 4.35599 10.7558 4.86861 10.3471L8.07092 12.3486C8.02449 12.5583 8 12.7763 8 13C8 14.6569 9.34315 16 11 16C12.6569 16 14 14.6569 14 13C14 11.3431 12.6569 10 11 10C10.2935 10 9.644 10.2442 9.13139 10.6529L5.92908 8.65143C5.97551 8.44169 6 8.22371 6 8C6 7.77629 5.97551 7.55831 5.92908 7.34857L9.13139 5.34713C9.644 5.75577 10.2935 6 11 6Z" fill="#436e60"/></svg> ' + t('share') + '</button>' +
        (isOwner ? '<button class="dropdown-item danger" onclick="confirmDeleteList()"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6M14 10V17M10 10V17" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + t('deleteList') + '</button>'
                 : '<button class="dropdown-item danger" onclick="confirmLeaveList()"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15M10 17L15 12M15 12L10 7M15 12H3" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + t('leaveList') + '</button>') +
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
    '<div class="item-circle ' + circleClass + '" onclick="if(window._longPressFired){window._longPressFired=false;return;} window._multiSelectMode ? selectItem(\'' + item.id + '\') : cycleState(\'' + item.id + '\')" ></div>' +
    '<span class="item-name" style="' + nameStyle + '" onclick="if(window._longPressFired){window._longPressFired=false;return;} window._multiSelectMode ? selectItem(\'' + item.id + '\') : cycleState(\'' + item.id + '\')">' + esc(item.name) +
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

window.focusAddInput = function() {
  document.getElementById('add-panel').classList.remove('hidden');
  document.getElementById('add-pill').classList.add('hidden');
  setTimeout(function(){ document.getElementById('item-input').focus(); }, 50);
};
window.toggleAddPanel = function() {
  var panel = document.getElementById('add-panel');
  var pill  = document.getElementById('add-pill');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    pill.classList.add('hidden');
    setTimeout(function(){ document.getElementById('item-input').focus(); }, 50);
  } else {
    pill.classList.remove('hidden');
  }
};

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

window._longPressFired = false;
window.startLongPress = function(id) {
  window._longPressFired = false;
  window.longPressTimer = setTimeout(function() {
    window._longPressFired = true;
    window.selectItem(id);
  }, 600);
};
window.cancelLongPress = function() { clearTimeout(window.longPressTimer); };

window.selectItem = function(id) {
  // First long press — enter selection mode
  if (window.selectedItemIds.length === 0) {
    document.getElementById('action-bar').classList.remove('hidden');
    document.getElementById('add-pill').classList.add('hidden');
    document.getElementById('btn-action-edit').style.display = 'block';
    document.getElementById('action-bar-info').textContent = '';
    var b = document.getElementById('back-btn'); b.textContent = '✕'; b.onclick = window.clearSelection;
    // Make all item rows tappable to toggle selection
    window._multiSelectMode = true;
  }
  // Toggle selection
  var idx = window.selectedItemIds.indexOf(id);
  if (idx === -1) {
    window.selectedItemIds.push(id);
    var row = document.getElementById('row-' + id);
    if (row) row.classList.add('selected');
  } else {
    window.selectedItemIds.splice(idx, 1);
    var row = document.getElementById('row-' + id);
    if (row) row.classList.remove('selected');
  }
  window.selectedItemId = window.selectedItemIds[0] || null;
  // Update info label and edit button
  var count = window.selectedItemIds.length;
  var info = document.getElementById('action-bar-info');
  var editBtn = document.getElementById('btn-action-edit');
  if (count === 0) {
    window.clearSelection(); return;
  } else if (count === 1) {
    info.textContent = '1 ' + t('selected1');
    editBtn.style.display = 'block';
  } else {
    info.textContent = count + ' ' + t('selectedN');
    editBtn.style.display = 'none';
  }
};

window.clearSelection = function() {
  window.selectedItemId = null;
  window.selectedItemIds = [];
  window._multiSelectMode = false;
  document.getElementById('action-bar').classList.add('hidden');
  document.getElementById('add-pill').classList.remove('hidden');
  document.querySelectorAll('.item-row').forEach(function(r) { r.classList.remove('selected'); });
  var b = document.getElementById('back-btn'); b.textContent = '←'; b.onclick = function() { location.href='app.html'; };
};

// Tap item when in multi-select mode to toggle selection
// handleItemClick no longer needed - handled inline in renderItem
window.handleItemClick = function(id) {
  if (window._multiSelectMode) window.selectItem(id);
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
  // Multi-copy
  if (window._pendingCopyIds && window._pendingCopyIds.length > 1) {
    var ids = window._pendingCopyIds;
    window._pendingCopyIds = null;
    var chain = Promise.resolve();
    ids.forEach(function(id) {
      var item = window.items.find(function(i){ return i.id === id; });
      if (!item) return;
      chain = chain.then(function() {
        return db.from('items').insert({ list_id: targetId, name: item.name, quantity: item.quantity, category_id: item.category_id, added_by: window.currentUser.id, item_state: 'unchecked' });
      });
    });
    chain.then(function() {
      document.getElementById('modal-copy').classList.add('hidden');
      showToast('✓', 'success');
    });
    return;
  }
  window._pendingCopyIds = null;
  var item = window.items.find(function(i){ return i.id === window._lastEditId; }); if (!item) return;
  db.from('items').insert({ list_id: targetId, name: item.name, quantity: item.quantity, category_id: item.category_id, added_by: window.currentUser.id, item_state: 'unchecked' }).then(function() {
    document.getElementById('modal-copy').classList.add('hidden');
    showToast('✓', 'success');
  });
};

window.deleteSelected = function() { window._lastEditId = window.selectedItemId; document.getElementById('modal-del-item').classList.remove('hidden'); window.clearSelection(); };

window.deleteSelectedItems = function() {
  if (window.selectedItemIds.length === 0) return;
  if (window.selectedItemIds.length === 1) {
    window._lastEditId = window.selectedItemIds[0];
    window.clearSelection();
    document.getElementById('modal-del-item').classList.remove('hidden');
    return;
  }
  var ids = window.selectedItemIds.slice();
  window.clearSelection();
  window._localChange = true;
  var chain = Promise.resolve();
  ids.forEach(function(id) {
    chain = chain.then(function() {
      return db.from('items').delete().eq('id', id);
    });
  });
  chain.then(function() { window._localChange = false; });
};

window.copySelectedItems = function() {
  if (window.selectedItemIds.length === 0) return;
  if (window.selectedItemIds.length === 1) {
    window._lastEditId = window.selectedItemIds[0];
    window.clearSelection();
    window.openCopyModal();
    return;
  }
  // Multi-select copy: open copy modal and copy all selected
  var ids = window.selectedItemIds.slice();
  window._pendingCopyIds = ids;
  window.clearSelection();
  // Reuse copy modal
  db.from('list_members').select('list_id').eq('user_id', window.currentUser.id).then(function(res) {
    var listIds = (res.data||[]).map(function(m){ return m.list_id; }).filter(function(id){ return id !== LIST_ID; });
    var sel = document.getElementById('copy-list-select');
    if (!listIds.length) {
      sel.innerHTML = '<option>' + (currentLang==='es'?'No hay otras listas':'No other lists') + '</option>';
    } else {
      db.from('lists').select('id, name').in('id', listIds).then(function(r) {
        sel.innerHTML = (r.data||[]).map(function(l){ return '<option value="' + l.id + '">' + l.name + '</option>'; }).join('');
      });
    }
    document.getElementById('modal-copy').classList.remove('hidden');
  });
};
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
