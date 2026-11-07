// ── State ─────────────────────────────────────────────────────────
var state = {
  screen: 'auth',
  authMode: 'login',
  authRole: 'donor',
  authStep: 'email',           // ✅ first step is now email entry (not phone)
  userRole: 'donor',
  activePage: 'dashboard',
  modal: null,
  settingsOpen: false,

  // ✅ Logged-in user data (loaded from MongoDB after register/login)
  currentUser: null,

  // Temp form data while registering
  formData: {}
};

var BACKEND = 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────────
// ✅ GMAIL OTP — replaces the old Firebase phone-OTP flow.
//    Both donors AND hospitals receive their login/register OTP
//    on the email address they provide.
// ─────────────────────────────────────────────────────────────────
function sendEmailOTP(payload, btn, errDiv, onSuccess) {
  // payload = { email, purpose: 'login' | 'register', role: 'donor' | 'hospital' }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending OTP...'; }
  fetch(BACKEND + '/api/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
    .then(function (res) {
      if (btn) btn.disabled = false;
      if (!res.ok) {
        if (btn) btn.textContent = '📧 Send OTP';
        if (errDiv) { errDiv.textContent = '❌ ' + (res.body.error || 'Failed to send OTP'); errDiv.style.display = 'block'; }
        return;
      }
      if (btn) btn.textContent = '✅ OTP Sent!';
      // dev mode helper — server returns devOtp when Gmail isn't configured
      if (res.body.devOtp) {
        console.log('🔑 DEV OTP (Gmail not configured):', res.body.devOtp);
        alert('Dev mode — your OTP is: ' + res.body.devOtp);
      }
      onSuccess && onSuccess();
    })
    .catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = '📧 Send OTP'; }
      if (errDiv) { errDiv.textContent = '❌ Server error. Is the backend running?'; errDiv.style.display = 'block'; }
    });
}

function verifyEmailOTP(email, otp, errDiv, onSuccess) {
  fetch(BACKEND + '/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, otp: otp })
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
    .then(function (res) {
      if (!res.ok) {
        if (errDiv) { errDiv.textContent = '❌ ' + (res.body.error || 'Verification failed'); errDiv.style.display = 'block'; }
        return;
      }
      onSuccess && onSuccess(res.body);
    })
}

// (legacy stub kept so any old reference doesn't crash; not used anymore)
function loadFirebase(callback) { callback && callback(); }

// ── Email validator ───────────────────────────────────────────────
function validateEmail(email) {
  if (!email) return { valid: false, error: '⚠️ Please enter your email address' };
  var clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { valid: false, error: '⚠️ Please enter a valid email address' };
  return { valid: true, email: clean };
}

// ── Phone number validator (Indian numbers) ───────────────────────
function validatePhone(phone) {
  // Remove spaces, dashes, +91, 91 prefix
  var cleaned = phone.replace(/\s|-/g, '').replace(/^\+91|^91/, '');
  // Must be exactly 10 digits starting with 6,7,8,9
  if (!/^[6-9]\d{9}$/.test(cleaned)) {
    return { valid: false, error: '❌ Enter a valid 10-digit Indian mobile number (starts with 6-9)' };
  }
  return { valid: true, number: '+91' + cleaned };
}

// ── Real-time polling: check for new requests every 15 seconds ────
var _lastRequestCount = 0;
var _notifBadge = null;

function startPolling() {
  setInterval(function () {
    fetch(BACKEND + '/api/requests?status=pending')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var user = state.currentUser;
        if (!user || user.role !== 'donor') return;

        // Filter requests matching donor's blood group
        var matched = data.filter(function (req) {
          return req.bloodGroup === user.bloodGroup;
        });

        // If new requests came in since last check — show notification bell
        if (matched.length > _lastRequestCount) {
          var newCount = matched.length - _lastRequestCount;
          showNotifToast('🩸 ' + newCount + ' new blood request for ' + user.bloodGroup + '!');
          updateNotifBadge(matched.length);
        }
        _lastRequestCount = matched.length;
      })
      .catch(function () {});
  }, 15000); // every 15 seconds
}

function showNotifToast(msg) {
  var existing = document.getElementById('notif-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'notif-toast';
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;background:linear-gradient(135deg,#DC2626,#B91C1C);color:white;padding:14px 20px;border-radius:14px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(220,38,38,0.4);display:flex;align-items:center;gap:10px;max-width:320px;cursor:pointer;';
  toast.innerHTML = '<span style="font-size:20px;">🔔</span><span>' + msg + '</span><span style="margin-left:auto;opacity:0.7;font-size:18px;">×</span>';
  toast.onclick = function () {
    toast.remove();
    state.activePage = 'requests';
    render();
  };
  document.body.appendChild(toast);
  setTimeout(function () { if (toast.parentNode) toast.remove(); }, 6000);
}

function updateNotifBadge(count) {
  var badge = document.getElementById('notif-count-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

var root = document.getElementById('app');

function render() {
  root.innerHTML = '';
  root.appendChild(state.screen === 'auth' ? renderAuth() : renderApp());
}

// ── Load user from localStorage on page load ──────────────────────
(function () {
  var saved = localStorage.getItem('bloodlink_user');
  if (saved) {
    try {
      state.currentUser = JSON.parse(saved);
      state.userRole = state.currentUser.role || 'donor';
      state.screen = 'app';
      state.activePage = 'dashboard';
      setTimeout(startPolling, 1000);
    } catch (e) {
      localStorage.removeItem('bloodlink_user');
    }
  }
})();

// ── Helper: get current user data (real or fallback) ─────────────
function getUser() {
  return state.currentUser || DUMMY_DATA.donor;
}
function getHospital() {
  return state.currentUser || DUMMY_DATA.hospital;
}

// ── AUTH ──────────────────────────────────────────────────────────

function renderAuth() {
  var page = el('div', { 'class': 'auth-page' }, []);

  var left = el('div', { 'class': 'auth-left' }, [
    el('div', { 'class': 'auth-illustration' }, ['🩸']),
    el('h2', {}, ['Save Lives, Anytime Anywhere']),
    el('p', {}, ['Connect hospitals with donors in real-time. Donate blood & earn Silver, Gold and Diamond health rewards for your family.']),
    el('div', { 'class': 'auth-stats' }, [
      el('div', { 'class': 'auth-stat' }, [el('div', { 'class': 'stat-num' }, ['12K+']), el('div', { 'class': 'stat-lbl' }, ['Active Donors'])]),
      el('div', { 'class': 'auth-stat' }, [el('div', { 'class': 'stat-num' }, ['340+']), el('div', { 'class': 'stat-lbl' }, ['Hospitals'])]),
      el('div', { 'class': 'auth-stat' }, [el('div', { 'class': 'stat-num' }, ['98%']), el('div', { 'class': 'stat-lbl' }, ['Success Rate'])])
    ])
  ]);

  var right = el('div', { 'class': 'auth-right' }, []);
  right.appendChild(el('div', { 'class': 'auth-logo' }, [
    el('div', { 'class': 'logo-icon' }, ['🩸']),
    el('span', {}, ['BloodLink'])
  ]));

  var loginTab = el('button', {
    'class': 'auth-tab' + (state.authMode === 'login' ? ' active' : ''),
    'onClick': function () { state.authMode = 'login'; state.authStep = 'email'; state.formData = {}; render(); }
  }, ['Sign In']);
  var regTab = el('button', {
    'class': 'auth-tab' + (state.authMode === 'register' ? ' active' : ''),
    'onClick': function () { state.authMode = 'register'; state.authStep = 'email'; state.formData = {}; render(); }
  }, ['Register']);
  right.appendChild(el('div', { 'class': 'auth-tabs' }, [loginTab, regTab]));
  right.appendChild(state.authMode === 'login' ? renderLoginForm() : renderRegisterForm());

  page.appendChild(left);
  page.appendChild(right);
  return page;
}

function renderRoleToggle() {
  return el('div', { 'class': 'role-toggle' }, [
    el('div', {
      'class': 'role-card' + (state.authRole === 'donor' ? ' active' : ''),
      'onClick': function () { state.authRole = 'donor'; render(); }
    }, [el('div', { 'class': 'role-icon' }, ['👤']), el('div', { 'class': 'role-name' }, ['Donor'])]),
    el('div', {
      'class': 'role-card' + (state.authRole === 'hospital' ? ' active' : ''),
      'onClick': function () { state.authRole = 'hospital'; render(); }
    }, [el('div', { 'class': 'role-icon' }, ['🏥']), el('div', { 'class': 'role-name' }, ['Hospital'])])
  ]);
}

// ── LOGIN FORM ────────────────────────────────────────────────────
function renderLoginForm() {
  var w = el('div', {}, []);

  if (state.authStep === 'email') {
    w.appendChild(el('h2', { 'class': 'auth-subtitle' }, ['Welcome Back 👋']));
    w.appendChild(el('p', { 'class': 'auth-hint' }, ['Enter your registered Gmail — we\'ll send a 6-digit OTP to your inbox']));
    w.appendChild(renderRoleToggle());

    var emailInput = el('input', { 'class': 'form-input', 'type': 'email', 'placeholder': 'yourname@gmail.com' }, []);
    w.appendChild(el('div', { 'class': 'form-group' }, [
      el('label', { 'class': 'form-label' }, ['📧 EMAIL ADDRESS']),
      emailInput,
      el('div', { 'style': 'font-size:11px;color:#6B7280;margin-top:5px;' }, ['OTP will be delivered to your Gmail inbox'])
    ]));

    var errDiv = el('div', { 'style': 'color:red;font-size:13px;margin-bottom:8px;display:none;' }, []);
    w.appendChild(errDiv);

    var sendBtn = el('button', {
      'class': 'btn btn-primary btn-full btn-lg',
      'onClick': function () {
        var v = validateEmail(emailInput.value);
        if (!v.valid) { errDiv.textContent = v.error; errDiv.style.display = 'block'; return; }
        errDiv.style.display = 'none';
        state.formData.email = v.email;
        state.formData.role  = state.authRole;

        sendEmailOTP(
          { email: v.email, purpose: 'login', role: state.authRole },
          sendBtn, errDiv,
          function () { state.authStep = 'otp'; render(); }
        );
      }
    }, ['📧 Send OTP']);
    w.appendChild(sendBtn);

  } else {
    w.appendChild(el('h2', { 'class': 'auth-subtitle' }, ['Enter OTP 🔐']));
    w.appendChild(el('p', { 'class': 'auth-hint' }, ['Check your Gmail (' + (state.formData.email || '') + ') for the 6-digit code']));

    var otpInput = el('input', { 'class': 'form-input otp-input', 'type': 'text', 'maxlength': '6', 'placeholder': '------' }, []);
    w.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['VERIFICATION CODE']), otpInput]));

    var errDiv2 = el('div', { 'style': 'color:red;font-size:13px;margin-bottom:8px;display:none;' }, []);
    w.appendChild(errDiv2);

    w.appendChild(el('button', {
      'class': 'btn btn-primary btn-full btn-lg',
'onClick': function () {
        var otp = otpInput.value.replace(/\s/g, '').trim();
        if (!otp || otp.length < 6) {
          errDiv2.textContent = '❌ Please enter the 6-digit OTP';
          errDiv2.style.display = 'block';
          return;
        }
        verifyEmailOTP(state.formData.email, otp, errDiv2, function (resp) {
          var user = resp.user;
          if (!user) {
            errDiv2.textContent = '❌ Account not found. Please register first.';
            errDiv2.style.display = 'block';
            return;
          }
          state.currentUser = user;
          state.userRole = user.role || 'donor';
          localStorage.setItem('bloodlink_user', JSON.stringify(user));
          state.screen = 'app';
          state.activePage = 'dashboard';
          startPolling();
          render();
        });
      }
    }, ['✓ Verify & Login']));

    w.appendChild(el('p', { 'class': 'text-sm text-secondary mt-12 text-center' }, [
      'Didn\'t receive? ',
      el('span', {
        'style': 'color:var(--primary);cursor:pointer;font-weight:600;',
        'onClick': function () { state.authStep = 'email'; render(); }
      }, ['Resend'])
    ]));
  }
  return w;
}

