const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const https = require('https');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const Donor = require('./models/donor');
const Request = require('./models/request');

// In-memory OTP stores
// otpStore           → donation-confirmation OTPs (hospital → donor after donation)
// authOtpStore       → login / register OTPs sent to user's Gmail
const otpStore = {};
const authOtpStore = {};   // { email: { otp, expiresAt, purpose } }

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ═══════════════════════════════════════════════════════════════════
//  EMAIL — Nodemailer via Gmail
// ═══════════════════════════════════════════════════════════════════
function createMailer() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.log('⚠️  Gmail not configured — emails will be logged only');
        return null;
    }
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD  // App Password, NOT your Gmail password
        }
    });
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}

// ─── Donation-confirmation email (existing) ──────────────────────
async function sendDonationOTPEmail(donor, hospitalName, otp) {
    const mailer = createMailer();

    const subject = `BloodLink — Donation OTP from ${hospitalName}`;
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eee;">
      <div style="background:linear-gradient(135deg,#DC2626,#B91C1C);padding:28px;text-align:center;">
        <div style="font-size:40px;">🩸</div>
        <h1 style="color:white;margin:8px 0 0;font-size:22px;">BloodLink</h1>
        <p style="color:#FCA5A5;margin:4px 0 0;font-size:13px;">Blood Donation Confirmation</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:16px;color:#111827;">Dear <strong>${donor.name}</strong>,</p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Thank you for donating blood at <strong>${hospitalName}</strong>! 🎉<br/>
          Your donation has been recorded. Please share this OTP with the hospital to confirm your donation and unlock your rewards.
        </p>
        <div style="background:#FFF7F7;border:2px dashed #DC2626;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
          <div style="font-size:13px;color:#6B7280;margin-bottom:8px;letter-spacing:1px;">YOUR DONATION OTP</div>
          <div style="font-size:42px;font-weight:900;letter-spacing:8px;color:#DC2626;">${otp}</div>
          <div style="font-size:12px;color:#9CA3AF;margin-top:8px;">Valid for 10 minutes</div>
        </div>
        <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:14px;font-size:13px;color:#166534;">
          ✅ Share this OTP with <strong>${hospitalName}</strong> to get your donation verified and rewards updated.
        </div>
        <hr style="border:none;border-top:1px solid #F3F4F6;margin:20px 0;"/>
        <p style="font-size:11px;color:#9CA3AF;text-align:center;">
          Do NOT share this OTP with anyone other than hospital staff.<br/>BloodLink — Save Lives, Earn Rewards
        </p>
      </div>
    </div>`;

    if (!mailer) {
        console.log('\n📧 EMAIL (not sent — Gmail not configured):');
        console.log(`   To: ${donor.email}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   OTP: ${otp}\n`);
        return { skipped: true, otp };
    }

    await mailer.sendMail({
        from: `"BloodLink" <${process.env.GMAIL_USER}>`,
        to: donor.email,
        subject,
        html
    });
    console.log(`✅ OTP email sent to ${donor.email}`);
    return { sent: true };
}

// ─── NEW: Auth (login / register) OTP email ──────────────────────
async function sendAuthOTPEmail(toEmail, otp, purpose, role) {
    const mailer = createMailer();
    const niceRole = role === 'hospital' ? 'Hospital' : 'Donor';
    const action = purpose === 'register' ? 'Complete your registration' : 'Sign in to your account';
    const subject = `BloodLink — Your ${purpose === 'register' ? 'Registration' : 'Login'} OTP`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eee;">
      <div style="background:linear-gradient(135deg,#DC2626,#B91C1C);padding:28px;text-align:center;">
        <div style="font-size:40px;">🩸</div>
        <h1 style="color:white;margin:8px 0 0;font-size:22px;">BloodLink</h1>
        <p style="color:#FCA5A5;margin:4px 0 0;font-size:13px;">${niceRole} ${purpose === 'register' ? 'Registration' : 'Login'} Verification</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:16px;color:#111827;">Hello 👋</p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Use the verification code below to <strong>${action}</strong> on BloodLink as a <strong>${niceRole}</strong>.
        </p>
        <div style="background:#FFF7F7;border:2px dashed #DC2626;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
          <div style="font-size:13px;color:#6B7280;margin-bottom:8px;letter-spacing:1px;">YOUR VERIFICATION CODE</div>
          <div style="font-size:42px;font-weight:900;letter-spacing:8px;color:#DC2626;">${otp}</div>
          <div style="font-size:12px;color:#9CA3AF;margin-top:8px;">Valid for 10 minutes</div>
        </div>
        <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;padding:14px;font-size:13px;color:#92400E;">
          ⚠️ If you did not request this code, simply ignore this email. Never share this code with anyone.
        </div>
        <hr style="border:none;border-top:1px solid #F3F4F6;margin:20px 0;"/>
        <p style="font-size:11px;color:#9CA3AF;text-align:center;">
          BloodLink — Save Lives, Earn Rewards
        </p>
      </div>
    </div>`;

    if (!mailer) {
        console.log('\n📧 AUTH EMAIL (not sent — Gmail not configured):');
        console.log(`   To: ${toEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   OTP: ${otp}\n`);
        return { skipped: true, otp };
    }

    await mailer.sendMail({
        from: `"BloodLink" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject,
        html
    });
    console.log(`✅ Auth OTP email sent to ${toEmail}`);
    return { sent: true };
}

// ═══════════════════════════════════════════════════════════════════
//  SMS — Multilingual (Fast2SMS)  [unchanged]
// ═══════════════════════════════════════════════════════════════════
const SMS_TEMPLATES = {
    English:   (n, h, bg, u, l) => `Dear ${n}, URGENT! ${h} needs ${u} unit(s) of ${bg} blood at ${l}. Please donate and save a life! - BloodLink`,
    Kannada:   (n, h, bg, u, l) => `ಪ್ರಿಯ ${n}, ತುರ್ತು! ${h} ಗೆ ${l} ನಲ್ಲಿ ${u} ಯೂನಿಟ್ ${bg} ರಕ್ತ ಬೇಕಿದೆ. ದಯವಿಟ್ಟು ರಕ್ತದಾನ ಮಾಡಿ! - BloodLink`,
    Hindi:     (n, h, bg, u, l) => `प्रिय ${n}, अत्यावश्यक! ${h} को ${l} में ${u} यूनिट ${bg} रक्त चाहिए। कृपया रक्तदान करें! - BloodLink`,
    Tamil:     (n, h, bg, u, l) => `அன்பான ${n}, அவசரம்! ${h} க்கு ${l} இல் ${u} யூனிட் ${bg} இரத்தம் தேவை. தயவுசெய்து கொடுங்கள்! - BloodLink`,
    Telugu:    (n, h, bg, u, l) => `ప్రియమైన ${n}, అత్యవసరం! ${h} కు ${l} లో ${u} యూనిట్ ${bg} రక్తం అవసరం. దయచేసి రక్తదానం చేయండి! - BloodLink`,
    Malayalam: (n, h, bg, u, l) => `പ്രിയ ${n}, അടിയന്തിരം! ${h} ന് ${l} ൽ ${u} യൂണിറ്റ് ${bg} രക്തം വേണം. ദയവായി രക്തദാനം ചെയ്യൂ! - BloodLink`
};

async function sendSMS(phone, message) {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) {
        console.log('⚠️  SMS skipped (no FAST2SMS_API_KEY):', phone, '-', message.substring(0, 50));
        return { skipped: true };
    }
    const cleaned = phone.replace(/^\+91|^91/, '').replace(/\D/g, '');
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ route: 'q', message, language: 'unicode', flash: 0, numbers: cleaned });
        const options = {
            hostname: 'www.fast2sms.com', path: '/dev/bulkV2', method: 'POST',
            headers: { 'authorization': apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        };
        const req = https.request(options, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const r = JSON.parse(data);
                    r.return ? resolve(r) : reject(r);
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function notifyMatchingDonors(bloodRequest) {
    try {
        const donors = await Donor.find({ bloodGroup: bloodRequest.bloodGroup, availability: true, role: 'donor' });
        console.log(`📢 Notifying ${donors.length} donor(s) for ${bloodRequest.bloodGroup}`);
        for (const donor of donors) {
            const lang = donor.language || 'English';
            const fn = SMS_TEMPLATES[lang] || SMS_TEMPLATES['English'];
            const msg = fn(donor.name.split(' ')[0], bloodRequest.hospitalName, bloodRequest.bloodGroup, bloodRequest.units, bloodRequest.location);
            try { await sendSMS(donor.phone, msg); } catch(e) { console.error(`SMS failed for ${donor.name}:`, e.message); }
        }
    } catch(e) { console.error('notifyMatchingDonors error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════
//  ✅ NEW — AUTH OTP via GMAIL (login + register, donor + hospital)
// ═══════════════════════════════════════════════════════════════════

// POST /api/auth/send-otp
//   body: { email, purpose: 'login' | 'register', role: 'donor' | 'hospital' }
app.post('/api/auth/send-otp', async (req, res) => {
    try {
        const { email, purpose, role } = req.body;
        if (!email)   return res.status(400).json({ error: 'email is required' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ error: 'Invalid email address' });

        const cleanEmail = email.toLowerCase().trim();
        const action = (purpose === 'register') ? 'register' : 'login';

        // For LOGIN — make sure account exists
        if (action === 'login') {
            const user = await Donor.findOne({ email: cleanEmail });
            if (!user)        return res.status(404).json({ error: 'Email not registered. Please register first.' });
            if (role && user.role !== role)
                return res.status(400).json({ error: `This email is registered as a ${user.role}, not a ${role}.` });
        }

        // For REGISTER — make sure email isn't already taken
        if (action === 'register') {
            const existing = await Donor.findOne({ email: cleanEmail });
            if (existing) return res.status(409).json({ error: 'Email already registered. Please login instead.' });
        }

        const otp = generateOTP();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
        authOtpStore[cleanEmail] = { otp, expiresAt, purpose: action, role: role || 'donor' };

        const result = await sendAuthOTPEmail(cleanEmail, otp, action, role || 'donor');

        res.json({
            message: `OTP sent to ${cleanEmail}`,
            // dev mode: when Gmail isn't configured, return the OTP so you can test locally
            devOtp: result.skipped ? otp : undefined
        });
    } catch (err) {
        console.error('send-otp error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/verify-otp
//   body: { email, otp }
//   For LOGIN  → returns the matching donor/hospital user
//   For REGISTER → marks email as verified (frontend then calls POST /api/donors)
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ error: 'email and otp are required' });

        const cleanEmail = email.toLowerCase().trim();
        const stored = authOtpStore[cleanEmail];
        if (!stored)                       return res.status(400).json({ error: 'No OTP found. Please request a new code.' });
        if (Date.now() > stored.expiresAt) { delete authOtpStore[cleanEmail]; return res.status(400).json({ error: 'OTP expired. Please request a new code.' }); }
        if (stored.otp !== otp.toString()) return res.status(400).json({ error: 'Wrong OTP. Please try again.' });

        const purpose = stored.purpose;
        //delete authOtpStore[cleanEmail];

        if (purpose === 'login') {
            const user = await Donor.findOne({ email: cleanEmail });
            if (!user) return res.status(404).json({ error: 'Account not found.' });
            return res.json({ message: 'Login successful', purpose, user });
        }

        // register
        return res.json({ message: 'Email verified — please complete registration', purpose, verifiedEmail: cleanEmail });
    } catch (err) {
        console.error('verify-otp error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
//  DONOR ROUTES
// ═══════════════════════════════════════════════════════════════════
app.get('/api/donors', async (req, res) => {
    try {
        const filter = {};
        if (req.query.bloodGroup)   filter.bloodGroup   = req.query.bloodGroup;
        if (req.query.city)         filter.city         = new RegExp(req.query.city, 'i');
        if (req.query.availability) filter.availability = req.query.availability === 'true';
        if (req.query.phone)        filter.phone        = req.query.phone;
        if (req.query.email)        filter.email        = req.query.email.toLowerCase();
        const donors = await Donor.find(filter).sort({ createdAt: -1 });
        res.json(donors);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/donors/:id', async (req, res) => {
    try {
        const donor = await Donor.findById(req.params.id);
        if (!donor) return res.status(404).json({ error: 'Donor not found' });
        res.json(donor);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/donors', async (req, res) => {
    try {
        const body = { ...req.body };
        if (body.email) body.email = body.email.toLowerCase().trim();

        // Both phone AND email must be unique
        if (body.email) {
            const existingByEmail = await Donor.findOne({ email: body.email });
            if (existingByEmail) return res.status(409).json({ error: 'Email already registered' });
        }
        if (body.phone) {
            const existingByPhone = await Donor.findOne({ phone: body.phone });
            if (existingByPhone) return res.status(409).json({ error: 'Phone number already registered' });
        }

        const newDonor = new Donor(body);
        await newDonor.save();
        res.status(201).json({ message: 'Account registered successfully!', donor: newDonor });
    } catch(err) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/donors/:id/availability', async (req, res) => {
    try {
        const donor = await Donor.findByIdAndUpdate(req.params.id, { availability: req.body.availability }, { new: true });
        if (!donor) return res.status(404).json({ error: 'Donor not found' });
        res.json({ message: 'Availability updated', donor });
    } catch(err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/donors/:id', async (req, res) => {
    try {
        const donor = await Donor.findByIdAndDelete(req.params.id);
        if (!donor) return res.status(404).json({ error: 'Donor not found' });
        res.json({ message: 'Donor removed successfully' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  DONATION OTP ROUTES (Hospital → send OTP → Donor verifies)
// ═══════════════════════════════════════════════════════════════════
app.post('/api/donation/send-otp', async (req, res) => {
    try {
        const { donorId, hospitalName } = req.body;
        if (!donorId || !hospitalName) return res.status(400).json({ error: 'donorId and hospitalName required' });

        const donor = await Donor.findById(donorId);
        if (!donor) return res.status(404).json({ error: 'Donor not found' });
        if (!donor.email) return res.status(400).json({ error: 'Donor has no email registered' });

        const otp = generateOTP();
        const expiresAt = Date.now() + 10 * 60 * 1000;
        otpStore[donorId] = { otp, expiresAt, hospitalName };

        const result = await sendDonationOTPEmail(donor, hospitalName, otp);
        res.json({
            message: `OTP sent to donor's email (${donor.email})`,
            devOtp: result.skipped ? otp : undefined
        });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/donation/verify-otp', async (req, res) => {
    try {
        const { donorId, otp } = req.body;
        if (!donorId || !otp) return res.status(400).json({ error: 'donorId and otp required' });

        const stored = otpStore[donorId];
        if (!stored) return res.status(400).json({ error: 'No OTP found. Ask hospital to resend.' });
        if (Date.now() > stored.expiresAt) {
            delete otpStore[donorId];
            return res.status(400).json({ error: 'OTP expired. Ask hospital to resend.' });
        }
        if (stored.otp !== otp.toString()) return res.status(400).json({ error: 'Wrong OTP. Please try again.' });

        const donor = await Donor.findByIdAndUpdate(donorId, { $inc: { donationCount: 1 } }, { new: true });
        delete otpStore[donorId];

        const count = donor.donationCount;
        let tier = 'none', tierUnlocked = null;
        if (count >= 5)      { tier = 'diamond'; if (count === 5) tierUnlocked = 'diamond'; }
        else if (count >= 3) { tier = 'gold';    if (count === 3) tierUnlocked = 'gold'; }
        else if (count >= 1) { tier = 'silver';  if (count === 1) tierUnlocked = 'silver'; }

        res.json({ message: 'Donation verified! Rewards updated.', donationCount: count, tier, tierUnlocked, donor });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  BLOOD REQUEST ROUTES
// ═══════════════════════════════════════════════════════════════════
app.get('/api/requests', async (req, res) => {
    try {
        const filter = {};
        if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;
        if (req.query.urgency)    filter.urgency    = req.query.urgency;
        if (req.query.status)     filter.status     = req.query.status;
        if (req.query.city)       filter.location   = new RegExp(req.query.city, 'i');
        const requests = await Request.find(filter).sort({ createdAt: -1 });
        res.json(requests);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/:id', async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        res.json(request);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/requests/:id/accept', async (req, res) => {
    try {
        const { donorId, donorName, donorPhone, donorEmail } = req.body;
        const request = await Request.findByIdAndUpdate(
            req.params.id,
            { status: 'accepted', acceptedBy: { donorId, donorName, donorPhone, donorEmail } },
            { new: true }
        );
        if (!request) return res.status(404).json({ error: 'Request not found' });
        res.json({ message: 'Request accepted!', request });
    } catch(err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/requests', async (req, res) => {
    try {
        const newRequest = new Request(req.body);
        await newRequest.save();
        notifyMatchingDonors(newRequest);
        res.status(201).json({ message: 'Blood request created! Notifying donors.', request: newRequest });
    } catch(err) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/requests/:id/status', async (req, res) => {
    try {
        const request = await Request.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
        if (!request) return res.status(404).json({ error: 'Request not found' });
        res.json({ message: 'Status updated', request });
    } catch(err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/requests/:id', async (req, res) => {
    try {
        const request = await Request.findByIdAndDelete(req.params.id);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        res.json({ message: 'Request deleted' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/match', async (req, res) => {
    try {
        const { bloodGroup, city } = req.query;
        if (!bloodGroup) return res.status(400).json({ error: 'bloodGroup is required' });
        const filter = { bloodGroup, availability: true };
        if (city) filter.city = new RegExp(city, 'i');
        const donors = await Donor.find(filter).sort({ createdAt: -1 });
        res.json({ count: donors.length, donors });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        sms: process.env.FAST2SMS_API_KEY ? '✅ Active' : '⚠️ Not configured',
        email: process.env.GMAIL_USER ? '✅ Active' : '⚠️ Not configured (add GMAIL_USER + GMAIL_APP_PASSWORD to .env)'
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(process.env.GMAIL_USER ? '📧 Email OTP: ACTIVE' : '⚠️  Email OTP: Add GMAIL_USER + GMAIL_APP_PASSWORD to .env');
    console.log(process.env.FAST2SMS_API_KEY ? '📲 SMS: ACTIVE' : '⚠️  SMS: Add FAST2SMS_API_KEY to .env');
});
