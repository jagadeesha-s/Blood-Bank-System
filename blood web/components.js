function el(tag, attrs, children) {
  attrs = attrs || {};
  children = children || [];
  var e = document.createElement(tag);
  var keys = Object.keys(attrs);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], v = attrs[k];
    if (v === null || v === undefined) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'onClick') e.addEventListener('click', v);
    else if (k === 'onChange') e.addEventListener('change', v);
    else e.setAttribute(k, v);
  }
  if (!Array.isArray(children)) children = [children];
  for (var j = 0; j < children.length; j++) {
    var c = children[j];
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(String(c)));
    else if (c && c.nodeType) e.appendChild(c);
  }
  return e;
}

function getTierAvatarClass(tier) {
  if (tier === 'diamond') return 'dav-diamond';
  if (tier === 'gold') return 'dav-gold';
  if (tier === 'silver') return 'dav-silver';
  return 'dav-plain';
}

function renderSidebar(activePage, userRole, onNav, onSwitch) {
  var donorNav = [
    { id:'dashboard', icon:'🏠', label:'Dashboard' },
    { id:'requests', icon:'🩸', label:'Requests', badge:'' },
    { id:'rewards', icon:'🏆', label:'My Rewards' },
    { id:'history', icon:'🕓', label:'Donation History' },
    { id:'profile', icon:'👤', label:'Profile' }
  ];
  var hospitalNav = [
    { id:'dashboard', icon:'🏥', label:'Dashboard' },
    { id:'request-blood', icon:'🩸', label:'Request Blood' },
    { id:'donors', icon:'👥', label:'Matching Donors' },
    { id:'history', icon:'📊', label:'Request History' },
    { id:'profile', icon:'👤', label:'Profile' }
  ];
  var nav = userRole === 'donor' ? donorNav : hospitalNav;
  var user = userRole === 'donor' ? DUMMY_DATA.donor : DUMMY_DATA.hospital;
  var initials = user.name.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
  var tier = userRole === 'donor' ? getDonorTier(DUMMY_DATA.donor.totalDonations) : 'none';
  var tc = tier === 'none' ? 'plain' : tier;
  var tierLabel = tier === 'none' ? 'New Donor' : (tier.charAt(0).toUpperCase()+tier.slice(1)+' Member');

  var items = nav.map(function(item) {
    var btnChildren = [el('span',{'class':'nav-icon'},[item.icon]), item.label];
    if (item.badge !== undefined) {
      var badgeEl = el('span', {'class':'nav-badge', 'id':'sidebar-req-badge', 'style': item.badge ? '' : 'display:none;'}, [item.badge]);
      btnChildren.push(badgeEl);
    }
    return el('li',{},[el('button',{
      'class':'nav-item'+(activePage===item.id?' active':''),
      'onClick':function(){ onNav(item.id); }
    },btnChildren)]);
  });

  return el('div',{'class':'sidebar'},[
    el('div',{'class':'sidebar-logo'},[
      el('div',{'class':'logo-icon'},['🩸']),
      el('div',{},[
        el('div',{'class':'logo-text'},['BloodLink']),
        el('span',{'class':'logo-sub'},[userRole==='donor'?'Donor Portal':'Hospital Portal'])
      ])
    ]),
    el('div',{'class':'sidebar-section-label'},[userRole==='donor'?'Donor Menu':'Hospital Menu']),
    el('ul',{'class':'sidebar-nav'},items),
    el('div',{'class':'sidebar-bottom'},[
      el('div',{'class':'user-pill'},[
        el('div',{'class':'avatar '+tc},[initials]),
        el('div',{},[
          el('div',{'class':'user-name'},[user.name.split(' ')[0]]),
          el('div',{'class':'user-role'},[getTierEmoji(tier)+' '+tierLabel])
        ])
      ]),
      el('button',{'class':'switch-role-btn','onClick':onSwitch},[
        userRole==='donor'?'🏥 Switch to Hospital View':'👤 Switch to Donor View'
      ])
    ])
  ]);
}

function renderTopBar(title, subtitle, onNotif, onSettings) {
  return el('div',{'class':'top-bar'},[
    el('div',{'class':'top-bar-title'},[
      el('h1',{},[title]),
      el('p',{},[subtitle])
    ]),
    el('div',{'class':'top-bar-actions'},[
      el('div',{'class':'icon-btn','onClick':onNotif},['🔔',el('span',{'class':'dot'},[])]),
      el('div',{'class':'icon-btn','onClick':onSettings},['⚙️'])
    ])
  ]);
}