// ── REGISTER FORM (✅ Gmail OTP — donor + hospital) ───────────
function renderRegisterForm() {
  var w = el('div', {}, []);

  if (state.authStep === 'email') {
    w.appendChild(el('h2', { 'class': 'auth-subtitle' }, ['Create Account ✨']));
    w.appendChild(el('p', { 'class': 'auth-hint' }, ['Join BloodLink. Save lives. Earn rewards.']));
    w.appendChild(renderRoleToggle());

    var inputs = {};

    if (state.authRole === 'donor') {
      var nameInput  = el('input', { 'class': 'form-input', 'type': 'text', 'placeholder': 'Your full name' }, []);
      var phoneInput = el('input', { 'class': 'form-input', 'type': 'tel',  'placeholder': '+91 98765 43210' }, []);
      var emailInput = el('input', { 'class': 'form-input', 'type': 'email','placeholder': 'yourname@gmail.com' }, []);
      var cityInput  = el('input', { 'class': 'form-input', 'type': 'text', 'placeholder': 'e.g. Bengaluru' }, []);
      var bgSelect   = el('select',{ 'class': 'form-input form-select' }, [el('option', {}, 'Select blood group')]);
      DUMMY_DATA.bloodGroups.forEach(function (bg) { bgSelect.appendChild(el('option', {}, bg)); });
      var langSelect = el('select',{ 'class': 'form-input form-select' }, [el('option', { 'value': '' }, 'Choose your language')]);
      DUMMY_DATA.languages.forEach(function (l) { langSelect.appendChild(el('option', { 'value': l }, l)); });

      var emailHint = el('div', { 'style': 'font-size:11px;color:#6B7280;margin-top:5px;line-height:1.5;' }, [
        '📧 Login OTP and donation OTPs will be sent here'
      ]);
      var langHint = el('div', { 'style': 'font-size:11px;color:#6B7280;margin-top:5px;line-height:1.5;' }, [
        '🔔 Blood request alerts will be sent to your mobile in this language'
      ]);

      w.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['FULL NAME']), nameInput]));
      w.appendChild(el('div', { 'class': 'form-group' }, [
        el('label', { 'class': 'form-label' }, ['📧 GMAIL (LOGIN + DONATION OTP)']),
        emailInput, emailHint
      ]));
      w.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['PHONE NUMBER']), phoneInput]));
      w.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['CITY']), cityInput]));
      w.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['BLOOD GROUP']), bgSelect]));
      w.appendChild(el('div', { 'class': 'form-group' }, [
        el('label', { 'class': 'form-label' }, ['🔔 PREFERRED LANGUAGE FOR NOTIFICATIONS']),
        langSelect, langHint
      ]));

      inputs = { nameInput, phoneInput, emailInput, cityInput, bgSelect, langSelect };

    } else {
      var hNameInput    = el('input', { 'class': 'form-input', 'type': 'text',  'placeholder': 'City General Hospital' }, []);
      var hLocInput     = el('input', { 'class': 'form-input', 'type': 'text',  'placeholder': 'MG Road, Bengaluru' }, []);
      var hPhoneInput   = el('input', { 'class': 'form-input', 'type': 'tel',   'placeholder': '+91 80-4567-8900' }, []);
      // ✅ NEW: hospital Gmail field
      var hEmailInput   = el('input', { 'class': 'form-input', 'type': 'email', 'placeholder': 'hospital@gmail.com' }, []);
      var hLicenseInput = el('input', { 'class': 'form-input', 'type': 'text',  'placeholder': 'Enter hospital license number' }, []);

      var hEmailHint = el('div', { 'style': 'font-size:11px;color:#6B7280;margin-top:5px;line-height:1.5;' }, [
        '📧 Login OTP will be delivered to this Gmail inbox'
      ]);

      w.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['HOSPITAL NAME']), hNameInput]));
      w.appendChild(el('div', { 'class': 'form-group' }, [
        el('label', { 'class': 'form-label' }, ['📧 GMAIL (FOR LOGIN OTP)']),
        hEmailInput, hEmailHint
      ]));
      w.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['LOCATION']), hLocInput]));
      w.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['CONTACT (PHONE)']), hPhoneInput]));
      w.appendChild(el('div', { 'class': 'form-group' }, [
        el('label', { 'class': 'form-label' }, ['🏥 HOSPITAL LICENSE NUMBER']),
        hLicenseInput,
        el('div', { 'style': 'font-size:11px;color:#6B7280;margin-top:4px;' }, ['⚠️ Enter your official hospital license number to register'])
      ]));

      inputs = { hNameInput, hLocInput, hPhoneInput, hEmailInput, hLicenseInput };
    }

    var errDiv = el('div', { 'style': 'color:red;font-size:13px;margin-bottom:8px;display:none;' }, []);
    w.appendChild(errDiv);

    var regBtn = el('button', {
      'class': 'btn btn-primary btn-full btn-lg',
      'onClick': function () {
        // ── Collect & validate ──
        if (state.authRole === 'donor') {
          var name       = inputs.nameInput.value.trim();
          var phone      = inputs.phoneInput.value.trim();
          var email      = inputs.emailInput.value.trim();
          var city       = inputs.cityInput.value.trim();
          var bloodGroup = inputs.bgSelect.value;
          var language   = inputs.langSelect.value;

          if (!name || !city || bloodGroup === 'Select blood group' || !language) {
            errDiv.textContent = '⚠️ Please fill all fields';
            errDiv.style.display = 'block'; return;
          }
          var ev = validateEmail(email);
          if (!ev.valid) { errDiv.textContent = ev.error; errDiv.style.display = 'block'; return; }

          var validation = validatePhone(phone);
          if (!validation.valid) { errDiv.textContent = validation.error; errDiv.style.display = 'block'; return; }

          errDiv.style.display = 'none';
          state.formData = {
            name: name, phone: validation.number, email: ev.email,
            city: city, bloodGroup: bloodGroup, language: language,
            role: 'donor', availability: true
          };

        } else {
          var hName    = inputs.hNameInput.value.trim();
          var hLoc     = inputs.hLocInput.value.trim();
          var hPhone   = inputs.hPhoneInput.value.trim();
          var hEmail   = inputs.hEmailInput.value.trim();
          var hLicense = inputs.hLicenseInput.value.trim();

          if (!hName || !hLoc || !hPhone || !hLicense || !hEmail) {
            errDiv.textContent = '⚠️ Please fill all fields including Gmail and License Number';
            errDiv.style.display = 'block'; return;
          }
          var hev = validateEmail(hEmail);
          if (!hev.valid) { errDiv.textContent = hev.error; errDiv.style.display = 'block'; return; }

          if (hLicense !== 'KA-2908') {
            errDiv.textContent = '❌ Invalid License Number. Please enter a valid hospital license number.';
            errDiv.style.display = 'block';
            inputs.hLicenseInput.style.border = '2px solid #DC2626';
            return;
          }
          inputs.hLicenseInput.style.border = '2px solid #16A34A';

          var hValidation = validatePhone(hPhone);
          if (!hValidation.valid) { errDiv.textContent = hValidation.error; errDiv.style.display = 'block'; return; }

          errDiv.style.display = 'none';
          state.formData = {
            name: hName, city: hLoc, phone: hValidation.number, email: hev.email,
            licenseNumber: hLicense, role: 'hospital',
            bloodGroup: 'N/A', availability: false
          };
        }

        // ── Send OTP to Gmail ──
        sendEmailOTP(
          { email: state.formData.email, purpose: 'register', role: state.authRole },
          regBtn, errDiv,
          function () { state.authStep = 'otp'; render(); }
        );
      }
    }, ['📧 Send OTP']);
    w.appendChild(regBtn);

  } else {
    // ── OTP step ──
    w.appendChild(el('h2', { 'class': 'auth-subtitle' }, ['Verify Email 🔐']));
    w.appendChild(el('p', { 'class': 'auth-hint' }, ['Check your Gmail (' + (state.formData.email || '') + ') for the 6-digit code']));

    var otpInput = el('input', { 'class': 'form-input otp-input', 'type': 'text', 'maxlength': '6', 'placeholder': '------' }, []);
    w.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['OTP CODE']), otpInput]));

    var errDiv3 = el('div', { 'style': 'color:red;font-size:13px;margin-bottom:8px;display:none;' }, []);
    w.appendChild(errDiv3);

    w.appendChild(el('button', {
      'class': 'btn btn-primary btn-full btn-lg',
      'onClick': function () {
        var otp = otpInput.value.trim();
        if (!otp || otp.length < 6) {
          errDiv3.textContent = '❌ Please enter the 6-digit OTP';
          errDiv3.style.display = 'block'; return;
        }

        verifyEmailOTP(state.formData.email, otp, errDiv3, function (resp) {

            // ✅ Email verified — now create account
            fetch(BACKEND + '/api/donors', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(state.formData)
            })

            .then(function (r) {
                return r.json().then(function (d) {
                    return {
                        ok: r.ok,
                        body: d
                    };
                });
            })

            .then(function (res) {

                if (!res.ok) {

                    console.log("BACKEND ERROR:", res.body);

                    errDiv3.textContent =
                        '❌ ' + (res.body.error || 'Registration failed');

                    errDiv3.style.display = 'block';

                    alert(res.body.error || 'Registration failed');

                    return null;
                }

                return res.body.donor;

            })

            .then(function (user) {

                console.log("USER:", user);

                if (!user) {
                    alert("User creation failed");
                    return;
                }

                state.currentUser = user;

                if (user.role) {
                    state.userRole = user.role;
                } else {
                    state.userRole = 'donor';
                }

                localStorage.setItem(
                    'bloodlink_user',
                    JSON.stringify(user)
                );

                state.screen = 'app';
                state.activePage = 'dashboard';

                render();

                setTimeout(function () {
                    startPolling();
                }, 500);

                alert("Registration Successful!");

            })

            .catch(function (err) {

                console.error(err);

                errDiv3.textContent =
                    '❌ Server error. Is backend running?';

                errDiv3.style.display = 'block';
            });

        });
      }
    }, ['✓ Complete Registration']));

    w.appendChild(el('p', { 'class': 'text-sm text-secondary mt-12 text-center' }, [
      'Didn\'t receive? ',
      el('span', {
        'style': 'color:var(--primary);cursor:pointer;font-weight:600;',
        'onClick': function () { state.authStep = 'email'; render(); }
      }, ['Resend'])
    ]));
  }
  return w;
}

// ── APP ───────────────────────────────────────────────────────────

