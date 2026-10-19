// Toast Bildirim Yardımcısı
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconClass = 'fa-circle-info';
  if (type === 'success') iconClass = 'fa-circle-check';
  if (type === 'error') iconClass = 'fa-triangle-exclamation';
  
  toast.innerHTML = `
    <i class="fa-solid ${iconClass}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Global Durum Değişkenleri
let discordChannels = [];
let discordRoles = [];
let discordMembers = [];
let currentIcOnlineMembers = [];
let currentIcOfflineMembers = [];

// Sekme (Tab) Yönetimi
const menuItems = document.querySelectorAll('.menu-item');
const tabContents = document.querySelectorAll('.tab-content');
const pageTitle = document.getElementById('page-title');
const pageDesc = document.getElementById('page-desc');

const tabMeta = {
  dashboard: { title: 'Genel Bakış', desc: 'Botun canlı istatistikleri ve genel kontrolleri.' },
  allperm: { title: 'AllPerm Yetkileri', desc: 'Dinamik yetkilere sahip kullanıcı ve rollerin yönetimi.' },
  config: { title: 'Sistem Ayarları', desc: 'Botun tüm log ve sistem kanal/rol konfigürasyonlarını düzenleyin.' },
  ticket: { title: 'Ticket Yönetimi', desc: 'Ticket sistemi kategorilerini, başvuru formlarını ve yetkili atamalarını yönetin.' },
  activity: { title: 'Aktiflik Yönetimi', desc: 'Mevcut aktiflik durumunu görün ve katılımcıları yönetin.' },
  youtube: { title: 'YouTube Yönetimi', desc: 'Takip edilen YouTube kanallarını ve duyuru ayarlarını yönetin.' },
  banaf: { title: 'Ban Affı Yönetimi', desc: 'Normal ve panelsiz ban affı başvurularını yönetin.' },
  cekilis: { title: 'Çekiliş Yönetimi', desc: 'Sunucudaki aktif ve bitmiş çekilişleri yönetin.' },
  dmduyuru: { title: 'DM Duyuru', desc: 'Seçilen roldeki tüm üyelere bota DM duyurusu göndertin.' },
  events: { title: 'Etkinlik Yönetimi', desc: 'Aktif etkinlikler ve yetkililerin gerçekleştirdiği etkinlik sayıları.' },
  farm: { title: 'Farm Yönetimi', desc: 'Yetkililerin ve üyelerin teslim ettiği farm miktarları ve sıralamaları.' },
  ickontrol: { title: 'IC Kontrol Yönetimi', desc: 'FiveM sunucularındaki oyuncu varlığına göre ekip içi kontrol ve düzenlemeler.' },
  bioguild: { title: 'Bio & Guild Taraması', desc: 'Onaylı üyelerin profillerinde ekip tagi ve davet linkini bulundurup bulundurmadığını denetleyin.' },
  database: { title: 'Veri Sıfırlama', desc: 'Botun SQLite veritabanındaki tablolarını sıfırlama paneli.' }
};

menuItems.forEach(item => {
  item.addEventListener('click', () => {
    const tabName = item.getAttribute('data-tab');
    
    // Aktif menüyü değiştir
    menuItems.forEach(mi => mi.classList.remove('active'));
    item.classList.add('active');
    
    // Aktif sekmeyi değiştir
    tabContents.forEach(tc => tc.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Başlıkları güncelle
    if (tabMeta[tabName]) {
      pageTitle.innerText = tabMeta[tabName].title;
      pageDesc.innerText = tabMeta[tabName].desc;
    }
    
    // Sekme bazlı ek veri yükle
    if (tabName === 'allperm') { loadAllPerm(); loadPanelAccess(); }
    if (tabName === 'config') loadConfig();
    if (tabName === 'ticket') loadTicketSettings();
    if (tabName === 'events') loadEvents();
    if (tabName === 'farm') loadFarm();
    if (tabName === 'activity') loadActivity();
    if (tabName === 'youtube') loadYoutubeSettings();
    if (tabName === 'banaf') loadBanAfSettings();
    if (tabName === 'cekilis') loadGiveawaySettings();
    if (tabName === 'ickontrol') loadIcKontrol();
    if (tabName === 'bioguild') loadBioGuildSettings();
  });
});

// Sayfa Yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
  const overlay = document.getElementById('perms-loading-overlay');
  const overlayText = document.getElementById('lo-step-text');

  function setStep(msg) {
    if (overlayText) overlayText.textContent = msg;
  }

  const removeOverlay = () => {
    if (overlay && !overlay.classList.contains('fade-out')) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.remove();
        document.body.classList.remove('perms-loading');
      }, 350);
    } else {
      document.body.classList.remove('perms-loading');
    }
  };

  // Güvenlik zamanlayıcısı: 5 saniyeyi geçerse her şekilde overlay'i kaldır
  const safetyTimeout = setTimeout(() => {
    console.warn('Veri yükleme zaman aşımına uğradı, ekran açılıyor.');
    removeOverlay();
  }, 5000);

  try {
    // 1) Sekme izinlerini yükle
    setStep('Oturum doğrulanıyor...');
    await applyTabPermissions().catch(err => console.error('applyTabPermissions hatası:', err));

    // 2) Bot durumunu yükle
    setStep('Bot durumu alınıyor...');
    await loadStatus().catch(err => console.error('loadStatus hatası:', err));

    // 3) Discord verilerini yükle (kanallar, roller, üyeler)
    setStep('Discord verileri yükleniyor...');
    await loadDiscordData().catch(err => console.error('loadDiscordData hatası:', err));

    setStep('Hazır!');
  } catch (err) {
    console.error('Başlangıç verileri yüklenirken hata:', err);
  } finally {
    clearTimeout(safetyTimeout);
    removeOverlay();
  }


  // Bind sort listener
  const sortSelect = document.getElementById('event-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', renderEventStats);
  }

  // Bind filter listener
  const filterSelect = document.getElementById('event-filter-select');
  if (filterSelect) {
    filterSelect.addEventListener('change', renderEventStats);
  }

  // Bind export listener
  const exportBtn = document.getElementById('btn-export-events');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportEventStats);
  }

  // Bind clear all events listener
  const clearAllBtn = document.getElementById('btn-clear-all-events');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllEvents);
  }

  // Bind farm sort listener
  const farmSortSelect = document.getElementById('farm-sort-select');
  if (farmSortSelect) {
    farmSortSelect.addEventListener('change', renderFarmStats);
  }

  // Bind farm filter listener
  const farmFilterSelect = document.getElementById('farm-filter-select');
  if (farmFilterSelect) {
    farmFilterSelect.addEventListener('change', renderFarmStats);
  }

  // Bind farm export listener
  const farmExportBtn = document.getElementById('btn-export-farm');
  if (farmExportBtn) {
    farmExportBtn.addEventListener('click', exportFarmStats);
  }
});

// 1) Bot Durumunu Yükle
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    // Bot ve Profil Bilgileri
    document.getElementById('bot-avatar').src = data.bot.avatar || '/placeholder.png';
    document.getElementById('bot-tag').innerText = data.bot.tag;
    document.getElementById('user-avatar').src = data.user.avatar ? `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
    document.getElementById('user-name').innerText = data.user.username;
    
    // Sunucu Bilgileri
    document.getElementById('guild-name').innerText = data.guild.name;
    document.getElementById('guild-icon').src = data.guild.icon || 'https://cdn.discordapp.com/embed/avatars/0.png';
    
    // İstatistikler
    document.getElementById('stat-ping').innerText = `${data.bot.ping} ms`;
    document.getElementById('stat-uptime').innerText = data.bot.uptime;
    document.getElementById('stat-members').innerText = `${data.guild.memberCount} Üye`;

    // Bot Güç Kontrolleri Butonları & Badge Durumu
    const btnStart = document.getElementById('btn-start');
    const btnRestart = document.getElementById('btn-restart');
    const btnStop = document.getElementById('btn-stop');
    const statusBadge = document.querySelector('.status-badge');

    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnRestart) btnRestart.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'inline-flex';

    if (data.bot.isReady) {
      if (btnStart) btnStart.disabled = true;
      if (btnRestart) btnRestart.disabled = false;
      if (btnStop) btnStop.disabled = false;
      if (statusBadge) {
        statusBadge.innerHTML = '<span class="dot green"></span> Çevrimiçi';
      }
    } else {
      if (btnStart) btnStart.disabled = false;
      if (btnRestart) btnRestart.disabled = true;
      if (btnStop) btnStop.disabled = true;
      if (statusBadge) {
        statusBadge.innerHTML = '<span class="dot" style="background:#ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.35);"></span> Çevrimdışı';
      }
    }
  } catch (err) {
    console.error(err);
    showToast('Bot durumu alınırken bir hata oluştu.', 'error');
  }
}

// 2) Discord Kanalları, Rolleri ve Üyelerini Yükle
async function loadDiscordData() {
  try {
    const res = await fetch('/api/discord-data');
    const data = await res.json();
    
    if (data.error) {
      showToast(data.error, 'error');
      // Dropdown'lara rate limit uyarısı göster
      _showDropdownWarning();
      return;
    }

    discordChannels = data.channels || [];
    discordRoles = data.roles || [];
    discordMembers = data.members || [];

    // AllPerm Dropdown'ları doldur
    const selectUser = document.getElementById('select-user-id');
    const selectRole = document.getElementById('select-role-id');
    
    // Temizle
    selectUser.innerHTML = '<option value="">Kişi Seçin...</option>';
    selectRole.innerHTML = '<option value="">Rol Seçin...</option>';

    discordMembers.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.innerText = `${m.displayName} (${m.tag})`;
      selectUser.appendChild(opt);
    });

    discordRoles.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.innerText = r.name;
      selectRole.appendChild(opt);
    });

    // Config Dropdown'larını doldur
    populateConfigDropdowns();

    // DM Duyuru Dropdown doldur
    const announceSelect = document.getElementById('announce-role-id');
    announceSelect.innerHTML = '<option value="">Lütfen Rol Seçin...</option>';
    discordRoles.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.innerText = r.name;
      announceSelect.appendChild(opt);
    });

    // Panel Access dropdownları doldur
    const paUserSel = document.getElementById('pa-user-select');
    const paRoleSel = document.getElementById('pa-role-select');
    if (paUserSel) {
      paUserSel.innerHTML = '<option value="">Kişi Seçin...</option>';
      discordMembers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.innerText = `${m.displayName} (${m.tag})`;
        paUserSel.appendChild(opt);
      });
    }
    if (paRoleSel) {
      paRoleSel.innerHTML = '<option value="">Rol Seçin...</option>';
      discordRoles.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.innerText = r.name;
        paRoleSel.appendChild(opt);
      });
    }

  } catch (err) {
    console.error(err);
    showToast('Discord verileri listelenirken hata oluştu.', 'error');
    _showDropdownWarning();
  }
}

// Dropdown'lara rate limit / hata uyarısı ekle
function _showDropdownWarning() {
  const warnHtml = '<option value="" disabled>⚠️ Bot henzü hazır değil, sayfayı yenileyin</option>';
  [
    'select-user-id', 'select-role-id', 'announce-role-id',
    'pa-user-select', 'pa-role-select'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = warnHtml;
  });
  // Guild-role ve guild-channel select'leri de uyar
  document.querySelectorAll('.guild-role-select, .guild-channel-select, .guild-category-select')
    .forEach(el => {
      if (el) el.innerHTML = warnHtml;
    });
}

// Config için kanal ve rol selectlerini dolduran yardımcı fonksiyon
function populateConfigDropdowns() {
  const roleSelects = document.querySelectorAll('.guild-role-select');
  const channelSelects = document.querySelectorAll('.guild-channel-select');
  const categorySelects = document.querySelectorAll('.guild-category-select');

  const categories = discordChannels.filter(c => c.type === 4);
  const textChannels = discordChannels.filter(c => c.type === 0 || c.type === 5); // 0: Text, 5: Announcement
  const voiceChannels = discordChannels.filter(c => c.type === 2); // 2: Voice

  roleSelects.forEach(sel => {
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Seçiniz...</option>';
    discordRoles.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.innerText = `${r.name} (${r.id})`;
      opt.dataset.name = r.name.toLowerCase();
      opt.dataset.id = r.id;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
  });

  categorySelects.forEach(sel => {
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Seçiniz...</option>';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = `📂 ${c.name}`;
      opt.dataset.name = c.name.toLowerCase();
      opt.dataset.id = c.id;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
  });

  channelSelects.forEach(sel => {
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Seçiniz...</option>';

    // Metin Kanalları Grubu
    const textGroup = document.createElement('optgroup');
    textGroup.label = 'METİN KANALLARI';
    textChannels.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = `# ${c.name} ${c.parentName ? `(${c.parentName})` : ''}`;
      opt.dataset.name = `${c.name} ${c.parentName || ''}`.toLowerCase();
      opt.dataset.id = c.id;
      opt.dataset.type = 'text';
      textGroup.appendChild(opt);
    });
    sel.appendChild(textGroup);

    // Ses Kanalları Grubu
    const voiceGroup = document.createElement('optgroup');
    voiceGroup.label = 'SES KANALLARI';
    voiceChannels.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = `🔊 ${c.name} ${c.parentName ? `(${c.parentName})` : ''}`;
      opt.dataset.name = `${c.name} ${c.parentName || ''}`.toLowerCase();
      opt.dataset.id = c.id;
      opt.dataset.type = 'voice';
      voiceGroup.appendChild(opt);
    });
    sel.appendChild(voiceGroup);

    if (currentVal) sel.value = currentVal;
  });

  initRoleSearchFilters();
}

function initRoleSearchFilters() {
  document.querySelectorAll('.searchable-select').forEach(wrapper => {
    const select = wrapper.querySelector('select');
    const trigger = wrapper.querySelector('.ss-trigger');
    const valDisplay = wrapper.querySelector('.ss-value');
    const searchInput = wrapper.querySelector('.ss-search-input');
    const clearBtn = wrapper.querySelector('.ss-clear-btn');
    const dropdown = wrapper.querySelector('.ss-dropdown');

    if (!select || !trigger || !dropdown) return;

    const isRole = select.classList.contains('guild-role-select');
    const isCategory = select.classList.contains('guild-category-select');
    const isChannel = select.classList.contains('guild-channel-select');

    // Trigger tıklama: Input moduna geç veya dropdown aç/kapat
    function openDropdown() {
      // Diğer açık dropdownları kapat
      document.querySelectorAll('.searchable-select.is-active').forEach(other => {
        if (other !== wrapper) closeDropdown(other);
      });

      wrapper.classList.add('is-active');
      valDisplay.style.display = 'none';
      searchInput.style.display = 'block';
      searchInput.value = '';
      searchInput.focus();
      dropdown.style.display = 'block';
      renderOptions('');
    }

    function closeDropdown(targetWrapper = wrapper) {
      const tValDisplay = targetWrapper.querySelector('.ss-value');
      const tSearchInput = targetWrapper.querySelector('.ss-search-input');
      const tDropdown = targetWrapper.querySelector('.ss-dropdown');

      targetWrapper.classList.remove('is-active');
      if (tSearchInput) tSearchInput.style.display = 'none';
      if (tDropdown) tDropdown.style.display = 'none';
      if (tValDisplay) tValDisplay.style.display = 'block';
      syncDisplay(targetWrapper);
    }

    function syncDisplay(targetWrapper = wrapper) {
      const tSelect = targetWrapper.querySelector('select');
      const tValDisplay = targetWrapper.querySelector('.ss-value');
      const tClearBtn = targetWrapper.querySelector('.ss-clear-btn');
      if (!tSelect || !tValDisplay) return;

      const selectedOpt = tSelect.options[tSelect.selectedIndex];
      if (selectedOpt && selectedOpt.value) {
        if (isRole) {
          const roleObj = discordRoles.find(r => r.id === selectedOpt.value);
          const color = roleObj?.color && roleObj.color !== '#000000' ? roleObj.color : 'var(--accent)';
          tValDisplay.innerHTML = `<span class="ss-badge"><span class="ss-badge-dot" style="background:${color};"></span>${selectedOpt.innerText}</span>`;
        } else if (isCategory) {
          tValDisplay.innerHTML = `<span class="ss-badge" style="background:rgba(234,179,8,0.15);border-color:rgba(234,179,8,0.3);"><i class="fa-solid fa-folder" style="color:#eab308;font-size:12px;"></i> ${selectedOpt.innerText.replace(/^📂\s*/, '')}</span>`;
        } else if (isChannel) {
          const chanObj = discordChannels.find(c => c.id === selectedOpt.value);
          const isVoice = chanObj?.type === 2 || selectedOpt.innerText.startsWith('🔊');
          const icon = isVoice ? 'fa-volume-high' : 'fa-hashtag';
          const iconColor = isVoice ? '#38bdf8' : '#818cf8';
          const cleanText = selectedOpt.innerText.replace(/^[#🔊]\s*/, '');
          tValDisplay.innerHTML = `<span class="ss-badge" style="background:rgba(99,102,241,0.15);"><i class="fa-solid ${icon}" style="color:${iconColor};font-size:12px;"></i> ${cleanText}</span>`;
        } else {
          tValDisplay.innerHTML = `<span class="ss-badge">${selectedOpt.innerText}</span>`;
        }
        tValDisplay.classList.remove('is-empty');
        if (tClearBtn) tClearBtn.style.display = 'inline-block';
      } else {
        tValDisplay.innerHTML = 'Seçiniz...';
        tValDisplay.classList.add('is-empty');
        if (tClearBtn) tClearBtn.style.display = 'none';
      }
    }

    function renderOptions(filterQuery = '') {
      const q = filterQuery.trim().toLowerCase();
      dropdown.innerHTML = '';

      let matched = 0;

      // Seçiniz (Boşalt) seçeneği
      const emptyOpt = document.createElement('div');
      emptyOpt.className = 'ss-option';
      emptyOpt.innerHTML = `<span class="ss-option-name"><em>(Seçimi Kaldır)</em></span>`;
      emptyOpt.addEventListener('click', (e) => {
        e.stopPropagation();
        select.value = '';
        select.dispatchEvent(new Event('change'));
        closeDropdown();
      });
      dropdown.appendChild(emptyOpt);

      Array.from(select.options).forEach(opt => {
        if (!opt.value) return;
        const nameMatch = opt.dataset.name ? opt.dataset.name.includes(q) : opt.text.toLowerCase().includes(q);
        const idMatch = (opt.dataset.id || opt.value).toLowerCase().includes(q);

        if (!q || nameMatch || idMatch) {
          matched++;
          const optDiv = document.createElement('div');
          optDiv.className = `ss-option ${select.value === opt.value ? 'is-selected' : ''}`;
          
          let prefixHtml = '';
          let displayText = opt.text;

          if (isRole) {
            const roleObj = discordRoles.find(r => r.id === opt.value);
            const color = roleObj?.color && roleObj.color !== '#000000' ? roleObj.color : '#94a3b8';
            prefixHtml = `<span class="ss-badge-dot" style="background:${color};"></span>`;
          } else if (isCategory) {
            prefixHtml = `<i class="fa-solid fa-folder" style="color:#eab308;font-size:12px;"></i>`;
            displayText = opt.text.replace(/^📂\s*/, '');
          } else if (isChannel) {
            const isVoice = opt.dataset.type === 'voice' || opt.text.startsWith('🔊');
            const icon = isVoice ? 'fa-volume-high' : 'fa-hashtag';
            const iconColor = isVoice ? '#38bdf8' : '#818cf8';
            prefixHtml = `<i class="fa-solid ${icon}" style="color:${iconColor};font-size:12px;"></i>`;
            displayText = opt.text.replace(/^[#🔊]\s*/, '');
          }

          optDiv.innerHTML = `
            <span class="ss-option-name">
              ${prefixHtml}
              <span>${displayText}</span>
            </span>
            <span class="ss-option-id">${opt.value}</span>
          `;

          optDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            select.value = opt.value;
            select.dispatchEvent(new Event('change'));
            closeDropdown();
          });

          dropdown.appendChild(optDiv);
        }
      });

      // Özel ID yazıldıysa (17-20 haneli Discord Snowflake)
      if (/^\d{17,20}$/.test(q)) {
        const customOptDiv = document.createElement('div');
        customOptDiv.className = 'ss-option';
        const typeLabel = isRole ? 'Rol' : (isCategory ? 'Kategori' : 'Kanal');
        customOptDiv.innerHTML = `<span class="ss-option-name"><strong>➕ Özel ${typeLabel} ID ile ata:</strong> ${q}</span>`;
        customOptDiv.addEventListener('click', (e) => {
          e.stopPropagation();
          let customOpt = select.querySelector(`option[value="${q}"]`);
          if (!customOpt) {
            customOpt = document.createElement('option');
            customOpt.value = q;
            customOpt.innerText = `Özel ${typeLabel} (${q})`;
            select.appendChild(customOpt);
          }
          select.value = q;
          select.dispatchEvent(new Event('change'));
          closeDropdown();
        });
        dropdown.appendChild(customOptDiv);
        matched++;
      }

      if (matched === 0) {
        const itemType = isRole ? 'rol' : (isCategory ? 'kategori' : 'kanal');
        dropdown.innerHTML += `<div class="ss-empty-note">Aramaya uygun ${itemType} bulunamadı. ID veya isim kontrol edin.</div>`;
      }
    }

    if (!wrapper.dataset.bound) {
      wrapper.dataset.bound = 'true';

      trigger.addEventListener('click', (e) => {
        if (e.target.closest('.ss-clear-btn')) return;
        if (wrapper.classList.contains('is-active')) {
          closeDropdown();
        } else {
          openDropdown();
        }
      });

      searchInput.addEventListener('input', (e) => {
        renderOptions(e.target.value);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeDropdown();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const firstOpt = dropdown.querySelector('.ss-option:not(:first-child)');
          if (firstOpt) firstOpt.click();
        }
      });

      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          select.value = '';
          select.dispatchEvent(new Event('change'));
          syncDisplay();
        });
      }

      select.addEventListener('change', () => {
        syncDisplay();
      });
    }

    syncDisplay();
  });

  // Sayfa dışına tıklandığında dropdownları kapat
  if (!window._ssGlobalClickBound) {
    window._ssGlobalClickBound = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.searchable-select')) {
        document.querySelectorAll('.searchable-select.is-active').forEach(w => {
          const sInput = w.querySelector('.ss-search-input');
          const dDown = w.querySelector('.ss-dropdown');
          const vDisp = w.querySelector('.ss-value');
          w.classList.remove('is-active');
          if (sInput) sInput.style.display = 'none';
          if (dDown) dDown.style.display = 'none';
          if (vDisp) vDisp.style.display = 'block';
        });
      }
    });
  }
}