function renderSettingsDropdown(onClose, onLogout) {
  var settings = DUMMY_DATA.settings;

  var langSelect = el('select',{'class':'sd-input sd-select'},[]);
  DUMMY_DATA.languages.forEach(function(l){
    var opt = el('option',{},l);
    if (l === settings.language) opt.setAttribute('selected','selected');
    langSelect.appendChild(opt);
  });

  var locInput = el('input',{'class':'sd-input','type':'text','placeholder':'Enter your location','value':settings.location},[]);

  var notifChecked = settings.notifications;
  var toggleInput = el('input',{'type':'checkbox'},[]);
  if (notifChecked) toggleInput.setAttribute('checked','checked');
  toggleInput.addEventListener('change', function(){
    DUMMY_DATA.settings.notifications = toggleInput.checked;
  });

  var dropdown = el('div',{'class':'settings-dropdown'},[
    el('div',{'class':'sd-header'},[
      el('div',{'class':'sd-header-title'},['⚙️ Settings']),
      el('div',{'class':'sd-header-sub'},['Manage your preferences'])
    ]),
    el('div',{'class':'sd-section'},[
      el('div',{'class':'sd-label'},['🌐 Language']),
      langSelect
    ]),
    el('div',{'class':'sd-section'},[
      el('div',{'class':'sd-label'},['📍 Location']),
      locInput
    ]),
    el('div',{'class':'sd-section'},[
      el('div',{'class':'sd-toggle-row'},[
        el('div',{'class':'sd-toggle-info'},[
          el('div',{'class':'sd-toggle-title'},['🔔 Notifications']),
          el('div',{'class':'sd-toggle-sub'},['Receive blood request alerts'])
        ]),
        el('label',{'class':'toggle-switch'},[toggleInput, el('span',{'class':'toggle-slider'},[])])
      ])
    ]),
    el('button',{'class':'sd-save-btn','onClick':function(){
      DUMMY_DATA.settings.language = langSelect.value;
      DUMMY_DATA.settings.location = locInput.value;
      DUMMY_DATA.donor.language = langSelect.value;
      DUMMY_DATA.donor.location = locInput.value;
      onClose();
      alert('✓ Settings saved!');
    }},['✓ Save Changes']),
    el('div',{'class':'sd-logout','onClick':onLogout},[
      el('div',{'class':'sd-logout-icon'},['🚪']),
      el('div',{},[
        el('div',{'class':'sd-logout-text'},['Logout']),
        el('div',{'class':'sd-logout-sub'},['Sign out of BloodLink'])
      ])
    ])
  ]);

  return dropdown;
}

function renderStatCard(icon, ic, value, label, change) {
  return el('div',{'class':'stat-card'},[
    el('div',{'class':'stat-icon '+ic},[icon]),
    el('div',{},[
      el('div',{'class':'stat-value'},[value]),
      el('div',{'class':'stat-label'},[label]),
      change ? el('div',{'class':'stat-change'},[change]) : null
    ])
  ]);
}

function renderTierShowcase(activeTier) {
  var tiers = [
    {key:'silver',color:'silver',dot:'🔹'},
    {key:'gold',color:'gold',dot:'🔸'},
    {key:'diamond',color:'diamond',dot:'🔷'}
  ];
  return el('div',{'class':'tier-showcase'},tiers.map(function(t){
    var td = DUMMY_DATA.tiers[t.key];
    var isActive = activeTier === t.key;
    var perks = td.perks.map(function(p){
      return el('div',{'class':'tier-perk'},[el('span',{},[t.dot]), p]);
    });
    return el('div',{'class':'tier-card '+t.color+(isActive?' active-tier':'')},[
      isActive ? el('div',{'class':'active-crown'},['👑']) : null,
      el('span',{'class':'tier-emoji'},[td.emoji]),
      el('div',{'class':'tier-name-text '+t.color},[td.name+' Tier']),
      el('div',{'class':'tier-req-text '+t.color},['Unlock at '+td.donations+' donation'+(td.donations>1?'s':'')]),
      el('div',{'class':'tier-divider '+t.color},[]),
      el('div',{'class':'tier-benefit-text'},[td.benefit]),
      el('div',{'class':'tier-detail-text'},[td.detail]),
      el('div',{},perks)
    ]);
  }));
}

function renderRequestCard(req, role, onAccept) {
  var urgBadge = req.urgency==='urgent'
    ? el('span',{'class':'badge badge-urgent'},['🔴 Urgent'])
    : el('span',{'class':'badge badge-orange'},['🟡 Normal']);
  var stBadge = null;
  if (req.status==='completed') stBadge = el('span',{'class':'badge badge-green'},['✓ Done']);
  else if (req.status==='accepted') stBadge = el('span',{'class':'badge badge-blue'},['⏳ Accepted']);

  var actions = [];
  if (role==='donor' && req.status==='pending') {
    actions.push(el('button',{'class':'btn btn-primary btn-sm','onClick':function(){ onAccept(req); }},['✓ Accept Request']));
  }

  return el('div',{'class':'request-card '+req.urgency},[
    el('div',{'class':'request-top'},[
      el('div',{},[
        el('div',{'class':'request-hospital'},[req.hospital]),
        el('div',{'class':'request-time'},[req.time])
      ]),
      el('div',{'class':'flex gap-8 items-center'},[urgBadge, stBadge])
    ]),
    el('div',{'class':'request-meta'},['📍 '+req.location+'  ·  🚗 '+req.distance+'  ·  ⏱ '+req.eta+'  ·  🧪 '+req.units+' unit(s)']),
    actions.length ? el('div',{'class':'request-actions'},actions) : null
  ]);
}