function renderApp() {
  var shell = el('div', { 'class': 'app-shell' }, []);

  shell.appendChild(renderSidebar(state.activePage, state.userRole,
    function (p) { state.activePage = p; state.settingsOpen = false; render(); },
    function () { state.userRole = state.userRole === 'donor' ? 'hospital' : 'donor'; state.activePage = 'dashboard'; state.settingsOpen = false; render(); }
  ));

  var main = el('div', { 'class': 'main-content' }, []);
  var cfg = getPageConfig();

  var topBar = renderTopBar(cfg.title, cfg.subtitle,
    function () { state.activePage = 'notifications'; state.settingsOpen = false; render(); },
    function () { state.settingsOpen = !state.settingsOpen; render(); }
  );

  if (state.settingsOpen) {
    var actions = topBar.querySelector('.top-bar-actions');
    if (actions) {
      var dropdown = renderSettingsDropdown(
        function () { state.settingsOpen = false; render(); },
        function () {
          // ✅ Logout: clear user from state + localStorage
          state.currentUser = null;
          localStorage.removeItem('bloodlink_user');
          state.settingsOpen = false;
          state.screen = 'auth';
          state.authStep = 'email';
          state.authMode = 'login';
          render();
        }
      );
      actions.style.position = 'relative';
      actions.appendChild(dropdown);
      setTimeout(function () {
        document.addEventListener('click', function handler(e) {
          if (!actions.contains(e.target)) {
            state.settingsOpen = false;
            render();
            document.removeEventListener('click', handler);
          }
        });
      }, 10);
    }
  }

  main.appendChild(topBar);
  var pg = el('div', { 'class': 'page' }, []);
  pg.appendChild(renderPage());
  main.appendChild(pg);
  shell.appendChild(main);

  if (state.modal) shell.appendChild(renderModalState());
  return shell;
}

function getPageConfig() {
  var u = getUser();
  var firstName = (u.name || 'User').split(' ')[0];
  var d = {
    dashboard: { title: 'Dashboard', subtitle: 'Welcome back, ' + firstName + ' 👋' },
    requests: { title: 'Blood Requests', subtitle: 'Hospitals that need your help' },
    rewards: { title: 'My Rewards', subtitle: 'Donation tiers & health benefits' },
    history: { title: 'Donation History', subtitle: 'Your contribution timeline' },
    profile: { title: 'My Profile', subtitle: 'Manage your account' },
    notifications: { title: 'Notifications', subtitle: 'Stay updated' }
  };
  var h = {
    dashboard: { title: 'Hospital Dashboard', subtitle: u.name || 'Hospital' },
    'request-blood': { title: 'Request Blood', subtitle: 'Find donors fast' },
    donors: { title: 'Matching Donors', subtitle: 'Nearby available donors' },
    history: { title: 'Request History', subtitle: 'Past blood requests' },
    profile: { title: 'Hospital Profile', subtitle: 'Manage hospital info' }
  };
  return (state.userRole === 'donor' ? d : h)[state.activePage] || { title: 'BloodLink', subtitle: '' };
}

function renderPage() {
  if (state.userRole === 'donor') {
    if (state.activePage === 'dashboard') return renderDonorDashboard();
    if (state.activePage === 'requests') return renderDonorRequests();
    if (state.activePage === 'rewards') return renderRewardsPage();
    if (state.activePage === 'history') return renderDonorHistory();
    if (state.activePage === 'profile') return renderDonorProfile();
    if (state.activePage === 'notifications') return renderNotifications();
    return renderDonorDashboard();
  } else {
    if (state.activePage === 'dashboard') return renderHospitalDashboard();
    if (state.activePage === 'request-blood') return renderRequestBlood();
    if (state.activePage === 'donors') return renderMatchingDonors();
    if (state.activePage === 'history') return renderHospitalHistory();
    if (state.activePage === 'profile') return renderHospitalProfile();
    return renderHospitalDashboard();
  }
}

function renderModalState() {
  var t = state.modal.type, d = state.modal.data;
  var close = function () { state.modal = null; render(); };
  if (t === 'accept-request') return renderAcceptModal(d, close);
  if (t === 'accept-success') return renderAcceptSuccessModal(d, close);
  if (t === 'tier-celebration') return renderTierCelebrationModal(d);
  if (t === 'otp-generate') return renderOTPModal('generate', d, close);
  return null;
}

function renderAcceptModal(req, close) {
  var overlay = el('div', {'style':'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;backdrop-filter:blur(4px);'},[]);
  var box = el('div', {'style':'background:white;border-radius:24px;padding:32px;max-width:420px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.18);'},[]);

  box.appendChild(el('div',{'style':'text-align:center;margin-bottom:20px;'},[
    el('div',{'style':'width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#FEE2E2,#FECACA);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 12px;'},['🩸']),
    el('div',{'style':'font-size:20px;font-weight:800;color:#111827;'},['Accept Blood Request?']),
    el('div',{'style':'font-size:13px;color:#6B7280;margin-top:6px;'},['You are about to accept this donation request'])
  ]));

  var detailCard = el('div',{'style':'background:#FFF7F7;border:1.5px solid #FECACA;border-radius:16px;padding:18px;margin-bottom:20px;'},[]);
  detailCard.appendChild(el('div',{'style':'font-size:16px;font-weight:700;color:#111827;margin-bottom:10px;'},[req.hospital||req.hospitalName||'Hospital']));
  [
    ['🩸','Blood Group', req.bloodGroup||'N/A'],
    ['📍','Location',    req.location||req.city||'N/A'],
    ['🧪','Units Needed',(req.units||req.unitsNeeded||1)+' unit(s)'],
    ['⚡','Urgency',     req.urgency||req.status||'Urgent']
  ].forEach(function(row){
    detailCard.appendChild(el('div',{'style':'display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #FEE2E2;'},[
      el('span',{'style':'font-size:16px;'},[row[0]]),
      el('span',{'style':'font-size:12px;color:#6B7280;flex:1;'},[row[1]]),
      el('span',{'style':'font-size:13px;font-weight:600;color:#111827;'},[row[2]])
    ]));
  });
  box.appendChild(detailCard);

  box.appendChild(el('div',{'style':'background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:12px;margin-bottom:20px;font-size:12px;color:#166534;'},['✅ By accepting, the hospital will be notified and you will be expected to arrive soon.']));

  var btnRow = el('div',{'style':'display:flex;gap:12px;'},[]);
  btnRow.appendChild(el('button',{
    'style':'flex:1;padding:14px;border-radius:12px;border:1.5px solid #E5E7EB;background:white;font-size:14px;font-weight:600;color:#6B7280;cursor:pointer;',
    'onClick':close
  },['Cancel']));
  btnRow.appendChild(el('button',{
    'style':'flex:2;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#DC2626,#B91C1C);color:white;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(220,38,38,0.35);',
    'onClick':function(){
      var user = getUser();
      // Save accepted donor info to backend
      if (req._id) {
        fetch(BACKEND + '/api/requests/' + req._id + '/accept', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            donorId:    user._id || '',
            donorName:  user.name || '',
            donorPhone: user.phone || '',
            donorEmail: user.email || ''
          })
        }).catch(function() {});
      }
      state.modal = { type: 'accept-success', data: req };
      render();
    }
  },['🩸 Yes, Accept Request']));
  box.appendChild(btnRow);

  overlay.appendChild(box);
  overlay.addEventListener('click',function(e){ if(e.target===overlay) close(); });
  return overlay;
}

function renderAcceptSuccessModal(req, close) {
  var overlay = el('div',{'style':'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;backdrop-filter:blur(4px);'},[]);
  var box = el('div',{'style':'background:white;border-radius:24px;padding:28px;max-width:420px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.18);text-align:center;'},[]);

  box.appendChild(el('div',{'style':'font-size:56px;margin-bottom:12px;'},['🎉']));
  box.appendChild(el('div',{'style':'font-size:20px;font-weight:800;color:#111827;margin-bottom:6px;'},['Request Accepted!']));
  box.appendChild(el('div',{'style':'font-size:13px;color:#6B7280;margin-bottom:16px;line-height:1.6;'},['Please head to '+(req.hospital||req.hospitalName||'the hospital')+' now. After donating, ask the hospital to send you a Donation OTP to your Gmail to unlock your rewards.']));

  var badges = el('div',{'style':'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:20px;'},[]);
  badges.appendChild(el('span',{'style':'background:#FEE2E2;color:#DC2626;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;'},['🩸 '+(req.bloodGroup||'')]));
  badges.appendChild(el('span',{'style':'background:#F0FDF4;color:#16A34A;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;'},['✅ Going to donate']));
  badges.appendChild(el('span',{'style':'background:#EFF6FF;color:#2563EB;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;'},['❤️ Life Saved']));
  box.appendChild(badges);

  // ── OTP verification box ──────────────────────────────────────
  var otpSection = el('div',{'style':'background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:14px;padding:16px;margin-bottom:16px;text-align:left;'},[]);
  otpSection.appendChild(el('div',{'style':'font-size:13px;font-weight:700;color:#111827;margin-bottom:4px;'},['🔐 Enter Donation OTP']));
  otpSection.appendChild(el('div',{'style':'font-size:11px;color:#6B7280;margin-bottom:12px;'},['After donating at the hospital, they will send a 6-digit OTP to your Gmail. Enter it below to unlock your rewards.']));

  var otpInput = el('input',{
    'type':'text','maxlength':'6',
    'placeholder':'Enter 6-digit OTP',
    'style':'width:100%;padding:12px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:20px;font-weight:700;letter-spacing:6px;text-align:center;outline:none;box-sizing:border-box;'
  },[]);

  var otpMsg = el('div',{'style':'font-size:12px;margin-top:8px;display:none;'},[]);

  var verifyBtn = el('button',{
    'style':'width:100%;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#DC2626,#B91C1C);color:white;font-size:14px;font-weight:700;cursor:pointer;margin-top:10px;',
    'onClick': function() {
      var otp = otpInput.value.trim();
      if (!otp || otp.length < 6) {
        otpMsg.textContent = '⚠️ Please enter the 6-digit OTP from your Gmail';
        otpMsg.style.color = 'orange';
        otpMsg.style.display = 'block';
        return;
      }
      var user = state.currentUser;
      if (!user || !user._id) {
        otpMsg.textContent = '❌ Not logged in';
        otpMsg.style.color = 'red';
        otpMsg.style.display = 'block';
        return;
      }
      verifyBtn.textContent = '⏳ Verifying...';
      verifyBtn.disabled = true;

      fetch(BACKEND + '/api/donation/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donorId: user._id, otp: otp })
      })
      .then(function(r){ return r.json(); })
      .then(function(data) {
        if (data.error) {
          otpMsg.textContent = '❌ ' + data.error;
          otpMsg.style.color = 'red';
          otpMsg.style.display = 'block';
          verifyBtn.textContent = '✓ Verify OTP & Unlock Rewards';
          verifyBtn.disabled = false;
          return;
        }
        // ✅ Update local user state with new donation count
        state.currentUser.donationCount = data.donationCount;
        localStorage.setItem('bloodlink_user', JSON.stringify(state.currentUser));

        // Check if a new tier was just unlocked
        if (data.tierUnlocked) {
          state.modal = { type: 'tier-celebration', data: data.tierUnlocked };
        } else {
          otpMsg.textContent = '🎉 Donation verified! You now have ' + data.donationCount + ' donation(s). Tier: ' + data.tier;
          otpMsg.style.color = '#16A34A';
          otpMsg.style.display = 'block';
          verifyBtn.textContent = '✅ Rewards Updated!';
        }
        render();
      })
      .catch(function() {
        otpMsg.textContent = '❌ Server error. Try again.';
        otpMsg.style.color = 'red';
        otpMsg.style.display = 'block';
        verifyBtn.textContent = '✓ Verify OTP & Unlock Rewards';
        verifyBtn.disabled = false;
      });
    }
  },['✓ Verify OTP & Unlock Rewards']);

  otpSection.appendChild(otpInput);
  otpSection.appendChild(otpMsg);
  otpSection.appendChild(verifyBtn);
  box.appendChild(otpSection);

  box.appendChild(el('button',{
    'style':'width:100%;padding:14px;border-radius:12px;border:1.5px solid #E5E7EB;background:white;font-size:13px;font-weight:600;color:#6B7280;cursor:pointer;',
    'onClick':function(){ state.modal=null; state.activePage='dashboard'; render(); }
  },['I will verify later — Go to Dashboard']));

  overlay.appendChild(box);
  return overlay;
}