// 3) AllPerm Verilerini Yükle

const permLabels = {
  allPerm: 'Tüm Yetkiler',
  ticketStaff: 'Alım Sorumlusu',
  banCommand: 'Ban Sorumlusu',
  farmSorumlusu: 'Farm Sorumlusu',
  ytSorumlusu: 'YouTube Sorumlusu',
  jail: 'Jail Sorumlusu'
};

async function loadAllPerm() {
  try {
    const res = await fetch('/api/allperm');
    const data = await res.json();

    const usersList = document.getElementById('allperm-users-list');
    const rolesList = document.getElementById('allperm-roles-list');

    if (usersList) usersList.innerHTML = '';
    if (rolesList) rolesList.innerHTML = '';

    // Render Users
    if (Object.keys(data.usersMap || {}).length === 0) {
      if (usersList) usersList.innerHTML = '<li class="loading-item">Hiç yetkili kullanıcı yok.</li>';
    } else {
      for (const [id, perms] of Object.entries(data.usersMap)) {
        const u = discordMembers.find(m => m.id === id) || window.CACHED_USERS?.find(user => user.id === id);
        const name = u ? (u.user?.globalName || u.user?.username || u.username || u.displayName || u.tag) : id;
        const avatar = u ? (u.user?.avatarURL || u.avatarURL) : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '10px';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        let badgesHtml = '';
        perms.forEach(p => {
          badgesHtml += `<span class="perm-badge" style="display: inline-block; background: rgba(88,101,242,0.2); color: #5865F2; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 4px; margin-bottom: 2px; border: 1px solid rgba(88,101,242,0.5);">${permLabels[p] || p} <i class="fa-solid fa-xmark remove-perm-btn" onclick="removeAllPerm('user', '${id}', '${p}')" style="cursor: pointer; margin-left: 3px;" title="Kaldır"></i></span>`;
        });

        li.innerHTML = `
          <div class="item-left" style="display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-user"></i>
            <div class="item-info">
              <strong>${name}</strong>
              <div style="margin-top: 4px;">${badgesHtml}</div>
            </div>
          </div>
        `;
        if (usersList) usersList.appendChild(li);
      }
    }

    // Render Roles
    if (Object.keys(data.rolesMap || {}).length === 0) {
      if (rolesList) rolesList.innerHTML = '<li class="loading-item">Hiç yetkili rol yok.</li>';
    } else {
      for (const [id, perms] of Object.entries(data.rolesMap)) {
        const r = discordRoles.find(role => role.id === id);
        const name = r ? r.name : id;
        const color = r && r.color ? `${r.color}` : '#99aab5';

        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '10px';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        let badgesHtml = '';
        perms.forEach(p => {
          badgesHtml += `<span class="perm-badge" style="display: inline-block; background: rgba(88,101,242,0.2); color: #5865F2; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 4px; margin-bottom: 2px; border: 1px solid rgba(88,101,242,0.5);">${permLabels[p] || p} <i class="fa-solid fa-xmark remove-perm-btn" onclick="removeAllPerm('role', '${id}', '${p}')" style="cursor: pointer; margin-left: 3px;" title="Kaldır"></i></span>`;
        });

        li.innerHTML = `
          <div class="item-left" style="display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-user-shield" style="color: ${color};"></i>
            <div class="item-info">
              <strong>${name}</strong>
              <div style="margin-top: 4px;">${badgesHtml}</div>
            </div>
          </div>
        `;
        if (rolesList) rolesList.appendChild(li);
      }
    }

  } catch (err) {
    console.error('AllPerm yükleme hatası:', err);
    showToast('Yetkiler yüklenemedi.', 'error');
  }
}

// AllPerm Ekleme Form Dinleyicileri
document.getElementById('add-user-perm-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const select = document.getElementById('select-user-id');
  const input = document.getElementById('input-user-id');
  const permSelect = document.getElementById('select-user-perm');
  
  const userId = select.value || input.value.trim();
  const perm = permSelect.value;
  
  if (!userId || !perm) {
    return showToast('Lütfen bir kişi seçin veya geçerli bir Discord ID girin ve yetki seçin!', 'error');
  }

  if (input.value.trim() && !/^\d+$/.test(input.value.trim())) {
    return showToast('Discord ID sadece rakamlardan oluşmalıdır!', 'error');
  }

  try {
    const res = await fetch('/api/allperm/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', id: userId, perm })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      select.value = '';
      input.value = '';
      permSelect.value = '';
      loadAllPerm();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Yetkilendirme sırasında hata oluştu.', 'error');
  }
});

document.getElementById('add-role-perm-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const select = document.getElementById('select-role-id');
  const permSelect = document.getElementById('select-role-perm');
  const roleId = select.value;
  const perm = permSelect.value;
  if (!roleId || !perm) return showToast('Rol ve yetki seçmelisiniz!', 'error');

  try {
    const res = await fetch('/api/allperm/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'role', id: roleId, perm })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      select.value = '';
      permSelect.value = '';
      loadAllPerm();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Yetkilendirme sırasında hata oluştu.', 'error');
  }
});

// AllPerm Silme Fonksiyonu
async function removeAllPerm(type, id, perm) {
  if (!confirm(`Bu ${type === 'user' ? 'kullanıcının' : 'rolün'} "${permLabels[perm] || perm}" yetkisini kaldırmak istediğinizden emin misiniz?`)) return;

  try {
    const res = await fetch('/api/allperm/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id, perm })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadAllPerm();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Yetki kaldırılırken hata oluştu.', 'error');
  }
}

// ══════════════════════════════════════════════════════════════════
// Web Panel Erişim Yönetimi
// ══════════════════════════════════════════════════════════════════

// Sekme görünen isimleri
const TAB_DISPLAY_NAMES = {
  dashboard: { label: 'Genel Bakış', icon: 'fa-chart-line' },
  ticket:    { label: 'Ticket', icon: 'fa-ticket' },
  activity:  { label: 'Aktiflik', icon: 'fa-people-arrows' },
  youtube:   { label: 'YouTube', icon: 'fa-brands fa-youtube' },
  banaf:     { label: 'Ban Affı', icon: 'fa-user-slash' },
  cekilis:   { label: 'Çekiliş', icon: 'fa-gifts' },
  events:    { label: 'Etkinlikler', icon: 'fa-calendar-check' },
  farm:      { label: 'Farm', icon: 'fa-tractor' },
  ickontrol: { label: 'IC Kontrol', icon: 'fa-gamepad' },
  bioguild:  { label: 'Bio & Guild', icon: 'fa-user-check' },
  dmduyuru:  { label: 'DM Duyuru', icon: 'fa-paper-plane' }
};

// Global: mevcut kullanıcının izinleri
let currentUserTabs = [];
let currentUserIsOwner = false;

// Sekme izinlerini yükle ve menüyü filtrele
async function applyTabPermissions() {
  try {
    const res = await fetch('/api/my-tabs');
    if (!res.ok) {
      // Session geçersiz ya da hata — güvenli taraf: her şeyi gizle
      console.warn('applyTabPermissions: /api/my-tabs başarısız, tüm sekmeler gizleniyor.');
      document.querySelectorAll('.menu-item[data-tab]').forEach(i => i.style.display = 'none');
      return;
    }
    const data = await res.json();

    currentUserIsOwner = data.isOwner;
    currentUserTabs = data.allowedTabs || [];

    if (data.isOwner) {
      // Owner: tüm menüyü göster, Web Panel Erişim bölümünü aç
      const section = document.getElementById('web-panel-access-section');
      if (section) section.style.display = 'block';
      // Menü öğelerinin opacity'sını geri getir
      document.querySelectorAll('.menu-item[data-tab]').forEach(i => {
        i.style.opacity = '';
        i.style.display = '';
      });
      return; // Hiçbir sekmeyi gizleme
    }

    // Non-owner: izinsiz menü öğelerini gizle
    const allMenuItems = document.querySelectorAll('.menu-item[data-tab]');
    const allowedSet = new Set(currentUserTabs);
    const ownerOnlyTabs = ['allperm', 'config', 'database'];

    allMenuItems.forEach(item => {
      const tab = item.getAttribute('data-tab');
      if (ownerOnlyTabs.includes(tab)) {
        item.style.display = 'none';
        return;
      }
      if (!allowedSet.has('*') && !allowedSet.has(tab)) {
        item.style.display = 'none';
      } else {
        item.style.opacity = '';
        item.style.display = '';
      }
    });

    // Gizlenen sekme aktifse ilk görünür sekmeye geç
    const activeItem = document.querySelector('.menu-item.active');
    if (activeItem && activeItem.style.display === 'none') {
      const firstVisible = document.querySelector('.menu-item[data-tab]:not([style*="display: none"])');
      if (firstVisible) firstVisible.click();
    }

    // Web Panel Erişim bölümünü gizle (owner değil)
    const section = document.getElementById('web-panel-access-section');
    if (section) section.style.display = 'none';

  } catch (err) {
    console.error('Tab izinleri yüklenemedi:', err);
    // Güvenli fallback: hata halinde her şeyi gizle
    document.querySelectorAll('.menu-item[data-tab]').forEach(i => i.style.display = 'none');
    showToast('Oturum bilgileri alınamadı. Lütfen sayfayı yenileyin.', 'error');
  }
}

// Panel erişim sekmelerini yükle (sadece allperm tab açıldığında)
async function loadPanelAccess() {
  try {
    if (!currentUserIsOwner) return; // Sadece owner görebilir

    const res = await fetch('/api/panel-access');
    if (!res.ok) return;
    const data = await res.json();

    const availableTabs = data.availableTabs || Object.keys(TAB_DISPLAY_NAMES);

    // Checkbox alanlarını doldur
    renderTabCheckboxes('pa-user-tab-checkboxes', availableTabs, []);
    renderTabCheckboxes('pa-role-tab-checkboxes', availableTabs, []);

    // Kişi listesini render et
    renderPanelAccessList('panel-access-users-list', 'user', data.users || [], data.tabPerms, availableTabs);
    // Rol listesini render et
    renderPanelAccessList('panel-access-roles-list', 'role', data.roles || [], data.tabPerms, availableTabs);

  } catch (err) {
    console.error('Panel erişim listesi yüklenemedi:', err);
  }
}

// Sekme checkbox'larını render et
function renderTabCheckboxes(containerId, availableTabs, checkedTabs) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const isAllChecked = checkedTabs.includes('*') || checkedTabs.length === availableTabs.length;

  container.innerHTML = '';
  availableTabs.forEach(tab => {
    const meta = TAB_DISPLAY_NAMES[tab] || { label: tab, icon: 'fa-circle' };
    const isChecked = isAllChecked || checkedTabs.includes(tab);
    const label = document.createElement('label');
    label.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); font-size: 12px; transition: background 0.15s;';
    label.innerHTML = `
      <input type="checkbox" data-tab="${tab}" ${isChecked ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer;accent-color:#7c3aed;">
      <i class="fa-solid ${meta.icon}" style="font-size:11px;color:var(--text-muted);"></i>
      <span>${meta.label}</span>
    `;
    label.addEventListener('mouseenter', () => label.style.background = 'rgba(124,58,237,0.08)');
    label.addEventListener('mouseleave', () => label.style.background = 'rgba(255,255,255,0.03)');
    container.appendChild(label);
  });
}

// Panel erişim listesini render et
function renderPanelAccessList(listId, type, ids, tabPerms, availableTabs) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';

  if (ids.length === 0) {
    list.innerHTML = `<li class="loading-item">Henüz ${type === 'user' ? 'kişi' : 'rol'} eklenmemiş.</li>`;
    return;
  }

  const permGroup = type === 'user' ? (tabPerms.users || {}) : (tabPerms.roles || {});

  ids.forEach(id => {
    const tabs = permGroup[id] || ['*'];
    const isAll = tabs.includes('*') || tabs.length === availableTabs.length;

    // Discord verisiyle isim bul
    let displayName = id;
    let colorStyle = '';
    if (type === 'user') {
      const m = discordMembers.find(m => m.id === id);
      if (m) displayName = m.displayName || m.tag;
    } else {
      const r = discordRoles.find(r => r.id === id);
      if (r) { displayName = r.name; colorStyle = `color: ${r.color || '#99aab5'};`; }
    }

    const tabBadges = isAll
      ? `<span style="display:inline-block;background:rgba(124,58,237,0.2);color:#a78bfa;padding:2px 7px;border-radius:4px;font-size:10px;border:1px solid rgba(124,58,237,0.4);">★ Tüm Sekmeler</span>`
      : tabs.map(t => {
          const meta = TAB_DISPLAY_NAMES[t] || { label: t };
          return `<span style="display:inline-block;background:rgba(88,101,242,0.15);color:#818cf8;padding:2px 6px;border-radius:4px;font-size:10px;margin-right:3px;margin-bottom:2px;border:1px solid rgba(88,101,242,0.3);">${meta.label}</span>`;
        }).join('');

    const li = document.createElement('li');
    li.style.cssText = 'padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;';
    li.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <i class="fa-solid ${type === 'user' ? 'fa-user' : 'fa-users'}" style="${colorStyle}font-size:13px;"></i>
          <strong style="font-size:13px;color:var(--text-main);">${displayName}</strong>
          <code style="font-size:10px;color:var(--text-muted);background:rgba(0,0,0,0.2);padding:1px 5px;border-radius:3px;">${id}</code>
        </div>
        <div class="pa-tab-edit-area-${id}" style="display:none; margin-bottom:8px;">
          <div class="pa-edit-checkboxes-${id}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:5px;margin-bottom:8px;"></div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-primary" style="padding:4px 12px;font-size:12px;" onclick="savePanelAccessTabs('${type}','${id}')">Kaydet</button>
            <button class="btn" style="padding:4px 12px;font-size:12px;background:rgba(255,255,255,0.04);" onclick="togglePanelAccessEdit('${type}','${id}')">İptal</button>
          </div>
        </div>
        <div class="pa-tab-badges-${id}">${tabBadges}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn-icon-only edit" style="width:28px;height:28px;font-size:12px;" title="Sekmeleri Düzenle" onclick="togglePanelAccessEdit('${type}','${id}', ${JSON.stringify(tabs)}, ${JSON.stringify(availableTabs)})">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn-icon-only delete" style="width:28px;height:28px;font-size:12px;" title="Erişimi Kaldır" onclick="removePanelAccess('${type}','${id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    list.appendChild(li);
  });
}

// Sekme düzenleme alanını aç/kapat
function togglePanelAccessEdit(type, id, currentTabs, availableTabs) {
  const editArea = document.querySelector(`.pa-tab-edit-area-${id}`);
  const badgesArea = document.querySelector(`.pa-tab-badges-${id}`);
  if (!editArea) return;

  const isOpen = editArea.style.display !== 'none';
  if (isOpen) {
    editArea.style.display = 'none';
    if (badgesArea) badgesArea.style.display = 'block';
    return;
  }

  // Checkbox'ları render et
  const checkContainer = document.querySelector(`.pa-edit-checkboxes-${id}`);
  if (checkContainer && availableTabs) {
    checkContainer.innerHTML = '';
    availableTabs.forEach(tab => {
      const meta = TAB_DISPLAY_NAMES[tab] || { label: tab, icon: 'fa-circle' };
      const isChecked = !currentTabs || currentTabs.includes('*') || currentTabs.includes(tab);
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:5px;cursor:pointer;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);font-size:11px;';
      label.innerHTML = `
        <input type="checkbox" data-tab="${tab}" ${isChecked ? 'checked' : ''} style="width:13px;height:13px;cursor:pointer;accent-color:#7c3aed;">
        <i class="fa-solid ${meta.icon}" style="font-size:10px;color:var(--text-muted);"></i>
        <span>${meta.label}</span>
      `;
      checkContainer.appendChild(label);
    });
  }

  editArea.style.display = 'block';
  if (badgesArea) badgesArea.style.display = 'none';
}

// Sekme izinlerini kaydet
async function savePanelAccessTabs(type, id) {
  const checkContainer = document.querySelector(`.pa-edit-checkboxes-${id}`);
  if (!checkContainer) return;

  const checked = [...checkContainer.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.getAttribute('data-tab'));
  if (checked.length === 0) return showToast('En az bir sekme seçmelisiniz!', 'error');

  try {
    const res = await fetch('/api/panel-access/update-tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id, tabs: checked })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadPanelAccess();
    } else {
      showToast(result.error || 'Hata oluştu.', 'error');
    }
  } catch (err) {
    showToast('Sekme izinleri güncellenirken hata oluştu.', 'error');
  }
}

