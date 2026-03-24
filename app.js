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
    db.from('lists').select('*').in('id', ids).order('updated_at', { ascending: false }).then(function(res2) {
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
    var avatars = list.members.slice(0,5).map(function(m) {
      var name = (m.profiles && m.profiles.display_name) || '?';
      return '<div class="avatar" style="background:' + avatarColor(name) + '">' + avatarInitials(name) + '</div>';
    }).join('');

    return '<div class="list-card" onclick="goToList(\'' + list.id + '\')">' +
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
          '<button class="dropdown-item" onclick="openRename(\'' + list.id + '\',\'' + esc(list.name) + '\')">✏️ ' + t('rename') + '</button>' +
          '<button class="dropdown-item" onclick="openInvite(\'' + list.id + '\')">👥 ' + t('share') + '</button>' +
          '<button class="dropdown-item" onclick="duplicateList(\'' + list.id + '\')">📋 ' + t('duplicate') + '</button>' +
          (list.owner_id === currentUser.id
            ? '<button class="dropdown-item danger" onclick="confirmDeleteList(\'' + list.id + '\')">🗑 ' + t('deleteList') + '</button>'
            : '<button class="dropdown-item danger" onclick="confirmLeaveList(\'' + list.id + '\')">🚪 ' + t('leaveList') + '</button>') +
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