function renderDonorCard(donor, onNotify) {
  var initials = donor.name.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
  var tc = donor.tier ? getTierAvatarClass(donor.tier) : 'dav-plain';
  return el('div',{'class':'donor-card'},[
    el('div',{'class':'donor-av '+tc},[initials]),
    el('div',{'class':'donor-info'},[
      el('div',{'class':'donor-name'},[donor.name]),
      el('div',{'class':'donor-sub'},[donor.bloodGroup+' · '+donor.distance+' · Last donated '+donor.lastDonated])
    ]),
    donor.tier && donor.tier!=='none' ? el('span',{'class':'badge badge-'+donor.tier},[getTierEmoji(donor.tier)+' '+donor.tier.charAt(0).toUpperCase()+donor.tier.slice(1)]) : null,
    el('span',{'class':'badge '+(donor.available?'badge-green':'badge-gray')},[donor.available?'● Available':'○ Busy']),
    el('button',{'class':'btn btn-primary btn-sm','onClick':function(){ onNotify(donor); }},['📨 Notify'])
  ]);
}

function renderNotifCard(notif) {
  var icons = {urgent:'🚨',normal:'🩸',success:'✅'};
  return el('div',{'class':'notif-card'+(notif.unread?' unread':'')},[
    el('div',{'class':'notif-icon'},[icons[notif.type]||'🔔']),
    el('div',{'class':'notif-body'},[
      el('div',{'class':'notif-title'},[notif.title]),
      el('div',{'class':'notif-text'},[notif.text]),
      el('div',{'class':'notif-time'},[notif.time])
    ]),
    notif.unread ? el('div',{'class':'notif-dot'},[]) : null
  ]);
}

function renderOTPModal(mode, req, onClose, onConfirm) {
  var content;
  if (mode==='enter') {
    var inp = el('input',{'class':'form-input otp-input','type':'text','maxlength':'4','placeholder':'----'},[]);
    content = el('div',{},[
      el('p',{'class':'text-sm text-secondary mb-16'},['Enter the OTP from the hospital to confirm donation.']),
      el('div',{'class':'form-group'},[el('label',{'class':'form-label'},['OTP CODE']),inp]),
      el('div',{'class':'flex gap-12'},[
        el('button',{'class':'btn btn-ghost flex-1','onClick':onClose},['Cancel']),
        el('button',{'class':'btn btn-success flex-1','onClick':function(){ onConfirm(inp.value); }},['✓ Confirm Donation'])
      ])
    ]);
  } else if (mode==='success') {
    content = el('div',{'class':'otp-success'},[
      el('div',{'class':'otp-success-icon'},['✅']),
      el('h3',{},['Donation Confirmed!']),
      el('p',{},['Thank you for saving a life. Your tier has been updated!']),
      el('button',{'class':'btn btn-success btn-lg mt-16','onClick':onClose},['Back to Dashboard'])
    ]);
  } else if (mode==='generate') {
    var otp = Math.floor(1000+Math.random()*9000).toString();
    content = el('div',{},[
      el('p',{'class':'text-sm text-secondary mb-20'},['Share this OTP with the donor.']),
      el('div',{'style':'text-align:center;padding:28px;background:var(--surface);border-radius:var(--radius-md);border:2px dashed var(--border-red);margin-bottom:20px;'},[
        el('div',{'style':'font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:2px;margin-bottom:10px;'},['ONE-TIME PASSWORD']),
        el('div',{'style':'font-size:44px;font-weight:800;color:var(--primary);letter-spacing:14px;'},[otp]),
        el('div',{'style':'font-size:11px;color:var(--text-muted);margin-top:10px;'},['Valid for 10 minutes'])
      ]),
      el('button',{'class':'btn btn-primary w-full','onClick':onClose},['Done'])
    ]);
  }

  var overlay = el('div',{'class':'modal-overlay'},[
    el('div',{'class':'modal'},[
      el('div',{'class':'modal-header'},[
        el('div',{'class':'modal-title'},[mode==='success'?'🎉 Success!':mode==='generate'?'🔐 OTP Generated':'🔐 Confirm Donation']),
        mode!=='success' ? el('button',{'class':'btn btn-ghost btn-sm','onClick':onClose},['✕']) : null
      ]),
      content
    ])
  ]);
  overlay.addEventListener('click',function(e){ if(e.target===overlay) onClose(); });
  return overlay;
}