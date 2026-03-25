// app.js — Listerfy main app logic

window.window.currentUser = null;
window.window.currentProfile = null;
window.window.activeListId = null;

const AVATAR_COLORS = ['#16a34a','#0284c7','#7c3aed','#db2777','#ea580c','#0891b2','#65a30d','#d97706','#0e7490','#b45309'];

window.avatarColor = function(str) {
  str = str || '';
  var h = 0;
  for (var i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

window.avatarInitials = function(n) {
  n = n || '';
  return n.trim().split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2) || '?';
}

window.esc = function(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.startApp = function() {
  requireAuth().then(function(user) {
    if (!user) return;
    window.currentUser = user;
    db.from('profiles').select('*').eq('id', user.id).single().then(function(res) {
      window.currentProfile = res.data;
      applyTranslations();
      // Re-apply to elements outside page-content (header, title)
      document.querySelectorAll('[data-i18n]').forEach(function(el) {
        el.textContent = t(el.dataset.i18n);
      });
      loadLists();
      loadNotifications();
      subscribeNotifs();
      window.initNotifBtn();
    });
  });
}

window.loadLists = function() {
  db.from('list_members').select('list_id').eq('user_id', currentUser.id).then(function(res) {
    var memberships = res.data;
    if (!memberships || !memberships.length) { renderEmpty(); return; }
    var ids = memberships.map(function(m){ return m.list_id; });
    db.from('lists').select('*').in('id', ids).order('sort_order', { ascending: true }).then(function(res2) {
      var lists = res2.data;
      if (!lists || !lists.length) { renderEmpty(); return; }
      var pending = lists.length;
      var enriched = [];
      lists.forEach(function(list, idx) {
        Promise.all([
          db.from('items').select('*',{count:'exact',head:true}).eq('list_id', list.id),
          db.from('items').select('*',{count:'exact',head:true}).eq('list_id', list.id).eq('is_checked', true),
          db.from('list_members').select('user_id, profiles(display_name)').eq('list_id', list.id),
        ]).then(function(results) {
          var total   = results[0].count || 0;
          var checked = results[1].count || 0;
          var members = results[2].data  || [];
          var lastVisit = localStorage.getItem('last_visit_' + list.id) || '2000-01-01';
          enriched[idx] = Object.assign({}, list, { total: total, checked: checked, members: members, hasNew: false });
          pending--;
          if (pending === 0) renderLists(enriched);
        });
      });
    });
  });
}

window.renderEmpty = function() {
  var el = document.getElementById('page-content');
  if (!el) return;
  el.innerHTML = '<div id="lists-container"><div class="empty-state">' +
    '<div class="empty-icon">🛒</div>' +
    '<h3>' + t('noLists') + '</h3>' +
    '<p>' + t('noListsHint') + '</p>' +
    '</div></div>';
}

window.renderLists = function(lists) {
  var html = lists.map(function(list) {
    var pct = list.total > 0 ? Math.round((list.checked / list.total) * 100) : 0;
    var currentUid = window.currentUser && window.currentUser.id;
    var avatars = list.members.filter(function(m) {
      return m.user_id !== currentUid;
    }).slice(0,5).map(function(m) {
      var name = (m.profiles && m.profiles.display_name) || '?';
      return '<div class="avatar" style="background:' + avatarColor(name) + '">' + avatarInitials(name) + '</div>';
    }).join('');

    return '<div class="list-card" id="card-' + list.id + '"' +
      ' draggable="true"' +
      ' ondragstart="dragStart(event, \'' + list.id + '\')"' +
      ' ondragover="dragOver(event)"' +
      ' ondrop="dragDrop(event, \'' + list.id + '\')"' +
      ' ondragend="dragEnd(event)"' +
      ' onclick="goToList(\'' + list.id + '\')">' +
      '<div class="list-card-name">' + esc(list.name) + '</div>' +
      '<div class="list-card-progress">' +
        '<div class="progress-dot"></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="progress-count">' + list.checked + '/' + list.total + '</span>' +
      '</div>' +
      '<div class="list-card-footer">' +
        '<div class="avatar-stack">' + avatars + '</div>' +
        (list.hasNew ? '<span class="badge-new-items">' + t('newItems') + '</span>' : '') +
      '</div>' +
      '<div class="card-menu-wrap dropdown-wrap" onclick="event.stopPropagation()">' +
        '<button class="kebab-btn" onclick="toggleCardMenu(\'menu-' + list.id + '\')">⋮</button>' +
        '<div class="dropdown-menu hidden card-menu" id="menu-' + list.id + '">' +
          '<button class="dropdown-item" onclick="openRename(\'' + list.id + '\',\'' + esc(list.name) + '\')"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.29289 3.70711L1 11V15H5L12.2929 7.70711L8.29289 3.70711Z" fill="#436e60"/><path d="M9.70711 2.29289L13.7071 6.29289L15.1716 4.82843C15.702 4.29799 16 3.57857 16 2.82843C16 1.26633 14.7337 0 13.1716 0C12.4214 0 11.702 0.297995 11.1716 0.828428L9.70711 2.29289Z" fill="#436e60"/></svg> ' + t('rename') + '</button>' +
          '<button class="dropdown-item" onclick="openInvite(\'' + list.id + '\')"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 6C12.6569 6 14 4.65685 14 3C14 1.34315 12.6569 0 11 0C9.34315 0 8 1.34315 8 3C8 3.22371 8.02449 3.44169 8.07092 3.65143L4.86861 5.65287C4.35599 5.24423 3.70652 5 3 5C1.34315 5 0 6.34315 0 8C0 9.65685 1.34315 11 3 11C3.70652 11 4.35599 10.7558 4.86861 10.3471L8.07092 12.3486C8.02449 12.5583 8 12.7763 8 13C8 14.6569 9.34315 16 11 16C12.6569 16 14 14.6569 14 13C14 11.3431 12.6569 10 11 10C10.2935 10 9.644 10.2442 9.13139 10.6529L5.92908 8.65143C5.97551 8.44169 6 8.22371 6 8C6 7.77629 5.97551 7.55831 5.92908 7.34857L9.13139 5.34713C9.644 5.75577 10.2935 6 11 6Z" fill="#436e60"/></svg> ' + t('share') + '</button>' +
          '<button class="dropdown-item" onclick="duplicateList(\'' + list.id + '\')"><svg width="14" height="14" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none"><path fill="#436e60" fill-rule="evenodd" d="M4 2a2 2 0 00-2 2v9a2 2 0 002 2h2v2a2 2 0 002 2h9a2 2 0 002-2V8a2 2 0 00-2-2h-2V4a2 2 0 00-2-2H4zm9 4V4H4v9h2V8a2 2 0 012-2h5zM8 8h9v9H8V8z"/></svg> ' + t('duplicate') + '</button>' +
          (list.owner_id === currentUser.id
            ? '<button class="dropdown-item danger" onclick="confirmDeleteList(\'' + list.id + '\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6M14 10V17M10 10V17" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + t('deleteList') + '</button>'
            : '<button class="dropdown-item danger" onclick="confirmLeaveList(\'' + list.id + '\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6M14 10V17M10 10V17" stroke="#436e60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + t('leaveList') + '</button>') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  var el = document.getElementById('page-content');
  if (el) el.innerHTML = '<div id="lists-container" style="padding-top:8px">' + html + '</div>';
}

window.goToList = function(id) {
  localStorage.setItem('last_visit_' + id, new Date().toISOString());
  location.href = 'list.html?id=' + id;
}

window.toggleCardMenu = function(menuId) {
  document.querySelectorAll('.dropdown-menu').forEach(function(m) {
    if (m.id !== menuId) m.classList.add('hidden');
  });
  var menu = document.getElementById(menuId);
  if (!menu) return;
  menu.classList.toggle('hidden');
  if (!menu.classList.contains('hidden')) {
    setTimeout(function() {
      document.addEventListener('click', function handler() {
        menu.classList.add('hidden');
        document.removeEventListener('click', handler);
      });
    }, 0);
  }
}

window.openNewList = function() {
  document.getElementById('modal-new-list').classList.remove('hidden');
  document.getElementById('new-list-name').value = '';
  setTimeout(function(){ document.getElementById('new-list-name').focus(); }, 100);
  applyTranslations();
}
window.closeNewList = function() { document.getElementById('modal-new-list').classList.add('hidden'); }

window.createList = function() {
  var name = document.getElementById('new-list-name').value.trim();
  if (!name) return;
  var btn = document.getElementById('btn-create');
  var span = btn.querySelector('span');
  btn.disabled = true; span.textContent = t('creating');
  db.from('lists').insert({ name: name, owner_id: currentUser.id }).select().single().then(function(res) {
    btn.disabled = false; span.textContent = t('createList');
    if (res.error) { showToast(t('errorGeneral'), 'error'); return; }
    closeNewList();
    goToList(res.data.id);
  });
}

window.openRename = function(id, currentName) {
  window.activeListId = id;
  document.getElementById('rename-input').value = currentName;
  document.getElementById('modal-rename').classList.remove('hidden');
  setTimeout(function(){ document.getElementById('rename-input').focus(); }, 100);
}
window.confirmRename = function() {
  var name = document.getElementById('rename-input').value.trim();
  if (!name || !activeListId) return;
  db.from('lists').update({ name: name }).eq('id', activeListId).then(function() {
    document.getElementById('modal-rename').classList.add('hidden');
    loadLists();
  });
}

window.openInvite = function(id) {
  window.activeListId = id;
  document.getElementById('invite-email-input').value = '';
  document.getElementById('invite-msg').textContent = '';
  document.getElementById('modal-invite').classList.remove('hidden');
  setTimeout(function(){ document.getElementById('invite-email-input').focus(); }, 100);
}
window.sendInvite = function() {
  var email = document.getElementById('invite-email-input').value.trim().toLowerCase();
  if (!email || !email.includes('@')) return;
  var btn = document.getElementById('btn-send-invite');
  var span = btn.querySelector('span');
  btn.disabled = true; span.textContent = t('sending');
  db.from('invitations').insert({ list_id: activeListId, invited_by: currentUser.id, invited_email: email }).then(function(res) {
    btn.disabled = false; span.textContent = t('sendInvite');
    if (res.error) { showToast(t('errorGeneral'), 'error'); return; }
    document.getElementById('modal-invite').classList.add('hidden');
    showToast(t('inviteSent'), 'success');
  });
}

window.duplicateList = function(id) {
  db.from('lists').select('*').eq('id', id).single().then(function(res) {
    if (!res.data) return;
    var original = res.data;
    db.from('lists').insert({ name: original.name + ' (copia)', owner_id: currentUser.id }).select().single().then(function(res2) {
      if (!res2.data) return;
      db.from('items').select('*').eq('list_id', id).then(function(itemsRes) {
        if (itemsRes.data && itemsRes.data.length) {
          var newItems = itemsRes.data.map(function(i) {
            return { list_id: res2.data.id, name: i.name, quantity: i.quantity, category_id: i.category_id, added_by: currentUser.id };
          });
          db.from('items').insert(newItems).then(function(){ loadLists(); showToast('✓', 'success'); });
        } else {
          loadLists(); showToast('✓', 'success');
        }
      });
    });
  });
}

window.confirmDeleteList = function(id) {
  window.activeListId = id;
  document.getElementById('confirm-title').textContent = t('deleteList');
  document.getElementById('confirm-msg').textContent = t('confirmDelete');
  document.getElementById('btn-confirm-ok').textContent = t('delete');
  document.getElementById('btn-confirm-ok').onclick = function() {
    db.from('lists').delete().eq('id', activeListId).then(function() {
      document.getElementById('modal-confirm').classList.add('hidden');
      loadLists();
    });
  };
  document.getElementById('modal-confirm').classList.remove('hidden');
}

window.confirmLeaveList = function(id) {
  window.activeListId = id;
  document.getElementById('confirm-title').textContent = t('leaveList');
  document.getElementById('confirm-msg').textContent = currentLang === 'es' ? '¿Seguro que quieres dejar esta lista?' : 'Are you sure you want to leave this list?';
  document.getElementById('btn-confirm-ok').textContent = t('yes');
  document.getElementById('btn-confirm-ok').onclick = function() {
    db.from('list_members').delete().eq('list_id', activeListId).eq('user_id', currentUser.id).then(function() {
      document.getElementById('modal-confirm').classList.add('hidden');
      loadLists();
    });
  };
  document.getElementById('modal-confirm').classList.remove('hidden');
}

window.loadNotifications = function() {
  db.from('notifications').select('*').eq('user_id', currentUser.id)
    .eq('is_read', false)
    .order('created_at', { ascending: false }).limit(20).then(function(res) {
    var notifs = res.data || [];
    var unread = notifs.filter(function(n){ return !n.is_read; }).length;
    updateNotifBadge(unread);
    var list = document.getElementById('notif-list');
    if (!list) return;
    if (!notifs.length) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:var(--fs-sm)">' + t('noNotifications') + '</div>';
      return;
    }
    list.innerHTML = notifs.map(function(n) {
      var d = n.data || {};
      var text = '';
      if (n.type === 'invitation_received') text = '<strong>' + esc(d.from_name) + '</strong> ' + t('invitationReceived') + ' <strong>' + esc(d.list_name) + '</strong>';
      else if (n.type === 'invitation_accepted') text = '<strong>' + esc(d.from_name) + '</strong> ' + t('invitationAccepted') + ' <strong>' + esc(d.list_name) + '</strong>';
      else if (n.type === 'invitation_rejected') text = '<strong>' + esc(d.from_name) + '</strong> ' + t('invitationRejected') + ' <strong>' + esc(d.list_name) + '</strong>';
      var actions = n.type === 'invitation_received'
        ? '<div class="notif-actions"><button class="btn btn-brand btn-sm" onclick="respondInvite(\'' + d.invitation_id + '\',\'accepted\',\'' + n.id + '\')">' + t('accept') + '</button><button class="btn btn-outline btn-sm" onclick="respondInvite(\'' + d.invitation_id + '\',\'rejected\',\'' + n.id + '\')">' + t('reject') + '</button></div>'
        : '';
      return '<div class="notif-item ' + (n.is_read ? '' : 'unread') + '" id="notif-' + n.id + '">' +
        '<div class="notif-text">' + text + '</div>' +
        '<div class="notif-time">' + timeAgo(n.created_at) + '</div>' +
        actions + '</div>';
    }).join('');
  });
}

window.updateNotifBadge = function(count) {
  ['notif-badge','nav-badge'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    el.classList.toggle('hidden', count === 0);
  });
}

window.respondInvite = function(invitationId, status, notifId) {
  db.from('invitations').update({ status: status, responded_at: new Date().toISOString() }).eq('id', invitationId).then(function() {
    db.from('notifications').update({ is_read: true }).eq('id', notifId).then(function() {
      loadNotifications();
      if (status === 'accepted') { loadLists(); showToast('✓', 'success'); }
    });
  });
}

window.subscribeNotifs = function() {
  db.channel('notifs:' + currentUser.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + currentUser.id },
      function() { loadNotifications(); })
    .subscribe();
}

// ── Drag & Drop para reordenar listas ────────
var _dragId = null;

window.dragStart = function(e, id) {
  _dragId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(function() {
    var el = document.getElementById('card-' + id);
    if (el) el.style.opacity = '0.4';
  }, 0);
};

window.dragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};

window.dragDrop = function(e, targetId) {
  e.preventDefault();
  if (_dragId === targetId) return;
  // Reorder in DOM and update sort_order
  var cards = Array.from(document.querySelectorAll('.list-card'));
  var fromIdx = cards.findIndex(function(c) { return c.id === 'card-' + _dragId; });
  var toIdx   = cards.findIndex(function(c) { return c.id === 'card-' + targetId; });
  if (fromIdx === -1 || toIdx === -1) return;

  // Reorder visually
  var parent = cards[0].parentNode;
  var fromEl = cards[fromIdx];
  var toEl   = cards[toIdx];
  if (fromIdx < toIdx) {
    parent.insertBefore(fromEl, toEl.nextSibling);
  } else {
    parent.insertBefore(fromEl, toEl);
  }

  // Save new order to DB
  var newCards = Array.from(document.querySelectorAll('.list-card'));
  newCards.forEach(function(card, idx) {
    var listId = card.id.replace('card-', '');
    db.from('lists').update({ sort_order: idx }).eq('id', listId);
  });
};

window.dragEnd = function(e) {
  var el = document.getElementById('card-' + _dragId);
  if (el) el.style.opacity = '1';
  _dragId = null;
};

window.initNotifBtn = function() {
  var btn = document.getElementById('notif-btn');
  if (!btn || btn._inited) return;
  btn._inited = true;
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var panel = document.getElementById('notif-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      window.loadNotifications();
      // Mark all unread as read when panel opens
      setTimeout(function() {
        db.from('notifications')
          .update({ is_read: true })
          .eq('user_id', window.currentUser.id)
          .eq('is_read', false)
          .then(function() {
            window.updateNotifBadge(0);
          });
      }, 1500);
      setTimeout(function() {
        document.addEventListener('click', function h() {
          panel.classList.add('hidden');
          document.removeEventListener('click', h);
        });
      }, 0);
    }
  });
}

window.timeAgo = function(dateStr) {
  var lang = localStorage.getItem('lang') || 'es';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins  = Math.floor(diff / 60000);
  var hours = Math.floor(diff / 3600000);
  var days  = Math.floor(diff / 86400000);
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

// Auto-start — wait for all scripts to be ready
if (typeof requireAuth === 'function') {
  window.startApp();
} else {
  window.addEventListener('load', function() {
    window.startApp();
  });
}
