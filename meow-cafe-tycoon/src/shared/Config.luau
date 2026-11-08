-- ค่าตั้งต้นของเกมทั้งหมด (PLAN.md ข้อ 9.3) ปรับตัวเลขที่นี่ที่เดียว

return {
	-- เมนู: id ต้องตรงกับชื่อสถานีในแมพ (Stations/Coffee, Bakery, Shake)
	Menus = {
		Coffee = { label = "Coffee", price = 5, makeTime = 2, color = Color3.fromRGB(140, 96, 72) },
		Bakery = { label = "Bakery", price = 8, makeTime = 3, color = Color3.fromRGB(246, 192, 112) },
		Shake = { label = "Milkshake", price = 12, makeTime = 4, color = Color3.fromRGB(152, 222, 232) },
	},

	Customers = {
		SpawnInterval = 8, -- วินาที ต่อ 1 ตัว (ถ้าคิวยังไม่เต็ม)
		FirstSpawnDelay = 2, -- ตัวแรกหลังจองร้าน
		MaxQueue = 5,
		SeatTime = 5, -- นั่งกินที่โต๊ะกี่วินาที
		WalkSpeed = 10, -- studs ต่อวินาที
		StartTables = 2, -- โต๊ะที่เปิดตอนยังไม่อัปเกรด (ในแมพมีทั้งหมด 6 ตัว)
	},

	-- ชนิดลูกค้า (PLAN.md ข้อ 9.2 จ. + 9.3)
	-- weight = โอกาสเกิด (เทียบกันเฉพาะชนิดที่ทำโมเดลแล้ว) · pay = ตัวคูณราคา
	Animals = {
		Cat = { weight = 60, pay = 1 },
		Dog = {
			weight = 25,
			pay = 1,
			patience = 20, -- วินาที นับตั้งแต่ถึงหน้าเคาน์เตอร์ หมดเวลา = เดินออกไม่จ่าย (ไม่หักเหรียญ)
			tipWindow = 8, -- เสิร์ฟภายในกี่วินาทีถึงได้ทิป
			tipBonus = 0.5, -- ทิปเพิ่ม 50%
		},
		Panda = {
			weight = 13,
			pay = 1.5, -- ×1.5 ทุกชิ้น
			orderCount = { 2, 3 }, -- สั่ง 2–3 อย่าง (ไม่ซ้ำกัน) เสิร์ฟทีละชิ้น
		},
		Unicorn = {
			weight = 2,
			pay = 10, -- ×10
			rare = true, -- ร้านหนึ่งมีได้ทีละตัว + ประกาศทั้งเซิร์ฟเวอร์
			cooldown = 120, -- วินาที หลังตัวล่าสุดมาถึง ถึงจะสุ่มเจออีก
			-- สุ่มเจอฟรีเท่านั้น ห้ามขายโอกาสเจอด้วยเงินจริง (PLAN.md หลักจริยธรรม)
		},
	},

	-- สวิตช์ทดสอบ (ทำงานเฉพาะใน Studio ในเกมจริงไม่มีผล)
	Debug = {
		ForceUnicorn = false, -- true = ลูกค้าตัวถัดไปเป็นยูนิคอร์นเสมอ (ข้ามโอกาส + เวลารอ)
		ResetData = false, -- true = เข้าเกมแล้วเริ่มใหม่จาก 0 (เหรียญ + อัปเกรด) แล้วเซฟทับข้อมูลทดสอบ
		StartCoins = 0, -- มากกว่า 0 เช่น 1000 = เข้าเกมแล้วมีเหรียญเท่านี้ ไว้ลองอัปเกรดเร็ว ๆ
	},

	-- ช่วยเสิร์ฟร้านคนอื่น: เดินไปที่เคาน์เตอร์ → กด Yes → เจ้าของได้แจ้งเตือน (กด Remove ไล่ได้) (PLAN.md 9.2 ฉ.)
	Helpers = {
		Bonus = 0.5, -- คนช่วยได้เพิ่ม 50% ของที่ลูกค้าจ่าย (สร้างเพิ่ม ไม่หักจากเจ้าของ)
		MaxHelpers = 3, -- ร้านหนึ่งมีคนช่วยได้พร้อมกันกี่คน
		NoticeTime = 6, -- แจ้งเตือนบนจอค้างกี่วินาที
	},

	-- เซฟข้อมูล (PLAN.md ข้อ 10.2) · Studio เก็บแยกชื่อ ..._Dev ข้อมูลผู้เล่นจริงไม่ปน
	Data = {
		StoreName = "MeowCafe_v1",
		AutoSave = 60, -- วินาที
	},

	-- อัปเกรด (PLAN.md ข้อ 10.3) · ราคาระดับถัดไป = cost × growth^ระดับปัจจุบัน
	Upgrades = {
		Speed = { label = "Speed", max = 5, cost = 40, growth = 1.8, step = 0.12 }, -- เวลาทำเมนู −12% ต่อระดับ
		Seats = { label = "Seats", max = 4, cost = 60, growth = 2, spawnStep = 1 }, -- โต๊ะ +1 และลูกค้ามาถี่ขึ้น 1 วิ ต่อระดับ
		Price = { label = "Price", max = 5, cost = 75, growth = 2, step = 0.2 }, -- ลูกค้าจ่าย +20% ต่อระดับ
	},
	UpgradeOrder = { "Speed", "Seats", "Price" }, -- ลำดับแถวในเมนูอัปเกรด

	Prompts = {
		StationDistance = 7,
		ServeDistance = 11, -- เสิร์ฟข้ามเคาน์เตอร์ได้
	},

	Sounds = {
		-- ใส่ asset id ของเสียงกระดิ่ง เช่น "rbxassetid://123456" (หาใน Toolbox → Audio)
		-- เว้นว่างไว้ = ไม่มีเสียง
		Coin = "",
		Unicorn = "", -- เสียงตอนยูนิคอร์นมาถึง (เว้นว่าง = ไม่มีเสียง)
	},
}