// ── TIER CELEBRATION POPUPS ──────────────────────────────────────
var TIER_CELEBRATIONS = {
  silver: {
    emoji: '🥈',
    gradient: 'linear-gradient(135deg,#94A3B8,#CBD5E1)',
    bg: '#F8FAFC',
    border: '#CBD5E1',
    color: '#475569',
    title: 'Silver Tier Unlocked!',
    subtitle: 'You completed 1 donation',
    benefits: [
      '🏥 Visit any registered hospital to claim your benefit',
      '💊 Get a FREE basic health checkup (blood pressure, sugar, BMI)',
      '🩸 Free blood group card issued to you',
      '⭐ Your profile is now highlighted to hospitals'
    ],
    instruction: 'Show your BloodLink profile at the hospital reception and say "I am a Silver tier BloodLink donor" to claim your free checkup.'
  },
  gold: {
    emoji: '🥇',
    gradient: 'linear-gradient(135deg,#D97706,#F59E0B)',
    bg: '#FFFBEB',
    border: '#FCD34D',
    color: '#92400E',
    title: 'Gold Tier Unlocked!',
    subtitle: 'You completed 3 donations — Amazing!',
    benefits: [
      '🏥 Visit any partner hospital to claim your Gold benefit',
      '🔬 FREE advanced health checkup (liver, kidney, CBC panel)',
      '💉 FREE vitamin B12 & iron deficiency test',
      '👨‍👩‍👧 One family member also gets a FREE basic checkup',
      '🌟 Gold badge on your BloodLink profile'
    ],
    instruction: 'Show your BloodLink Gold profile at the hospital and present your phone to the doctor. Your family member can also come with you for their free checkup.'
  },
  diamond: {
    emoji: '💎',
    gradient: 'linear-gradient(135deg,#0891B2,#06B6D4)',
    bg: '#ECFEFF',
    border: '#67E8F9',
    color: '#164E63',
    title: 'Diamond Tier Unlocked!',
    subtitle: 'You completed 5 donations — You are a Hero! 🦸',
    benefits: [
      '🏥 Lifetime priority access at all BloodLink partner hospitals',
      '🔬 FREE full body health checkup every 6 months',
      '👨‍👩‍👧‍👦 FREE basic checkup for entire family (up to 4 members)',
      '🚑 Priority emergency blood access for you & family',
      '💎 Diamond badge + Certificate of Honour',
      '📱 Personal health coordinator assigned to you'
    ],
    instruction: 'Congratulations! You are a BloodLink Diamond Hero. Contact us via the app to schedule your full body checkup and collect your Certificate of Honour from the hospital.'
  }
};

function renderTierCelebrationModal(tier) {
  var cfg = TIER_CELEBRATIONS[tier];
  if (!cfg) return null;

  var overlay = el('div', { 'style': 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px;backdrop-filter:blur(6px);' }, []);
  var box = el('div', { 'style': 'background:white;border-radius:28px;max-width:440px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.25);overflow:hidden;' }, []);

  // Top gradient header
  var header = el('div', { 'style': 'background:' + cfg.gradient + ';padding:36px 28px;text-align:center;' }, []);
  header.appendChild(el('div', { 'style': 'font-size:72px;margin-bottom:8px;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.2));' }, [cfg.emoji]));
  header.appendChild(el('div', { 'style': 'font-size:28px;font-weight:900;color:white;text-shadow:0 2px 8px rgba(0,0,0,0.2);' }, ['Congratulations!']));
  header.appendChild(el('div', { 'style': 'font-size:18px;font-weight:700;color:rgba(255,255,255,0.9);margin-top:6px;' }, [cfg.title]));
  header.appendChild(el('div', { 'style': 'font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;' }, [cfg.subtitle]));
  box.appendChild(header);

  // Body
  var body = el('div', { 'style': 'padding:24px 28px;' }, []);

  body.appendChild(el('div', { 'style': 'font-size:14px;font-weight:700;color:#111827;margin-bottom:12px;' }, ['🎁 Your Benefits:']));

  var benefitList = el('div', { 'style': 'background:' + cfg.bg + ';border:1px solid ' + cfg.border + ';border-radius:12px;padding:14px;margin-bottom:16px;' }, []);
  cfg.benefits.forEach(function(b) {
    benefitList.appendChild(el('div', { 'style': 'font-size:13px;color:#374151;padding:5px 0;border-bottom:1px solid ' + cfg.border + ';line-height:1.5;' }, [b]));
  });
  body.appendChild(benefitList);

  // Instruction box
  body.appendChild(el('div', { 'style': 'background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:12px;margin-bottom:20px;font-size:12px;color:#166534;line-height:1.6;' }, [
    '📋 ' + cfg.instruction
  ]));

  // Claim button
  body.appendChild(el('button', {
    'style': 'width:100%;padding:16px;border-radius:14px;border:none;background:' + cfg.gradient + ';color:white;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,0.15);',
    'onClick': function() { state.modal = null; render(); }
  }, [cfg.emoji + ' Awesome! Go Claim My Rewards']));

  box.appendChild(body);
  overlay.appendChild(box);
  return overlay;
}

// ── DONOR PAGES ───────────────────────────────────────────────────

function renderDonorDashboard() {
  // ✅ Use real user data
  var d = getUser();
  var totalDonations = d.donationCount || d.totalDonations || 0;
  var tier = getDonorTier(totalDonations);
  var tc = tier === 'none' ? 'plain' : tier;
  var td = getTierData(tier);
  var w = el('div', {}, []);

  var hero = el('div', { 'class': 'card card-surface mb-24', 'style': 'padding:28px;' }, []);
  hero.innerHTML = '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">'
    + '<div style="width:64px;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:800;'
    + (tc === 'diamond' ? 'background:linear-gradient(135deg,var(--diamond-1),var(--diamond-3));box-shadow:0 6px 20px rgba(6,182,212,0.35);'
      : tc === 'gold' ? 'background:linear-gradient(135deg,var(--gold-1),var(--gold-3));color:#1F2937;box-shadow:0 6px 20px rgba(218,165,32,0.35);'
        : tc === 'silver' ? 'background:linear-gradient(135deg,var(--silver-1),var(--silver-2));box-shadow:0 6px 20px rgba(138,149,163,0.35);'
          : 'background:linear-gradient(135deg,var(--primary),var(--primary-dark));box-shadow:0 6px 20px rgba(220,38,38,0.35);')
    + '">' + (d.name || 'U').split(' ').map(function (x) { return x[0]; }).join('') + '</div>'
    + '<div style="flex:1;">'
    + '<div style="font-size:22px;font-weight:800;">Welcome, ' + (d.name || 'User').split(' ')[0] + ' 👋</div>'
    + '<div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">📍 ' + (d.city || d.location || 'Your city') + ' · 🩸 ' + (d.bloodGroup || '?') + ' · 🌐 ' + (d.language || 'English') + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">'
    + '<span class="badge badge-red">🩸 ' + (d.bloodGroup || '?') + '</span>'
    + (td ? '<span class="badge badge-' + tier + '">' + getTierEmoji(tier) + ' ' + td.name + ' Member</span>' : '')
    + '<span class="badge badge-green">⚡ ' + (d.availability ? 'Available' : 'Unavailable') + '</span>'
    + '</div></div>'
    + '<div style="text-align:right;">'
    + '<div style="font-size:36px;font-weight:800;' + (tc === 'diamond' ? 'color:var(--diamond-1);' : tc === 'gold' ? 'color:var(--gold-1);' : tc === 'silver' ? 'color:var(--silver-1);' : 'color:var(--primary);') + '">' + totalDonations + '</div>'
    + '<div style="font-size:12px;color:var(--text-secondary);">Total Donations</div>'
    + '</div></div>';
  w.appendChild(hero);

  // ── Stats grid with real data ──────────────────────────────────
  // Build stat boxes we can update after fetch
  function makeDonorStat(emoji, idSuffix, label, defaultVal, sub) {
    var box = el('div', { 'class': 'card', 'style': 'padding:20px;' }, []);
    box.appendChild(el('div', { 'style': 'font-size:26px;margin-bottom:6px;' }, [emoji]));
    var valDiv = el('div', { 'id': 'dstat-' + idSuffix, 'style': 'font-size:26px;font-weight:800;color:#111827;' }, [defaultVal]);
    box.appendChild(valDiv);
    box.appendChild(el('div', { 'style': 'font-size:12px;color:#6B7280;margin-top:4px;' }, [label]));
    if (sub) {
      var subDiv = el('div', { 'id': 'dstat-sub-' + idSuffix, 'style': 'font-size:11px;color:#9CA3AF;margin-top:2px;' }, [sub]);
      box.appendChild(subDiv);
    }
    return box;
  }

  var statsGrid = el('div', { 'class': 'stats-grid mb-24' }, []);
  statsGrid.appendChild(makeDonorStat('🩸', 'donations', 'Total Donations', String(totalDonations), ''));
  statsGrid.appendChild(makeDonorStat(td ? getTierEmoji(tier) : '🎯', 'tier', 'Current Tier', td ? td.name : 'Newbie', td ? 'Claim benefit →' : 'Donate to unlock'));
  statsGrid.appendChild(makeDonorStat('⏰', 'requests', 'Active Requests', '...', 'Loading...'));
  statsGrid.appendChild(makeDonorStat('📅', 'lastdon', 'Last Donated', 'Loading...', ''));

  // Fetch last donated date from requests accepted by this donor
  fetch(BACKEND + '/api/requests')
    .then(function(r) { return r.json(); })
    .then(function(reqs) {
      // Find requests accepted by this donor, sorted by latest
      var myDonations = reqs.filter(function(r) {
        return r.acceptedBy && r.acceptedBy.donorId === (d._id || '');
      });
      var lastEl = document.getElementById('dstat-lastdon');
      if (!lastEl) return;
      if (!myDonations.length) {
        lastEl.textContent = 'N/A';
        return;
      }
      // Sort by updatedAt descending
      myDonations.sort(function(a, b) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
      var latest = myDonations[0];
      var date = new Date(latest.updatedAt);
      var day = date.getDate();
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      lastEl.textContent = day + ' ' + months[date.getMonth()] + ' ' + date.getFullYear();
    })
    .catch(function() {
      var lastEl = document.getElementById('dstat-lastdon');
      if (lastEl) lastEl.textContent = 'N/A';
    });
  w.appendChild(statsGrid);

  // Fetch real request count — pending + accepted = active
  fetch(BACKEND + '/api/requests')
    .then(function(r) { return r.json(); })
    .then(function(reqs) {
      // Active = pending OR accepted, matching donor blood group exactly
      var matched = reqs.filter(function(r) {
        return r.bloodGroup === d.bloodGroup &&
               (r.status === 'pending' || r.status === 'accepted');
      });
      var rEl = document.getElementById('dstat-requests');
      var rSub = document.getElementById('dstat-sub-requests');
      if (rEl) rEl.textContent = matched.length;
      if (rSub) rSub.textContent = matched.length > 0 ? matched.length + ' need ' + d.bloodGroup : 'No urgent requests';

      // Update sidebar badge
      updateNotifBadge(matched.length);
      var sidebarBadge = document.getElementById('sidebar-req-badge');
      if (sidebarBadge) {
        if (matched.length > 0) {
          sidebarBadge.textContent = matched.length;
          sidebarBadge.style.display = '';
        } else {
          sidebarBadge.style.display = 'none';
        }
      }
    })
    .catch(function() {
      var rEl = document.getElementById('dstat-requests');
      if (rEl) rEl.textContent = '-';
    });

  // ── Nearby Requests + Notifications grid ──────────────────────
  var grid = el('div', { 'class': 'grid-2' }, []);

  // Nearby Requests card
  var rCard = el('div', { 'class': 'card' }, []);
  rCard.appendChild(el('div', { 'class': 'card-header' }, [
    el('div', {}, [
      el('div', { 'class': 'card-title' }, ['🩸 Nearby Requests']),
      el('div', { 'class': 'card-subtitle' }, ['Hospitals needing your blood group'])
    ]),
    el('button', { 'class': 'btn btn-secondary btn-sm', 'onClick': function() { state.activePage = 'requests'; render(); } }, ['View All'])
  ]));

  var reqLoad = el('div', { 'style': 'padding:16px;color:var(--text-secondary);font-size:13px;' }, ['Loading...']);
  rCard.appendChild(reqLoad);

  fetch(BACKEND + '/api/requests?status=pending')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      reqLoad.remove();
      // ✅ Show ONLY requests matching donor's exact blood group
      var sorted = data.filter(function(r) {
        return r.bloodGroup === d.bloodGroup;
      });
      var shown = sorted.slice(0, 2);
      if (!shown.length) {
        rCard.appendChild(el('div', { 'style': 'padding:16px;color:var(--text-secondary);font-size:13px;' }, ['No requests for ' + d.bloodGroup + ' right now.']));
        return;
      }
      shown.forEach(function(req) {
        var isMatch = req.bloodGroup === d.bloodGroup;
        var item = el('div', { 'style': 'padding:14px;border-bottom:1px solid var(--border);' + (isMatch ? 'background:#FFF7F7;border-left:3px solid #DC2626;' : '') }, []);
        item.appendChild(el('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;' }, [
          el('div', { 'style': 'font-size:14px;font-weight:700;' }, [req.hospitalName || 'Hospital']),
          el('span', { 'style': 'padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;color:white;background:' + (req.urgency === 'high' || req.urgency === 'critical' ? '#DC2626' : '#F59E0B') + ';' }, [req.urgency === 'high' || req.urgency === 'critical' ? 'Urgent' : 'Normal'])
        ]));
        item.appendChild(el('div', { 'style': 'font-size:12px;color:#6B7280;' }, [
          '📍 ' + (req.location || 'N/A') + ' · 🩸 ' + req.bloodGroup + ' · 🧪 ' + req.units + ' unit(s)'
        ]));
        if (isMatch) {
          var accBtn = el('button', {
            'style': 'margin-top:8px;padding:8px 16px;border-radius:8px;border:none;background:linear-gradient(135deg,#DC2626,#B91C1C);color:white;font-size:12px;font-weight:700;cursor:pointer;',
            'onClick': function() {
              state.modal = { type: 'accept-request', data: {
                _id: req._id, hospital: req.hospitalName,
                bloodGroup: req.bloodGroup, location: req.location,
                units: req.units, urgency: req.urgency, status: req.status
              }};
              render();
            }
          }, ['✅ Accept Request']);
          item.appendChild(accBtn);
        }
        rCard.appendChild(item);
      });
    })
    .catch(function() { reqLoad.textContent = 'Could not load requests.'; });
  grid.appendChild(rCard);

  // Notifications card
  var nCard = el('div', { 'class': 'card' }, []);
  nCard.appendChild(el('div', { 'class': 'card-header' }, [
    el('div', {}, [
      el('div', { 'class': 'card-title' }, ['🔔 Notifications']),
      el('div', { 'class': 'card-subtitle' }, ['Real time updates'])
    ]),
    el('button', { 'class': 'btn btn-secondary btn-sm', 'onClick': function() { state.activePage = 'notifications'; render(); } }, ['All'])
  ]));

  var notifLoad = el('div', { 'style': 'padding:16px;color:var(--text-secondary);font-size:13px;' }, ['Loading...']);
  nCard.appendChild(notifLoad);

  fetch(BACKEND + '/api/requests')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      notifLoad.remove();
      // ✅ Only show notifications for donor's exact blood group
      var relevant = data.filter(function(r) { return r.bloodGroup === d.bloodGroup; }).slice(0, 3);
      if (!relevant.length) {
        nCard.appendChild(el('div', { 'style': 'padding:16px;color:var(--text-secondary);font-size:13px;' }, ['No new notifications.']));
        return;
      }
      relevant.forEach(function(req) {
        var statusColor = req.status === 'pending' ? '#DC2626' : req.status === 'accepted' ? '#3B82F6' : '#16A34A';
        var n = el('div', { 'style': 'display:flex;gap:12px;align-items:flex-start;padding:12px;border-bottom:1px solid var(--border);' }, []);
        n.appendChild(el('div', { 'style': 'width:36px;height:36px;border-radius:50%;background:#FEE2E2;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;' }, ['🩸']));
        var info = el('div', { 'style': 'flex:1;' }, []);
        info.appendChild(el('div', { 'style': 'font-size:13px;font-weight:600;color:#111827;' }, [req.hospitalName + ' needs ' + req.bloodGroup]));
        info.appendChild(el('div', { 'style': 'font-size:12px;color:#6B7280;margin-top:2px;' }, ['📍 ' + req.location + ' · ' + req.units + ' unit(s)']));
        info.appendChild(el('span', { 'style': 'display:inline-block;margin-top:4px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:white;background:' + statusColor + ';' }, [req.status.toUpperCase()]));
        n.appendChild(info);
        if (req.status === 'pending') {
          n.appendChild(el('div', { 'style': 'width:8px;height:8px;border-radius:50%;background:#DC2626;margin-top:4px;flex-shrink:0;' }, []));
        }
        nCard.appendChild(n);
      });
    });
  grid.appendChild(nCard);
  w.appendChild(grid);
  return w;
}

