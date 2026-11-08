export interface Env {
  STATE: KVNamespace;
  LINE_CHANNEL_SECRET: string;
  /** ตั้งเป็น "dry" เพื่อพิมพ์ข้อความลง log แทนการส่งจริง (ใช้ทดสอบ) */
  LINE_CHANNEL_ACCESS_TOKEN: string;
}

export interface WatchItem {
  /** สัญลักษณ์แบบ Yahoo เช่น PTT.BK, AAPL */
  symbol: string;
  name: string;
}

/** ข้อมูลของผู้ใช้แต่ละคน — เก็บที่ key `user:<userId>` */
export interface UserState {
  watch: WatchItem[];
  /** รอบที่ผู้ใช้ตั้งเอง (นาที) — รอบจริงอาจยืดออกเพื่อแบ่งโควตา */
  intervalMin: number;
  paused: boolean;
  /** เวลาซื้อขายล่าสุด (วินาที) ที่ส่งไปแล้วของแต่ละหุ้น ใช้กันส่งซ้ำ */
  lastSeen: Record<string, number>;
}

/** ข้อมูลรวมของบอท — เก็บที่ key `meta` */
export interface Meta {
  /** userId ของเจ้าของบอท (คนแรกที่ทักมา) */
  owner?: string;
  /** คนที่ได้แจ้งเตือนอัตโนมัติ (รวมเจ้าของ) สูงสุด MAX_PUSH_USERS คน เรียงตามลำดับที่มา */
  users: string[];
  /** คนที่มาทีหลังตอนที่เต็มแล้ว — ใช้คำสั่งได้ แต่ไม่ได้แจ้งเตือนอัตโนมัติ */
  guests: string[];
}

export interface Quote {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  prevClose: number;
  /** เวลาซื้อขายล่าสุด (วินาที unix) */
  time: number;
}