// Kişi panele ekle
async function addPanelAccessUser() {
  const sel = document.getElementById('pa-user-select');
  const inp = document.getElementById('pa-user-input');
  const userId = sel?.value || inp?.value?.trim();
  if (!userId) return showToast('Lütfen bir kişi seçin veya Discord ID girin!', 'error');
  if (inp?.value?.trim() && !/^\d+$/.test(inp.value.trim())) return showToast('Discord ID sadece rakamlardan oluşmalıdır!', 'error');

  const container = document.getElementById('pa-user-tab-checkboxes');
  const checked = container ? [...container.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.getAttribute('data-tab')) : [];
  if (checked.length === 0) return showToast('En az bir sekme seçmelisiniz!', 'error');

  try {
    const res = await fetch('/api/panel-access/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', id: userId, tabs: checked })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      if (sel) sel.value = '';
      if (inp) inp.value = '';
      loadPanelAccess();
    } else {
      showToast(result.error || 'Hata oluştu.', 'error');
    }
  } catch (err) {
    showToast('Kişi eklenirken hata oluştu.', 'error');
  }
}

// Rol panele ekle
async function addPanelAccessRole() {
  const sel = document.getElementById('pa-role-select');
  const roleId = sel?.value;
  if (!roleId) return showToast('Lütfen bir rol seçin!', 'error');

  const container = document.getElementById('pa-role-tab-checkboxes');
  const checked = container ? [...container.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.getAttribute('data-tab')) : [];
  if (checked.length === 0) return showToast('En az bir sekme seçmelisiniz!', 'error');

  try {
    const res = await fetch('/api/panel-access/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'role', id: roleId, tabs: checked })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      if (sel) sel.value = '';
      loadPanelAccess();
    } else {
      showToast(result.error || 'Hata oluştu.', 'error');
    }
  } catch (err) {
    showToast('Rol eklenirken hata oluştu.', 'error');
  }
}

// Erişimi kaldır
async function removePanelAccess(type, id) {
  const label = type === 'user' ? 'kişinin' : 'rolün';
  if (!confirm(`Bu ${label} web panel erişimini kaldırmak istediğinizden emin misiniz?`)) return;

  try {
    const res = await fetch('/api/panel-access/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadPanelAccess();
    } else {
      showToast(result.error || 'Hata oluştu.', 'error');
    }
  } catch (err) {
    showToast('Erişim kaldırılırken hata oluştu.', 'error');
  }
}

// Tümünü seç / temizle yardımcıları
function paSelectAllTabs(forType) {
  const containerId = forType === 'user' ? 'pa-user-tab-checkboxes' : 'pa-role-tab-checkboxes';
  document.querySelectorAll(`#${containerId} input[type=checkbox]`).forEach(cb => cb.checked = true);
}
function paClearAllTabs(forType) {
  const containerId = forType === 'user' ? 'pa-user-tab-checkboxes' : 'pa-role-tab-checkboxes';
  document.querySelectorAll(`#${containerId} input[type=checkbox]`).forEach(cb => cb.checked = false);
}

// Buton event listener'ları
document.addEventListener('DOMContentLoaded', () => {
  const btnAddUser = document.getElementById('btn-add-panel-user');
  if (btnAddUser) btnAddUser.addEventListener('click', addPanelAccessUser);

  const btnAddRole = document.getElementById('btn-add-panel-role');
  if (btnAddRole) btnAddRole.addEventListener('click', addPanelAccessRole);
});

// ══════════════════════════════════════════════════════════════════

// 4) Config Ayarlarını Yükle
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();

    // Text inputları doldur
    document.getElementById('cfg-ekipIsmi').value = config.ekipIsmi || '';
    document.getElementById('cfg-guildId').value = config.guildId || '';

    // Select elemanlarını doldur (Değerleri eşleştir)
    const selects = document.querySelectorAll('#system-settings-form select');
    selects.forEach(sel => {
      const configKey = sel.id.replace('cfg-', '');
      if (config[configKey]) {
        sel.value = config[configKey];
        if (!sel.value && config[configKey]) {
          const opt = document.createElement('option');
          opt.value = config[configKey];
          opt.innerText = `Özel ID: ${config[configKey]}`;
          opt.selected = true;
          sel.appendChild(opt);
        }
      } else {
        sel.value = '';
      }

      // Searchable-select görünümünü güncelle
      const ssWrapper = sel.closest('.searchable-select');
      if (ssWrapper) {
        const valDisplay = ssWrapper.querySelector('.ss-value');
        const clearBtn = ssWrapper.querySelector('.ss-clear-btn');
        const selectedOpt = sel.options[sel.selectedIndex];
        const isRole = sel.classList.contains('guild-role-select');
        const isCategory = sel.classList.contains('guild-category-select');
        const isChannel = sel.classList.contains('guild-channel-select');

        if (selectedOpt && selectedOpt.value) {
          if (isRole) {
            const roleObj = discordRoles.find(r => r.id === selectedOpt.value);
            const color = roleObj?.color && roleObj.color !== '#000000' ? roleObj.color : 'var(--accent)';
            if (valDisplay) valDisplay.innerHTML = `<span class="ss-badge"><span class="ss-badge-dot" style="background:${color};"></span>${selectedOpt.innerText}</span>`;
          } else if (isCategory) {
            if (valDisplay) valDisplay.innerHTML = `<span class="ss-badge" style="background:rgba(234,179,8,0.15);border-color:rgba(234,179,8,0.3);"><i class="fa-solid fa-folder" style="color:#eab308;font-size:12px;"></i> ${selectedOpt.innerText.replace(/^📂\s*/, '')}</span>`;
          } else if (isChannel) {
            const chanObj = discordChannels.find(c => c.id === selectedOpt.value);
            const isVoice = chanObj?.type === 2 || selectedOpt.innerText.startsWith('🔊');
            const icon = isVoice ? 'fa-volume-high' : 'fa-hashtag';
            const iconColor = isVoice ? '#38bdf8' : '#818cf8';
            const cleanText = selectedOpt.innerText.replace(/^[#🔊]\s*/, '');
            if (valDisplay) valDisplay.innerHTML = `<span class="ss-badge" style="background:rgba(99,102,241,0.15);"><i class="fa-solid ${icon}" style="color:${iconColor};font-size:12px;"></i> ${cleanText}</span>`;
          } else {
            if (valDisplay) valDisplay.innerHTML = `<span class="ss-badge">${selectedOpt.innerText}</span>`;
          }
          if (valDisplay) valDisplay.classList.remove('is-empty');
          if (clearBtn) clearBtn.style.display = 'inline-block';
        } else {
          if (valDisplay) {
            valDisplay.innerHTML = 'Seçiniz...';
            valDisplay.classList.add('is-empty');
          }
          if (clearBtn) clearBtn.style.display = 'none';
        }
      }
    });


    // Checkbox elemanlarını doldur (Sistem Toggles)
    const checkboxes = document.querySelectorAll('#system-settings-form input[type="checkbox"]');
    checkboxes.forEach(cb => {
      const configKey = cb.id.replace('cfg-', '');
      cb.checked = config[configKey] !== false;
    });

  } catch (err) {
    console.error(err);
    showToast('Config ayarları yüklenemedi.', 'error');
  }
}

// Config Ayarları Kaydetme Formu
document.getElementById('system-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const updates = {};
  updates.ekipIsmi = document.getElementById('cfg-ekipIsmi').value;

  const selects = document.querySelectorAll('#system-settings-form select');
  selects.forEach(sel => {
    const configKey = sel.id.replace('cfg-', '');
    updates[configKey] = sel.value;
  });

  const checkboxes = document.querySelectorAll('#system-settings-form input[type="checkbox"]');
  checkboxes.forEach(cb => {
    const configKey = cb.id.replace('cfg-', '');
    updates[configKey] = cb.checked;
  });

  try {
    const res = await fetch('/api/config/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const result = await res.json();
    
    if (result.success) {
      showToast(result.message, 'success');
      loadConfig();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Ayarlar kaydedilirken hata oluştu.', 'error');
  }
});

// 5) DM Duyuru Formu
document.getElementById('dm-announce-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const roleId = document.getElementById('announce-role-id').value;
  const message = document.getElementById('announce-message').value;

  if (!roleId || !message) return;

  if (!confirm('Bu duyuruyu tüm hedef üyelere göndermek istediğinizden emin misiniz?')) return;

  try {
    const res = await fetch('/api/dm-duyuru', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId, message })
    });
    const result = await res.json();
    
    if (result.success) {
      showToast(result.message, 'success');
      document.getElementById('announce-message').value = '';
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Duyuru gönderilirken bir hata oluştu.', 'error');
  }
});

// 6) Etkinlikleri ve Etkinlik Sayılarını Yükle
let currentEventStats = [];

async function loadEvents() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();

    // Aktif Etkinlikler Grid
    const activeGrid = document.getElementById('active-events-grid');
    activeGrid.innerHTML = '';

    if (data.activeEvents.length === 0) {
      activeGrid.innerHTML = '<div class="loading-item" style="grid-column: 1 / -1;">Aktif etkinlik bulunmuyor.</div>';
    } else {
      data.activeEvents.forEach(evt => {
        const card = document.createElement('div');
        card.className = 'event-active-card';
        const dateFormatted = new Date(evt.timestamp || Date.now()).toLocaleString('tr-TR');
        card.innerHTML = `
          <div class="eac-header">
            <span class="eac-type"><i class="fa-solid fa-calendar-check"></i> ${evt.eventType || evt.name || 'Etkinlik'}</span>
            <span class="eac-id">#${evt.messageId}</span>
          </div>
          <div class="eac-body">
            <div class="eac-info">
              <i class="fa-regular fa-user"></i> <span>${evt.creatorTag || evt.creatorId || '-'}</span>
            </div>
            <div class="eac-info">
              <i class="fa-regular fa-clock"></i> <span>${dateFormatted}</span>
            </div>
          </div>
          <div class="eac-footer">
            <button class="btn btn-ghost btn-sm" onclick="showEventEditModal('${evt.messageId}', '${(evt.eventType || evt.name || '').replace(/'/g, "\\'")}', '${evt.limit || ''}', '${evt.sure || ''}', '${evt.yedek || ''}', '${evt.toplanmaSaati || ''}')">
              <i class="fa-solid fa-pen-to-square"></i> Düzenle
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteActiveEvent('${evt.messageId}')">
              <i class="fa-solid fa-ban"></i> Bitir
            </button>
          </div>
        `;
        activeGrid.appendChild(card);
      });
    }

    currentEventStats = data.eventStats || [];
    renderEventStats();

  } catch (err) {
    console.error(err);
    showToast('Etkinlik bilgileri alınamadı.', 'error');
  }
}

function renderEventStats() {
  const sortSelect = document.getElementById('event-sort-select');
  const sortOrder = sortSelect ? sortSelect.value : 'desc';

  const filterSelect = document.getElementById('event-filter-select');
  const filterVal = filterSelect ? filterSelect.value : 'all';

  let filteredStats = [...currentEventStats];
  if (filterVal === 'did') {
    filteredStats = filteredStats.filter(st => st.eventCount > 0);
  } else if (filterVal === 'notdid') {
    filteredStats = filteredStats.filter(st => st.eventCount === 0);
  }

  if (sortOrder === 'asc') {
    filteredStats.sort((a, b) => a.eventCount - b.eventCount);
  } else {
    filteredStats.sort((a, b) => b.eventCount - a.eventCount);
  }

  const statsTbody = document.getElementById('event-stats-tbody');
  statsTbody.innerHTML = '';

  if (filteredStats.length === 0) {
    statsTbody.innerHTML = '<tr><td colspan="4" class="loading-item">Kayıtlı etkinlik istatistiği bulunmuyor.</td></tr>';
  } else {
    filteredStats.forEach((st, index) => {
      const member = discordMembers.find(m => m.id === st.userId);
      const nameText = member ? `${member.displayName}` : `Bilinmeyen (\`${st.userId}\`)`;
      const avatarUrl = member && member.avatar ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
      
      let rankBadge = `<span class="rank-badge">${index + 1}</span>`;
      if (index === 0) rankBadge = `<span class="rank-badge gold"><i class="fa-solid fa-crown"></i></span>`;
      else if (index === 1) rankBadge = `<span class="rank-badge silver">${index + 1}</span>`;
      else if (index === 2) rankBadge = `<span class="rank-badge bronze">${index + 1}</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="width: 60px; text-align: center;">${rankBadge}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${avatarUrl}" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); object-fit: cover;">
            <div style="display: flex; flex-direction: column;">
              <strong style="color: var(--text-primary); font-size: 14px;">${nameText}</strong>
              <span style="color: var(--text-muted); font-size: 11px;">${member ? member.tag : ''}</span>
            </div>
          </div>
        </td>
        <td style="text-align: center;">
          <div class="event-count-badge">
            <i class="fa-solid fa-star"></i> ${st.eventCount}
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-icon-only edit" title="1 Ekle" onclick="updateEventCount('${st.userId}', 1, 'add')" style="background: var(--success-subtle); color: var(--success); border: 1px solid var(--success-glow);">
              <i class="fa-solid fa-plus"></i>
            </button>
            <button class="btn btn-icon-only edit" title="1 Çıkar" onclick="updateEventCount('${st.userId}', -1, 'add')" style="background: var(--warning-subtle); color: var(--warning); border: 1px solid var(--warning-glow);">
              <i class="fa-solid fa-minus"></i>
            </button>
            <button class="btn btn-icon-only" title="Sıfırla" onclick="updateEventCount('${st.userId}', 0, 'clear')" style="background: var(--danger-subtle); color: var(--danger); border: 1px solid var(--danger-glow);">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      `;
      statsTbody.appendChild(tr);
    });
  }
}

function exportEventStats() {
  const sortSelect = document.getElementById('event-sort-select');
  const sortOrder = sortSelect ? sortSelect.value : 'desc';

  const filterSelect = document.getElementById('event-filter-select');
  const filterVal = filterSelect ? filterSelect.value : 'all';

  let filteredStats = [...currentEventStats];
  if (filterVal === 'did') {
    filteredStats = filteredStats.filter(st => st.eventCount > 0);
  } else if (filterVal === 'notdid') {
    filteredStats = filteredStats.filter(st => st.eventCount === 0);
  }

  if (sortOrder === 'asc') {
    filteredStats.sort((a, b) => a.eventCount - b.eventCount);
  } else {
    filteredStats.sort((a, b) => b.eventCount - a.eventCount);
  }

  let fileContent = 'ETKİNLİK TOP\n';
  fileContent += '==================================================\n\n';
  fileContent += 'Sıra | İsim | ID | Etkinlik Sayısı|\n';
  fileContent += '----------------------------------------------------------------------\n';

  filteredStats.forEach((st, index) => {
    const member = discordMembers.find(m => m.id === st.userId);
    const displayName = member ? member.displayName : 'Bilinmeyen Kullanıcı';
    fileContent += `${index + 1}. ${displayName} - ${st.userId} - ${st.eventCount} adet -\n`;
  });

  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  let filterText = 'tumu';
  if (filterVal === 'did') filterText = 'yapanlar';
  if (filterVal === 'notdid') filterText = 'yapmayanlar';

  a.download = `etkinlik_istatistikleri_${filterText}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('İstatistikler başarıyla dışa aktarıldı.', 'success');
}

// Aktif Etkinlik Silme
async function deleteActiveEvent(messageId) {
  if (!confirm('Bu etkinliği sonlandırmak ve listeden kaldırmak istediğinizden emin misiniz?')) return;

  try {
    const res = await fetch('/api/events/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadEvents();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Etkinlik kaldırılırken bir hata meydana geldi.', 'error');
  }
}

// Bütün Aktif Etkinlikleri Sil
async function clearAllEvents() {
  if (!confirm('Bütün aktif etkinlik kayıtlarını silmek istediğinizden emin misiniz?\n(Bu işlem kullanıcıların etkinlik sayılarını veya istatistiklerini sıfırlamaz, sadece aktif etkinlikler listesini temizler)')) return;

  try {
    const res = await fetch('/api/events/clear-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadEvents();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Etkinlikler temizlenirken bir hata meydana geldi.', 'error');
  }
}

// Yetkili Etkinlik Sayısı Güncelleme
async function updateEventCount(userId, amount, action) {
  if (action === 'clear' && !confirm('Bu kullanıcının tüm etkinlik geçmişini sıfırlamak istediğinize emin misiniz?')) return;

  try {
    const res = await fetch('/api/events/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, action })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadEvents();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Etkinlik sayısı güncellenirken hata oluştu.', 'error');
  }
}

// 6.5) Farm Yükleme ve Farm Sayılarını Yönetme
let currentFarmStats = [];

async function loadFarm() {
  try {
    const res = await fetch('/api/farm');
    const data = await res.json();

    currentFarmStats = data.farmStats || [];
    renderFarmStats();

  } catch (err) {
    console.error(err);
    showToast('Farm bilgileri alınamadı.', 'error');
  }
}

function renderFarmStats() {
  const sortSelect = document.getElementById('farm-sort-select');
  const sortOrder = sortSelect ? sortSelect.value : 'desc';

  const filterSelect = document.getElementById('farm-filter-select');
  const filterVal = filterSelect ? filterSelect.value : 'all';

  let filteredStats = [...currentFarmStats];
  if (filterVal === 'did') {
    filteredStats = filteredStats.filter(st => st.farmCount > 0);
  } else if (filterVal === 'notdid') {
    filteredStats = filteredStats.filter(st => st.farmCount === 0);
  }

  if (sortOrder === 'asc') {
    filteredStats.sort((a, b) => a.farmCount - b.farmCount);
  } else {
    filteredStats.sort((a, b) => b.farmCount - a.farmCount);
  }

  // Toplam farm sayısını üstteki karta yaz (tüm üyelerin toplamı, filtrelemeye bakılmaz)
  const totalFarm = currentFarmStats.reduce((sum, st) => sum + (st.farmCount || 0), 0);
  const statTotalEl = document.getElementById('stat-total-farm');
  if (statTotalEl) statTotalEl.innerText = totalFarm.toLocaleString('tr-TR');

  const statsTbody = document.getElementById('farm-stats-tbody');
  statsTbody.innerHTML = '';

  if (filteredStats.length === 0) {
    statsTbody.innerHTML = '<tr><td colspan="4" class="loading-item">Kayıtlı farm istatistiği bulunmuyor.</td></tr>';
  } else {
    filteredStats.forEach((st, index) => {
      const member = discordMembers.find(m => m.id === st.userId);
      const nameText = member ? `${member.displayName}` : `Bilinmeyen (\`${st.userId}\`)`;
      const avatarUrl = member && member.avatar ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
      
      let rankBadge = `<span class="rank-badge">${index + 1}</span>`;
      if (index === 0) rankBadge = `<span class="rank-badge gold"><i class="fa-solid fa-crown"></i></span>`;
      else if (index === 1) rankBadge = `<span class="rank-badge silver">${index + 1}</span>`;
      else if (index === 2) rankBadge = `<span class="rank-badge bronze">${index + 1}</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="width: 60px; text-align: center;">${rankBadge}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${avatarUrl}" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); object-fit: cover;">
            <div style="display: flex; flex-direction: column;">
              <strong style="color: var(--text-primary); font-size: 14px;">${nameText}</strong>
              <span style="color: var(--text-muted); font-size: 11px;">${member ? member.tag : ''}</span>
            </div>
          </div>
        </td>
        <td style="text-align: center;">
          <div class="event-count-badge" style="background: rgba(230, 126, 34, 0.15); color: #e67e22; border-color: rgba(230, 126, 34, 0.3);">
            <i class="fa-solid fa-tractor"></i> ${st.farmCount.toLocaleString('tr-TR')}
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-icon-only edit" title="100 Ekle" onclick="updateFarmCount('${st.userId}', 100, 'add')" style="background: var(--success-subtle); color: var(--success); border: 1px solid var(--success-glow);">
              <i class="fa-solid fa-plus"></i> 100
            </button>
            <button class="btn btn-icon-only edit" title="Değer Düzenle" onclick="promptUpdateFarmCount('${st.userId}', ${st.farmCount})" style="background: var(--primary-subtle); color: var(--primary); border: 1px solid var(--primary-glow);">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-icon-only edit" title="100 Çıkar" onclick="updateFarmCount('${st.userId}', -100, 'add')" style="background: var(--warning-subtle); color: var(--warning); border: 1px solid var(--warning-glow);">
              <i class="fa-solid fa-minus"></i> 100
            </button>
            <button class="btn btn-icon-only" title="Sıfırla" onclick="updateFarmCount('${st.userId}', 0, 'clear')" style="background: var(--danger-subtle); color: var(--danger); border: 1px solid var(--danger-glow);">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      `;
      statsTbody.appendChild(tr);
    });
  }
}