function renderDonorProfile() {
  // ✅ Use real user data
  var d = getUser();
  var totalDonations = d.donationCount || d.totalDonations || 0;
  var tier = getDonorTier(totalDonations);
  var tc = tier === 'none' ? 'plain' : tier;
  var td = getTierData(tier);
  var w = el('div', {}, []);
  var initials = (d.name || 'U').split(' ').map(function (x) { return x[0]; }).join('');

  w.appendChild(el('div', { 'class': 'profile-hero ' + tc }, [
    el('div', { 'class': 'ph-avatar pha-' + tc }, [initials]),
    el('div', { 'class': 'ph-info' }, [
      el('h2', {}, [d.name || 'User']),
      el('p', {}, [(d.phone || '') + ' · ' + (d.city || d.location || '')]),
      el('div', { 'class': 'ph-badges' }, [
        el('span', { 'class': 'badge badge-red' }, ['🩸 ' + (d.bloodGroup || '?')]),
        td ? el('span', { 'class': 'badge badge-' + tier }, [getTierEmoji(tier) + ' ' + td.name + ' Member']) : null,
        el('span', { 'class': 'badge badge-green' }, ['⚡ ' + (d.availability ? 'Available' : 'Unavailable')]),
        el('span', { 'class': 'badge badge-blue' }, ['🌐 ' + (d.language || 'English')])
      ])
    ])
  ]));

  var grid = el('div', { 'class': 'grid-2' }, []);
  var ic = el('div', { 'class': 'card' }, []);
  ic.appendChild(el('div', { 'class': 'card-header' }, [el('div', { 'class': 'card-title' }, ['📋 Personal Info']), el('button', { 'class': 'btn btn-secondary btn-sm' }, ['✏️ Edit'])]));
  [
    { l: 'Full Name', v: d.name || 'N/A' },
    { l: 'Phone', v: d.phone || 'N/A' },
    { l: 'Blood Group', v: d.bloodGroup || 'N/A' },
    { l: 'City', v: d.city || d.location || 'N/A' },
    { l: 'Language', v: d.language || 'English' },
    { l: 'Total Donations', v: String(totalDonations) },
    { l: 'Current Tier', v: td ? getTierEmoji(tier) + ' ' + td.name : 'Not started' }
  ].forEach(function (f) {
    ic.appendChild(el('div', { 'style': 'display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);' }, [
      el('span', { 'style': 'font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.5px;text-transform:uppercase;' }, [f.l]),
      el('span', { 'style': 'font-size:13px;font-weight:600;color:var(--text-primary);' }, [f.v])
    ]));
  });
  grid.appendChild(ic);

  var bc = el('div', { 'class': 'card' }, []);
  bc.appendChild(el('div', { 'class': 'card-title mb-16' }, ['🎁 My Benefits']));
  if (td) {
    bc.appendChild(el('div', { 'style': 'padding:20px;border-radius:var(--radius-md);margin-bottom:16px;' + (tc === 'diamond' ? 'background:var(--diamond-bg);border:1.5px solid var(--diamond-border);' : tc === 'gold' ? 'background:var(--gold-bg);border:1.5px solid var(--gold-border);' : 'background:var(--silver-bg);border:1.5px solid var(--silver-border);') }, [
      el('div', { 'style': 'font-size:36px;margin-bottom:10px;' }, [getTierEmoji(tier)]),
      el('div', { 'style': 'font-size:16px;font-weight:800;margin-bottom:6px;' }, [td.benefit]),
      el('div', { 'style': 'font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.6;' }, [td.detail]),
      el('button', { 'class': 'btn btn-' + tc + ' btn-sm' }, ['🎁 Claim at Hospital'])
    ]));
  }
  grid.appendChild(bc);
  w.appendChild(grid);
  return w;
}

function renderRewardsPage() {
  var d = getUser();
  var totalDonations = d.donationCount || d.totalDonations || 0;
  var tier = getDonorTier(totalDonations);
  var w = el('div', {}, []);
  w.appendChild(el('p', { 'class': 'section-sub' }, ['You have ' + totalDonations + ' donation(s). Keep donating to unlock better health benefits!']));
  w.appendChild(renderTierShowcase(tier));
  return w;
}

