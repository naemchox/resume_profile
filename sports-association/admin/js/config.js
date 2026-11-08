// ค่าคงที่ของหน้าแอดมิน แก้ที่นี่ที่เดียว

// ลิงก์ "ดูหน้าเว็บจริง"
export const SITE_URL = 'https://samplesport.com';

// หน้าเว็บหลักที่ใช้แสดง "ตัวอย่าง" ในกรอบ (ดู PREVIEW.md)
// เปิดแอดมินจากเครื่องตัวเอง:
// - เซิร์ฟเวอร์ที่เห็นทั้งโปรเจกต์ (เช่น VS Code Live Server: …/admin/banners.html) → ใช้โฟลเดอร์ site ข้าง ๆ บนเซิร์ฟเวอร์เดียวกัน
// - เปิดเฉพาะโฟลเดอร์ admin → ใช้เซิร์ฟเวอร์ทดสอบของหน้าหลัก (site/README.md: พอร์ต 5610)
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const ADMIN_DIR = location.pathname.lastIndexOf('/admin/');
const LOCAL_SITE_URL = ADMIN_DIR >= 0
  ? location.origin + location.pathname.slice(0, ADMIN_DIR) + '/site'
  : 'http://127.0.0.1:5610';
export const PREVIEW_SITE_URL = LOCAL ? LOCAL_SITE_URL : SITE_URL;

// รูปประจำหน้าแต่ละ key อยู่หน้าไหนของเว็บหลัก [ชื่อแท็บ, path]
export const SITE_IMAGE_PAGES = {
  'home-about': [['หน้าแรก', 'index.html']],
  'organisation-hero': [['ORGANISATION', 'organisation.html']],
  'news-hero': [['NEWS', 'news.html']],
  'competition-hero': [['COMPETITION', 'competition.html']],
  'downloads-hero': [['DOWNLOADS', 'downloads.html']],
  'media-hero': [['MEDIA', 'media.html']],
  'about-jumprope-hero': [['ABOUT JUMP ROPE', 'about-jump-rope.html']],
  'contact-hero': [['CONTACT US', 'contact.html']],
  'national-team': [['ABOUT JUMP ROPE', 'about-jump-rope.html'], ['หน้าแรก', 'index.html']]
};

// กรอบ "หน้าเว็บตอนนี้" บนแต่ละหน้า (live.js): ดูคอลเลกชันไหน + แสดงส่วนไหนของเว็บหลัก
// pages: [ชื่อแท็บ, path, id ของส่วนที่จะแสดง (คั่นด้วย ,)] ดู PREVIEW.md หัวข้อ 6
export const LIVE_VIEWS = {
  news: { watch: 'news', pages: [
    ['หน้าแรก › ข่าวล่าสุด', 'index.html', 'latestNews'],
    ['หน้า NEWS', 'news.html', 'lead,newsList']
  ] },
  banners: { watch: 'banners', pages: [
    ['หน้าแรก › แบนเนอร์', 'index.html', 'hero']
  ] },
  events: { watch: 'events', pages: [
    ['หน้าแรก › การแข่งขันที่กำลังจะมาถึง', 'index.html', 'upcomingEvents'],
    ['หน้า COMPETITION', 'competition.html', 'calendar,details']
  ] },
  albums: { watch: 'albums', pages: [
    ['หน้าแรก › อัลบั้มล่าสุด', 'index.html', 'latestAlbums'],
    ['หน้า MEDIA', 'media.html', 'photos']
  ] },
  'site-images': { watch: 'siteImages', pages: [
    ['ORGANISATION', 'organisation.html', 'pageHero'],
    ['NEWS', 'news.html', 'pageHero'],
    ['COMPETITION', 'competition.html', 'pageHero'],
    ['DOWNLOADS', 'downloads.html', 'pageHero'],
    ['MEDIA', 'media.html', 'pageHero'],
    ['ABOUT JUMP ROPE', 'about-jump-rope.html', 'pageHero'],
    ['CONTACT US', 'contact.html', 'pageHero'],
    ['ทีมชาติ (หน้าแรก)', 'index.html', 'nationalTeam'],
    ['ทีมชาติ (ABOUT)', 'about-jump-rope.html', 'national-team']
  ] }
};