async function updateFarmCount(userId, amount, action) {
  if (action === 'clear' && !confirm('Bu kullanıcının tüm farm geçmişini sıfırlamak istediğinize emin misiniz?')) return;

  try {
    const res = await fetch('/api/farm/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, action })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadFarm();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Farm miktarı güncellenirken hata oluştu.', 'error');
  }
}

function promptUpdateFarmCount(userId, currentVal) {
  const newValStr = prompt('Yeni farm miktarını girin:', currentVal);
  if (newValStr === null) return;
  const newVal = parseInt(newValStr);
  if (isNaN(newVal) || newVal < 0) {
    showToast('Geçersiz farm miktarı girdiniz.', 'error');
    return;
  }
  updateFarmCount(userId, newVal, 'set');
}

function exportFarmStats() {
  const sortSelect = document.getElementById('farm-sort-select');
  const sortOrder = sortSelect ? sortSelect.value : 'desc';

  const filterSelect = document.getElementById('farm-filter-select');
  const filterVal = filterSelect ? filterSelect.value : 'all';

  let filteredStats = [...currentFarmStats];
  if (filterVal === 'did') {
    filteredStats = filteredStats.filter(st => st.farmCount > 0);
  } else if (filterVal === 'notdid') {
    filteredStats = filteredStats.filter(st => st.farmCount === 0);
  }

  if (sortOrder === 'asc') {
    filteredStats.sort((a, b) => a.farmCount - b.farmCount);
  } else {
    filteredStats.sort((a, b) => b.farmCount - a.farmCount);
  }

  let fileContent = 'FARM TOP LISTESI\n';
  fileContent += '==================================================\n\n';
  fileContent += 'Sıra | İsim | ID | Farm Miktarı|\n';
  fileContent += '----------------------------------------------------------------------\n';

  filteredStats.forEach((st, index) => {
    const member = discordMembers.find(m => m.id === st.userId);
    const displayName = member ? member.displayName : 'Bilinmeyen Kullanıcı';
    fileContent += `${index + 1}. ${displayName} - ${st.userId} - ${st.farmCount} farm -\n`;
  });

  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  let filterText = 'tumu';
  if (filterVal === 'did') filterText = 'yapanlar';
  if (filterVal === 'notdid') filterText = 'yapmayanlar';

  a.download = `farm_istatistikleri_${filterText}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Farm istatistikleri başarıyla dışa aktarıldı.', 'success');
}

// 7) Bot Güç Kontrolleri (Restart / Stop)
document.getElementById('btn-restart').addEventListener('click', async () => {
  if (!confirm('Botu yeniden başlatmak istediğinizden emin misiniz?')) return;
  
  try {
    const res = await fetch('/api/bot/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restart' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      // 5 saniye sonra sayfayı yeniden yüklemeye çalış
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Bot yeniden başlatılamadı.', 'error');
  }
});

document.getElementById('btn-stop').addEventListener('click', async () => {
  if (!confirm('DİKKAT: Botu tamamen kapatmak istediğinizden emin misiniz?')) return;
  
  try {
    const res = await fetch('/api/bot/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Bot kapatılamadı.', 'error');
  }
});

document.getElementById('btn-start').addEventListener('click', async () => {
  if (!confirm('Botu başlatmak istediğinizden emin misiniz?')) return;
  
  try {
    const res = await fetch('/api/bot/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadStatus();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Bot başlatılamadı.', 'error');
  }
});

// 8) Veritabanı Sıfırlama
async function resetDatabase(target) {
  let text = '';
  if (target === 'farm') text = 'Tüm kullanıcıların farm verileri sıfırlanacak!';
  if (target === 'warnings') text = 'Tüm kullanıcıların uyarı ve geçmiş kayıtları sıfırlanacak!';
  if (target === 'events') text = 'Tüm etkinlik sayıları ve aktif etkinlik verileri sıfırlanacak!';
  if (target === 'all') text = 'DİKKAT: Veritabanındaki tüm farm, uyarı, etkinlik ve istatistik verileri kalıcı olarak silinecek!';

  if (!confirm(`${text}\nBu işlemi onaylıyor musunuz?`)) return;
  if (target === 'all' && !confirm('SON UYARI: Bu işlem geri alınamaz. Devam etmek istiyor musunuz?')) return;

  try {
    const res = await fetch('/api/data/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Sıfırlama işlemi sırasında teknik bir hata oluştu.', 'error');
  }
}

// 9) Çıkış (Logout) Butonu
document.getElementById('logout-btn').addEventListener('click', () => {
  if (confirm('Panel oturumunu sonlandırmak istiyor musunuz?')) {
    // Sayfayı kapatmayı dene veya geçersiz bir URL'ye at
    window.location.href = 'about:blank';
  }
});

// 10) Ticket Ayarlarını Yükle
async function loadTicketSettings() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();

    // Temel Ticket Ayarlarını Doldur
    document.getElementById('ticket-cfg-ticketStaffRoleId').value = config.ticketStaffRoleId || '';
    document.getElementById('ticket-cfg-ticketChannelId').value = config.ticketChannelId || '';
    document.getElementById('ticket-cfg-ticketLogChannelId').value = config.ticketLogChannelId || '';
    document.getElementById('ticket-cfg-basvuruCategoryId').value = config.basvuruCategoryId || '';
    document.getElementById('ticket-cfg-ticketPanelStyle').value = config.ticketPanelStyle || 'style1';
    document.getElementById('ticket-cfg-ticketPanelType').value = config.ticketPanelType || 'select';
    document.getElementById('ticket-cfg-ticketEmbedColor').value = config.ticketEmbedColor || '#2B2D7A';

    // Onay / Red Ayarlarını Doldur
    document.getElementById('ticket-cfg-onayChannelId').value = config.onayChannelId || '';

    // Ticket searchable-select rozetlerini senkronize et
    ['ticket-cfg-ticketStaffRoleId', 'ticket-cfg-ticketChannelId', 'ticket-cfg-ticketLogChannelId', 'ticket-cfg-basvuruCategoryId', 'ticket-cfg-onayChannelId'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.dispatchEvent(new Event('change'));
    });
    document.getElementById('ticket-cfg-ticketApprovalDmMessage').value = config.ticketApprovalDmMessage || `{panda} **Başvurunuz Onaylandı!**\n\nTebrikler! Başvurunuz incelendi ve onaylandı. Aramıza hoş geldin!`;
    document.getElementById('ticket-cfg-ticketRejectionDmMessage').value = config.ticketRejectionDmMessage || `{unlem} **Başvurunuz Reddedildi**\n\nMaalesef başvurunuz reddedildi.\n\n**Sebep:** {reason}`;
    document.getElementById('ticket-cfg-ticketApprovalChannelMessage').value = config.ticketApprovalChannelMessage || `{panda} {user} incelenip ekibe uygun görülmüş ve başvurusu onaylanmıştır.`;
    document.getElementById('ticket-cfg-ticketRejectionChannelMessage').value = config.ticketRejectionChannelMessage || `{unlem} {user} başvurusu **{reason}** sebebiyle reddedilmiştir.`;

    document.getElementById('ticket-cfg-ticketApprovalDmEnabled').checked = config.ticketApprovalDmEnabled !== false;
    document.getElementById('ticket-cfg-ticketRejectionDmEnabled').checked = config.ticketRejectionDmEnabled !== false;
    document.getElementById('ticket-cfg-ticketApprovalChannelEnabled').checked = config.ticketApprovalChannelEnabled !== false;
    document.getElementById('ticket-cfg-ticketRejectionChannelEnabled').checked = config.ticketRejectionChannelEnabled !== false;

    // Form metnini doldur
    const defaultForm = `**Başvuru formu :**\nYaş:\nGünlük aktiflik süreniz?\nDaha önce hangi ekiplerde oynadınız?\nFivem saatiniz:\nMap Bilgisi (10/?):\n3 Adet kill pov (zorunlu):`;
    document.getElementById('ticket-form-text').value = config.ticketFormText || defaultForm;

    // Kategorileri Tabloda Listele
    const categoriesTbody = document.getElementById('ticket-categories-tbody');
    categoriesTbody.innerHTML = '';

    const categories = config.ticketCategories || [
      { id: 'destek', label: 'Destek', emoji: '1507734289255628990', description: 'Destek almak için ticket açın', enabled: true, categoryId: config.basvuruCategoryId || '', buttonStyle: 'Primary' },
      { id: 'basvuru', label: 'Başvuru', emoji: '1507733959432208515', description: 'Ekibe katılmak için başvurun', enabled: true, categoryId: config.basvuruCategoryId || '', buttonStyle: 'Secondary' },
      { id: 'referans', label: 'Referans ile Alım', emoji: '1507734363046150204', description: 'Referans ile alım için başvurun', enabled: true, categoryId: config.basvuruCategoryId || '', buttonStyle: 'Primary' }
    ];

    categories.forEach(cat => {
      const tr = document.createElement('tr');
      
      const badgeClass = cat.enabled ? 'dot green' : 'dot';
      const badgeStyle = !cat.enabled ? 'background: #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68, 0.35);' : '';
      const statusText = cat.enabled ? 'Aktif' : 'Pasif';

      // Kategori kanalını bul
      const targetChannel = discordChannels.find(ch => ch.id === cat.categoryId);
      const categoryName = targetChannel ? `📂 ${targetChannel.name}` : `Bilinmeyen Kategori (\`${cat.categoryId || ''}\`)`;

      const buttonStyleTranslations = { Primary: 'Mavi', Secondary: 'Gri', Success: 'Yeşil', Danger: 'Kırmızı' };
      const styleText = buttonStyleTranslations[cat.buttonStyle || 'Primary'] || 'Mavi';

      tr.innerHTML = `
        <td><code>${cat.id}</code></td>
        <td><strong>${cat.label}</strong></td>
        <td><code>${cat.emoji || '-'}</code></td>
        <td><span class="user-role">${cat.categoryId ? categoryName : 'Varsayılan (Config)'}</span></td>
        <td><span class="user-role">${styleText}</span></td>
        <td><span class="user-role">${cat.description || '-'}</span></td>
        <td>
          <span class="status-badge" style="margin-top:0;">
            <span class="${badgeClass}" style="${badgeStyle}"></span> ${statusText}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-small ${cat.enabled ? 'btn-danger' : 'btn-success'}" onclick="toggleTicketCategory('${cat.id}')" style="padding: 6px 10px; font-size: 11px; width: auto; border:none; outline:none;" title="${cat.enabled ? 'Kapat' : 'Aç'}">
              <i class="fa-solid ${cat.enabled ? 'fa-eye-slash' : 'fa-eye'}"></i>
            </button>
            <button class="btn btn-small btn-primary" onclick="editTicketCategory('${cat.id}', '${cat.label.replace(/'/g, "\\'")}', '${cat.emoji || ''}', '${cat.categoryId || ''}', '${cat.buttonStyle || 'Primary'}', '${(cat.description || '').replace(/'/g, "\\'")}')" style="padding: 6px 10px; font-size: 11px; width: auto;" title="Düzenle">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-small btn-danger" onclick="deleteTicketCategory('${cat.id}')" style="padding: 6px 10px; font-size: 11px; width: auto;" title="Sil">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;
      categoriesTbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    showToast('Ticket ayarları yüklenemedi.', 'error');
  }
}

// Kategori Aktif/Pasif Durumu Değiştirme
async function toggleTicketCategory(categoryId) {
  try {
    const res = await fetch('/api/ticket/category/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadTicketSettings();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Kategori durumu değiştirilirken hata oluştu.', 'error');
  }
}

// Kategori Ekle/Düzenle Arayüz İşlemleri
function showNewCategoryForm() {
  document.getElementById('category-form-card').style.display = 'block';
  document.getElementById('category-form-title').innerHTML = '<i class="fa-solid fa-plus"></i> Yeni Kategori Ekle';
  document.getElementById('cat-is-edit').value = 'false';
  
  // Alanları temizle
  document.getElementById('cat-id').value = '';
  document.getElementById('cat-id').disabled = false;
  document.getElementById('cat-label').value = '';
  document.getElementById('cat-emoji').value = '';
  document.getElementById('cat-categoryId').value = '';
  document.getElementById('cat-buttonStyle').value = 'Primary';
  document.getElementById('cat-description').value = '';
  
  // Sayfayı forma kaydır
  document.getElementById('category-form-card').scrollIntoView({ behavior: 'smooth' });
}

function editTicketCategory(id, label, emoji, categoryId, buttonStyle, description) {
  document.getElementById('category-form-card').style.display = 'block';
  document.getElementById('category-form-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Kategoriyi Düzenle';
  document.getElementById('cat-is-edit').value = 'true';
  
  // Alanları doldur
  document.getElementById('cat-id').value = id;
  document.getElementById('cat-id').disabled = true; // Düzenlerken ID değiştirilemez
  document.getElementById('cat-label').value = label;
  document.getElementById('cat-emoji').value = emoji;
  document.getElementById('cat-categoryId').value = categoryId;
  document.getElementById('cat-buttonStyle').value = buttonStyle || 'Primary';
  document.getElementById('cat-description').value = description;

  document.getElementById('category-form-card').scrollIntoView({ behavior: 'smooth' });
}

function hideCategoryForm() {
  document.getElementById('category-form-card').style.display = 'none';
}

// Kategori Silme
async function deleteTicketCategory(categoryId) {
  if (!confirm(`"${categoryId}" kategorisini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) return;

  try {
    const res = await fetch('/api/ticket/category/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadTicketSettings();
      hideCategoryForm();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Kategori silinirken hata oluştu.', 'error');
  }
}

// Kategori Kaydetme Formu (Submit)
document.getElementById('ticket-category-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('cat-id').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const label = document.getElementById('cat-label').value;
  const emoji = document.getElementById('cat-emoji').value;
  const categoryId = document.getElementById('cat-categoryId').value;
  const buttonStyle = document.getElementById('cat-buttonStyle').value;
  const description = document.getElementById('cat-description').value;

  if (!id || !label || !emoji) return;

  try {
    const res = await fetch('/api/ticket/category/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, label, emoji, categoryId, buttonStyle, description })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadTicketSettings();
      hideCategoryForm();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Kategori kaydedilemedi.', 'error');
  }
});

// Ticket Temel Ayarları Form Dinleyicisi
document.getElementById('ticket-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const updates = {
    ticketStaffRoleId: document.getElementById('ticket-cfg-ticketStaffRoleId').value,
    ticketChannelId: document.getElementById('ticket-cfg-ticketChannelId').value,
    ticketLogChannelId: document.getElementById('ticket-cfg-ticketLogChannelId').value,
    basvuruCategoryId: document.getElementById('ticket-cfg-basvuruCategoryId').value,
    ticketPanelStyle: document.getElementById('ticket-cfg-ticketPanelStyle').value,
    ticketPanelType: document.getElementById('ticket-cfg-ticketPanelType').value,
    ticketEmbedColor: document.getElementById('ticket-cfg-ticketEmbedColor').value
  };

  try {
    const res = await fetch('/api/config/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Ticket temel ayarları başarıyla kaydedildi.', 'success');
      loadTicketSettings();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Ticket ayarları kaydedilemedi.', 'error');
  }
});

// Ticket Başvuru Form Metni Dinleyicisi
document.getElementById('ticket-form-text-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formText = document.getElementById('ticket-form-text').value;

  try {
    const res = await fetch('/api/ticket/form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formText })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadTicketSettings();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Form metni kaydedilemedi.', 'error');
  }
});

// 11) Görünüm 1 / Görünüm 2 Toggle Mantığı
const btnSettingsView1 = document.getElementById('btn-settings-view-1');
const btnSettingsView2 = document.getElementById('btn-settings-view-2');
const formSettingsLayout = document.getElementById('system-settings-form');
const rawSettingsLayout = document.getElementById('settings-raw-view');

if (btnSettingsView1 && btnSettingsView2) {
  btnSettingsView1.addEventListener('click', () => {
    btnSettingsView1.className = 'btn btn-primary';
    btnSettingsView2.className = 'btn btn-warning';
    btnSettingsView2.style.background = 'rgba(255,255,255,0.05)';
    btnSettingsView2.style.borderColor = 'rgba(255,255,255,0.1)';
    btnSettingsView2.style.color = 'var(--text-muted)';
    
    formSettingsLayout.style.display = 'block';
    rawSettingsLayout.style.display = 'none';
    
    loadConfig();
  });

  btnSettingsView2.addEventListener('click', async () => {
    btnSettingsView2.className = 'btn btn-primary';
    btnSettingsView1.className = 'btn btn-warning';
    btnSettingsView1.style.background = 'rgba(255,255,255,0.05)';
    btnSettingsView1.style.borderColor = 'rgba(255,255,255,0.1)';
    btnSettingsView1.style.color = 'var(--text-muted)';
    
    formSettingsLayout.style.display = 'none';
    rawSettingsLayout.style.display = 'block';
    
    try {
      const res = await fetch('/api/config');
      const config = await res.json();
      
      const keys = [
        'banCommandRoleId', 'ticketStaffRoleId', 'onayRoleId', 'ytSorumlusuRoleId',
        'farmSorumlusuRoleId', 'autoRoleId', 'ticketChannelId',
        'videoChannelId', 'banAfChannelId', 'onayChannelId', 'farmIstekChannelId',
        'youtubeBasvuruChannelId', 'banLogChannelId', 'unbanLogChannelId',
        'warningLogChannelId', 'warningPublicChannelId', 'farmLogChannelId',
        'farmLogChannelTwoId', 'ticketLogChannelId', 'banAfLogChannelId',
        'youtubeLogChannelId', 'roleLogChannelId', 'dmDuyuruLogChannelId',
        'botLogChannelId', 'activityLogChannelId',
        'messageLogChannelId', 'yonetimCategoryId', 'killCategoryId',
        'basvuruCategoryId', 'aktifIslemlerChannelId'
      ];
      
      let rawText = '';
      keys.forEach(key => {
        rawText += `${key} = ${config[key] || ''}\n`;
      });
      
      document.getElementById('settings-raw-text').value = rawText;
    } catch (err) {
      console.error(err);
      showToast('Ayarlar listelenirken hata oluştu.', 'error');
    }
  });

  document.getElementById('btn-save-raw-settings').addEventListener('click', async () => {
    const text = document.getElementById('settings-raw-text').value;
    const lines = text.split('\n');
    const updates = {};
    
    lines.forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.startsWith('#') || cleanLine.startsWith('//')) return;
      const parts = cleanLine.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        if (key) {
          updates[key] = val;
        }
      }
    });

    try {
      const res = await fetch('/api/config/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const result = await res.json();
      if (result.success) {
        showToast('Ayarlar başarıyla kaydedildi.', 'success');
      } else {
        showToast(result.error, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Ayarlar kaydedilirken hata oluştu.', 'error');
    }
  });
}