function renderDonorRequests() {
  var w = el('div', {}, []);
  w.appendChild(el('p', { 'class': 'section-sub' }, ['Real blood requests from hospitals near you']));
  var loading = el('div', { 'style': 'padding:20px;color:var(--text-secondary);font-size:13px;' }, ['Loading requests...']);
  w.appendChild(loading);

  var user = getUser();

  fetch(BACKEND + '/api/requests')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      loading.remove();
      if (!data.length) {
        w.appendChild(el('div', { 'class': 'card', 'style': 'padding:32px;text-align:center;' }, [
          el('div', { 'style': 'font-size:40px;margin-bottom:12px;' }, ['🩸']),
          el('div', { 'style': 'font-size:16px;font-weight:600;color:var(--text-secondary);' }, ['No blood requests right now']),
          el('div', { 'style': 'font-size:13px;color:var(--text-muted);margin-top:6px;' }, ['Check back soon'])
        ]));
        return;
      }

      // ✅ Filter only requests matching donor's blood group
      var filtered = data.filter(function(req) {
        return req.bloodGroup === user.bloodGroup;
      });

      if (!filtered.length) {
        w.appendChild(el('div', { 'class': 'card', 'style': 'padding:32px;text-align:center;' }, [
          el('div', { 'style': 'font-size:40px;margin-bottom:12px;' }, ['🩸']),
          el('div', { 'style': 'font-size:16px;font-weight:600;color:var(--text-secondary);' }, ['No blood requests for ' + user.bloodGroup + ' right now']),
          el('div', { 'style': 'font-size:13px;color:var(--text-muted);margin-top:6px;' }, ['We will notify you when hospitals need your blood group'])
        ]));
        return;
      }

      filtered.forEach(function(req) {
        var isAcceptedByMe = req.acceptedBy && req.acceptedBy.donorId === (user._id || '');
        var urgencyColor = req.urgency === 'high' || req.urgency === 'critical' ? '#DC2626' : '#F59E0B';
        var urgencyLabel = req.urgency === 'high' || req.urgency === 'critical' ? 'Urgent' : 'Normal';

        var card = el('div', { 'class': 'card', 'style': 'margin-bottom:12px;padding:18px;' }, []);

        // ── Top row: hospital + badges ──
        var topRow = el('div', { 'style': 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;' }, []);
        topRow.appendChild(el('div', { 'style': 'font-size:16px;font-weight:800;color:#111827;' }, [req.hospitalName || 'Hospital']));
        var badges = el('div', { 'style': 'display:flex;gap:6px;flex-wrap:wrap;' }, []);
        badges.appendChild(el('span', { 'style': 'padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;color:white;background:' + urgencyColor + ';' }, [urgencyLabel]));
        if (req.status === 'accepted') {
          badges.appendChild(el('span', { 'style': 'padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;color:white;background:#3B82F6;' }, ['⏳ Accepted']));
        }
        topRow.appendChild(badges);
        card.appendChild(topRow);

        // ── Details row ──
        var details = el('div', { 'style': 'display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;' }, []);
        [
          ['📍', req.location || 'N/A'],
          ['🩸', req.bloodGroup || 'N/A'],
          ['🧪', (req.units || 1) + ' unit(s)']
        ].forEach(function(d) {
          details.appendChild(el('span', { 'style': 'font-size:12px;color:#6B7280;display:flex;align-items:center;gap:4px;' }, [
            el('span', {}, [d[0]]),
            el('span', {}, [d[1]])
          ]));
        });
        card.appendChild(details);

        // ── Accept button OR OTP box ──
        if (req.status === 'pending') {
          // Show Accept button
          var acceptBtn = el('button', {
            'style': 'width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#DC2626,#B91C1C);color:white;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(220,38,38,0.3);',
            'onClick': function() {
              state.modal = { type: 'accept-request', data: {
                _id: req._id,
                hospital: req.hospitalName,
                bloodGroup: req.bloodGroup,
                location: req.location,
                units: req.units,
                urgency: req.urgency,
                status: req.status
              }};
              render();
            }
          }, ['✅ Accept Request']);
          card.appendChild(acceptBtn);

        } else if (req.status === 'accepted' && isAcceptedByMe) {
          // ── OTP Box — shown only to the donor who accepted ──
          var otpBox = el('div', { 'style': 'background:#F0FDF4;border:1.5px solid #86EFAC;border-radius:14px;padding:16px;' }, []);

          otpBox.appendChild(el('div', { 'style': 'font-size:13px;font-weight:700;color:#166534;margin-bottom:4px;' }, ['🎉 You accepted this request!']));
          otpBox.appendChild(el('div', { 'style': 'font-size:12px;color:#166534;margin-bottom:12px;' }, [
            'After donating blood at the hospital, they will send an OTP to your Gmail. Enter it below to confirm your donation and unlock rewards.'
          ]));

          var otpInput = el('input', {
            'class': 'form-input',
            'type': 'text',
            'maxlength': '6',
            'placeholder': '● ● ● ● ● ●',
            'style': 'text-align:center;font-size:24px;font-weight:800;letter-spacing:8px;margin-bottom:10px;border:2px solid #86EFAC;border-radius:12px;'
          }, []);
          otpBox.appendChild(otpInput);

          var otpMsg = el('div', { 'style': 'font-size:12px;margin-bottom:8px;display:none;text-align:center;' }, []);
          otpBox.appendChild(otpMsg);

          var verifyBtn = el('button', {
            'style': 'width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#16A34A,#15803D);color:white;font-size:14px;font-weight:700;cursor:pointer;',
            'onClick': function() {
              var otp = otpInput.value.trim();
              if (!otp || otp.length < 4) {
                otpMsg.textContent = '⚠️ Please enter the OTP from your Gmail';
                otpMsg.style.color = '#DC2626';
                otpMsg.style.display = 'block';
                return;
              }
              verifyBtn.textContent = '⏳ Verifying...';
              verifyBtn.disabled = true;

              fetch(BACKEND + '/api/donation/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ donorId: user._id, otp: otp })
              })
              .then(function(r) { return r.json(); })
              .then(function(data) {
                if (data.error) {
                  otpMsg.textContent = '❌ ' + data.error;
                  otpMsg.style.color = '#DC2626';
                  otpMsg.style.display = 'block';
                  verifyBtn.textContent = '✓ Verify OTP';
                  verifyBtn.disabled = false;
                  return;
                }
                // Update localStorage with new donation count
                var updatedUser = data.donor;
                if (updatedUser) {
                  state.currentUser = updatedUser;
                  localStorage.setItem('bloodlink_user', JSON.stringify(updatedUser));
                }
                // Show tier celebration popup if tier unlocked
                if (data.tierUnlocked) {
                  state.modal = { type: 'tier-celebration', data: { tier: data.tierUnlocked } };
                } else {
                  otpMsg.textContent = '✅ Donation confirmed! Rewards updated.';
                  otpMsg.style.color = '#16A34A';
                  otpMsg.style.display = 'block';
                  verifyBtn.textContent = '✅ Verified!';
                }
                render();
              })
              .catch(function() {
                otpMsg.textContent = '❌ Server error. Is backend running?';
                otpMsg.style.color = '#DC2626';
                otpMsg.style.display = 'block';
                verifyBtn.textContent = '✓ Verify OTP';
                verifyBtn.disabled = false;
              });
            }
          }, ['✓ Verify OTP & Confirm Donation']);

          otpBox.appendChild(verifyBtn);
          card.appendChild(otpBox);

        } else if (req.status === 'accepted' && !isAcceptedByMe) {
          // Another donor accepted — show disabled state
          card.appendChild(el('div', { 'style': 'padding:10px;background:#F3F4F6;border-radius:10px;text-align:center;font-size:13px;color:#6B7280;' }, [
            '✅ This request has been accepted by another donor'
          ]));
        }

        w.appendChild(card);
      });
    })
    .catch(function() {
      loading.textContent = '❌ Could not load requests. Is the backend running?';
    });

  return w;
}

function renderDonorHistory() {
  var d = getUser();
  var totalDonations = d.donationCount || d.totalDonations || 0;
  var tier = getDonorTier(totalDonations);
  var w = el('div', {}, []);
  w.appendChild(el('p', { 'class': 'section-sub' }, ['Every drop you give saves a life']));
  w.appendChild(el('div', { 'class': 'stats-grid mb-24' }, [
    renderStatCard('🩸', 'si-red', String(totalDonations), 'Total Donations', null),
    renderStatCard(getTierEmoji(tier), 'si-gold', tier === 'none' ? 'Newbie' : tier.charAt(0).toUpperCase() + tier.slice(1), 'Current Tier', 'Keep donating!')
  ]));
  var card = el('div', { 'class': 'card' }, []);
  card.appendChild(el('div', { 'class': 'card-title mb-16' }, ['📋 Donation Timeline']));
  card.appendChild(el('div', { 'style': 'color:var(--text-secondary);font-size:13px;padding:20px 0;' }, ['Your donation history will appear here after each verified donation.']));
  w.appendChild(card);
  return w;
}

function renderNotifications() {
  var w = el('div', {}, []);
  var loading = el('div',{'style':'padding:20px;color:var(--text-secondary);font-size:13px;'},['Loading...']);
  w.appendChild(loading);
  fetch(BACKEND + '/api/requests')
    .then(function(r){ return r.json(); })
    .then(function(data){
      loading.remove();
      if (!data.length) {
        w.appendChild(el('div',{'style':'padding:24px;text-align:center;color:var(--text-secondary);font-size:13px;'},['No notifications yet.']));
        return;
      }
      data.forEach(function(req){
        var n = el('div',{'class':'card','style':'margin-bottom:10px;padding:16px;display:flex;gap:12px;align-items:flex-start;'},[]);
        var icon = req.urgency==='high'||req.urgency==='critical' ? '🚨' : '🩸';
        n.appendChild(el('div',{'style':'width:42px;height:42px;border-radius:50%;background:#FEE2E2;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;'},[icon]));
        var info = el('div',{'style':'flex:1;'},[]);
        info.appendChild(el('div',{'style':'font-size:14px;font-weight:700;color:#111827;'},[req.hospitalName+' needs '+req.bloodGroup]));
        info.appendChild(el('div',{'style':'font-size:12px;color:#6B7280;margin-top:3px;'},['📍 '+req.location+' · 🧪 '+req.units+' unit(s)']));
        info.appendChild(el('div',{'style':'display:flex;gap:6px;margin-top:8px;'},[ 
          el('span',{'style':'background:#FEE2E2;color:#DC2626;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;'},[req.urgency||'pending']),
          el('span',{'style':'background:#F0FDF4;color:#16A34A;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;'},[req.status])
        ]));
        n.appendChild(info);
        w.appendChild(n);
      });
    });
  return w;
}

// ── HOSPITAL PAGES ─────────────────────────────────────────────────

