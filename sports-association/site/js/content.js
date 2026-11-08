// เนื้อหาที่ไม่ได้แก้ผ่านหน้าแอดมิน (แก้ในไฟล์นี้)
// ข้อความที่มี "[รอข้อมูล]" คือข้อมูลตัวอย่าง ต้องเปลี่ยนเป็นข้อมูลจริงจากสมาคมก่อนเปิดใช้งาน

export const IMG = (id, w = 1600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`;

export const PHOTOS = {
  outdoor: 'photo-1761070831434-ce9010383099',
  outdoor2: 'photo-1761070827493-4e86cdd37ebe',
  gymWoman: 'photo-1770026136375-9b9d038300e1',
  coach: 'photo-1758875569940-b69e9b392005',
  gymMan2: 'photo-1758875568447-aa45a5d3b351',
  girl: 'photo-1482368395386-c40ff5165e15',
  woman: 'photo-1514994667787-b48ca37155f0',
  shoes: 'photo-1517931524326-bdd55a541177',
  rope: 'photo-1520334298038-4182dac472e8',
  arena: 'photo-1771909719482-4f95e62f41a7',
  court: 'photo-1775993167393-f2add1f8eec2',
};

export const SITE = {
  name: 'สมาคมกีฬาตัวอย่าง',
  nameEn: 'Sample Sports Association',
  address: '[รอข้อมูล] ที่อยู่สมาคมกีฬาตัวอย่าง',
  phone: '[รอข้อมูล] 0X-XXX-XXXX',
  email: '[รอข้อมูล] contact@samplesport.com',
  hours: 'จันทร์–ศุกร์ 09:00–17:00 น.',
  mapEmbed: 'https://www.google.com/maps?q=Bangkok&output=embed', // [รอข้อมูล] เปลี่ยนเป็นพิกัดสมาคม
  social: {
    facebook: '#', // [รอข้อมูล]
    instagram: '#',
    youtube: '#',
    tiktok: '#',
  },
  marathonUrl: '#', // [รอข้อมูล] ลิงก์ JR MARATHON
};

export const MENU = [
  { label: 'Home', href: 'index.html' },
  { label: 'Organisation', href: 'organisation.html', sub: [
    ['About Sample Sports', 'organisation.html#about'],
    ['Official Affiliations', 'organisation.html#affiliations'],
    ['Board of Directors', 'organisation.html#board'],
    ['Judges', 'organisation.html#judges'],
    ['Coaches', 'organisation.html#coaches'],
    ['Club Members', 'organisation.html#clubs'],
  ] },
  { label: 'News', href: 'news.html', sub: [
    ['All News', 'news.html'],
    ['Announcement', 'news.html?cat=announcement'],
    ['Press Release', 'news.html?cat=press'],
    ['Social and Community', 'news.html?cat=community'],
    ['Competition', 'news.html?cat=competition'],
  ] },
  { label: 'Competition', href: 'competition.html', sub: [
    ['Event Calendar', 'competition.html#calendar'],
    ['Competition Details', 'competition.html#details'],
  ] },
  { label: 'Downloads', href: 'downloads.html', sub: [
    ['IJRU Rules', 'downloads.html#rules'],
    ['Anti-Doping', 'downloads.html#anti-doping'],
    ['Safe Sport', 'downloads.html#safe-sport'],
    ['Timing Tracks', 'downloads.html#timing'],
  ] },
  { label: 'Media', href: 'media.html', sub: [
    ['Photo Gallery', 'media.html#photos'],
    ['Video Gallery', 'media.html#videos'],
  ] },
  { label: 'About Jump Rope', href: 'about-jump-rope.html', sub: [
    ['What is Jump Rope?', 'about-jump-rope.html#what'],
    ['Benefits + Clip Video', 'about-jump-rope.html#benefits'],
    ['Categories', 'about-jump-rope.html#categories'],
    ['Thailand National Team', 'about-jump-rope.html#national-team'],
    ['International Results', 'about-jump-rope.html#results'],
  ] },
  { label: 'Contact Us', href: 'contact.html', accent: true },
];

export const PARTNERS = [
  { mark: 'HFT', sub: 'Partner' },
  { mark: 'กรมอนามัย', sub: 'Department of Health' },
  { mark: 'KRSA', sub: 'Partner' },
  { mark: 'CRSA', sub: 'Partner' },
  { mark: 'THAIBEV', sub: 'Partner' },
];

export const ABOUT_TEXT = `[รอข้อมูล] สมาคมกีฬาตัวอย่างเป็นองค์กรกลางในการส่งเสริมและพัฒนากีฬากระโดดเชือกในประเทศไทย ตั้งแต่ระดับเยาวชน สโมสร จนถึงทีมชาติ

สมาคมฯ จัดการแข่งขันชิงแชมป์ประเทศไทย พัฒนาผู้ตัดสินและผู้ฝึกสอนตามมาตรฐาน IJRU และคัดเลือกนักกีฬาเป็นตัวแทนประเทศไทยไปแข่งขันในระดับนานาชาติ`;

export const AFFILIATIONS = [
  { abbr: 'SAT', name: 'การกีฬาแห่งประเทศไทย', desc: 'Sports Authority of Thailand — หน่วยงานกำกับดูแลสมาคมกีฬาในประเทศไทย' },
  { abbr: 'IJRU', name: 'International Jump Rope Union', desc: 'สหพันธ์กีฬากระโดดเชือกนานาชาติ ผู้กำหนดกติกาการแข่งขันสากล' },
  { abbr: 'AJRU', name: 'Asian Jump Rope Union', desc: 'สหพันธ์กีฬากระโดดเชือกแห่งเอเชีย' },
];

// [รอข้อมูล] รายชื่อกรรมการ ผู้ตัดสิน ผู้ฝึกสอน และสโมสร
export const BOARD = {
  president: { name: '[รอข้อมูล] ชื่อนายกสมาคม', role: 'นายกสมาคม' },
  vice: [
    { name: '[รอข้อมูล] ชื่อ', role: 'อุปนายก' },
    { name: '[รอข้อมูล] ชื่อ', role: 'อุปนายก' },
  ],
  members: [
    { name: '[รอข้อมูล] ชื่อ', role: 'เลขาธิการ' },
    { name: '[รอข้อมูล] ชื่อ', role: 'เหรัญญิก' },
    { name: '[รอข้อมูล] ชื่อ', role: 'ฝ่ายเทคนิค' },
    { name: '[รอข้อมูล] ชื่อ', role: 'ฝ่ายประชาสัมพันธ์' },
  ],
};

export const JUDGES = Array.from({ length: 8 }, (_, i) => ({ name: `[รอข้อมูล] ผู้ตัดสิน ${i + 1}`, role: i < 3 ? 'IJRU Level 2' : 'IJRU Level 1' }));
export const COACHES = Array.from({ length: 8 }, (_, i) => ({ name: `[รอข้อมูล] ผู้ฝึกสอน ${i + 1}`, role: i < 2 ? 'หัวหน้าผู้ฝึกสอนทีมชาติ' : 'ผู้ฝึกสอนระดับชาติ' }));
export const CLUBS = [
  ['[รอข้อมูล] สโมสร A', 'กรุงเทพมหานคร'],
  ['[รอข้อมูล] สโมสร B', 'เชียงใหม่'],
  ['[รอข้อมูล] สโมสร C', 'ขอนแก่น'],
  ['[รอข้อมูล] สโมสร D', 'ชลบุรี'],
  ['[รอข้อมูล] สโมสร E', 'สงขลา'],
  ['[รอข้อมูล] สโมสร F', 'นครราชสีมา'],
];

// ไฟล์ดาวน์โหลด: วางไฟล์จริงไว้ที่ site/files/ แล้วแก้ href
export const DOWNLOADS = {
  rules: [
    { name: 'IJRU Competition Manual (ฉบับล่าสุด)', meta: 'PDF · ภาษาอังกฤษ', href: 'https://rules.ijru.sport', type: 'LINK' },
    { name: '[รอข้อมูล] สรุปกติกาการแข่งขัน ภาษาไทย', meta: 'PDF', href: '#', type: 'PDF' },
  ],
  antiDoping: [
    { name: 'รายการสารต้องห้าม WADA Prohibited List', meta: 'ลิงก์ภายนอก', href: 'https://www.wada-ama.org/en/prohibited-list', type: 'LINK' },
    { name: '[รอข้อมูล] คู่มือต่อต้านการใช้สารต้องห้ามสำหรับนักกีฬา', meta: 'PDF', href: '#', type: 'PDF' },
  ],
  safeSport: [
    { name: '[รอข้อมูล] นโยบาย Safe Sport ของสมาคม', meta: 'PDF', href: '#', type: 'PDF' },
    { name: '[รอข้อมูล] ช่องทางแจ้งเหตุและขอความช่วยเหลือ', meta: 'PDF', href: '#', type: 'PDF' },
  ],
  // [รอข้อมูล] ไฟล์เสียงประมาณ 10 รายการ วางไว้ที่ site/files/timing/
  timing: [
    'Speed Sprint 30 วินาที',
    'Speed Endurance 2 นาที',
    'Speed Endurance 3 นาที',
    'Double Under Relay',
    'Single Rope Speed Relay',
    'Double Dutch Speed Relay',
    'Double Dutch Speed Sprint',
    'Triple Under',
    'Single Rope Pair Freestyle (เวลา)',
    'Double Dutch Freestyle (เวลา)',
  ].map((name, i) => ({ name, meta: 'MP3', href: `files/timing/track-${String(i + 1).padStart(2, '0')}.mp3`, type: 'MP3' })),
};

export const CATEGORIES = [
  { key: 'speed', title: 'Speed', th: 'สปีด', img: PHOTOS.shoes, desc: 'แข่งความเร็ว นับจำนวนครั้งที่เท้าขวาแตะพื้นภายในเวลาที่กำหนด เช่น 30 วินาที และ 3 นาที' },
  { key: 'freestyle', title: 'Freestyle', th: 'ฟรีสไตล์', img: PHOTOS.gymWoman, desc: 'โชว์ท่าประกอบเพลง ตัดสินจากความยาก ความสร้างสรรค์ และความแม่นยำ' },
  { key: 'double-dutch', title: 'Double Dutch', th: 'ดับเบิลดัตช์', img: PHOTOS.coach, desc: 'ใช้เชือกสองเส้นหมุนสลับกัน มีผู้หมุนสองคนและผู้กระโดดตรงกลาง' },
  { key: 'recreation', title: 'Recreation', th: 'นันทนาการ', img: PHOTOS.girl, desc: 'กระโดดเชือกเพื่อสุขภาพและความสนุก เหมาะกับทุกวัย ทั้งในโรงเรียนและชุมชน' },
];

export const BENEFITS = [
  ['หัวใจและปอดแข็งแรง', 'กระโดดเชือก 10 นาทีช่วยเพิ่มอัตราการเต้นของหัวใจได้ใกล้เคียงการวิ่ง'],
  ['เผาผลาญพลังงานสูง', 'ใช้กล้ามเนื้อทั้งร่างกาย เหมาะกับการควบคุมน้ำหนัก'],
  ['ทักษะการประสานงาน', 'พัฒนาจังหวะ การทรงตัว และความสัมพันธ์ระหว่างมือ–เท้า'],
  ['กระดูกแข็งแรง', 'แรงกระแทกเบา ๆ ช่วยเสริมความหนาแน่นของกระดูกในเด็กและเยาวชน'],
  ['ฝึกง่าย ลงทุนน้อย', 'ใช้แค่เชือกหนึ่งเส้นและพื้นที่เล็ก ๆ ฝึกได้ทุกที่'],
  ['ทำงานเป็นทีม', 'ประเภททีมและดับเบิลดัตช์ช่วยฝึกการสื่อสารและความไว้ใจกัน'],
];

// [รอข้อมูล] คลิป YouTube: ใส่ video id
export const VIDEOS = [
  { title: '[รอข้อมูล] ประโยชน์ของการกระโดดเชือก', youtube: '' },
  { title: '[รอข้อมูล] ไฮไลต์ชิงแชมป์ประเทศไทย', youtube: '' },
  { title: '[รอข้อมูล] สอนท่าพื้นฐาน Freestyle', youtube: '' },
];

export const NATIONAL_TEAM = Array.from({ length: 8 }, (_, i) => ({ name: `[รอข้อมูล] นักกีฬา ${i + 1}`, role: ['Speed', 'Freestyle', 'Double Dutch', 'Speed'][i % 4] }));

export const RESULTS = [
  ['[รอข้อมูล] 2026', 'IJRU World Jump Rope Championships', '[รอข้อมูล] ชื่อนักกีฬา', 'เหรียญทองแดง · Speed Sprint'],
  ['[รอข้อมูล] 2025', 'Asian Jump Rope Championships', '[รอข้อมูล] ชื่อนักกีฬา', 'เหรียญเงิน · Double Dutch'],
  ['[รอข้อมูล] 2025', 'Asian Jump Rope Championships', '[รอข้อมูล] ชื่อนักกีฬา', 'เหรียญทอง · Single Rope Freestyle'],
];

// รูปสำรองของแต่ละหน้า (ใช้เมื่อยังไม่มี doc ใน siteImages)
export const SITE_IMAGE_FALLBACK = {
  'home-about': PHOTOS.outdoor2,
  'organisation-hero': PHOTOS.coach,
  'news-hero': PHOTOS.arena,
  'competition-hero': PHOTOS.court,
  'downloads-hero': PHOTOS.rope,
  'media-hero': PHOTOS.outdoor,
  'about-jumprope-hero': PHOTOS.woman,
  'contact-hero': PHOTOS.arena,
  'national-team': PHOTOS.gymMan2,
};
