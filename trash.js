// trash.js — Listerfy papelera
window.currentUser = null;
window.trashedLists = [];
window.selectedTrashIds = [];
window._trashLongPressTimer = null;
window._trashLongPressFired = false;
window._trashMultiMode = false;
var _delForeverStep = 0;

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Format dd/mm/yy hh:mm
function formatDate(iso) {
  var d = new Date(iso);
  var dd = String(d.getDate()).padStart(2,'0');
  var mm = String(d.getMonth()+1).padStart(2,'0');
  var yy = String(d.getFullYear()).slice(-2);
  var hh = String(d.getHours()).padStart(2,'0');
  var min = String(d.getMinutes()).padStart(2,'0');
  return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + min;
}

window.addEventListener('load', function() {
  requireAuth().then(function(user) {
    if (!user) return;
    window.currentUser = user;
    applyTranslations();
    loadTrash();
  });
});

window.loadTrash = function() {
  // Load trashed lists owned by this user
  db.from('lists')
    .select('*')
    .eq('owner_id', window.currentUser.id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .then(function(res) {
      var lists = res.data || [];
      if (!lists.length) { renderTrashEmpty(); return; }
      // Fetch item counts for each list
      var pending = lists.length;
      var enriched = lists.map(function(l) { return Object.assign({}, l, { itemCount: 0 }); });
      lists.forEach(function(list, idx) {
        db.from('items').select('*', { count: 'exact', head: true }).eq('list_id', list.id).then(function(r) {
          enriched[idx].itemCount = r.count || 0;
          pending--;
          if (pending === 0) { window.trashedLists = enriched; renderTrash(); }
        });
      });
    });
};

function renderTrashEmpty() {
  document.getElementById('page-content').innerHTML =
    '<div class="empty-state">' +
      '<div style="margin-bottom:16px;opacity:.35">' +
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="56" height="56">' +
          '<path d="M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6M14 10V17M10 10V17" stroke="var(--text-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
      '</div>' +
      '<h3>' + t('trashEmpty') + '</h3>' +
      '<p>' + t('trashEmptyHint') + '</p>' +
    '</div>';
}

function renderTrash() {
  if (!window.trashedLists.length) { renderTrashEmpty(); return; }
  var html = '<div style="padding-top:8px">' +
    window.trashedLists.map(function(list) {
      var isSelected = window.selectedTrashIds.indexOf(list.id) !== -1;
      return '<div class="trash-card' + (isSelected ? ' selected' : '') + '" id="tcard-' + list.id + '"' +
        ' ontouchstart="trashLongPressStart(\'' + list.id + '\')" ontouchend="trashLongPressCancel()" ontouchmove="trashLongPressCancel()"' +
        ' onmousedown="trashLongPressStart(\'' + list.id + '\')" onmouseup="trashLongPressCancel()" onmouseleave="trashLongPressCancel()"' +
        ' onclick="trashCardClick(\'' + list.id + '\')">' +
        '<div class="trash-card-icon">' +
          '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fill="var(--text-3)" width="28" height="28">' +
            '<path d="M134.4,345.6c-8.53,0-14.93,6.4-14.93,14.93s6.4,14.93,14.93,14.93,14.93-6.4,14.93-14.93-6.4-14.93-14.93-14.93Z"/>' +
            '<path d="M134.4,238.93c-8.53,0-14.93,6.4-14.93,14.93s6.4,14.93,14.93,14.93,14.93-6.4,14.93-14.93c0-10.67-6.4-14.93-14.93-14.93Z"/>' +
            '<path d="M256,0C114.62,0,0,114.62,0,256s114.62,256,256,256,256-114.62,256-256S397.38,0,256,0ZM134.4,405.33c-25.6,0-46.93-19.2-46.93-46.93,0-25.6,19.2-46.93,46.93-46.93s46.93,19.2,46.93,46.93c-2.13,27.73-21.33,46.93-46.93,46.93ZM134.4,298.67c-25.6,0-46.93-19.2-46.93-46.93s19.2-44.8,46.93-44.8,46.93,19.2,46.93,46.93-21.33,44.8-46.93,44.8ZM183.47,132.27l-46.93,46.93c-2.13,4.27-6.4,4.27-10.67,4.27s-8.53-2.13-10.67-4.27l-23.47-23.47c-6.4-4.27-6.4-14.93,0-21.33s14.93-6.4,21.33,0l12.8,12.8,36.27-36.27c6.4-6.4,14.93-6.4,21.33,0s6.4,14.93,0,21.33ZM409.6,375.47h-183.47c-8.53,0-14.93-6.4-14.93-14.93s6.4-14.93,14.93-14.93h183.47c8.53,0,14.93,6.4,14.93,14.93s-6.4,14.93-14.93,14.93ZM409.6,268.8h-183.47c-8.53,0-14.93-6.4-14.93-14.93s6.4-14.93,14.93-14.93h183.47c8.53,0,14.93,6.4,14.93,14.93s-6.4,14.93-14.93,14.93ZM409.6,162.13h-183.47c-8.53,0-14.93-6.4-14.93-14.93s6.4-14.93,14.93-14.93h183.47c8.53,0,14.93,6.4,14.93,14.93s-6.4,14.93-14.93,14.93Z"/>' +
          '</svg>' +
        '</div>' +
        '<div class="trash-card-body">' +
          '<div class="trash-card-name">' + esc(list.name) + '</div>' +
          '<div class="trash-card-meta">' +
            '<span>' + list.itemCount + ' ' + t('items') + '</span>' +
            '<span>·</span>' +
            '<span>' + t('deletedOn') + ': ' + formatDate(list.deleted_at) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="trash-card-restore">' +
          '<button class="btn btn-brand btn-sm" onclick="event.stopPropagation();restoreList(\'' + list.id + '\')">' + t('restore') + '</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  document.getElementById('page-content').innerHTML = html;
}

// ── Long press para multi-select ──────────────────────
window.trashLongPressStart = function(id) {
  window._trashLongPressFired = false;
  window._trashLongPressTimer = setTimeout(function() {
    window._trashLongPressFired = true;
    trashSelectItem(id);
  }, 600);
};
window.trashLongPressCancel = function() { clearTimeout(window._trashLongPressTimer); };

window.trashCardClick = function(id) {
  if (window._trashLongPressFired) { window._trashLongPressFired = false; return; }
  if (window._trashMultiMode) { trashSelectItem(id); }
  // single tap — no action in normal mode (restore button handles it)
};

function trashSelectItem(id) {
  if (!window._trashMultiMode) {
    window._trashMultiMode = true;
    document.getElementById('trash-action-bar').classList.remove('hidden');
  }
  var idx = window.selectedTrashIds.indexOf(id);
  var card = document.getElementById('tcard-' + id);
  if (idx === -1) {
    window.selectedTrashIds.push(id);
    if (card) card.classList.add('selected');
  } else {
    window.selectedTrashIds.splice(idx, 1);
    if (card) card.classList.remove('selected');
  }
  if (window.selectedTrashIds.length === 0) { cancelTrashSelection(); return; }
  var count = window.selectedTrashIds.length;
  document.getElementById('trash-action-count').textContent =
    count + ' ' + (count === 1 ? t('selected1') : t('selectedN'));
}

window.cancelTrashSelection = function() {
  window.selectedTrashIds = [];
  window._trashMultiMode = false;
  document.getElementById('trash-action-bar').classList.add('hidden');
  document.querySelectorAll('.trash-card').forEach(function(c) { c.classList.remove('selected'); });
};

// ── Restore ───────────────────────────────────────────
window.restoreList = function(id) {
  var list = window.trashedLists.find(function(l) { return l.id === id; });
  if (!list) return;
  var newName = list.name + ' ' + t('restoredSuffix');
  db.from('lists').update({ name: newName, deleted_at: null, deleted_by: null }).eq('id', id).then(function(res) {
    if (res.error) { showToast(t('errorGeneral'), 'error'); return; }
    showToast(t('restoredToast'), 'success');
    loadTrash();
  });
};

// ── Delete forever (modal 2 pasos) ───────────────────
window.promptDeleteForever = function() {
  if (!window.selectedTrashIds.length) return;
  _delForeverStep = 1;
  document.getElementById('del-forever-title').textContent = t('deleteForever');
  document.getElementById('del-forever-desc').textContent = t('confirmDeleteForever');
  document.getElementById('del-forever-step2').style.display = 'none';
  document.getElementById('del-forever-input').value = '';
  document.getElementById('btn-del-forever-cancel').textContent = t('cancel');
  document.getElementById('btn-del-forever-ok').textContent = t('delete');
  document.getElementById('btn-del-forever-ok').disabled = false;
  document.getElementById('modal-del-forever').classList.remove('hidden');
};

window.delForeverNext = function() {
  if (_delForeverStep === 1) {
    _delForeverStep = 2;
    var word = t('deleteForeverWord');
    document.getElementById('del-forever-desc').textContent = '';
    document.getElementById('del-forever-prompt').innerHTML = t('deleteForeverPrompt') + ' <span id="del-confirm-word">' + word + '</span>';
    document.getElementById('del-forever-step2').style.display = 'block';
    document.getElementById('btn-del-forever-ok').disabled = true;
    setTimeout(function() { document.getElementById('del-forever-input').focus(); }, 100);
  } else if (_delForeverStep === 2) {
    var input = document.getElementById('del-forever-input').value.trim().toUpperCase();
    var expected = t('deleteForeverWord').toUpperCase();
    if (input !== expected) {
      var inp = document.getElementById('del-forever-input');
      inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
      inp.value = ''; document.getElementById('btn-del-forever-ok').disabled = true;
      return;
    }
    doDeleteForever();
  }
};

window.closeDelForever = function() {
  document.getElementById('modal-del-forever').classList.add('hidden');
  _delForeverStep = 0;
};

async function doDeleteForever() {
  var btn = document.getElementById('btn-del-forever-ok');
  btn.disabled = true; btn.textContent = '...';
  var ids = window.selectedTrashIds.slice();
  // Delete items first, then the lists
  for (var i = 0; i < ids.length; i++) {
    await db.from('items').delete().eq('list_id', ids[i]);
    await db.from('list_members').delete().eq('list_id', ids[i]);
    await db.from('lists').delete().eq('id', ids[i]);
  }
  document.getElementById('modal-del-forever').classList.add('hidden');
  _delForeverStep = 0;
  cancelTrashSelection();
  showToast('✓', 'success');
  loadTrash();
}

document.addEventListener('langchange', function() { applyTranslations(); renderTrash(); });