function renderHospitalDashboard() {
  var h = getHospital();
  var w = el('div', {}, []);

  // ── Hero card ─────────────────────────────────────────────────
  var hero = el('div', { 'class': 'card card-surface mb-24', 'style': 'padding:28px;' }, []);
  hero.innerHTML = '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">'
    + '<div style="font-size:48px;">🏥</div>'
    + '<div style="flex:1;">'
    + '<div style="font-size:22px;font-weight:800;">' + (h.name || 'Hospital') + '</div>'
    + '<div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">📍 ' + (h.city || h.location || '') + ' · 📞 ' + (h.phone || h.contact || '') + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">'
    + '<span class="badge badge-green">✓ Verified Hospital</span>'
    + '</div></div></div>';
  var rb = el('button', { 'class': 'btn btn-primary', 'style': 'margin-top:16px;', 'onClick': function () { state.activePage = 'request-blood'; render(); } }, ['🩸 Request Blood Now']);
  hero.appendChild(rb);
  w.appendChild(hero);

  // ── Stats grid ────────────────────────────────────────────────
  // Each box: emoji | big value | label | sub-label
  function makeStatBox(emoji, idSuffix, label, accentColor) {
    var box = el('div', { 'class': 'card', 'style': 'padding:20px;text-align:center;position:relative;overflow:hidden;' }, []);
    // subtle left accent bar
    var accent = el('div', { 'style': 'position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:4px 0 0 4px;background:' + accentColor + ';' }, []);
    box.appendChild(accent);
    box.appendChild(el('div', { 'style': 'font-size:28px;margin-bottom:6px;' }, [emoji]));
    var valDiv = el('div', {
      'id': 'hstat-' + idSuffix,
      'style': 'font-size:28px;font-weight:800;color:#111827;transition:all 0.3s;'
    }, ['0']);
    box.appendChild(valDiv);
    box.appendChild(el('div', { 'style': 'font-size:12px;color:#6B7280;margin-top:4px;font-weight:600;' }, [label]));
    var subDiv = el('div', {
      'id': 'hstat-sub-' + idSuffix,
      'style': 'font-size:11px;color:#9CA3AF;margin-top:2px;min-height:16px;'
    }, ['Loading...']);
    box.appendChild(subDiv);
    return box;
  }

  var statsGrid = el('div', { 'class': 'stats-grid mb-24' }, []);
  statsGrid.appendChild(makeStatBox('📨', 'active',    'Active Requests', '#DC2626'));
  statsGrid.appendChild(makeStatBox('✅', 'fulfilled', 'Fulfilled',       '#16A34A'));
  statsGrid.appendChild(makeStatBox('👥', 'donors',    'Available Donors','#2563EB'));
  statsGrid.appendChild(makeStatBox('⏱',  'response',  'Avg Response',    '#D97706'));
  w.appendChild(statsGrid);

  // ── Last-updated indicator ────────────────────────────────────
  var refreshRow = el('div', { 'style': 'display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:16px;' }, []);
  var lastUpdEl = el('div', { 'id': 'hstat-last-updated', 'style': 'font-size:11px;color:#9CA3AF;' }, ['Fetching live data...']);
  var refreshBtn = el('button', {
    'style': 'padding:4px 10px;border-radius:8px;border:1px solid #E5E7EB;background:white;font-size:11px;color:#6B7280;cursor:pointer;display:flex;align-items:center;gap:4px;',
    'onClick': function() { loadHospitalStats(); }
  }, ['↻ Refresh']);
  refreshRow.appendChild(lastUpdEl);
  refreshRow.appendChild(refreshBtn);
  w.appendChild(refreshRow);

  // ── Fetch + populate stats ────────────────────────────────────
  var thisHospital = (h.name || '').toLowerCase().trim();
  var _statsTimer = null;

  function loadHospitalStats() {
    // Show spinner on refresh button
    refreshBtn.textContent = '⏳';
    refreshBtn.disabled = true;

    Promise.all([
      fetch(BACKEND + '/api/requests').then(function(r) { return r.json(); }),
      fetch(BACKEND + '/api/donors').then(function(r) { return r.json(); })
    ]).then(function(results) {
      var allReqs = Array.isArray(results[0]) ? results[0] : [];
      var donors  = Array.isArray(results[1]) ? results[1] : [];

      // ── Filter to THIS hospital's requests only ──
      var reqs = allReqs.filter(function(r) {
        return (r.hospitalName || '').toLowerCase().trim() === thisHospital;
      });

      // Active = pending + accepted
      var activeReqs = reqs.filter(function(r) {
        return r.status === 'pending' || r.status === 'accepted';
      });
      var active = activeReqs.length;
      var urgent = activeReqs.filter(function(r) {
        return r.urgency === 'high' || r.urgency === 'critical';
      }).length;
      var pendingCount  = activeReqs.filter(function(r) { return r.status === 'pending';  }).length;
      var acceptedCount = activeReqs.filter(function(r) { return r.status === 'accepted'; }).length;

      // Fulfilled = status === 'fulfilled'
      var fulfilledReqs = reqs.filter(function(r) { return r.status === 'fulfilled'; });
      var fulfilled = fulfilledReqs.length;

      // Available donors system-wide (all donors with availability: true)
      var availableDonors = donors.filter(function(d) { return d.role === 'donor' && d.availability; });
      var available = availableDonors.length;

      // Blood groups covered by available donors
      var bgs = {};
      availableDonors.forEach(function(d) { if (d.bloodGroup) bgs[d.bloodGroup] = true; });
      var bgList = Object.keys(bgs).sort();

      // Avg response time — ms between createdAt and updatedAt for fulfilled requests
      var avgDisplay = '-';
      var avgSubText = 'No fulfilled requests yet';
      if (fulfilledReqs.length > 0) {
        var validReqs = fulfilledReqs.filter(function(r) { return r.createdAt && r.updatedAt; });
        if (validReqs.length > 0) {
          var totalMs = validReqs.reduce(function(sum, r) {
            return sum + Math.abs(new Date(r.updatedAt) - new Date(r.createdAt));
          }, 0);
          var avgMs = totalMs / validReqs.length;
          var avgMins = Math.round(avgMs / 60000);
          if (avgMins < 1) {
            avgDisplay = '< 1 min';
          } else if (avgMins < 60) {
            avgDisplay = avgMins + ' min';
          } else {
            var hrs = Math.round(avgMins / 60 * 10) / 10;
            avgDisplay = hrs + ' hr';
          }
          avgSubText = 'Based on ' + validReqs.length + ' request(s)';
        }
      }

      // ── Update DOM ──
      function setText(id, val) {
        var el2 = document.getElementById(id);
        if (el2) el2.textContent = val;
      }

      setText('hstat-active',    String(active));
      setText('hstat-fulfilled', String(fulfilled));
      setText('hstat-donors',    String(available));
      setText('hstat-response',  avgDisplay);

      // Sub-labels
      if (active === 0) {
        setText('hstat-sub-active', 'No active requests');
      } else {
        var parts = [];
        if (urgent > 0)       parts.push(urgent + ' urgent');
        if (acceptedCount > 0) parts.push(acceptedCount + ' accepted');
        if (pendingCount > 0)  parts.push(pendingCount + ' pending');
        setText('hstat-sub-active', parts.join(' · '));
      }

      setText('hstat-sub-fulfilled', fulfilled === 0
        ? 'No donations completed yet'
        : fulfilled + ' donation(s) completed');

      setText('hstat-sub-donors', available === 0
        ? 'No donors available now'
        : bgList.length > 0 ? bgList.join(', ') : available + ' donors ready');

      setText('hstat-sub-response', avgSubText);

      // Last updated time
      var now = new Date();
      var hh = now.getHours().toString().padStart(2,'0');
      var mm = now.getMinutes().toString().padStart(2,'0');
      var ss = now.getSeconds().toString().padStart(2,'0');
      setText('hstat-last-updated', '● Live · Updated ' + hh + ':' + mm + ':' + ss);
      var luEl = document.getElementById('hstat-last-updated');
      if (luEl) { luEl.style.color = '#16A34A'; setTimeout(function() { if (luEl) luEl.style.color = '#9CA3AF'; }, 2000); }

      refreshBtn.textContent = '↻ Refresh';
      refreshBtn.disabled = false;

    }).catch(function() {
      ['active','fulfilled','donors','response'].forEach(function(id) {
        var el2 = document.getElementById('hstat-' + id);
        if (el2) { el2.textContent = '-'; el2.style.color = '#DC2626'; }
        var sub = document.getElementById('hstat-sub-' + id);
        if (sub) sub.textContent = 'Could not load';
      });
      var luEl = document.getElementById('hstat-last-updated');
      if (luEl) { luEl.textContent = '⚠ Backend unreachable'; luEl.style.color = '#DC2626'; }
      refreshBtn.textContent = '↻ Refresh';
      refreshBtn.disabled = false;
    });
  }

  // Initial load
  loadHospitalStats();

  // Auto-refresh every 30 seconds while on this page
  _statsTimer = setInterval(function() {
    if (state.activePage === 'dashboard' && state.userRole === 'hospital') {
      loadHospitalStats();
    } else {
      clearInterval(_statsTimer);
    }
  }, 30000);

  return w;
}

function renderRequestBlood() {
  var w = el('div', {}, []);
  w.appendChild(el('p', { 'class': 'section-sub' }, ['Notify nearby donors instantly']));
  var fc = el('div', { 'class': 'card' }, []);
  fc.appendChild(el('div', { 'class': 'card-title mb-20' }, ['🩸 New Blood Request']));
  var bgS = el('select', { 'class': 'form-input form-select' }, [el('option', {}, 'Select blood group')]);
  DUMMY_DATA.bloodGroups.forEach(function (bg) { bgS.appendChild(el('option', {}, bg)); });
  fc.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['BLOOD GROUP']), bgS]));
  var unitsInput = el('input', { 'class': 'form-input', 'type': 'number', 'placeholder': 'e.g. 2' }, []);
  fc.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['UNITS REQUIRED']), unitsInput]));
  var uS = el('select', { 'class': 'form-input form-select' }, []);
  ['Urgent (Emergency)', 'Normal (Scheduled)'].forEach(function (u) { uS.appendChild(el('option', {}, u)); });
  fc.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['URGENCY']), uS]));
  var locInput = el('input', { 'class': 'form-input', 'type': 'text', 'placeholder': 'MG Road, Bengaluru' }, []);
  fc.appendChild(el('div', { 'class': 'form-group' }, [el('label', { 'class': 'form-label' }, ['LOCATION']), locInput]));

  var sent = false;
  var sb = el('button', {
    'class': 'btn btn-primary btn-full btn-lg', 'onClick': function () {
      if (sent) return;
      var h = getHospital();
      var requestData = {
        hospitalName: h.name || 'Hospital',
        bloodGroup: bgS.value,
        units: parseInt(unitsInput.value) || 1,
        urgency: uS.value.includes('Urgent') ? 'high' : 'medium',
        location: locInput.value || (h.city || ''),
        phone: h.phone || ''
      };
      fetch(BACKEND + '/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      }).then(function () {
        sent = true;
        sb.textContent = '✓ Sent! Notifying donors...';
        sb.style.background = 'linear-gradient(135deg,#16A34A,#15803D)';
        setTimeout(function () { state.activePage = 'donors'; render(); }, 1500);
      });
    }
  }, ['📨 Send Request to Nearby Donors']);
  fc.appendChild(sb);
  w.appendChild(fc);
  return w;
}