// กรอบเส้นประในตัวปรับตำแหน่งรูป (focal.js): [ชื่อ, สัดส่วน กว้าง/สูง] ตามที่เว็บหลักครอปรูปจริง
// วัดจากหน้าเว็บที่ความกว้าง 1280 (คอม), 1920 (จอกว้าง) และ 390 (มือถือ) เมื่อ 30 ต.ค. 2569
// ถ้าหน้าเว็บเปลี่ยนขนาดกรอบรูป ให้แก้ตัวเลขที่นี่
export const IMAGE_FRAMES = {
  news: [['การ์ดข่าว / ข่าวเด่น', 16 / 9], ['หัวบทความ (คอม)', 21 / 9], ['หัวบทความ (มือถือ)', 4 / 3]],
  banner: [['แบนเนอร์ (คอม)', 1200 / 580], ['แบนเนอร์ (จอกว้าง)', 1840 / 580], ['แบนเนอร์ (มือถือ)', 390 / 593]],
  event: [['หน้า COMPETITION', 16 / 10]],
  pageHero: [['หัวหน้า (คอม)', 1200 / 377], ['หัวหน้า (จอกว้าง)', 1840 / 377], ['หัวหน้า (มือถือ)', 390 / 229]],
  pageHeroChips: [['หัวหน้า (คอม)', 1200 / 420], ['หัวหน้า (จอกว้าง)', 1840 / 420], ['หัวหน้า (มือถือ)', 390 / 267]],
  feature: [['ส่วนทีมชาติ (คอม)', 672 / 580], ['ส่วนทีมชาติ (มือถือ)', 4 / 3]]
};

export const NEWS_CATEGORIES = {
  announcement: 'ประกาศ (Announcement)',
  press: 'ข่าวประชาสัมพันธ์ (Press Release)',
  community: 'สังคมและชุมชน (Social & Community)',
  competition: 'การแข่งขัน (Competition)'
};

export const EVENT_TYPES = {
  major: 'รายการหลัก',
  other: 'รายการอื่น'
};

export const STATUS_LABELS = {
  published: 'เผยแพร่',
  draft: 'ฉบับร่าง'
};

// key ของ siteImages ตาม CONTRACT.md · frames = ชื่อชุดใน IMAGE_FRAMES ([] = หน้าเว็บยังไม่ได้ใช้รูปนี้)
export const SITE_IMAGE_KEYS = [
  { key: 'home-about', label: 'หน้าแรก: ส่วนแนะนำสมาคม', hint: 'แนวนอน ประมาณ 1600×1000', frames: [] },
  { key: 'organisation-hero', label: 'ORGANISATION: รูปหัวหน้า', hint: 'แนวนอน 1920×600', frames: 'pageHero' },
  { key: 'news-hero', label: 'NEWS: รูปหัวหน้า', hint: 'แนวนอน 1920×600', frames: 'pageHeroChips' },
  { key: 'competition-hero', label: 'COMPETITION: รูปหัวหน้า', hint: 'แนวนอน 1920×600', frames: 'pageHeroChips' },
  { key: 'downloads-hero', label: 'DOWNLOADS: รูปหัวหน้า', hint: 'แนวนอน 1920×600', frames: 'pageHero' },
  { key: 'media-hero', label: 'MEDIA: รูปหัวหน้า', hint: 'แนวนอน 1920×600', frames: 'pageHero' },
  { key: 'about-jumprope-hero', label: 'ABOUT JUMP ROPE: รูปหัวหน้า', hint: 'แนวนอน 1920×600', frames: 'pageHero' },
  { key: 'contact-hero', label: 'CONTACT US: รูปหัวหน้า', hint: 'แนวนอน 1920×600', frames: 'pageHero' },
  { key: 'national-team', label: 'ทีมชาติไทย (Thailand National Team)', hint: 'แนวนอน ประมาณ 1600×1000', frames: 'feature' }
];

// ขนาดย่อรูปตาม CONTRACT.md
export const IMAGE_MAX_SIDE = 1920;
export const ALBUM_MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.85;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
