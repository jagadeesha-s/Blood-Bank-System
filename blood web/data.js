var DUMMY_DATA = {
  donor: {
    name: 'Arjun Sharma',
    phone: '+91 98765 43210',
    bloodGroup: 'B+',
    location: 'Koramangala, Bengaluru',
    language: 'English',
    totalDonations: 3,
    lastDonation: '2025-12-18',
    isAvailable: true,
    tier: 'gold'
  },
  hospital: {
    name: 'City General Hospital',
    location: 'MG Road, Bengaluru',
    contact: '+91 80-4567-8900',
    verifiedBeds: 320,
    activeRequests: 3
  },
  tiers: {
    silver: {
      name: 'Silver',
      emoji: '🥈',
      donations: 1,
      benefit: 'Basic Full Body Checkup',
      detail: 'Blood count, sugar, BP, BMI analysis for 1 family member. Value: ₹2,500.',
      perks: ['Blood count & sugar test', 'Blood pressure check', 'BMI & body mass analysis', '1 family member eligible']
    },
    gold: {
      name: 'Gold',
      emoji: '🥇',
      donations: 3,
      benefit: 'Advanced Health Checkup',
      detail: 'Liver & kidney function, lipid profile, thyroid panel, ECG for 1 family member. Value: ₹6,500.',
      perks: ['All Silver benefits', 'Liver & kidney function tests', 'Thyroid panel & lipid profile', 'ECG + chest X-ray', '1 family member eligible']
    },
    diamond: {
      name: 'Diamond',
      emoji: '💎',
      donations: 5,
      benefit: 'Full Body Scan & Imaging',
      detail: 'MRI / CT scan, full internal organ imaging, cancer marker tests, specialist consultation. Value: ₹18,000.',
      perks: ['All Gold benefits', 'MRI / CT full body scan', 'Cancer marker panel', 'Specialist consultation', 'Dental & eye checkup', '1 family member eligible']
    }
  },
  bloodRequests: [
    { id: 'REQ001', hospital: 'Apollo Hospital', bloodGroup: 'O+', units: 2, location: 'Shivajinagar', distance: '2.4 km', urgency: 'urgent', time: '5 min ago', status: 'pending', eta: '~8 min' },
    { id: 'REQ002', hospital: 'Manipal Hospital', bloodGroup: 'B+', units: 1, location: 'Whitefield', distance: '6.1 km', urgency: 'normal', time: '18 min ago', status: 'pending', eta: '~22 min' },
    { id: 'REQ003', hospital: 'Fortis Hospital', bloodGroup: 'A-', units: 3, location: 'Bannerghatta Rd', distance: '9.3 km', urgency: 'urgent', time: '2 min ago', status: 'pending', eta: '~30 min' },
    { id: 'REQ004', hospital: 'Narayana Health', bloodGroup: 'AB+', units: 2, location: 'Electronic City', distance: '14.7 km', urgency: 'normal', time: '1 hr ago', status: 'accepted', eta: '~45 min' }
  ],
  donationHistory: [
    { id: 'DON001', hospital: 'Apollo Hospital', date: '2025-12-18', bloodGroup: 'B+', units: 1, status: 'completed', tier: 'gold' },
    { id: 'DON002', hospital: 'Fortis Hospital', date: '2025-09-05', bloodGroup: 'B+', units: 1, status: 'completed', tier: 'gold' },
    { id: 'DON003', hospital: 'Manipal Hospital', date: '2025-06-10', bloodGroup: 'B+', units: 1, status: 'completed', tier: 'silver' }
  ],
  nearbyDonors: [
    { id: 'D002', name: 'Priya Nair', bloodGroup: 'O+', distance: '1.2 km', available: true, lastDonated: '4 months ago', donations: 5, tier: 'diamond' },
    { id: 'D003', name: 'Rahul Menon', bloodGroup: 'O+', distance: '2.7 km', available: true, lastDonated: '3 months ago', donations: 3, tier: 'gold' },
    { id: 'D004', name: 'Sneha Reddy', bloodGroup: 'O-', distance: '3.4 km', available: false, lastDonated: '1 month ago', donations: 1, tier: 'silver' },
    { id: 'D005', name: 'Kiran Patel', bloodGroup: 'O+', distance: '4.1 km', available: true, lastDonated: '6 months ago', donations: 2, tier: 'silver' },
    { id: 'D006', name: 'Meera Iyer', bloodGroup: 'B+', distance: '5.0 km', available: true, lastDonated: '5 months ago', donations: 4, tier: 'gold' }
  ],
  hospitalRequests: [
    { id: 'HREQ001', bloodGroup: 'O+', units: 2, status: 'pending', sentAt: '10 min ago', matches: 4 },
    { id: 'HREQ002', bloodGroup: 'A+', units: 1, status: 'completed', sentAt: '2 hr ago', matches: 2 },
    { id: 'HREQ003', bloodGroup: 'B-', units: 3, status: 'pending', sentAt: '45 min ago', matches: 1 }
  ],
  bloodGroups: ['A+','A-','B+','B-','AB+','AB-','O+','O-'],
  languages: ['English','Kannada','Hindi','Tamil','Telugu','Malayalam'],
  notifications: [
    { id: 'N001', title: 'Urgent Request — Apollo Hospital', text: 'O+ blood needed urgently · 2.4 km away · 2 units', time: '5 min ago', unread: true, type: 'urgent' },
    { id: 'N002', title: 'New Request — Manipal Hospital', text: 'B+ blood needed · 6.1 km away · 1 unit', time: '18 min ago', unread: true, type: 'normal' },
    { id: 'N003', title: '🥇 Gold Tier Unlocked!', text: 'You donated 3 times. Claim your Advanced Health Checkup!', time: '2 days ago', unread: false, type: 'success' }
  ],
  settings: {
    language: 'English',
    location: 'Koramangala, Bengaluru',
    notifications: true
  }
};

function getDonorTier(donations) {
  if (donations >= 5) return 'diamond';
  if (donations >= 3) return 'gold';
  if (donations >= 1) return 'silver';
  return 'none';
}

function getTierData(tier) {
  return DUMMY_DATA.tiers[tier] || null;
}

function getTierEmoji(tier) {
  if (tier === 'diamond') return '💎';
  if (tier === 'gold') return '🥇';
  if (tier === 'silver') return '🥈';
  return '🩸';
}

function getTierBadgeClass(tier) {
  if (tier === 'diamond') return 'badge-diamond';
  if (tier === 'gold') return 'badge-gold';
  if (tier === 'silver') return 'badge-silver';
  return 'badge-gray';
}