function renderMatchingDonors() {
  var w = el('div', {}, []);
  var h = getHospital();
  // Match by BOTH name AND phone to avoid cross-hospital confusion
  var thisHospitalName  = (h.name  || '').toLowerCase().trim();
  var thisHospitalPhone = (h.phone || '').replace(/\s/g, '');

  var loadingCard = el('div', { 'class': 'card', 'style': 'padding:32px;text-align:center;' }, [
    el('div', { 'style': 'font-size:36px;margin-bottom:10px;' }, ['⏳']),
    el('div', { 'style': 'font-size:14px;color:var(--text-secondary);' }, ['Loading your requests...'])
  ]);
  w.appendChild(loadingCard);

  // Step 1: Get only THIS hospital's requests
  fetch(BACKEND + '/api/requests')
    .then(function(r) { return r.json(); })
    .then(function(allRequests) {

      var myRequests = allRequests.filter(function(r) {
        var nameMatch  = (r.hospitalName || '').toLowerCase().trim() === thisHospitalName;
        var phoneMatch = thisHospitalPhone && (r.phone || '').replace(/\s/g, '') === thisHospitalPhone;
        return nameMatch || phoneMatch;
      });

      loadingCard.remove();

      // If no requests at all — show empty state
      if (!myRequests.length) {
        w.appendChild(el('div', { 'class': 'card', 'style': 'padding:40px;text-align:center;' }, [
          el('div', { 'style': 'font-size:48px;margin-bottom:14px;' }, ['🏥']),
          el('div', { 'style': 'font-size:18px;font-weight:700;color:#111827;margin-bottom:8px;' }, ['No Blood Requests Yet']),
          el('div', { 'style': 'font-size:13px;color:#6B7280;margin-bottom:20px;' }, ['Post a blood request first — then matching donors will appear here automatically.']),
          el('button', {
            'class': 'btn btn-primary',
            'onClick': function() { state.activePage = 'request-blood'; render(); }
          }, ['🩸 Request Blood Now'])
        ]));
        return;
      }

      // Get unique blood groups from this hospital's requests
      var requestedBGs = [];
      myRequests.forEach(function(r) {
        if (r.bloodGroup && requestedBGs.indexOf(r.bloodGroup) === -1) {
          requestedBGs.push(r.bloodGroup);
        }
      });

      // Active filter — default to first requested blood group
      var selectedBG = requestedBGs[0] || 'All';

      // Filter row showing only requested blood groups
      var filterRow = el('div', { 'style': 'display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;' }, []);
      filterRow.appendChild(el('div', { 'style': 'font-size:13px;font-weight:600;color:#374151;' }, ['🔍 Your requested groups:']));

      var filterBtns = {};
      requestedBGs.forEach(function(bg) {
        var isActive = bg === selectedBG;
        var btn = el('button', {
          'style': 'padding:6px 14px;border-radius:20px;border:1.5px solid ' + (isActive ? '#DC2626' : '#E5E7EB') + ';background:' + (isActive ? '#DC2626' : 'white') + ';color:' + (isActive ? 'white' : '#374151') + ';font-size:12px;font-weight:600;cursor:pointer;',
          'onClick': function() {
            selectedBG = bg;
            Object.keys(filterBtns).forEach(function(k) {
              filterBtns[k].style.background   = k === bg ? '#DC2626' : 'white';
              filterBtns[k].style.color        = k === bg ? 'white'   : '#374151';
              filterBtns[k].style.borderColor  = k === bg ? '#DC2626' : '#E5E7EB';
            });
            refreshList();
          }
        }, [bg]);
        filterBtns[bg] = btn;
        filterRow.appendChild(btn);
      });
      w.appendChild(filterRow);

      // Donor list card
      var lc = el('div', { 'class': 'card' }, []);
      var cardTitle = el('div', { 'class': 'card-title' }, ['👥 Matching Donors']);
      lc.appendChild(el('div', { 'class': 'card-header' }, [
        cardTitle,
        el('span', { 'class': 'badge badge-green' }, ['● Live'])
      ]));
      var listContainer = el('div', {}, []);
      lc.appendChild(listContainer);
      w.appendChild(lc);

      var allDonors = [];

      function refreshList() {
        listContainer.innerHTML = '';
        var filtered = allDonors.filter(function(d) {
          if (d.role !== 'donor') return false;
          if (selectedBG !== 'All' && d.bloodGroup !== selectedBG) return false;
          return true;
        });
        filtered.sort(function(a, b) { return (b.availability ? 1 : 0) - (a.availability ? 1 : 0); });
        cardTitle.textContent = '👥 Matching Donors (' + filtered.length + ')';

        if (!filtered.length) {
          listContainer.appendChild(el('div', { 'style': 'padding:32px;text-align:center;' }, [
            el('div', { 'style': 'font-size:36px;margin-bottom:10px;' }, ['🩸']),
            el('div', { 'style': 'font-size:14px;color:#6B7280;' }, ['No donors with blood group ' + selectedBG + ' registered yet.'])
          ]));
          return;
        }

        filtered.forEach(function(donor) {
          var card = el('div', { 'style': 'padding:16px;border-bottom:1px solid var(--border);' }, []);

          // Donor info
          var infoRow = el('div', { 'style': 'display:flex;align-items:center;gap:12px;margin-bottom:12px;' }, []);
          var avatar = el('div', { 'style': 'width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#DC2626,#B91C1C);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0;' }, [(donor.name || 'D')[0]]);
          var info = el('div', { 'style': 'flex:1;' }, []);
          info.appendChild(el('div', { 'style': 'font-weight:700;font-size:14px;' }, [donor.name]));
          info.appendChild(el('div', { 'style': 'font-size:12px;color:#6B7280;' }, [
            '🩸 ' + donor.bloodGroup + ' · 📍 ' + (donor.city || '') + ' · ' + (donor.availability ? '✅ Available' : '❌ Unavailable')
          ]));
          if (donor.email) {
            info.appendChild(el('div', { 'style': 'font-size:11px;color:#9CA3AF;' }, ['📧 ' + donor.email]));
          }
          infoRow.appendChild(avatar);
          infoRow.appendChild(info);
          card.appendChild(infoRow);


          listContainer.appendChild(card);
        });
      }

      // Step 2: Fetch all donors and filter by this hospital's requested blood groups
      fetch(BACKEND + '/api/donors')
        .then(function(r) { return r.json(); })
        .then(function(donors) {
          // Only donors whose blood group matches one of this hospital's requests
          allDonors = donors.filter(function(d) {
            return d.role === 'donor' && requestedBGs.indexOf(d.bloodGroup) !== -1;
          });
          refreshList();
        })
        .catch(function() {
          listContainer.innerHTML = '<div style="padding:20px;color:red;">❌ Could not load donors.</div>';
        });
    })
    .catch(function() {
      loadingCard.innerHTML = '<div style="padding:20px;color:red;text-align:center;">❌ Could not load requests. Is backend running?</div>';
    });

  return w;
}

function renderHospitalHistory() {
  var w = el('div', {}, []);
  w.appendChild(el('p', { 'class': 'section-sub' }, ['When a donor accepts your request, send them an OTP to confirm donation and unlock their rewards.']));
  var card = el('div', { 'class': 'card' }, []);
  card.appendChild(el('div', { 'class': 'card-title mb-16' }, ['📋 Request History']));

  var loadingMsg = el('div', { 'style': 'padding:20px;color:var(--text-secondary);' }, ['Loading...']);
  card.appendChild(loadingMsg);

  var thisHospitalName = (getHospital().name || '').toLowerCase().trim();

  fetch(BACKEND + '/api/requests')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      loadingMsg.remove();
      // ✅ Filter to show only THIS hospital's requests
      var myRequests = data.filter(function(r) {
        return (r.hospitalName || '').toLowerCase().trim() === thisHospitalName;
      });
      if (!myRequests.length) {
        card.appendChild(el('div', { 'style': 'padding:32px;text-align:center;color:var(--text-secondary);' }, [
          el('div', { 'style': 'font-size:36px;margin-bottom:10px;' }, ['📋']),
          el('div', { 'style': 'font-size:14px;' }, ['No requests from your hospital yet.']),
          el('div', { 'style': 'font-size:12px;margin-top:6px;color:#9CA3AF;' }, ['Use "Request Blood" to post your first request.'])
        ]));
        return;
      }
      data = myRequests;

      data.forEach(function(req) {
        var row = el('div', { 'style': 'padding:16px;border-bottom:1px solid var(--border);' }, []);

        // Top info row
        var topRow = el('div', { 'style': 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;' }, []);
        topRow.appendChild(el('div', { 'style': 'width:36px;height:36px;border-radius:10px;background:#FEE2E2;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#DC2626;flex-shrink:0;' }, [req.bloodGroup || '?']));
        var info = el('div', { 'style': 'flex:1;' }, []);
        info.appendChild(el('div', { 'style': 'font-size:14px;font-weight:700;color:#111827;' }, [req.hospitalName + ' · ' + (req.bloodGroup || '') + ' · ' + req.units + ' unit(s)']));
        info.appendChild(el('div', { 'style': 'font-size:12px;color:#6B7280;margin-top:2px;' }, ['📍 ' + req.location + ' · ⚡ ' + req.urgency]));
        topRow.appendChild(info);

        // Status badge
        var statusColors = { pending: '#F59E0B', accepted: '#3B82F6', fulfilled: '#16A34A', cancelled: '#6B7280' };
        var statusColor = statusColors[req.status] || '#6B7280';
        topRow.appendChild(el('span', { 'style': 'padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;color:white;background:' + statusColor + ';' }, [req.status.toUpperCase()]));
        row.appendChild(topRow);

        // If donor accepted → show donor info + OTP button
        if (req.status === 'accepted' && req.acceptedBy && req.acceptedBy.donorName) {
          var donorInfo = el('div', { 'style': 'background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px;margin-bottom:10px;' }, []);
          donorInfo.appendChild(el('div', { 'style': 'font-size:12px;font-weight:700;color:#1D4ED8;margin-bottom:4px;' }, ['✅ Accepted by Donor:']));
          donorInfo.appendChild(el('div', { 'style': 'font-size:13px;color:#111827;font-weight:600;' }, [req.acceptedBy.donorName + ' · 📞 ' + req.acceptedBy.donorPhone]));
          if (req.acceptedBy.donorEmail) {
            donorInfo.appendChild(el('div', { 'style': 'font-size:12px;color:#6B7280;margin-top:2px;' }, ['📧 ' + req.acceptedBy.donorEmail]));
          }
          row.appendChild(donorInfo);

          // OTP send button + status
          var otpStatus = el('div', { 'style': 'font-size:12px;margin-top:6px;display:none;' }, []);
          var otpBtn = el('button', {
            'style': 'width:100%;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#DC2626,#B91C1C);color:white;font-size:13px;font-weight:700;cursor:pointer;',
            'onClick': function() {
              if (!req.acceptedBy.donorEmail) {
                otpStatus.textContent = '❌ Donor has no Gmail registered.';
                otpStatus.style.color = '#DC2626';
                otpStatus.style.display = 'block';
                return;
              }
              otpBtn.textContent = '⏳ Sending OTP to Gmail...';
              otpBtn.disabled = true;
              var hospital = getHospital();
              fetch(BACKEND + '/api/donation/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  donorId: req.acceptedBy.donorId,
                  hospitalName: hospital.name || req.hospitalName
                })
              })
              .then(function(r) { return r.json(); })
              .then(function(data) {
                if (data.error) {
                  otpBtn.textContent = '📧 Send OTP to Donor Gmail';
                  otpBtn.disabled = false;
                  otpStatus.textContent = '❌ ' + data.error;
                  otpStatus.style.color = '#DC2626';
                } else {
                  otpBtn.textContent = '✅ OTP Sent to ' + req.acceptedBy.donorEmail;
                  otpStatus.style.color = '#16A34A';
                  otpStatus.textContent = data.devOtp
                    ? '🧪 Dev OTP: ' + data.devOtp + ' (add Gmail to .env for real email)'
                    : '📧 OTP sent! Donor should check their Gmail.';
                }
                otpStatus.style.display = 'block';
              })
              .catch(function() {
                otpBtn.textContent = '📧 Send OTP to Donor Gmail';
                otpBtn.disabled = false;
                otpStatus.textContent = '❌ Server error.';
                otpStatus.style.color = '#DC2626';
                otpStatus.style.display = 'block';
              });
            }
          }, ['📧 Send OTP to Donor Gmail']);
          row.appendChild(otpBtn);
          row.appendChild(otpStatus);
        }

        card.appendChild(row);
      });
    })
    .catch(function() { loadingMsg.textContent = '❌ Could not load requests.'; });

  w.appendChild(card);
  return w;
}

function renderHospitalProfile() {
  var h = getHospital();
  var w = el('div', {}, []);
  w.appendChild(el('div', { 'class': 'profile-hero plain' }, [
    el('div', { 'class': 'ph-avatar pha-plain', 'style': 'font-size:36px;' }, ['🏥']),
    el('div', { 'class': 'ph-info' }, [
      el('h2', {}, [h.name || 'Hospital']),
      el('p', {}, [(h.phone || h.contact || '') + ' · ' + (h.city || h.location || '')]),
      el('div', { 'class': 'ph-badges' }, [
        el('span', { 'class': 'badge badge-green' }, ['✓ Verified'])
      ])
    ])
  ]));
  return w;
}

render();