// 12) Kişi Bazlı Sıfırlama İşlemleri
document.getElementById('btn-reset-member').addEventListener('click', async () => {
  const userId = document.getElementById('reset-member-id').value.trim();
  if (!userId) {
    showToast('Lütfen geçerli bir Discord Kullanıcı ID girin.', 'error');
    return;
  }

  const checkedBoxes = document.querySelectorAll('#reset-member-targets input:checked');
  const targets = Array.from(checkedBoxes).map(cb => cb.value);

  if (targets.length === 0) {
    showToast('Lütfen sıfırlanacak en az bir veri türü seçin.', 'error');
    return;
  }

  if (!confirm(`${userId} ID'li kullanıcının seçilen verilerini (${targets.join(', ')}) sıfırlamak istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;

  try {
    const res = await fetch('/api/data/reset/member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, targets })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('reset-member-id').value = '';
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Kullanıcı verileri sıfırlanırken hata oluştu.', 'error');
  }
});

// 13) Etkinlik Düzenleme Modal & Form İşlemleri
function showEventEditModal(messageId, eventType, limit, sure, yedek, toplanmaSaati) {
  document.getElementById('edit-event-message-id').value = messageId;
  document.getElementById('edit-event-type').value = eventType;
  document.getElementById('edit-event-limit').value = limit;
  document.getElementById('edit-event-sure').value = sure;
  document.getElementById('edit-event-yedek').value = (yedek === 'null' || !yedek) ? '' : yedek;
  document.getElementById('edit-event-toplanma').value = (toplanmaSaati === 'null' || !toplanmaSaati) ? '' : toplanmaSaati;
  document.getElementById('event-edit-modal').style.display = 'flex';
}

function closeEventEditModal() {
  document.getElementById('event-edit-modal').style.display = 'none';
}

document.getElementById('event-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const messageId = document.getElementById('edit-event-message-id').value;
  const eventType = document.getElementById('edit-event-type').value;
  const limit = document.getElementById('edit-event-limit').value;
  const sure = document.getElementById('edit-event-sure').value;
  const yedek = document.getElementById('edit-event-yedek').value;
  const toplanmaSaati = document.getElementById('edit-event-toplanma').value;

  try {
    const res = await fetch('/api/events/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, eventType, limit, sure, yedek, toplanmaSaati })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeEventEditModal();
      loadEvents();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Etkinlik güncellenirken hata oluştu.', 'error');
  }
});

// 14) Aktiflik Yönetimi Sekmesi
let currentActivityData = null;
let remainingInterval = null;

async function loadActivity() {
  try {
    const res = await fetch('/api/activity/current');
    const data = await res.json();
    
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    const noActive = document.getElementById('activity-no-active');
    const activeContainer = document.getElementById('activity-active-container');

    if (!data.active) {
      noActive.style.display = 'block';
      activeContainer.style.display = 'none';
      currentActivityData = null;
      if (remainingInterval) clearInterval(remainingInterval);
      return;
    }

    noActive.style.display = 'none';
    activeContainer.style.display = 'block';
    
    currentActivityData = data;
    
    document.getElementById('act-role-name').innerText = data.roleName || 'Bilinmeyen Rol';
    document.getElementById('act-created-at').innerText = new Date(data.activity.createdAt).toLocaleString('tr-TR');
    
    updateActivityRemainingTime();
    renderActivityLists();
  } catch (err) {
    console.error(err);
    showToast('Aktiflik verisi yüklenemedi.', 'error');
  }
}

function updateActivityRemainingTime() {
  if (remainingInterval) clearInterval(remainingInterval);
  
  const span = document.getElementById('act-remaining-time');
  if (!currentActivityData || !currentActivityData.activity) return;
  
  const expiresAt = currentActivityData.activity.expiresAt;
  
  function updateTime() {
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      span.innerText = 'Süre Doldu';
      clearInterval(remainingInterval);
      return;
    }
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    span.innerText = `${minutes}dk ${seconds}sn`;
  }
  
  updateTime();
  remainingInterval = setInterval(updateTime, 1000);
}

function renderActivityLists() {
  if (!currentActivityData) return;
  
  const searchPart = document.getElementById('search-participants').value.toLowerCase();
  const searchNonPart = document.getElementById('search-non-participants').value.toLowerCase();
  
  const participants = currentActivityData.participants || [];
  const nonParticipants = currentActivityData.nonParticipants || [];
  
  const filteredPart = participants.filter(p => 
    p.displayName.toLowerCase().includes(searchPart) || 
    p.tag.toLowerCase().includes(searchPart) || 
    p.id.includes(searchPart)
  );
  
  const filteredNonPart = nonParticipants.filter(np => 
    np.displayName.toLowerCase().includes(searchNonPart) || 
    np.tag.toLowerCase().includes(searchNonPart) || 
    np.id.includes(searchNonPart)
  );
  
  const partList = document.getElementById('activity-participants-list');
  partList.innerHTML = '';
  document.getElementById('act-p-count').innerText = participants.length;
  
  if (filteredPart.length === 0) {
    partList.innerHTML = '<li class="loading-item">Katılımcı bulunamadı.</li>';
  } else {
    filteredPart.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 24px; height: 24px; border-radius: 50%;">
          <span><strong>${p.displayName}</strong> (${p.tag})</span>
        </div>
        <button class="btn btn-danger btn-small" onclick="removeActivityParticipant('${p.id}')" style="padding: 4px 8px; font-size: 11px; width: auto;">
          <i class="fa-solid fa-user-minus"></i> Çıkar
        </button>
      `;
      partList.appendChild(li);
    });
  }
  
  const nonPartList = document.getElementById('activity-non-participants-list');
  nonPartList.innerHTML = '';
  document.getElementById('act-np-count').innerText = nonParticipants.length;
  
  if (filteredNonPart.length === 0) {
    nonPartList.innerHTML = '<li class="loading-item">Katılmayan üye bulunamadı.</li>';
  } else {
    filteredNonPart.forEach(np => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${np.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 24px; height: 24px; border-radius: 50%;">
          <span><strong>${np.displayName}</strong> (${np.tag})</span>
        </div>
        <button class="btn btn-success btn-small" onclick="addActivityParticipant('${np.id}')" style="padding: 4px 8px; font-size: 11px; width: auto;">
          <i class="fa-solid fa-user-plus"></i> Ekle
        </button>
      `;
      nonPartList.appendChild(li);
    });
  }
}

document.getElementById('search-participants').addEventListener('input', renderActivityLists);
document.getElementById('search-non-participants').addEventListener('input', renderActivityLists);

async function addActivityParticipant(userId) {
  try {
    const res = await fetch('/api/activity/participant/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadActivity();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Kullanıcı eklenirken hata oluştu.', 'error');
  }
}

async function removeActivityParticipant(userId) {
  try {
    const res = await fetch('/api/activity/participant/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadActivity();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Kullanıcı silinirken hata oluştu.', 'error');
  }
}

document.getElementById('btn-activity-end').addEventListener('click', async () => {
  if (!confirm('Aktifliği sonlandırmak istediğinizden emin misiniz? Katılmayanların yetkili rolleri geri alınacaktır.')) return;
  
  try {
    const res = await fetch('/api/activity/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadActivity();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Aktiflik sonlandırılırken hata oluştu.', 'error');
  }
});

// 15) YouTube Yönetim Sekmesi
async function loadYoutubeSettings() {
  try {
    const res = await fetch('/api/youtube/channels');
    const data = await res.json();
    
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    document.getElementById('yt-videoChannelId').value = data.videoChannelId || '';
    document.getElementById('yt-ytSorumlusuRoleId').value = data.ytSorumlusuRoleId || '';
    document.getElementById('yt-youtubeBasvuruChannelId').value = data.youtubeBasvuruChannelId || '';

    const tbody = document.getElementById('youtube-channels-tbody');
    tbody.innerHTML = '';

    if (data.channels.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="loading-item">Takip edilen kanal bulunmuyor.</td></tr>';
    } else {
      data.channels.forEach(ch => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${ch.channelName}</strong><br><span style="font-size:11px;color:var(--text-muted);">${ch.channelId}</span></td>
          <td>${ch.everyone ? '<span style="color:var(--success);font-weight:600;">Evet</span>' : 'Hayır'}</td>
          <td>
            <button class="btn btn-danger btn-small" onclick="removeYoutubeChannel('${ch.channelId}')" style="padding: 6px 12px; font-size: 12px;">
              <i class="fa-solid fa-trash-can"></i> Kaldır
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error(err);
    showToast('YouTube verileri yüklenemedi.', 'error');
  }
}

document.getElementById('youtube-config-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const videoChannelId = document.getElementById('yt-videoChannelId').value;
  const ytSorumlusuRoleId = document.getElementById('yt-ytSorumlusuRoleId').value;
  const youtubeBasvuruChannelId = document.getElementById('yt-youtubeBasvuruChannelId').value;

  try {
    const res = await fetch('/api/youtube/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoChannelId, ytSorumlusuRoleId, youtubeBasvuruChannelId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadYoutubeSettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Ayarlar kaydedilirken hata oluştu.', 'error');
  }
});

document.getElementById('youtube-add-channel-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = document.getElementById('yt-channel-url').value.trim();
  const everyone = document.getElementById('yt-everyone-alert').checked;

  if (!url) return;

  try {
    const res = await fetch('/api/youtube/channels/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, everyone })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('yt-channel-url').value = '';
      document.getElementById('yt-everyone-alert').checked = false;
      loadYoutubeSettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('YouTube kanalı eklenemedi.', 'error');
  }
});

async function removeYoutubeChannel(channelId) {
  if (!confirm('Bu kanalı takipten kaldırmak istediğinizden emin misiniz?')) return;

  try {
    const res = await fetch('/api/youtube/channels/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadYoutubeSettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('YouTube kanalı takipten kaldırılamadı.', 'error');
  }
}

// 16) Ban Affı Yönetim Sekmesi
async function loadBanAfSettings() {
  try {
    const resConfig = await fetch('/api/panelsizbanaf/config');
    const pbConfig = await resConfig.json();
    
    document.getElementById('pb-active').checked = !!pbConfig.active;
    document.getElementById('pb-yazmaKanalId').value = pbConfig.yazmaKanalId || '';
    document.getElementById('pb-banListeKanalId').value = pbConfig.banListeKanalId || '';

    const pbTbody = document.getElementById('panelsiz-banaf-tbody');
    pbTbody.innerHTML = '';
    
    if (!pbConfig.entries || pbConfig.entries.length === 0) {
      pbTbody.innerHTML = '<tr><td colspan="3" class="loading-item">Panelsiz ban listesi boş.</td></tr>';
    } else {
      pbConfig.entries.forEach(entry => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong><span class="user-role">&lt;@${entry.userId}&gt; (${entry.userId})</span></strong></td>
          <td>${entry.reason}</td>
          <td>
            <button class="btn btn-danger btn-small" onclick="removePanelsizBanEntry('${entry.userId}')" style="padding: 6px 12px; font-size: 12px;">
              <i class="fa-solid fa-user-minus"></i> Kaldır
            </button>
          </td>
        `;
        pbTbody.appendChild(tr);
      });
    }

    const resRequests = await fetch('/api/banaf/requests');
    const requests = await resRequests.json();

    const requestsTbody = document.getElementById('banaf-requests-tbody');
    requestsTbody.innerHTML = '';

    if (requests.length === 0) {
      requestsTbody.innerHTML = '<tr><td colspan="7" class="loading-item">Ban affı başvurusu bulunmuyor.</td></tr>';
    } else {
      requests.forEach(req => {
        const tr = document.createElement('tr');
        const statusText = req.opened ? '<span class="status-badge" style="margin-top:0;"><span class="dot green"></span> Onaylandı</span>' : '<span class="status-badge" style="margin-top:0;"><span class="dot" style="background:#eab308;box-shadow:0 0 8px rgba(234,179,8,0.35);"></span> Bekliyor</span>';
        
        tr.innerHTML = `
          <td><code>${req.id}</code></td>
          <td><strong>${req.userTag}</strong><br><span style="font-size:11px;color:var(--text-muted);">${req.userId}</span></td>
          <td>${req.banType || '-'}</td>
          <td>${req.banReason || '-'}</td>
          <td>${req.banner || '-'}</td>
          <td>${statusText}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              ${!req.opened ? `
                <button class="btn btn-success btn-small" onclick="approveBanRequest('${req.id}')" style="padding: 6px 10px; font-size: 11px; width: auto;">
                  <i class="fa-solid fa-check"></i> Onayla
                </button>
                <button class="btn btn-warning btn-small" onclick="rejectBanRequest('${req.id}')" style="padding: 6px 10px; font-size: 11px; width: auto;">
                  <i class="fa-solid fa-xmark"></i> Reddet
                </button>
              ` : ''}
              <button class="btn btn-danger btn-small" onclick="deleteBanRequest('${req.id}')" style="padding: 6px 10px; font-size: 11px; width: auto;">
                <i class="fa-solid fa-trash-can"></i> Sil
              </button>
            </div>
          </td>
        `;
        requestsTbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error(err);
    showToast('Ban affı verileri yüklenemedi.', 'error');
  }
}

document.getElementById('panelsiz-banaf-config-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const active = document.getElementById('pb-active').checked;
  const yazmaKanalId = document.getElementById('pb-yazmaKanalId').value;
  const banListeKanalId = document.getElementById('pb-banListeKanalId').value;

  try {
    const res = await fetch('/api/panelsizbanaf/config/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active, yazmaKanalId, banListeKanalId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadBanAfSettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Ayarlar kaydedilirken hata oluştu.', 'error');
  }
});

document.getElementById('panelsiz-banaf-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.getElementById('pb-add-user-id').value.trim();
  const reason = document.getElementById('pb-add-reason').value.trim();

  if (!userId || !reason) return;

  try {
    const res = await fetch('/api/panelsizbanaf/entries/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('pb-add-user-id').value = '';
      document.getElementById('pb-add-reason').value = '';
      loadBanAfSettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Panelsiz ban kaydı eklenemedi.', 'error');
  }
});

async function removePanelsizBanEntry(userId) {
  if (!confirm('Bu kaydı panelsiz ban listesinden kaldırmak istediğinizden emin misiniz?')) return;

  try {
    const res = await fetch('/api/panelsizbanaf/entries/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadBanAfSettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Kayıt silinemedi.', 'error');
  }
}

async function approveBanRequest(requestId) {
  if (!confirm('Bu ban affı talebini onaylamak ve kullanıcının banını açmak istediğinizden emin misiniz?')) return;

  try {
    const res = await fetch('/api/banaf/requests/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadBanAfSettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Talep onaylanırken hata oluştu.', 'error');
  }
}

async function rejectBanRequest(requestId) {
  if (!confirm('Bu ban affı talebini reddetmek istediğinizden emin misiniz?')) return;

  try {
    const res = await fetch('/api/banaf/requests/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadBanAfSettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Talep reddedilirken hata oluştu.', 'error');
  }
}

async function deleteBanRequest(requestId) {
  if (!confirm('Bu ban affı talebini veritabanından kalıcı olarak silmek istediğinizden emin misiniz?')) return;

  try {
    const res = await fetch('/api/banaf/requests/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadBanAfSettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Talep silinirken hata oluştu.', 'error');
  }
}

// 17) Çekiliş Yönetim Sekmesi
async function loadGiveawaySettings() {
  try {
    const res = await fetch('/api/giveaways/list');
    const giveaways = await res.json();

    const activeTbody = document.getElementById('active-giveaways-tbody');
    const endedTbody = document.getElementById('ended-giveaways-tbody');

    activeTbody.innerHTML = '';
    endedTbody.innerHTML = '';

    const activeList = giveaways.filter(g => !g.ended);
    const endedList = giveaways.filter(g => g.ended);

    if (activeList.length === 0) {
      activeTbody.innerHTML = '<tr><td colspan="6" class="loading-item">Aktif çekiliş bulunmuyor.</td></tr>';
    } else {
      activeList.forEach(g => {
        const tr = document.createElement('tr');
        const endDate = new Date(g.endAt).toLocaleString('tr-TR');
        tr.innerHTML = `
          <td><code>${g.messageId}</code></td>
          <td><strong>${g.prize}</strong></td>
          <td>${g.winnerCount} kişi</td>
          <td>${g.participants ? g.participants.length : 0} kişi</td>
          <td>${endDate}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-success btn-small" onclick="showGiveawayManualModal('${g.messageId}')" style="padding: 6px 12px; font-size: 12px;">
                <i class="fa-solid fa-trophy"></i> Kazanan Seç & Bitir
              </button>
            </div>
          </td>
        `;
        activeTbody.appendChild(tr);
      });
    }

    if (endedList.length === 0) {
      endedTbody.innerHTML = '<tr><td colspan="6" class="loading-item">Bitmiş çekiliş bulunmuyor.</td></tr>';
    } else {
      endedList.forEach(g => {
        const tr = document.createElement('tr');
        const winnersText = g.winners && g.winners.length > 0 ? g.winners.map(id => `<@${id}>`).join(', ') : 'Belirlenmedi';
        const dateStr = new Date(g.endAt).toLocaleString('tr-TR');
        tr.innerHTML = `
          <td><code>${g.messageId}</code></td>
          <td><strong>${g.prize}</strong></td>
          <td>${g.winnerCount} kişi</td>
          <td><span style="font-size:12px;word-break:break-all;">${winnersText}</span></td>
          <td>${dateStr}</td>
          <td>
            <button class="btn btn-primary btn-small" onclick="rerollGiveaway('${g.messageId}')" style="padding: 6px 12px; font-size: 12px;">
              <i class="fa-solid fa-rotate-right"></i> Reroll (Yeniden Çek)
            </button>
          </td>
        `;
        endedTbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error(err);
    showToast('Çekiliş verileri yüklenemedi.', 'error');
  }
}

function showGiveawayManualModal(messageId) {
  document.getElementById('giveaway-manual-message-id').value = messageId;
  document.getElementById('giveaway-forced-winner').value = '';
  document.getElementById('giveaway-manual-modal').style.display = 'flex';
}

function closeGiveawayManualModal() {
  document.getElementById('giveaway-manual-modal').style.display = 'none';
}

document.getElementById('giveaway-manual-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageId = document.getElementById('giveaway-manual-message-id').value;
  const forcedWinnerId = document.getElementById('giveaway-forced-winner').value.trim();

  if (!forcedWinnerId) return;

  try {
    const res = await fetch('/api/giveaways/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, forcedWinnerId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeGiveawayManualModal();
      loadGiveawaySettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Çekiliş sonlandırılırken hata oluştu.', 'error');
  }
});

async function rerollGiveaway(messageId) {
  if (!confirm('Bu çekiliş için kazananları yeniden seçmek istediğinizden emin misiniz?')) return;

  try {
    const res = await fetch('/api/giveaways/reroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadGiveawaySettings();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Yeniden çekim sırasında hata oluştu.', 'error');
  }
}

async function loadIcKontrol() {
  try {
    const res = await fetch('/api/ickontrol');
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    const cfg = data.config || {};

    // Set main server select
    document.getElementById('ick-mainServer').value = cfg.icKontrolMainServer || '';

    // Set type checkboxes (icKontrolTypes is now an array)
    const activeTypes = cfg.icKontrolTypes || [];
    const isimChk = document.getElementById('ick-type-isim');
    const kanalChk = document.getElementById('ick-type-kanal');
    if (isimChk) isimChk.checked = activeTypes.includes('isim');
    if (kanalChk) kanalChk.checked = activeTypes.includes('kanal-list');

    const channelSelect = document.getElementById('ick-channelId');
    channelSelect.innerHTML = '<option value="">Seçiniz...</option>';

    // Group text channels from discordChannels
    const textChannels = discordChannels.filter(c => c.type === 0 || c.type === 5);
    textChannels.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = `# ${c.name} ${c.parentName ? `(${c.parentName})` : ''}`;
      channelSelect.appendChild(opt);
    });

    if (cfg.icKontrolChannelId) {
      channelSelect.value = cfg.icKontrolChannelId;
    }

    // Show/hide channel group based on kanal-list checkbox state
    const channelGroup = document.getElementById('ick-channel-group');
    channelGroup.style.display = activeTypes.includes('kanal-list') ? 'flex' : 'none';

    // Set server checkboxes
    const activeServers = cfg.icKontrolActiveServers || [];
    ['MDRP', 'WELL', 'MDPVP', 'GUID'].forEach(srv => {
      const chk = document.getElementById(`ick-srv-${srv}`);
      if (chk) {
        const isChecked = activeServers.includes(srv) || (srv === 'GUID' && activeServers.includes('GUİD'));
        chk.checked = isChecked;
      }
    });

    // Store online and offline members
    currentIcOnlineMembers = data.onlineMembers || [];
    currentIcOfflineMembers = data.offlineMembers || [];

    // Render IC Kontrol players table
    renderIcMembers();

  } catch (err) {
    console.error(err);
    showToast('IC Kontrol verileri yüklenemedi.', 'error');
  }
}

function renderIcMembers() {
  const filterSelect = document.getElementById('ickontrol-filter-select');
  const filterVal = filterSelect ? filterSelect.value : 'online';

  const tbody = document.getElementById('ickontrol-members-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const online = currentIcOnlineMembers || [];
  const offline = currentIcOfflineMembers || [];

  if (filterVal === 'online') {
    if (online.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading-item">Sunucuda oyunda aktif ekip üyesi bulunmuyor.</td></tr>';
    } else {
      online.forEach(m => {
        const tr = document.createElement('tr');
        const avatarUrl = m.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
        tr.innerHTML = `
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <img src="${avatarUrl}" class="user-avatar" style="width:24px;height:24px;border-radius:50%;">
              <strong>${m.displayName}</strong> <span style="font-size:11px;color:var(--text-muted)">(${m.tag})</span>
            </div>
          </td>
          <td><span class="user-role">${m.serverName}</span></td>
          <td><code>${m.playerName}</code></td>
          <td><span style="font-family:monospace;font-size:12px;color:var(--text-muted)">${m.id}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
  } else if (filterVal === 'offline') {
    if (offline.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading-item">Oyunda olmayan onaylı ekip üyesi bulunmuyor.</td></tr>';
    } else {
      offline.forEach(m => {
        const tr = document.createElement('tr');
        const avatarUrl = m.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
        tr.innerHTML = `
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <img src="${avatarUrl}" class="user-avatar" style="width:24px;height:24px;border-radius:50%;">
              <strong>${m.displayName}</strong> <span style="font-size:11px;color:var(--text-muted)">(${m.tag})</span>
            </div>
          </td>
          <td><span style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;"><i class="fa-solid fa-circle-xmark"></i> Oyunda Değil</span></td>
          <td><span style="color:var(--text-muted); font-size:12px;">Onaylı Üye</span></td>
          <td><span style="font-family:monospace;font-size:12px;color:var(--text-muted)">${m.id}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
  } else {
    // all
    const allMembers = [
      ...online.map(m => ({ ...m, isOnline: true })),
      ...offline.map(m => ({ ...m, isOnline: false }))
    ];

    if (allMembers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading-item">Onaylı üye bulunamadı.</td></tr>';
    } else {
      allMembers.forEach(m => {
        const tr = document.createElement('tr');
        const avatarUrl = m.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const statusBadge = m.isOnline 
          ? `<span class="user-role" style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;"><i class="fa-solid fa-gamepad"></i> Oyunda (${m.serverName})</span>`
          : `<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;"><i class="fa-solid fa-circle-xmark"></i> Oyunda Değil</span>`;
        
        const detailText = m.isOnline ? `<code>${m.playerName}</code>` : `<span style="color:var(--text-muted); font-size:12px;">-</span>`;

        tr.innerHTML = `
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <img src="${avatarUrl}" class="user-avatar" style="width:24px;height:24px;border-radius:50%;">
              <strong>${m.displayName}</strong> <span style="font-size:11px;color:var(--text-muted)">(${m.tag})</span>
            </div>
          </td>
          <td>${statusBadge}</td>
          <td>${detailText}</td>
          <td><span style="font-family:monospace;font-size:12px;color:var(--text-muted)">${m.id}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
  }
}

function exportIcKontrol() {
  const filterSelect = document.getElementById('ickontrol-filter-select');
  const filterVal = filterSelect ? filterSelect.value : 'online';

  const online = currentIcOnlineMembers || [];
  const offline = currentIcOfflineMembers || [];

  let fileContent = '';
  let fileName = '';
  const nowStr = new Date().toLocaleString('tr-TR');

  if (filterVal === 'online') {
    fileContent += 'OYUNDA OLAN EKİP ÜYELERİ\n';
    fileContent += '==================================================\n';
    fileContent += `Tarih: ${nowStr}\n`;
    fileContent += `Toplam Oyunda Olan Üye Sayısı: ${online.length}\n`;
    fileContent += '----------------------------------------------------------------------\n\n';
    fileContent += 'Sıra | Kullanıcı Adı | Discord Tag | Sunucu | FiveM Karakter Adı | Discord ID\n';
    fileContent += '----------------------------------------------------------------------\n';

    online.forEach((m, idx) => {
      fileContent += `${idx + 1}. ${m.displayName} - ${m.tag} - ${m.serverName} - ${m.playerName} - ${m.id}\n`;
    });
    fileName = 'oyunda_olan_ekip_uyeleri.txt';
  } else if (filterVal === 'offline') {
    fileContent += 'OYUNDA OLMAYAN ONAYLI EKİP ÜYELERİ\n';
    fileContent += '==================================================\n';
    fileContent += `Tarih: ${nowStr}\n`;
    fileContent += `Toplam Oyunda Olmayan Onaylı Üye Sayısı: ${offline.length}\n`;
    fileContent += '----------------------------------------------------------------------\n\n';
    fileContent += 'Sıra | Kullanıcı Adı | Discord Tag | Durum | Discord ID\n';
    fileContent += '----------------------------------------------------------------------\n';

    offline.forEach((m, idx) => {
      fileContent += `${idx + 1}. ${m.displayName} - ${m.tag} - Oyunda Değil - ${m.id}\n`;
    });
    fileName = 'oyunda_olmayan_ekip_uyeleri.txt';
  } else {
    fileContent += 'TÜM ONAYLI EKİP ÜYELERİ (OYUN DURUMU)\n';
    fileContent += '==================================================\n';
    fileContent += `Tarih: ${nowStr}\n`;
    fileContent += `Toplam Onaylı Üye: ${online.length + offline.length} (Oyunda: ${online.length} | Oyunda Değil: ${offline.length})\n`;
    fileContent += '----------------------------------------------------------------------\n\n';
    fileContent += 'Sıra | Kullanıcı Adı | Discord Tag | Durum | Sunucu / FiveM Adı | Discord ID\n';
    fileContent += '----------------------------------------------------------------------\n';

    let counter = 1;
    online.forEach((m) => {
      fileContent += `${counter++}. ${m.displayName} - ${m.tag} - OYUNDA - ${m.serverName} (${m.playerName}) - ${m.id}\n`;
    });
    offline.forEach((m) => {
      fileContent += `${counter++}. ${m.displayName} - ${m.tag} - OYUNDA DEĞİL - - - ${m.id}\n`;
    });
    fileName = 'tum_onayli_ekip_uyeleri.txt';
  }

  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Bind IC Kontrol listeners on DOM load
document.addEventListener('DOMContentLoaded', () => {
  // ── IC Kontrol type checkbox → kanal grubu göster/gizle ──
  const kanalTypeChk = document.getElementById('ick-type-kanal');
  if (kanalTypeChk) {
    kanalTypeChk.addEventListener('change', (e) => {
      const channelGroup = document.getElementById('ick-channel-group');
      channelGroup.style.display = e.target.checked ? 'flex' : 'none';
    });
  }

  const icFilterSelect = document.getElementById('ickontrol-filter-select');
  if (icFilterSelect) {
    icFilterSelect.addEventListener('change', renderIcMembers);
  }

  const icExportBtn = document.getElementById('btn-export-ickontrol');
  if (icExportBtn) {
    icExportBtn.addEventListener('click', exportIcKontrol);
  }

  // ── Aktif sunucu ve tip seçimini okumak için yardımcı ──
  function _ickReadTypes() {
    const types = [];
    if (document.getElementById('ick-type-isim')?.checked) types.push('isim');
    if (document.getElementById('ick-type-kanal')?.checked) types.push('kanal-list');
    return types;
  }

  function _ickReadActiveServers(mainServer) {
    const activeServers = [];
    ['MDRP', 'WELL', 'MDPVP', 'GUID'].forEach(srv => {
      const chk = document.getElementById(`ick-srv-${srv}`);
      if (chk && chk.checked) {
        activeServers.push(srv === 'GUID' ? 'GUİD' : srv);
      }
    });
    // Ensure mainServer is always included
    if (mainServer && !activeServers.includes(mainServer)) {
      activeServers.push(mainServer);
      const mainChk = document.getElementById(`ick-srv-${mainServer}`);
      if (mainChk) mainChk.checked = true;
    }
    return activeServers;
  }

  const configForm = document.getElementById('ickontrol-config-form');
  if (configForm) {
    configForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mainServer = document.getElementById('ick-mainServer').value;
      const types = _ickReadTypes();
      const channelId = document.getElementById('ick-channelId').value;

      if (!mainServer) {
        showToast('Lütfen bir ana sunucu seçin.', 'error');
        return;
      }
      if (types.length === 0) {
        showToast('Lütfen en az bir kontrol türü seçin.', 'error');
        return;
      }
      if (types.includes('kanal-list') && !channelId) {
        showToast('Kanal-list modu için bir kanal seçmelisiniz.', 'error');
        return;
      }

      const activeServers = _ickReadActiveServers(mainServer);

      try {
        const res = await fetch('/api/ickontrol/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mainServer, types, activeServers, channelId })
        });
        const result = await res.json();
        if (result.success) {
          showToast(result.message, 'success');
          loadIcKontrol();
        } else {
          showToast(result.error, 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Ayarlar kaydedilirken hata oluştu.', 'error');
      }
    });
  }

  const srvBtn = document.getElementById('btn-save-ick-servers');
  if (srvBtn) {
    srvBtn.addEventListener('click', async () => {
      const mainServer = document.getElementById('ick-mainServer').value;
      const types = _ickReadTypes();
      const channelId = document.getElementById('ick-channelId').value;

      if (!mainServer || types.length === 0) {
        showToast('Lütfen önce sol taraftan ana sunucu ve tarama türünü kaydedin!', 'error');
        return;
      }

      const activeServers = _ickReadActiveServers(mainServer);

      try {
        const res = await fetch('/api/ickontrol/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mainServer, types, activeServers, channelId })
        });
        const result = await res.json();
        if (result.success) {
          showToast('Taranacak sunucu listesi başarıyla güncellendi.', 'success');
          loadIcKontrol();
        } else {
          showToast(result.error, 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Sunucu listesi güncellenirken hata oluştu.', 'error');
      }
    });
  }
});

// ── TICKET ONAY/RED MESAJ AYARLARI FORM SUBMIT ──
document.getElementById('ticket-approval-messages-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const updates = {
    onayChannelId: document.getElementById('ticket-cfg-onayChannelId').value,
    ticketApprovalDmMessage: document.getElementById('ticket-cfg-ticketApprovalDmMessage').value,
    ticketRejectionDmMessage: document.getElementById('ticket-cfg-ticketRejectionDmMessage').value,
    ticketApprovalChannelMessage: document.getElementById('ticket-cfg-ticketApprovalChannelMessage').value,
    ticketRejectionChannelMessage: document.getElementById('ticket-cfg-ticketRejectionChannelMessage').value,
    ticketApprovalDmEnabled: document.getElementById('ticket-cfg-ticketApprovalDmEnabled').checked,
    ticketRejectionDmEnabled: document.getElementById('ticket-cfg-ticketRejectionDmEnabled').checked,
    ticketApprovalChannelEnabled: document.getElementById('ticket-cfg-ticketApprovalChannelEnabled').checked,
    ticketRejectionChannelEnabled: document.getElementById('ticket-cfg-ticketRejectionChannelEnabled').checked
  };

  try {
    const res = await fetch('/api/config/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Onay & red mesaj ayarları başarıyla kaydedildi.', 'success');
      loadTicketSettings();
      // Sync with the general config form if it exists
      const genOnay = document.getElementById('cfg-onayChannelId');
      if (genOnay) genOnay.value = updates.onayChannelId;
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Ayarlar kaydedilemedi.', 'error');
  }
});

// ── AYAR ARA VE DÜZENLEME MANTIĞI (CONFIG_METADATA) ──
const CONFIG_METADATA = [
  { key: 'ekipIsmi', label: 'Ekip İsmi', type: 'text', description: 'Ekibinizin görünen adı.' },
  { key: 'banCommandRoleId', label: 'Ban Komutu Rolü', type: 'role', description: 'Ban yetkisine sahip yetkili rolü.' },
  { key: 'ticketStaffRoleId', label: 'Ticket Yetkilisi Rolü', type: 'role', description: 'Ticket taleplerine bakacak yetkili rolü.' },
  { key: 'onayRoleId', label: 'Member (Kayıtlı Ekip Üyesi Rolü)', type: 'role', description: 'Başvurusu onaylanan üyelere verilecek rol.' },
  { key: 'ytSorumlusuRoleId', label: 'YouTube Sorumlusu Rolü', type: 'role', description: 'YouTube kanallarını ve takip sistemini yönetecek rol.' },
  { key: 'farmSorumlusuRoleId', label: 'Farm Sorumlusu Rolü', type: 'role', description: 'Farm teslimatlarını kontrol edecek ve onaylayacak rol.' },
  { key: 'autoRoleId', label: 'Oto Verilecek Rol (Oto Rol)', type: 'role', description: 'Sunucuya yeni giren üyelere otomatik verilecek rol.' },
  { key: 'ticketChannelId', label: 'Ticket Açma Kanalı', type: 'channel', description: 'Kullanıcıların ticket açmak için kullanacağı select/buton kanalı.' },
  { key: 'videoChannelId', label: 'Video / SS Kanalı (YouTube Duyuru)', type: 'channel', description: 'YouTube video bildirimlerinin ve paylaşımların gideceği kanal.' },
  { key: 'banAfChannelId', label: 'Ban Af Başvuru Kanalı', type: 'channel', description: 'Ban affı başvuru panelinin bulunacağı kanal.' },
  { key: 'onayChannelId', label: 'Onay İstek / Bildirim Kanalı', type: 'channel', description: 'Ticket onay/red kararlarının duyurulacağı bildirim kanalı.' },
  { key: 'farmIstekChannelId', label: 'Farm Talep Kanalı', type: 'channel', description: 'Üyelerin farm teslim bildirimini göndereceği kanal.' },
  { key: 'youtubeBasvuruChannelId', label: 'YouTube Başvuru Kanalı', type: 'channel', description: 'YouTube kanallarının listelendiği/yönetildiği kanal.' },
  { key: 'banLogChannelId', label: 'Ban Log Kanalı', type: 'channel', description: 'Yasaklama işlemlerinin loglandığı kanal.' },
  { key: 'unbanLogChannelId', label: 'Unban Log Kanalı', type: 'channel', description: 'Yasak kaldırma işlemlerinin loglandığı kanal.' },
  { key: 'warningLogChannelId', label: 'Uyarı Log Kanalı', type: 'channel', description: 'Uyarı cezalarının loglandığı kanal.' },
  { key: 'warningPublicChannelId', label: 'Uyarı Duyuru Kanalı (Public)', type: 'channel', description: 'Cezaların sunucuda duyurulacağı genel kanal.' },
  { key: 'farmLogChannelId', label: 'Farm Log Kanalı 1', type: 'channel', description: 'Farm teslim onaylarının loglandığı ana kanal.' },
  { key: 'farmLogChannelTwoId', label: 'Farm Log Kanalı 2', type: 'channel', description: 'Farm teslim onaylarının loglandığı yedek kanal.' },
  { key: 'ticketLogChannelId', label: 'Ticket Log Kanalı', type: 'channel', description: 'Ticket kapatma ve transkript loglarının gideceği kanal.' },
  { key: 'banAfLogChannelId', label: 'Ban Af Log Kanalı', type: 'channel', description: 'Ban affı taleplerinin loglandığı kanal.' },
  { key: 'youtubeLogChannelId', label: 'YouTube Log Kanalı', type: 'channel', description: 'YouTube kanalı ekleme/silme logları.' },
  { key: 'roleLogChannelId', label: 'Rol İşlem Log Kanalı', type: 'channel', description: 'Kullanıcılara verilen/alınan rollerin loglandığı kanal.' },
  { key: 'dmDuyuruLogChannelId', label: 'DM Duyuru Log Kanalı', type: 'channel', description: 'DM duyuru gönderim loglarının gideceği kanal.' },
  { key: 'botLogChannelId', label: 'Bot Sistem Log Kanalı', type: 'channel', description: 'Botun genel durum ve sistem loglarının gideceği kanal.' },
  { key: 'sesLogChannelId', label: 'Ses Log Kanalı', type: 'channel', description: 'Ses kanalına giriş, çıkış ve taşınma hareketlerinin loglandığı kanal.' },
  { key: 'davetLogChannelId', label: 'Davet Log Kanalı', type: 'channel', description: 'Sunucuda oluşturulan/silinen davetlerin loglandığı kanal.' },
  { key: 'girisLogChannelId', label: 'Giriş-Çıkış Log Kanalı', type: 'channel', description: 'Sunucuya giren ve çıkan üyelerin loglandığı kanal.' },
  { key: 'kanalLogChannelId', label: 'Kanal Log Kanalı', type: 'channel', description: 'Kanal oluşturma, silme ve güncelleme işlemlerinin loglandığı kanal.' },
  { key: 'isimLogChannelId', label: 'İsim Log Kanalı', type: 'channel', description: 'Üyelerin isim ve nickname değişikliklerinin loglandığı kanal.' },
  { key: 'warningSystemEnabled', label: 'Uyarı Sistemi Aktif', type: 'toggle', description: 'Uyarı cezalarının ve geçmişinin aktif olup olmadığı.' },
  { key: 'farmSystemEnabled', label: 'Farm Sistemi Aktif', type: 'toggle', description: 'Farm takip ve teslim sisteminin aktif olup olmadığı.' },
  { key: 'ticketSystemEnabled', label: 'Ticket Sistemi Aktif', type: 'toggle', description: 'Ticket/Başvuru açma sisteminin aktif olup olmadığı.' },
  { key: 'youtubeSystemEnabled', label: 'YouTube Sistemi Aktif', type: 'toggle', description: 'YouTube video takip ve duyuru sisteminin aktif olup olmadığı.' },
  { key: 'banAfSystemEnabled', label: 'Ban Affı Sistemi Aktif', type: 'toggle', description: 'Ban affı başvurularının aktif olup olmadığı.' },
  { key: 'giveawaySystemEnabled', label: 'Çekiliş Sistemi Aktif', type: 'toggle', description: 'Çekiliş başlatma/bitirme sisteminin aktif olup olmadığı.' },
  { key: 'activitySystemEnabled', label: 'Aktiflik Sistemi Aktif', type: 'toggle', description: 'Aktiflik taramalarının aktif olup olmadığı.' },
  { key: 'icKontrolSystemEnabled', label: 'IC Kontrol Sistemi Aktif', type: 'toggle', description: 'FiveM oyuncu/isim tarama sisteminin aktif olup olmadığı.' },
  { key: 'loggingSystemEnabled', label: 'Log Kanalları Sistemi Aktif', type: 'toggle', description: 'Tüm log kanallarına bildirim gönderilip gönderilmeyeceği.' },
  { key: 'ticketApprovalDmMessage', label: 'Ticket Onay DM Mesajı', type: 'textarea', description: 'Kullanıcıya DM\'den giden onay şablonu.' },
  { key: 'ticketRejectionDmMessage', label: 'Ticket Red DM Mesajı', type: 'textarea', description: 'Kullanıcıya DM\'den giden red şablonu.' },
  { key: 'ticketApprovalChannelMessage', label: 'Ticket Onay Kanal Mesajı', type: 'textarea', description: 'Onay kanalına giden onay şablonu.' },
  { key: 'ticketRejectionChannelMessage', label: 'Ticket Red Kanal Mesajı', type: 'textarea', description: 'Onay kanalına giden red şablonu.' }
];

async function saveSearchSetting(key) {
  const meta = CONFIG_METADATA.find(m => m.key === key);
  if (!meta) return;

  const inputEl = document.getElementById(`search-cfg-${key}`);
  if (!inputEl) return;

  let value;
  if (meta.type === 'toggle') {
    value = inputEl.checked;
  } else {
    value = inputEl.value;
  }

  try {
    const res = await fetch('/api/config/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`"${meta.label}" başarıyla güncellendi.`, 'success');
      loadConfig();
      loadTicketSettings();
      loadYoutubeSettings();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Ayar kaydedilirken hata oluştu.', 'error');
  }
}
window.saveSearchSetting = saveSearchSetting;

// Input dinleyici (Ayar Arama)
document.getElementById('settings-search-input').addEventListener('input', async (e) => {
  const query = e.target.value.toLowerCase().trim();
  const wrapper = document.getElementById('search-results-wrapper');
  const container = document.getElementById('search-results-list');

  if (!query) {
    wrapper.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  // Fetch current config values
  let config = {};
  try {
    const res = await fetch('/api/config');
    config = await res.json();
  } catch (err) {
    console.error(err);
  }

  const matches = CONFIG_METADATA.filter(m => 
    m.label.toLowerCase().includes(query) || 
    m.key.toLowerCase().includes(query) || 
    m.description.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-style: italic; font-size: 13px;">Eşleşen bir ayar bulunamadı.</div>';
    wrapper.style.display = 'block';
    return;
  }

  container.innerHTML = '';
  matches.forEach(meta => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'search-result-item';
    itemDiv.style.cssText = 'padding: 15px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 8px; display: flex; flex-direction: column; gap: 10px;';

    const currentValue = config[meta.key] !== undefined ? config[meta.key] : '';

    let inputHtml = '';
    if (meta.type === 'toggle') {
      const isChecked = currentValue !== false ? 'checked' : '';
      inputHtml = `<input type="checkbox" id="search-cfg-${meta.key}" ${isChecked} style="width: 20px; height: 20px; cursor: pointer;">`;
    } else if (meta.type === 'role') {
      let roleOpts = '<option value="">Seçiniz...</option>';
      discordRoles.forEach(r => {
        const isSel = r.id === currentValue ? 'selected' : '';
        roleOpts += `<option value="${r.id}" ${isSel}>${r.name}</option>`;
      });
      inputHtml = `<select id="search-cfg-${meta.key}" class="guild-role-select" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); color: var(--text-main); font-family: inherit;">${roleOpts}</select>`;
    } else if (meta.type === 'channel') {
      let chanOpts = '<option value="">Seçiniz...</option>';
      
      const textChannels = discordChannels.filter(c => c.type === 0 || c.type === 5);
      const voiceChannels = discordChannels.filter(c => c.type === 2);

      chanOpts += '<optgroup label="METİN KANALLARI">';
      textChannels.forEach(c => {
        const isSel = c.id === currentValue ? 'selected' : '';
        chanOpts += `<option value="${c.id}" ${isSel}># ${c.name}</option>`;
      });
      chanOpts += '</optgroup>';

      chanOpts += '<optgroup label="SES KANALLARI">';
      voiceChannels.forEach(c => {
        const isSel = c.id === currentValue ? 'selected' : '';
        chanOpts += `<option value="${c.id}" ${isSel}>🔊 ${c.name}</option>`;
      });
      chanOpts += '</optgroup>';

      inputHtml = `<select id="search-cfg-${meta.key}" class="guild-channel-select" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); color: var(--text-main); font-family: inherit;">${chanOpts}</select>`;
    } else if (meta.type === 'textarea') {
      inputHtml = `<textarea id="search-cfg-${meta.key}" rows="3" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); color: var(--text-main); font-family: inherit; font-size: 13px;">${currentValue}</textarea>`;
    } else {
      inputHtml = `<input type="text" id="search-cfg-${meta.key}" value="${currentValue}" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); color: var(--text-main); font-family: inherit;">`;
    }

    itemDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <strong style="color: var(--text-main); font-size: 14px;">${meta.label}</strong>
          <span style="font-size: 11px; color: var(--text-muted); font-family: monospace; display: block; margin-top: 2px;">Anahtar: ${meta.key}</span>
        </div>
        <button class="btn btn-primary btn-small" onclick="saveSearchSetting('${meta.key}')" style="width: auto; padding: 6px 12px; font-size: 12px;">
          <i class="fa-solid fa-floppy-disk"></i> Güncelle
        </button>
      </div>
      <p style="font-size: 12px; color: var(--text-muted); margin: 0;">${meta.description}</p>
      <div style="margin-top: 5px;">
        ${inputHtml}
      </div>
    `;
    container.appendChild(itemDiv);
  });

  wrapper.style.display = 'block';
});

// ── WEB SETUP & UPDATE BUTON DİNLEYİCİLERİ ──
document.getElementById('btn-web-guncelle').addEventListener('click', async () => {
  if (!confirm('Sistemi güncellemek ve sunucu taramasını başlatmak istediğinizden emin misiniz?')) return;
  
  showToast('Güncelleme işlemi başlatıldı, lütfen bekleyin...', 'info');
  try {
    const res = await fetch('/api/bot/guncelle', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      let msg = `Sistem Başarıyla Güncellendi!\n`;
      if (data.createdItems && data.createdItems.length > 0) {
        msg += `Oluşturulanlar:\n${data.createdItems.join('\n')}\n`;
      }
      msg += `Komut Kayıt Sonucu: ${data.registerResult}`;
      alert(msg);
      loadConfig();
      loadTicketSettings();
    } else {
      showToast(data.error || 'Güncelleme başarısız.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Teknik hata oluştu.', 'error');
  }
});

document.getElementById('btn-web-ekip-kur').addEventListener('click', async () => {
  try {
    const configRes = await fetch('/api/config');
    const config = await configRes.json();

    // Check if system is already installed
    const isInstalled = !!(config.yonetimCategoryId || config.basvuruCategoryId);
    if (isInstalled) {
      document.getElementById('confirm-setup-modal').style.display = 'flex';
    } else {
      openEkipSistemKurModal();
    }
  } catch (err) {
    console.error(err);
    showToast('Sunucu ayarları denetlenirken bir hata oluştu.', 'error');
  }
});

// Confirmation Modal Buttons
document.getElementById('btn-confirm-setup-yes').addEventListener('click', () => {
  document.getElementById('confirm-setup-modal').style.display = 'none';
  openEkipSistemKurModal();
});

document.getElementById('btn-confirm-setup-no').addEventListener('click', () => {
  document.getElementById('confirm-setup-modal').style.display = 'none';
});

// Open main setup modal function
function openEkipSistemKurModal() {
  document.getElementById('ekip-sistem-kur-form').reset();
  
  // Set default select values & trigger toggle handler
  const typeSelect = document.getElementById('setup-banAfType');
  typeSelect.value = 'panelli';
  triggerSetupBanAfToggle('panelli');

  document.getElementById('ekip-sistem-kur-modal').style.display = 'flex';
}

function triggerSetupBanAfToggle(val) {
  const panelsizFields = document.getElementById('setup-panelsiz-fields');
  const panelliGroup1 = document.getElementById('setup-banAfChannelId-group');
  const panelliGroup2 = document.getElementById('setup-banAffiManagementChannelId-group');

  if (val === 'panelsiz') {
    panelsizFields.style.display = 'block';
    panelliGroup1.style.display = 'none';
    panelliGroup2.style.display = 'none';
  } else {
    panelsizFields.style.display = 'none';
    panelliGroup1.style.display = 'flex';
    panelliGroup2.style.display = 'flex';
  }
}

// Ban Affı Select toggle handler
document.getElementById('setup-banAfType').addEventListener('change', (e) => {
  triggerSetupBanAfToggle(e.target.value);
});

// Close Setup Modal button
document.getElementById('btn-setup-modal-cancel').addEventListener('click', () => {
  document.getElementById('ekip-sistem-kur-modal').style.display = 'none';
});

// Setup Form Submission
document.getElementById('ekip-sistem-kur-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const banAfType = document.getElementById('setup-banAfType').value;
  const payload = {
    banAfType,
    // Panelsiz inputs
    panelsizYazmaKanalId: document.getElementById('setup-panelsizYazmaKanalId').value.trim(),
    panelsizBanListeKanalId: document.getElementById('setup-panelsizBanListeKanalId').value.trim(),
    // Roles
    banCommandRoleId: document.getElementById('setup-banCommandRoleId').value.trim(),
    ticketStaffRoleId: document.getElementById('setup-ticketStaffRoleId').value.trim(),
    onayRoleId: document.getElementById('setup-onayRoleId').value.trim(),
    ytSorumlusuRoleId: document.getElementById('setup-ytSorumlusuRoleId').value.trim(),
    farmSorumlusuRoleId: document.getElementById('setup-farmSorumlusuRoleId').value.trim(),
    // Categories
    basvuruCategoryId: document.getElementById('setup-basvuruCategoryId').value.trim(),
    yonetimCategoryId: document.getElementById('setup-yonetimCategoryId').value.trim(),
    killCategoryId: document.getElementById('setup-killCategoryId').value.trim(),
    logCategoryId: document.getElementById('setup-logCategoryId').value.trim(),
    // Channels
    videoChannelId: document.getElementById('setup-videoChannelId').value.trim(),
    warningPublicChannelId: document.getElementById('setup-warningPublicChannelId').value.trim(),
    ticketChannelId: document.getElementById('setup-ticketChannelId').value.trim(),
    onayChannelId: document.getElementById('setup-onayChannelId').value.trim(),
    farmIstekChannelId: document.getElementById('setup-farmIstekChannelId').value.trim(),
    youtubeBasvuruChannelId: document.getElementById('setup-youtubeBasvuruChannelId').value.trim(),
    farmManagementChannelId: document.getElementById('setup-farmManagementChannelId').value.trim(),
    youtubeManagementChannelId: document.getElementById('setup-youtubeManagementChannelId').value.trim(),
    aktifIslemlerChannelId: document.getElementById('setup-aktifIslemlerChannelId').value.trim(),
    // Conditional (Panelli) Channels
    banAfChannelId: banAfType === 'panelli' ? document.getElementById('setup-banAfChannelId').value.trim() : '',
    banAffiManagementChannelId: banAfType === 'panelli' ? document.getElementById('setup-banAffiManagementChannelId').value.trim() : '',
    // Log channels
    banLogChannelId: document.getElementById('setup-banLogChannelId').value.trim(),
    warningLogChannelId: document.getElementById('setup-warningLogChannelId').value.trim(),
    farmLogChannelId: document.getElementById('setup-farmLogChannelId').value.trim(),
    ticketLogChannelId: document.getElementById('setup-ticketLogChannelId').value.trim(),
    sesLogChannelId: document.getElementById('setup-sesLogChannelId').value.trim(),
    davetLogChannelId: document.getElementById('setup-davetLogChannelId').value.trim(),
    girisLogChannelId: document.getElementById('setup-girisLogChannelId').value.trim(),
    kanalLogChannelId: document.getElementById('setup-kanalLogChannelId').value.trim(),
    isimLogChannelId: document.getElementById('setup-isimLogChannelId').value.trim(),
    youtubeLogChannelId: document.getElementById('setup-youtubeLogChannelId').value.trim(),
    roleLogChannelId: document.getElementById('setup-roleLogChannelId').value.trim(),
    dmDuyuruLogChannelId: document.getElementById('setup-dmDuyuruLogChannelId').value.trim(),
    botLogChannelId: document.getElementById('setup-botLogChannelId').value.trim(),
    banAfLogChannelId: document.getElementById('setup-banAfLogChannelId').value.trim(),
    activityLogChannelId: document.getElementById('setup-activityLogChannelId').value.trim(),
    messageLogChannelId: document.getElementById('setup-messageLogChannelId').value.trim()
  };

  document.getElementById('ekip-sistem-kur-modal').style.display = 'none';
  showToast('Ekip sistemi kurulumu başlatıldı, lütfen bekleyin...', 'info');

  try {
    const res = await fetch('/api/bot/ekip-sistemi-kur', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      let msg = `Ekip Sistemi Başarıyla Kuruldu!\n`;
      if (data.reports && data.reports.length > 0) {
        msg += `Rapor:\n${data.reports.join('\n')}`;
      }
      alert(msg);
      loadConfig();
      loadTicketSettings();
      loadBanAfSettings();
    } else {
      showToast(data.error || 'Kurulum başarısız oldu.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Teknik hata oluştu.', 'error');
  }
});

// ── SİSTEM DETAYLI AYAR MODAL YÖNETİMİ ──
const SYSTEM_FIELDS = {
  warning: {
    title: 'Uyarı Sistemi',
    toggleKey: 'warningSystemEnabled',
    fields: [
      { key: 'warningLogChannelIdEnabled', label: 'Uyarı Log Kanalı Gönderimi', type: 'toggle', description: 'Uyarı cezalarının log kanalına gönderilip gönderilmeyeceği.' },
      { key: 'warningPublicChannelIdEnabled', label: 'Uyarı Duyuru Kanalı (Public) Gönderimi', type: 'toggle', description: 'Cezaların genel duyuru kanalında duyurulup duyurulmayacağı.' }
    ]
  },
  farm: {
    title: 'Farm Sistemi',
    toggleKey: 'farmSystemEnabled',
    fields: [
      { key: 'farmLogChannelIdEnabled', label: 'Farm Log Kanalı 1 Gönderimi', type: 'toggle', description: 'Farm teslim onaylarının ana log kanalına gönderilmesi.' },
      { key: 'farmLogChannelTwoIdEnabled', label: 'Farm Log Kanalı 2 Gönderimi', type: 'toggle', description: 'Farm teslim onaylarının yedek log kanalına gönderilmesi.' },
      { key: 'farmIstekChannelIdEnabled', label: 'Farm Talep Kanalı Bildirimleri', type: 'toggle', description: 'Üyelerin farm teslim bildirimlerinin işlenmesi.' }
    ]
  },
  ticket: {
    title: 'Ticket Sistemi',
    toggleKey: 'ticketSystemEnabled',
    fields: [
      { key: 'ticketChannelIdEnabled', label: 'Ticket Açma Kanalı Aktif', type: 'toggle', description: 'Kullanıcıların panel üzerinden ticket açabilmesi.' },
      { key: 'ticketLogChannelIdEnabled', label: 'Ticket Log Kanalı Gönderimi', type: 'toggle', description: 'Ticket kapatma ve transkript loglarının gönderilmesi.' },
      { key: 'onayChannelIdEnabled', label: 'Onay İstek / Bildirim Kanalı Gönderimi', type: 'toggle', description: 'Ticket onay/red kararlarının bildirim kanalına gitmesi.' },
      
      { key: 'ticketApprovalDmEnabled', label: 'DM Onay Mesajı Gönderimi', type: 'toggle', description: 'Kullanıcıya DM\'den onay mesajı gönderilsin mi?' },
      { key: 'ticketApprovalDmMessage', label: 'DM Onay Mesajı Şablonu', type: 'textarea', description: 'Kullanıcıya DM\'den giden onay şablonu. {user}, {reason}, {panda}, {unlem} kullanabilirsiniz.' },
      { key: 'ticketRejectionDmEnabled', label: 'DM Red Mesajı Gönderimi', type: 'toggle', description: 'Kullanıcıya DM\'den red mesajı gönderilsin mi?' },
      { key: 'ticketRejectionDmMessage', label: 'DM Red Mesajı Şablonu', type: 'textarea', description: 'Kullanıcıya DM\'den giden red şablonu. {user}, {reason}, {panda}, {unlem} kullanabilirsiniz.' },
      { key: 'ticketApprovalChannelEnabled', label: 'Kanal Onay Mesajı Gönderimi', type: 'toggle', description: 'Onay kanalına onay mesajı gönderilsin mi?' },
      { key: 'ticketApprovalChannelMessage', label: 'Kanal Onay Mesajı Şablonu', type: 'textarea', description: 'Onay kanalına giden onay şablonu. {user}, {reason}, {panda}, {unlem} kullanabilirsiniz.' },
      { key: 'ticketRejectionChannelEnabled', label: 'Kanal Red Mesajı Gönderimi', type: 'toggle', description: 'Onay kanalına red mesajı gönderilsin mi?' },
      { key: 'ticketRejectionChannelMessage', label: 'Kanal Red Mesajı Şablonu', type: 'textarea', description: 'Onay kanalına giden red şablonu. {user}, {reason}, {panda}, {unlem} kullanabilirsiniz.' }
    ]
  },
  youtube: {
    title: 'YouTube Sistemi',
    toggleKey: 'youtubeSystemEnabled',
    fields: [
      { key: 'videoChannelIdEnabled', label: 'Video / SS Kanalı Gönderimi', type: 'toggle', description: 'YouTube video bildirimlerinin kanala gönderilmesi.' },
      { key: 'youtubeBasvuruChannelIdEnabled', label: 'YouTube Başvuru Kanalı Aktif', type: 'toggle', description: 'YouTube başvurularının kabul edilip taranması.' },
      { key: 'youtubeLogChannelIdEnabled', label: 'YouTube Log Kanalı Gönderimi', type: 'toggle', description: 'YouTube kanalı ekleme/silme loglarının gönderilmesi.' }
    ]
  },
  banAf: {
    title: 'Ban Affı Sistemi',
    toggleKey: 'banAfSystemEnabled',
    fields: [
      { key: 'banAfChannelIdEnabled', label: 'Ban Af Başvuru Kanalı Aktif', type: 'toggle', description: 'Ban affı başvuru panelinin aktif olması.' },
      { key: 'banAfLogChannelIdEnabled', label: 'Ban Af Log Kanalı Gönderimi', type: 'toggle', description: 'Ban affı loglarının log kanalına gönderilmesi.' }
    ]
  },
  giveaway: {
    title: 'Çekiliş Sistemi',
    toggleKey: 'giveawaySystemEnabled',
    fields: []
  },
  activity: {
    title: 'Aktiflik Sistemi',
    toggleKey: 'activitySystemEnabled',
    fields: [
      { key: 'activityLogChannelIdEnabled', label: 'Aktiflik Log Kanalı Gönderimi', type: 'toggle', description: 'Aktiflik taramalarının log kanalına gönderilmesi.' }
    ]
  },
  icKontrol: {
    title: 'IC Kontrol Sistemi',
    toggleKey: 'icKontrolSystemEnabled',
    fields: [
      { key: 'icKontrolMainServer', label: 'IC Kontrol Ana Sunucu', type: 'text', description: 'IC Kontrol sistemi için taranacak FiveM ana sunucusu.' },
      { key: 'icKontrolType', label: 'IC Kontrol Türü', type: 'text', description: 'IC Kontrol tarama türü (örn: kanal-list).' },
      { key: 'icKontrolChannelIdEnabled', label: 'IC Kontrol Kanalı Gönderimi', type: 'toggle', description: 'Ekip içi kontrol listesinin kanala gönderilmesi.' }
    ]
  },
  logging: {
    title: 'Log Kanalları Sistemi',
    toggleKey: 'loggingSystemEnabled',
    fields: [
      { key: 'banLogChannelIdEnabled', label: 'Ban Log Kanalı Gönderimi', type: 'toggle', description: 'Yasaklama işlemlerinin log kanalına gönderilmesi.' },
      { key: 'sesLogChannelIdEnabled', label: 'Ses Log Kanalı Gönderimi', type: 'toggle', description: 'Ses hareketleri loglarının kanala gönderilmesi.' },
      { key: 'davetLogChannelIdEnabled', label: 'Davet Log Kanalı Gönderimi', type: 'toggle', description: 'Davet loglarının kanala gönderilmesi.' },
      { key: 'girisLogChannelIdEnabled', label: 'Giriş-Çıkış Log Kanalı Gönderimi', type: 'toggle', description: 'Giriş/çıkış loglarının kanala gönderilmesi.' },
      { key: 'kanalLogChannelIdEnabled', label: 'Kanal Log Kanalı Gönderimi', type: 'toggle', description: 'Kanal loglarının kanala gönderilmesi.' },
      { key: 'isimLogChannelIdEnabled', label: 'İsim Log Kanalı Gönderimi', type: 'toggle', description: 'İsim loglarının kanala gönderilmesi.' },
      { key: 'roleLogChannelIdEnabled', label: 'Rol İşlem Log Kanalı Gönderimi', type: 'toggle', description: 'Rol verme/alma işlemlerinin log kanalına gönderilmesi.' },
      { key: 'messageLogChannelIdEnabled', label: 'Mesaj Log Kanalı Gönderimi', type: 'toggle', description: 'Mesaj düzenleme/silme loglarının log kanalına gönderilmesi.' },
      { key: 'botLogChannelIdEnabled', label: 'Bot Sistem Log Kanalı Gönderimi', type: 'toggle', description: 'Bot sistem durum loglarının log kanalına gönderilmesi.' },
      { key: 'dmDuyuruLogChannelIdEnabled', label: 'DM Duyuru Log Kanalı Gönderimi', type: 'toggle', description: 'DM duyuru loglarının log kanalına gönderilmesi.' },
      { key: 'warningLogChannelIdEnabled', label: 'Uyarı Log Kanalı Gönderimi', type: 'toggle', description: 'Uyarı cezalarının log kanalına gönderilmesi.' },
      { key: 'farmLogChannelIdEnabled', label: 'Farm Log Kanalı 1 Gönderimi', type: 'toggle', description: 'Farm teslim onaylarının 1. log kanalına gönderilmesi.' },
      { key: 'farmLogChannelTwoIdEnabled', label: 'Farm Log Kanalı 2 Gönderimi', type: 'toggle', description: 'Farm teslim onaylarının 2. log kanalına gönderilmesi.' },
      { key: 'ticketLogChannelIdEnabled', label: 'Ticket Log Kanalı Gönderimi', type: 'toggle', description: 'Ticket loglarının log kanalına gönderilmesi.' },
      { key: 'banAfLogChannelIdEnabled', label: 'Ban Af Log Kanalı Gönderimi', type: 'toggle', description: 'Ban affı loglarının log kanalına gönderilmesi.' },
      { key: 'youtubeLogChannelIdEnabled', label: 'YouTube Log Kanalı Gönderimi', type: 'toggle', description: 'YouTube loglarının log kanalına gönderilmesi.' },
      { key: 'activityLogChannelIdEnabled', label: 'Aktiflik Log Kanalı Gönderimi', type: 'toggle', description: 'Aktiflik loglarının log kanalına gönderilmesi.' }
    ]
  }
};

async function openSystemSettingsModal(systemKey) {
  const sys = SYSTEM_FIELDS[systemKey];
  if (!sys) return;

  try {
    const res = await fetch('/api/config');
    const config = await res.json();

    document.getElementById('sys-modal-system-key').value = systemKey;
    document.getElementById('sys-modal-title').innerHTML = `<i class="fa-solid fa-gear"></i> ${sys.title} Ayarları`;
    document.getElementById('sys-modal-master-toggle').checked = config[sys.toggleKey] !== false;

    const container = document.getElementById('sys-modal-fields-container');
    container.innerHTML = '';

    sys.fields.forEach(field => {
      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'form-group';
      if (field.type === 'textarea' || field.type === 'toggle') {
        fieldDiv.style.gridColumn = 'span 2';
      }

      if (field.type === 'toggle') {
        const checked = config[field.key] !== false ? 'checked' : '';
        fieldDiv.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px;">
            <input type="checkbox" id="modal-field-${field.key}" ${checked} style="width: 18px; height: 18px; cursor: pointer;">
            <label for="modal-field-${field.key}" style="cursor: pointer; user-select: none; margin-bottom: 0;">${field.label}</label>
          </div>
          ${field.description ? `<p style="font-size: 12px; color: var(--text-muted); margin: 4px 0 0 28px;">${field.description}</p>` : ''}
        `;
      } else {
        let inputHtml = '';
        if (field.type === 'channel') {
          let selectOptions = '<option value="">Seçiniz...</option>';
          const textChannels = discordChannels.filter(c => c.type === 0 || c.type === 5);
          const voiceChannels = discordChannels.filter(c => c.type === 2);
          
          selectOptions += '<optgroup label="METİN KANALLARI">';
          textChannels.forEach(c => {
            selectOptions += `<option value="${c.id}" ${config[field.key] === c.id ? 'selected' : ''}># ${c.name} ${c.parentName ? `(${c.parentName})` : ''}</option>`;
          });
          selectOptions += '</optgroup>';
          
          selectOptions += '<optgroup label="SES KANALLARI">';
          voiceChannels.forEach(c => {
            selectOptions += `<option value="${c.id}" ${config[field.key] === c.id ? 'selected' : ''}>🔊 ${c.name} ${c.parentName ? `(${c.parentName})` : ''}</option>`;
          });
          selectOptions += '</optgroup>';
          
          inputHtml = `<select id="modal-field-${field.key}" class="guild-channel-select" style="width: 100%;">${selectOptions}</select>`;
        } else if (field.type === 'role') {
          let selectOptions = '<option value="">Seçiniz...</option>';
          discordRoles.forEach(r => {
            selectOptions += `<option value="${r.id}" ${config[field.key] === r.id ? 'selected' : ''}>${r.name}</option>`;
          });
          inputHtml = `<select id="modal-field-${field.key}" class="guild-role-select" style="width: 100%;">${selectOptions}</select>`;
        } else if (field.type === 'category') {
          let selectOptions = '<option value="">Seçiniz...</option>';
          const categories = discordChannels.filter(c => c.type === 4);
          categories.forEach(c => {
            selectOptions += `<option value="${c.id}" ${config[field.key] === c.id ? 'selected' : ''}>📂 ${c.name}</option>`;
          });
          inputHtml = `<select id="modal-field-${field.key}" class="guild-category-select" style="width: 100%;">${selectOptions}</select>`;
        } else if (field.type === 'textarea') {
          const val = config[field.key] || '';
          inputHtml = `<textarea id="modal-field-${field.key}" rows="3" style="width: 100%;" required>${val}</textarea>`;
        } else {
          const val = config[field.key] || '';
          inputHtml = `<input type="text" id="modal-field-${field.key}" value="${val}" style="width: 100%;">`;
        }

        fieldDiv.innerHTML = `
          <label for="modal-field-${field.key}">${field.label}</label>
          ${inputHtml}
          ${field.description ? `<p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${field.description}</p>` : ''}
        `;
      }

      container.appendChild(fieldDiv);
    });

    document.getElementById('system-settings-modal').style.display = 'flex';
  } catch (err) {
    console.error(err);
    showToast('Ayarlar yüklenirken hata oluştu.', 'error');
  }
}

function closeSystemSettingsModal() {
  document.getElementById('system-settings-modal').style.display = 'none';
}

window.closeSystemSettingsModal = closeSystemSettingsModal;

document.getElementById('system-modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const systemKey = document.getElementById('sys-modal-system-key').value;
  const sys = SYSTEM_FIELDS[systemKey];
  if (!sys) return;

  const updates = {};
  updates[sys.toggleKey] = document.getElementById('sys-modal-master-toggle').checked;

  sys.fields.forEach(field => {
    const el = document.getElementById(`modal-field-${field.key}`);
    if (el) {
      if (field.type === 'toggle') {
        updates[field.key] = el.checked;
      } else {
        updates[field.key] = el.value;
      }
    }
  });

  try {
    const res = await fetch('/api/config/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Sistem ayarları başarıyla güncellendi.', 'success');
      closeSystemSettingsModal();
      loadConfig();
      loadTicketSettings();
      if (systemKey === 'youtube') loadYoutubeSettings();
    } else {
      showToast(result.error || 'Ayarlar kaydedilemedi.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Ayarlar kaydedilirken hata oluştu.', 'error');
  }
});

// Sistem toggles gear settings clicks delegation
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-system-settings');
  if (btn) {
    const system = btn.getAttribute('data-system');
    if (system) {
      openSystemSettingsModal(system);
    }
  }
});

// 22) Bio & Guild Tarama Yönetimi
let exemptUserIds = new Set();
let currentScanMissingUserIds = [];

async function loadBioGuildSettings() {
  try {
    const res = await fetch('/api/bioguild/config');
    const config = await res.json();
    
    document.getElementById('bg-guildName').value = config.guildName || '';
    document.getElementById('bg-bioName').value = config.bioName || '';
    
    const tokenStatus = document.getElementById('bg-token-status');
    if (config.hasToken) {
      tokenStatus.innerText = '✅ User Token Tanımlı';
      tokenStatus.style.color = 'var(--success)';
    } else {
      tokenStatus.innerText = '⚠️ User Token Tanımlanmamış!';
      tokenStatus.style.color = 'var(--danger)';
    }

    // Populate channel dropdown select menu
    const channelSelect = document.getElementById('bg-send-list-channel');
    if (channelSelect) {
      channelSelect.innerHTML = '<option value="">Kanal Seçiniz...</option>';
      const textChannels = discordChannels.filter(c => c.type === 0);
      textChannels.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = `#${c.name}${c.parentName ? ` (${c.parentName})` : ''}`;
        channelSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error(err);
    showToast('Bio-Guild ayarları yüklenemedi.', 'error');
  }
}

window.loadBioGuildSettings = loadBioGuildSettings;

// Bio-Guild Ayarlarını Kaydetme
document.getElementById('bioguild-config-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const guildName = document.getElementById('bg-guildName').value.trim();
  const bioName = document.getElementById('bg-bioName').value.trim();
  const userToken = document.getElementById('bg-userToken').value.trim();
  
  const payload = { guildName, bioName };
  if (userToken !== '') {
    payload.userToken = userToken;
  }
  
  try {
    const res = await fetch('/api/bioguild/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      document.getElementById('bg-userToken').value = '';
      loadBioGuildSettings();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Ayarlar kaydedilirken hata oluştu.', 'error');
  }
});

// Taramayı Çalıştır
document.getElementById('btn-start-bg-scan').addEventListener('click', async () => {
  const type = document.getElementById('bg-scan-type').value;
  const progressWrapper = document.getElementById('bg-scan-progress-wrapper');
  const progressBar = document.getElementById('bg-scan-progress-bar');
  const progressText = document.getElementById('bg-scan-progress-text');
  const summaryWrapper = document.getElementById('bg-scan-summary');
  const summaryText = document.getElementById('bg-scan-summary-text');
  const scanActions = document.getElementById('bg-scan-actions');
  const resultsTbody = document.getElementById('bioguild-results-tbody');
  const startBtn = document.getElementById('btn-start-bg-scan');
  
  // UI reset
  exemptUserIds.clear();
  currentScanMissingUserIds = [];
  progressWrapper.style.display = 'block';
  progressBar.style.width = '10%';
  progressText.innerText = 'Taranıyor...';
  summaryWrapper.style.display = 'none';
  scanActions.style.display = 'none';
  resultsTbody.innerHTML = '<tr><td colspan="4" class="loading-item">Tarama yapılıyor, lütfen bekleyin... (Bu işlem kullanıcı sayısına göre vakit alabilir)</td></tr>';
  startBtn.disabled = true;
  
  try {
    const res = await fetch('/api/bioguild/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    
    progressBar.style.width = '80%';
    
    const result = await res.json();
    
    progressBar.style.width = '100%';
    startBtn.disabled = false;
    
    if (res.status === 401) {
      showToast('Hata: Geçersiz veya süresi dolmuş User Token!', 'error');
      resultsTbody.innerHTML = '<tr><td colspan="4" class="loading-item" style="color:var(--danger);">❌ Geçersiz User Token. Lütfen geçerli bir token kaydedin.</td></tr>';
      progressWrapper.style.display = 'none';
      return;
    }
    
    if (!res.ok) {
      showToast(result.error || 'Tarama gerçekleştirilemedi.', 'error');
      resultsTbody.innerHTML = `<tr><td colspan="4" class="loading-item" style="color:var(--danger);">❌ Hata: ${result.error || 'Bilinmeyen Hata'}</td></tr>`;
      progressWrapper.style.display = 'none';
      return;
    }
    
    progressWrapper.style.display = 'none';
    
    // Save missing users globally
    currentScanMissingUserIds = result.missing.map(m => m.id);
    
    // Render Summary
    summaryWrapper.style.display = 'block';
    const targetWord = type === 'guild' ? document.getElementById('bg-guildName').value : document.getElementById('bg-bioName').value;
    summaryText.innerHTML = `Toplam <strong>${result.total}</strong> onaylı üyeden <strong>${result.missing.length}</strong> kişide <strong>"${targetWord}"</strong> ifadesi bulunamadı.`;
    
    // Show / Hide Global Action buttons
    if (result.missing.length > 0) {
      scanActions.style.display = 'flex';
    } else {
      scanActions.style.display = 'none';
    }
    
    // Render missing members
    resultsTbody.innerHTML = '';
    if (result.missing.length === 0) {
      resultsTbody.innerHTML = '<tr><td colspan="4" class="loading-item" style="color:var(--success);">✅ Harika! Tüm üyeler kurallara uygun görünüyor.</td></tr>';
    } else {
      result.missing.forEach(m => {
        const tr = document.createElement('tr');
        tr.id = `bg-user-row-${m.id}`;
        tr.innerHTML = `
          <td>
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="${m.avatar}" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); object-fit: cover;">
              <strong style="color: var(--text-primary); font-size: 14px;">${m.displayName}</strong>
            </div>
          </td>
          <td>${m.tag}</td>
          <td><code>${m.id}</code></td>
          <td>
            <button type="button" class="btn btn-warning btn-sm btn-exempt-toggle" data-user-id="${m.id}" style="padding: 6px 12px; font-size: 12px;">
              <i class="fa-solid fa-user-shield"></i> Muaf Tut
            </button>
          </td>
        `;
        resultsTbody.appendChild(tr);
      });
    }
    
    showToast('Tarama başarıyla tamamlandı.', 'success');
  } catch (err) {
    console.error(err);
    startBtn.disabled = false;
    progressWrapper.style.display = 'none';
    showToast('Tarama sırasında teknik bir hata oluştu.', 'error');
    resultsTbody.innerHTML = '<tr><td colspan="4" class="loading-item" style="color:var(--danger);">❌ Teknik bir hata nedeniyle tarama durduruldu.</td></tr>';
  }
});

// Member exemption toggle listener
document.getElementById('bioguild-results-tbody').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-exempt-toggle');
  if (btn) {
    const userId = btn.getAttribute('data-user-id');
    const row = document.getElementById(`bg-user-row-${userId}`);
    if (exemptUserIds.has(userId)) {
      exemptUserIds.delete(userId);
      btn.innerHTML = '<i class="fa-solid fa-user-shield"></i> Muaf Tut';
      btn.className = 'btn btn-warning btn-sm btn-exempt-toggle';
      if (row) {
        row.style.opacity = '1';
        row.style.background = '';
      }
      showToast('Üye muafiyeti kaldırıldı.', 'info');
    } else {
      exemptUserIds.add(userId);
      btn.innerHTML = '<i class="fa-solid fa-user-check"></i> Muaf Tutuldu';
      btn.className = 'btn btn-success btn-sm btn-exempt-toggle';
      if (row) {
        row.style.opacity = '0.4';
        row.style.background = 'rgba(255, 255, 255, 0.02)';
      }
      showToast('Üye tarama eylemlerinden muaf tutuldu.', 'success');
    }
  }
});

// Global "Permleri Çek" Button Click Handler
document.getElementById('btn-bg-pull-roles').addEventListener('click', async () => {
  const targetUserIds = currentScanMissingUserIds.filter(id => !exemptUserIds.has(id));
  
  if (targetUserIds.length === 0) {
    showToast('Muaf olmayan ve kurallara uymayan herhangi bir üye bulunamadı.', 'warning');
    return;
  }
  
  if (!confirm(`Muaf tutulmayan ${targetUserIds.length} üyenin bütün yetki/rollerini çekmek istediğinize emin misiniz?`)) {
    return;
  }
  
  const btn = document.getElementById('btn-bg-pull-roles');
  btn.disabled = true;
  
  try {
    const res = await fetch('/api/bioguild/remove-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: targetUserIds })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.error || 'İşlem başarısız oldu.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('API çağrısı sırasında bir hata oluşdu.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// Global "Liste Gönder" Button Click Handler
document.getElementById('btn-bg-send-list').addEventListener('click', async () => {
  const channelId = document.getElementById('bg-send-list-channel').value;
  if (!channelId) {
    showToast('Lütfen listenin gönderileceği kanalı seçin.', 'warning');
    return;
  }
  
  const targetUserIds = currentScanMissingUserIds.filter(id => !exemptUserIds.has(id));
  if (targetUserIds.length === 0) {
    showToast('Gönderilecek muaf olmayan üye bulunmuyor.', 'warning');
    return;
  }
  
  const btn = document.getElementById('btn-bg-send-list');
  btn.disabled = true;
  
  try {
    const res = await fetch('/api/bioguild/send-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: targetUserIds, channelId })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.error || 'İşlem başarısız oldu.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('API çağrısı sırasında bir hata oluştu.', 'error');
  } finally {
    btn.disabled = false;
  }
});


