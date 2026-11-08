// ข้อมูลตัวอย่าง ใช้แสดงเมื่อ FIREBASE_READY === false หรือ Firestore ยังว่าง
// โครงเหมือน Firestore ใน CONTRACT.md ทุก field (วันที่ใช้ Date แทน Timestamp)
import { IMG, PHOTOS as P } from './content.js';

const ago = h => new Date(Date.now() - h * 3600e3);
const d = (y, m, day) => new Date(y, m - 1, day);

export const SEED = {
  banners: [
    { id: 'b1', imageUrl: IMG(P.outdoor, 1920), title: 'ชิงแชมป์ประเทศไทย 2026 เปิดรับสมัครแล้ว', subtitle: 'การแข่งขัน', linkUrl: 'competition.html', linkLabel: 'สมัคร', order: 1, active: true },
    { id: 'b2', imageUrl: IMG(P.gymWoman, 1920), title: 'ทีมชาติไทยเตรียมลุยศึกชิงแชมป์เอเชีย', subtitle: 'ทีมชาติ', linkUrl: 'about-jump-rope.html#national-team', linkLabel: 'อ่าน', order: 2, active: true },
    { id: 'b3', imageUrl: IMG(P.coach, 1920), title: 'อบรมผู้ตัดสินมาตรฐาน IJRU รุ่นที่ 5', subtitle: 'ประกาศ', linkUrl: 'news.html?cat=announcement', linkLabel: 'อ่าน', order: 3, active: true },
    { id: 'b4', imageUrl: IMG(P.girl, 1920), title: 'กระโดดเชือกในโรงเรียน สร้างเด็กไทยแข็งแรง', subtitle: 'สังคมและชุมชน', linkUrl: 'news.html?cat=community', linkLabel: 'อ่าน', order: 4, active: true },
  ],

  news: [
    { id: 'n1', title: 'เปิดรับสมัครชิงแชมป์ประเทศไทย 2026 ทุกรุ่นอายุ', category: 'competition', excerpt: 'สมาคมฯ เปิดรับสมัครนักกีฬาและสโมสรทั่วประเทศ เข้าร่วมการแข่งขันชิงแชมป์ประเทศไทย 4 วันเต็ม', body: 'สมาคมกีฬาตัวอย่างขอเชิญนักกีฬา สโมสร และโรงเรียนทั่วประเทศ เข้าร่วมการแข่งขันชิงแชมป์ประเทศไทย ประจำปี 2026\n\nการแข่งขันมีทั้งประเภท Speed, Freestyle และ Double Dutch แบ่งตามรุ่นอายุตามกติกา IJRU\n\nดูรายละเอียดและสมัครได้ที่หน้าการแข่งขัน', coverUrl: IMG(P.outdoor), publishedAt: ago(3), status: 'published', featured: true },
    { id: 'n2', title: 'ประกาศรายชื่อนักกีฬาทีมชาติไทย ชุดชิงแชมป์เอเชีย', category: 'announcement', excerpt: 'คณะกรรมการคัดเลือกประกาศรายชื่อนักกีฬา 12 คน พร้อมผู้ฝึกสอน', body: 'คณะกรรมการคัดเลือกนักกีฬาได้พิจารณาผลการแข่งขันคัดตัว และประกาศรายชื่อนักกีฬาทีมชาติไทยจำนวน 12 คน\n\nนักกีฬาจะเข้าค่ายเก็บตัวฝึกซ้อมก่อนเดินทางไปแข่งขัน', coverUrl: IMG(P.gymWoman), publishedAt: ago(9), status: 'published', featured: false },
    { id: 'n3', title: 'อบรมผู้ตัดสินมาตรฐาน IJRU รุ่นที่ 5', category: 'announcement', excerpt: 'เปิดรับสมัครผู้สนใจเข้าอบรมผู้ตัดสินระดับ 1 จำนวน 40 ที่นั่ง', body: 'สมาคมฯ จัดอบรมผู้ตัดสินกีฬากระโดดเชือกตามมาตรฐาน IJRU ระดับ 1\n\nผู้ผ่านการอบรมจะได้รับใบรับรองและมีสิทธิ์ตัดสินการแข่งขันในประเทศ', coverUrl: IMG(P.coach), publishedAt: ago(28), status: 'published', featured: false },
    { id: 'n4', title: 'กระโดดเชือกในโรงเรียน: โครงการร่วมกับกรมอนามัย', category: 'community', excerpt: 'ส่งเสริมการออกกำลังกายในเด็กวัยเรียน นำร่อง 50 โรงเรียนทั่วประเทศ', body: 'สมาคมฯ ร่วมกับกรมอนามัยเปิดโครงการกระโดดเชือกในโรงเรียน\n\nครูพลศึกษาจะได้รับการอบรมและอุปกรณ์สำหรับจัดกิจกรรมในโรงเรียน', coverUrl: IMG(P.girl), publishedAt: ago(52), status: 'published', featured: false },
    { id: 'n5', title: 'สมาคมฯ ลงนามความร่วมมือกับพันธมิตรใหม่', category: 'press', excerpt: 'ร่วมพัฒนากีฬากระโดดเชือกไทยสู่ระดับสากลในอีก 3 ปีข้างหน้า', body: 'สมาคมกีฬาตัวอย่างลงนามบันทึกความร่วมมือกับพันธมิตร เพื่อสนับสนุนการพัฒนานักกีฬาและการจัดการแข่งขัน', coverUrl: IMG(P.woman), publishedAt: ago(80), status: 'published', featured: false },
    { id: 'n6', title: 'สรุปผลการแข่งขันรายการ Jump Rope Open ภาคเหนือ', category: 'competition', excerpt: 'นักกีฬากว่า 300 คนร่วมแข่งขัน ที่เชียงใหม่', body: 'การแข่งขันรายการ Jump Rope Open ภาคเหนือจบลงอย่างยิ่งใหญ่ มีนักกีฬากว่า 300 คนจาก 25 สโมสร', coverUrl: IMG(P.shoes), publishedAt: ago(130), status: 'published', featured: false },
    { id: 'n7', title: 'แถลงข่าวการแข่งขันชิงแชมป์ประเทศไทย 2026', category: 'press', excerpt: 'เตรียมความพร้อมสนาม ผู้ตัดสิน และระบบจับเวลา', body: 'สมาคมฯ จัดแถลงข่าวการแข่งขันชิงแชมป์ประเทศไทย 2026 พร้อมเปิดตัวระบบจับเวลาใหม่', coverUrl: IMG(P.arena), publishedAt: ago(200), status: 'published', featured: false },
    { id: 'n8', title: 'Jump Rope Day ที่สวนลุมพินี ครอบครัวร่วมกิจกรรมคึกคัก', category: 'community', excerpt: 'กิจกรรมเปิดให้ทุกวัยลองกระโดดเชือก พร้อมการแสดงจากนักกีฬาทีมชาติ', body: 'กิจกรรม Jump Rope Day ที่สวนลุมพินีมีผู้เข้าร่วมกว่า 1,000 คน', coverUrl: IMG(P.outdoor2), publishedAt: ago(320), status: 'published', featured: false },
  ],

  events: [
    { id: 'e1', title: 'Jump Rope Open ภาคกลาง', type: 'other', startDate: d(2026, 11, 14), endDate: d(2026, 11, 15), location: 'อาคารกีฬาเวสน์ 2 ศูนย์กีฬาแห่งชาติ', description: 'การแข่งขันระดับภูมิภาค เปิดให้สโมสรและโรงเรียนในภาคกลางเข้าร่วม', coverUrl: IMG(P.court), registerUrl: '#', status: 'published' },
    { id: 'e2', title: 'ชิงแชมป์ประเทศไทย 2026', type: 'major', startDate: d(2026, 12, 10), endDate: d(2026, 12, 13), location: 'กรุงเทพมหานคร', description: 'รายการหลักประจำปี แข่งขัน 4 วัน ครบทุกประเภทและทุกรุ่นอายุ\n\nใช้ผลการแข่งขันประกอบการคัดเลือกนักกีฬาทีมชาติ', coverUrl: IMG(P.arena), registerUrl: '#', status: 'published' },
    { id: 'e3', title: 'Jump Rope Open ภาคอีสาน', type: 'other', startDate: d(2027, 2, 6), endDate: d(2027, 2, 7), location: 'ขอนแก่น', description: 'การแข่งขันระดับภูมิภาค', coverUrl: '', registerUrl: '', status: 'published' },
    { id: 'e4', title: 'Jump Rope Open ภาคใต้', type: 'other', startDate: d(2027, 4, 10), endDate: d(2027, 4, 11), location: 'สงขลา', description: 'การแข่งขันระดับภูมิภาค', coverUrl: '', registerUrl: '', status: 'published' },
    { id: 'e5', title: 'Thailand Jump Rope Cup 2027', type: 'major', startDate: d(2027, 6, 17), endDate: d(2027, 6, 20), location: 'กรุงเทพมหานคร', description: 'รายการหลักกลางปี แข่งขัน 4 วัน', coverUrl: '', registerUrl: '', status: 'published' },
    { id: 'e0', title: 'Jump Rope Open ภาคเหนือ', type: 'other', startDate: d(2026, 9, 12), endDate: d(2026, 9, 13), location: 'เชียงใหม่', description: 'การแข่งขันระดับภูมิภาค', coverUrl: '', registerUrl: '', status: 'published' },
  ],

  albums: [
    { id: 'a1', title: 'Jump Rope Open ภาคเหนือ 2026', eventId: 'e0', date: d(2026, 9, 12), coverUrl: IMG(P.shoes, 900), photoCount: 8, status: 'published' },
    { id: 'a2', title: 'Jump Rope Day สวนลุมพินี', eventId: '', date: d(2026, 8, 20), coverUrl: IMG(P.outdoor2, 900), photoCount: 6, status: 'published' },
    { id: 'a3', title: 'Thailand Jump Rope Cup 2026', eventId: '', date: d(2026, 6, 18), coverUrl: IMG(P.arena, 900), photoCount: 8, status: 'published' },
    { id: 'a4', title: 'อบรมผู้ตัดสิน รุ่นที่ 4', eventId: '', date: d(2026, 5, 2), coverUrl: IMG(P.coach, 900), photoCount: 5, status: 'published' },
    { id: 'a5', title: 'ค่ายเก็บตัวทีมชาติ', eventId: '', date: d(2026, 3, 15), coverUrl: IMG(P.gymWoman, 900), photoCount: 6, status: 'published' },
    { id: 'a6', title: 'กระโดดเชือกในโรงเรียน', eventId: '', date: d(2026, 2, 10), coverUrl: IMG(P.girl, 900), photoCount: 6, status: 'published' },
  ],
};

const POOL = [P.outdoor, P.gymWoman, P.coach, P.gymMan2, P.girl, P.woman, P.shoes, P.outdoor2, P.arena, P.court];
export function seedPhotos(album) {
  const start = album.id.charCodeAt(1) % POOL.length;
  return Array.from({ length: album.photoCount }, (_, i) => {
    const id = POOL[(start + i) % POOL.length];
    return { id: `${album.id}-p${i}`, url: IMG(id, 1600), thumb: IMG(id, 600), caption: '', order: i };
  });
}
