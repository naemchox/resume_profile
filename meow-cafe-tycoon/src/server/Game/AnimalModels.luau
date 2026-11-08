--[[
	ตัวลูกค้าทำจากรูปทรงพื้นฐาน (ออกแบบเอง ไม่ใช้โมเดลจาก Creator Store)
	สไตล์: ชิบิ หัวโต ตัวกลม แบบตุ๊กตาโมจิ

	โครงของทุกตัว:
	  Root       (ล่องหน Anchored อยู่ที่เท้า) ← สคริปต์เลื่อนชิ้นนี้ชิ้นเดียว
	  Body       ต่อกับ Root ด้วย Weld "Bob" (ขยับ C0 ขึ้นลง = เด้งตัวตอนเดิน)
	  TailPivot  ต่อกับ Body ด้วย Weld "Wag" (หมุน C0 = หางแกว่ง) ชิ้น Tail* ทั้งหมดติดกับมัน
	  ชิ้นอื่นทั้งหมด Weld (กำหนด C0) ติดกับ Body
	หน้าของสัตว์หัน -Z (LookVector) จึงใช้ CFrame.lookAt หันไปทางที่เดินได้ตรง ๆ

	ทรงรีใช้ Part + SpecialMesh (Sphere) ซึ่งยืดตาม Size ของ Part ได้ทุกแกน
	ทุกตัวเลขในไฟล์นี้เป็น "หน่วยออกแบบ" แล้วคูณ SCALE ตอนสร้าง (ไม่ใช้ Model:ScaleTo)

	มีแล้ว: แมว (6A), หมา (ข้อ 7), แพนด้า (ข้อ 8), ยูนิคอร์น (ข้อ 9)
]]

local TweenService = game:GetService("TweenService")

local Util = require(script.Parent.Parent.Map.Util)

local AnimalModels = {}

-- ขนาดตัวลูกค้า (หน่วยออกแบบสูง ~4.4 · ×1.4 = ~6 studs พ้นเคาน์เตอร์)
AnimalModels.SCALE = 1.4
local S = AnimalModels.SCALE

local WHITE = Color3.fromRGB(255, 252, 248)
local PINK = Color3.fromRGB(255, 168, 196)
local BLUSH = Color3.fromRGB(255, 140, 170)
local EYE_DARK = Color3.fromRGB(40, 30, 44)
local NOSE = Color3.fromRGB(255, 120, 160)

-- ลายขน 2 แบบ (ผู้ใช้เลือก 5 พ.ย.: แมวส้ม + แมวลายสลิด)
-- แมวส้ม: ส้มสด ลายจาง ๆ ที่หน้าผาก
-- ลายสลิด: น้ำตาลเทา ลายเข้มทั้งหน้าผาก แก้ม ข้างตัว และหางเป็นปล้อง
local PATTERNS = {
	{ fur = Color3.fromRGB(255, 170, 88), accent = Color3.fromRGB(232, 122, 48) },
	{ fur = Color3.fromRGB(156, 140, 120), accent = Color3.fromRGB(84, 70, 60), fullStripes = true },
}

local APRONS = {
	Color3.fromRGB(255, 170, 196), -- ชมพู
	Color3.fromRGB(158, 224, 204), -- มิ้นต์
	Color3.fromRGB(202, 182, 242), -- ม่วงลาเวนเดอร์
	Color3.fromRGB(255, 224, 140), -- เหลือง
}

export type Animal = {
	model: Model,
	root: BasePart,
	head: BasePart,
	bob: Weld,
	bobBase: CFrame,
	wag: Weld?,
	wagBase: CFrame?,
	eyes: { BasePart },
	sparkles: { BasePart },
	wagTime: number?, -- วินาทีต่อการแกว่ง 1 ข้าง (หมาแกว่งเร็วกว่าแมว)
	wagAngle: number?,
}

local function pick<T>(list: { T }): T
	return list[math.random(1, #list)]
end

-- หน่วยออกแบบ → studs
local function sv(x: number, y: number, z: number): Vector3
	return Vector3.new(x, y, z) * S
end
local function at(x: number, y: number, z: number): CFrame
	return CFrame.new(sv(x, y, z))
end

-- ทรงรี (Part + SpecialMesh Sphere)
local function blob(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3, props: { [string]: any }?): BasePart
	local p = props or {}
	p.Size = size
	p.CFrame = cf
	p.Color = color
	local part = Util.part(parent, name, p)
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = part
	return part
end

local function ball(parent: Instance, name: string, d: number, cf: CFrame, color: Color3, props: { [string]: any }?): BasePart
	local p = props or {}
	p.Shape = Enum.PartType.Ball
	p.Size = Vector3.new(d, d, d) * S
	p.CFrame = cf
	p.Color = color
	return Util.part(parent, name, p)
end

-- เชื่อมทุกชิ้น แล้วปลด Anchored ให้เลื่อนตาม Root ได้
local function rig(model: Model, root: BasePart, body: BasePart, tailPivot: BasePart): (Weld, Weld)
	local bob, wag
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") then
			p.CanCollide = false
			p.CanTouch = false
			p.CanQuery = false
			p.Massless = true
			p.CastShadow = p == body
			if p ~= root then
				p.Anchored = false
			end
			if p ~= root then
				local isTail = p ~= tailPivot and string.sub(p.Name, 1, 4) == "Tail"
				local part0 = (p == body and root) or (isTail and tailPivot) or body
				local w = Instance.new("Weld")
				w.Part0 = part0
				w.Part1 = p
				w.C0 = part0.CFrame:Inverse() * p.CFrame
				w.Parent = p
				if p == body then
					w.Name = "Bob"
					bob = w
				elseif p == tailPivot then
					w.Name = "Wag"
					wag = w
				end
			end
		end
	end
	model.PrimaryPart = root
	return bob, wag
end

local function addBow(model: Model, center: CFrame, color: Color3)
	for i, side in { -1, 1 } do
		blob(model, "BowLoop" .. i, sv(0.5, 0.38, 0.24), center * CFrame.new(sv(side * 0.26, 0, 0)) * CFrame.Angles(0, 0, math.rad(side * 22)), color)
	end
	ball(model, "BowKnot", 0.2, center, color)
end

local function addFlower(model: Model, center: CFrame)
	local petal = pick({ WHITE, Color3.fromRGB(255, 200, 225), Color3.fromRGB(200, 225, 255) })
	for i = 1, 5 do
		local a = math.rad(i * 72)
		ball(model, "Petal" .. i, 0.26, center * CFrame.new(sv(math.cos(a) * 0.2, math.sin(a) * 0.2, 0)), petal)
	end
	ball(model, "FlowerCenter", 0.2, center * CFrame.new(sv(0, 0, -0.04)), Color3.fromRGB(255, 214, 90))
end

function AnimalModels.cat(): Animal
	local look = pick(PATTERNS)
	local fur = look.fur
	local white = WHITE
	local apron = pick(APRONS)

	local model = Instance.new("Model")
	model.Name = "Cat"

	local root = Util.part(model, "Root", { Size = sv(1, 0.2, 1), CFrame = CFrame.new(), Transparency = 1 })

	-- ── ตัว ──
	local body = blob(model, "Body", sv(2.2, 2.1, 2.2), at(0, 1.12, 0), fur)
	blob(model, "ChestFluff", sv(1.0, 0.55, 0.45), at(0, 1.75, -0.82), white)
	for i, side in { -1, 1 } do
		blob(model, "FrontPaw" .. i, sv(0.62, 0.45, 0.7), at(side * 0.48, 0.22, -0.78), white)
		blob(model, "BackFoot" .. i, sv(0.7, 0.45, 0.8), at(side * 0.8, 0.22, 0.35), white)
	end

	-- ── ผ้ากันเปื้อน (ธีมคาเฟ่) ──
	blob(model, "Apron", sv(1.45, 1.2, 0.45), at(0, 0.95, -0.92), apron)
	blob(model, "ApronFrill", sv(1.6, 0.45, 0.45), at(0, 0.42, -0.85), WHITE)
	blob(model, "ApronPocket", sv(0.45, 0.3, 0.12), at(0.28, 0.85, -1.12), WHITE)
	Util.cylinder(model, "ApronString", at(0, 1.3, 0), 0.1 * S, 2.24 * S, { Color = apron })
	addBow(model, at(0, 1.35, 1.12), apron)

	-- ── หัว (ทรงแป้นแบบโมจิ + แก้มฟู) ──
	local head = blob(model, "Head", sv(3.0, 2.5, 2.6), at(0, 3.1, -0.1), fur)
	for i, side in { -1, 1 } do
		blob(model, "CheekFluff" .. i, sv(1.0, 0.8, 0.9), at(side * 1.3, 2.7, -0.35), fur)
	end
	blob(model, "Muzzle", sv(1.1, 0.6, 0.4), at(0, 2.65, -1.2), white)

	-- ── หน้า ──
	local eyes, sparkles = {}, {}
	for i, side in { -1, 1 } do
		local x = side * 0.62
		table.insert(eyes, blob(model, "Eye" .. i, sv(0.5, 0.66, 0.3), at(x, 3.1, -1.25), EYE_DARK))
		-- ไฮไลต์ 2 จุด ไปทางเดียวกันทั้งสองตา ให้ดูวิบวับ
		table.insert(sparkles, ball(model, "Sparkle" .. i, 0.2, at(x - 0.1, 3.26, -1.38), WHITE))
		table.insert(sparkles, ball(model, "SparkleSmall" .. i, 0.1, at(x + 0.1, 2.96, -1.37), WHITE))
		blob(model, "Blush" .. i, sv(0.48, 0.26, 0.25), at(side * 1.0, 2.68, -0.95), BLUSH, { Transparency = 0.15 })
	end
	blob(model, "Nose", sv(0.26, 0.18, 0.15), at(0, 2.82, -1.37), NOSE)
	local mouth = Util.part(model, "Mouth", {
		Size = sv(0.6, 0.32, 0.05),
		CFrame = at(0, 2.58, -1.42),
		Transparency = 1,
	})
	Util.surfaceText(mouth, Enum.NormalId.Front, "ω", Color3.fromRGB(90, 56, 70))

	-- ── ลายขน ──
	-- ลายหน้าผาก 3 เส้น (ทั้งสองแบบ)
	for i, x in { -0.3, 0, 0.3 } do
		blob(model, "Stripe" .. i, sv(0.16, 0.42, 0.16), at(x, 3.95, x == 0 and -1.0 or -0.97), look.accent)
	end
	if look.fullStripes then
		for i, side in { -1, 1 } do
			-- หนวดลาย 2 เส้นที่แก้ม
			blob(model, "CheekStripeA" .. i, sv(0.4, 0.08, 0.12), at(side * 1.45, 2.82, -0.68) * CFrame.Angles(0, 0, math.rad(side * 10)), look.accent)
			blob(model, "CheekStripeB" .. i, sv(0.4, 0.08, 0.12), at(side * 1.48, 2.62, -0.66) * CFrame.Angles(0, 0, math.rad(side * -6)), look.accent)
			-- ลายข้างตัว 2 เส้น
			blob(model, "BodyStripeA" .. i, sv(0.18, 0.7, 0.3), at(side * 1.04, 1.3, 0), look.accent)
			blob(model, "BodyStripeB" .. i, sv(0.18, 0.6, 0.3), at(side * 0.92, 1.35, 0.5), look.accent)
		end
	end

	-- ── หู (ใหญ่ เอียงออกนิด ๆ ในหูชมพู) ──
	for _, side in { -1, 1 } do
		local tag = side < 0 and "L" or "R"
		local base = at(side * 0.88, 3.95, -0.1) * CFrame.Angles(0, 0, -side * math.rad(14)) * CFrame.Angles(0, math.pi, 0)
		Util.ear(model, "Ear" .. tag, base, 1.25 * S, 1.2 * S, 0.35 * S, fur)
		Util.ear(model, "EarInner" .. tag, base * CFrame.new(0, 0.1 * S, 0.19 * S), 0.72 * S, 0.75 * S, 0.06 * S, PINK)
	end

	-- ── หางฟู งอเป็นตะขอ ปลายขาว ──
	local tailPivot = Util.part(model, "TailPivot", { Size = sv(0.3, 0.3, 0.3), CFrame = at(0, 0.95, 1.0), Transparency = 1 })
	ball(model, "Tail1", 0.62, at(0, 1.05, 1.25), fur)
	-- ลายสลิด: หางเป็นปล้องเข้มสลับ
	ball(model, "Tail2", 0.6, at(0, 1.55, 1.55), look.fullStripes and look.accent or fur)
	ball(model, "Tail3", 0.58, at(0, 2.1, 1.62), fur)
	ball(model, "TailTip", 0.62, at(0, 2.6, 1.45), white)

	-- ── ของแต่งสุ่ม ──
	local accessory = pick({ "Bow", "Bell", "Flower" })
	if accessory == "Bow" then
		addBow(model, at(1.05, 3.85, -0.55), Color3.fromRGB(255, 120, 170))
	elseif accessory == "Bell" then
		Util.cylinder(model, "Collar", at(0, 1.95, 0), 0.2 * S, 1.62 * S, { Color = Color3.fromRGB(235, 90, 110) })
		ball(model, "Bell", 0.38, at(0, 1.9, -0.82), Color3.fromRGB(255, 206, 84), { Material = Enum.Material.Metal })
	else
		addFlower(model, at(-1.05, 3.85, -0.58))
	end

	local bob, wag = rig(model, root, body, tailPivot)
	return {
		model = model,
		root = root,
		head = head,
		bob = bob,
		bobBase = bob.C0,
		wag = wag,
		wagBase = wag.C0,
		eyes = eyes,
		sparkles = sparkles,
		wagTime = 0.7,
		wagAngle = 22,
	}
end

-- ── หมา (6B ข้อ 7) ─────────────────────────────────────
-- ชิบิแบบเดียวกับแมว แต่: หูตกห้อย จมูกดำ ปากกระบอกยื่น ลิ้นแลบ คิ้วจุด ผ้าพันคอแทนผ้ากันเปื้อน หางสั้นแกว่งเร็ว

local DOG_PATTERNS = {
	{ fur = Color3.fromRGB(244, 192, 120), ears = Color3.fromRGB(206, 140, 80) }, -- ทอง
	{ fur = Color3.fromRGB(178, 126, 90), ears = Color3.fromRGB(120, 80, 56) }, -- น้ำตาล
	{ fur = Color3.fromRGB(252, 238, 212), ears = Color3.fromRGB(214, 172, 128), eyePatch = true }, -- ครีม มีปื้นรอบตา
}
local BANDANAS = {
	Color3.fromRGB(235, 92, 104), -- แดง
	Color3.fromRGB(110, 162, 236), -- ฟ้า
	Color3.fromRGB(255, 206, 92), -- เหลือง
	Color3.fromRGB(130, 206, 152), -- เขียว
}
local DOG_NOSE = Color3.fromRGB(48, 36, 44)
local TONGUE = Color3.fromRGB(255, 128, 150)

function AnimalModels.dog(): Animal
	local look = pick(DOG_PATTERNS)
	local fur = look.fur
	local bandana = pick(BANDANAS)

	local model = Instance.new("Model")
	model.Name = "Dog"

	local root = Util.part(model, "Root", { Size = sv(1, 0.2, 1), CFrame = CFrame.new(), Transparency = 1 })

	-- ── ตัว ──
	local body = blob(model, "Body", sv(2.2, 2.1, 2.2), at(0, 1.12, 0), fur)
	blob(model, "ChestFluff", sv(1.0, 0.7, 0.45), at(0, 1.45, -0.9), WHITE)
	for i, side in { -1, 1 } do
		blob(model, "FrontPaw" .. i, sv(0.62, 0.45, 0.7), at(side * 0.48, 0.22, -0.78), WHITE)
		blob(model, "BackFoot" .. i, sv(0.7, 0.45, 0.8), at(side * 0.8, 0.22, 0.35), fur)
	end

	-- ── ผ้าพันคอ: ปลอกคอ + ผ้าสามเหลี่ยมชี้ลง ──
	Util.cylinder(model, "Collar", at(0, 1.95, 0), 0.22 * S, 1.66 * S, { Color = bandana })
	Util.ear(model, "Bandana", at(0, 2.05, -0.92) * CFrame.Angles(0, 0, math.pi) * CFrame.Angles(0, math.pi, 0), 1.5 * S, 0.95 * S, 0.12 * S, bandana)

	-- ── หัว ──
	local head = blob(model, "Head", sv(2.9, 2.4, 2.6), at(0, 3.05, -0.1), fur)
	blob(model, "Muzzle", sv(1.4, 0.85, 0.7), at(0, 2.6, -1.15), WHITE)
	blob(model, "Nose", sv(0.42, 0.3, 0.25), at(0, 2.85, -1.5), DOG_NOSE)
	blob(model, "Tongue", sv(0.3, 0.36, 0.15), at(0.12, 2.3, -1.42), TONGUE)
	local mouth = Util.part(model, "Mouth", {
		Size = sv(0.6, 0.32, 0.05),
		CFrame = at(0, 2.5, -1.52),
		Transparency = 1,
	})
	Util.surfaceText(mouth, Enum.NormalId.Front, "ω", Color3.fromRGB(90, 56, 70))

	if look.eyePatch then
		blob(model, "EyePatch", sv(0.9, 0.85, 0.4), at(0.62, 3.15, -1.12), look.ears)
	end

	local eyes, sparkles = {}, {}
	for i, side in { -1, 1 } do
		local x = side * 0.62
		table.insert(eyes, blob(model, "Eye" .. i, sv(0.5, 0.66, 0.3), at(x, 3.15, -1.23), EYE_DARK))
		table.insert(sparkles, ball(model, "Sparkle" .. i, 0.2, at(x - 0.1, 3.31, -1.36), WHITE))
		table.insert(sparkles, ball(model, "SparkleSmall" .. i, 0.1, at(x + 0.1, 3.01, -1.35), WHITE))
		blob(model, "Blush" .. i, sv(0.48, 0.26, 0.25), at(side * 1.0, 2.7, -0.95), BLUSH, { Transparency = 0.15 })
		-- คิ้วจุด
		blob(model, "Brow" .. i, sv(0.26, 0.16, 0.1), at(side * 0.55, 3.65, -1.1), WHITE)
		-- หูตกห้อยข้างหัว ปลายบนเอียงเข้าหาหัว
		blob(model, "FloppyEar" .. i, sv(0.75, 1.4, 0.35), at(side * 1.35, 3.4, -0.1) * CFrame.Angles(0, 0, math.rad(side * 20)), look.ears)
	end

	-- ── หางสั้นชี้ขึ้น ──
	local tailPivot = Util.part(model, "TailPivot", { Size = sv(0.3, 0.3, 0.3), CFrame = at(0, 1.0, 1.0), Transparency = 1 })
	ball(model, "TailBase", 0.55, at(0, 1.25, 1.2), fur)
	ball(model, "TailTip", 0.5, at(0, 1.65, 1.3), WHITE)

	local bob, wag = rig(model, root, body, tailPivot)
	return {
		model = model,
		root = root,
		head = head,
		bob = bob,
		bobBase = bob.C0,
		wag = wag,
		wagBase = wag.C0,
		eyes = eyes,
		sparkles = sparkles,
		wagTime = 0.22,
		wagAngle = 30,
	}
end

-- ── แพนด้า (6B ข้อ 8) ──────────────────────────────────
-- ตัวใหญ่กว่า 15% · ขาวดำ หูกลมดำ ปื้นตาเอียง แขนขาดำ หูกระต่ายแดงที่คอ ใบไผ่บนหัว

local PANDA_BIG = 1.15
local PANDA_WHITE = Color3.fromRGB(252, 250, 246)
local PANDA_BLACK = Color3.fromRGB(46, 44, 52)
local LEAF = Color3.fromRGB(120, 200, 110)

function AnimalModels.panda(): Animal
	local model = Instance.new("Model")
	model.Name = "Panda"

	-- หน่วยออกแบบของแพนด้า × PANDA_BIG
	local function pv(x: number, y: number, z: number): Vector3
		return sv(x, y, z) * PANDA_BIG
	end
	local function pat(x: number, y: number, z: number): CFrame
		return CFrame.new(pv(x, y, z))
	end

	local root = Util.part(model, "Root", { Size = sv(1, 0.2, 1), CFrame = CFrame.new(), Transparency = 1 })

	-- ── ตัว ──
	local body = blob(model, "Body", pv(2.4, 2.2, 2.3), pat(0, 1.15, 0), PANDA_WHITE)
	blob(model, "ShoulderBand", pv(2.3, 0.8, 2.2), pat(0, 1.75, 0), PANDA_BLACK)
	for i, side in { -1, 1 } do
		blob(model, "Arm" .. i, pv(0.7, 0.9, 0.75), pat(side * 0.85, 1.0, -0.6) * CFrame.Angles(0, 0, math.rad(side * 12)), PANDA_BLACK)
		blob(model, "BackFoot" .. i, pv(0.8, 0.5, 0.9), pat(side * 0.8, 0.25, 0.35), PANDA_BLACK)
	end
	addBow(model, pat(0, 1.95, -0.98), Color3.fromRGB(235, 80, 96))

	-- ── หัว ──
	local head = blob(model, "Head", pv(3.0, 2.6, 2.6), pat(0, 3.2, -0.05), PANDA_WHITE)
	for i, side in { -1, 1 } do
		ball(model, "Ear" .. i, 0.95 * PANDA_BIG, pat(side * 1.05, 4.25, -0.05), PANDA_BLACK)
	end
	blob(model, "Muzzle", pv(1.0, 0.55, 0.35), pat(0, 2.65, -1.2), Color3.fromRGB(255, 246, 236))
	blob(model, "Nose", pv(0.36, 0.24, 0.2), pat(0, 2.8, -1.32), PANDA_BLACK)
	local mouth = Util.part(model, "Mouth", {
		Size = pv(0.6, 0.32, 0.05),
		CFrame = pat(0, 2.55, -1.39),
		Transparency = 1,
	})
	Util.surfaceText(mouth, Enum.NormalId.Front, "ω", Color3.fromRGB(90, 56, 70))

	local eyes, sparkles = {}, {}
	for i, side in { -1, 1 } do
		local x = side * 0.62
		-- ปื้นตาเอียงลงด้านนอก แบบหยดน้ำ
		blob(model, "EyePatch" .. i, pv(0.75, 0.95, 0.35), pat(x, 3.2, -1.15) * CFrame.Angles(0, 0, math.rad(side * 25)), PANDA_BLACK)
		table.insert(eyes, blob(model, "Eye" .. i, pv(0.38, 0.5, 0.25), pat(x, 3.22, -1.31), EYE_DARK))
		table.insert(sparkles, ball(model, "Sparkle" .. i, 0.2 * PANDA_BIG, pat(x - 0.08, 3.36, -1.43), WHITE))
		table.insert(sparkles, ball(model, "SparkleSmall" .. i, 0.1 * PANDA_BIG, pat(x + 0.08, 3.1, -1.42), WHITE))
		blob(model, "Blush" .. i, pv(0.45, 0.24, 0.24), pat(side * 1.05, 2.75, -0.95), BLUSH, { Transparency = 0.15 })
	end

	-- ใบไผ่ 2 ใบบนหัว
	blob(model, "Leaf1", pv(0.35, 0.12, 0.8), pat(0.25, 4.5, -0.1) * CFrame.Angles(0, math.rad(30), math.rad(15)), LEAF)
	blob(model, "Leaf2", pv(0.35, 0.12, 0.8), pat(-0.05, 4.52, -0.05) * CFrame.Angles(0, math.rad(-35), math.rad(-10)), LEAF)

	-- ── หางกลมขาวเล็ก ๆ ──
	local tailPivot = Util.part(model, "TailPivot", { Size = sv(0.3, 0.3, 0.3), CFrame = pat(0, 0.85, 1.05), Transparency = 1 })
	ball(model, "TailBall", 0.5 * PANDA_BIG, pat(0, 0.95, 1.25), PANDA_WHITE)

	local bob, wag = rig(model, root, body, tailPivot)
	return {
		model = model,
		root = root,
		head = head,
		bob = bob,
		bobBase = bob.C0,
		wag = wag,
		wagBase = wag.C0,
		eyes = eyes,
		sparkles = sparkles,
		wagTime = 0.9,
		wagAngle = 12,
	}
end

-- ── ยูนิคอร์น (6B ข้อ 9, หายาก) ────────────────────────────
-- ขาวมุก เขาเกลียวสีรุ้ง แผงคอกับหางสีรุ้งพาสเทล ขนตางอน กีบม่วง ประกายรุ้งรอบตัว

local UNI_WHITE = Color3.fromRGB(255, 250, 253)
local HOOF = Color3.fromRGB(202, 182, 242)
local RAINBOW = {
	Color3.fromRGB(255, 170, 204), -- ชมพู
	Color3.fromRGB(206, 174, 255), -- ม่วง
	Color3.fromRGB(150, 206, 255), -- ฟ้า
	Color3.fromRGB(150, 232, 200), -- มิ้นต์
	Color3.fromRGB(255, 222, 130), -- ทอง
}

function AnimalModels.unicorn(): Animal
	local model = Instance.new("Model")
	model.Name = "Unicorn"

	local root = Util.part(model, "Root", { Size = sv(1, 0.2, 1), CFrame = CFrame.new(), Transparency = 1 })

	-- ── ตัว ──
	local body = blob(model, "Body", sv(2.2, 2.1, 2.2), at(0, 1.12, 0), UNI_WHITE)
	for i, side in { -1, 1 } do
		blob(model, "FrontHoof" .. i, sv(0.62, 0.45, 0.7), at(side * 0.48, 0.22, -0.78), HOOF)
		blob(model, "BackHoof" .. i, sv(0.7, 0.45, 0.8), at(side * 0.8, 0.22, 0.35), HOOF)
	end

	-- ── หัว ──
	local head = blob(model, "Head", sv(3.0, 2.5, 2.6), at(0, 3.1, -0.1), UNI_WHITE)
	blob(model, "Muzzle", sv(1.3, 0.8, 0.6), at(0, 2.6, -1.15), Color3.fromRGB(255, 232, 240))
	for i, side in { -1, 1 } do
		blob(model, "Nostril" .. i, sv(0.12, 0.1, 0.06), at(side * 0.22, 2.75, -1.44), Color3.fromRGB(220, 150, 180))
	end
	local mouth = Util.part(model, "Mouth", {
		Size = sv(0.6, 0.32, 0.05),
		CFrame = at(0, 2.5, -1.45),
		Transparency = 1,
	})
	Util.surfaceText(mouth, Enum.NormalId.Front, "ω", Color3.fromRGB(90, 56, 70))

	local eyes, sparkles = {}, {}
	for i, side in { -1, 1 } do
		local x = side * 0.62
		table.insert(eyes, blob(model, "Eye" .. i, sv(0.5, 0.66, 0.3), at(x, 3.1, -1.25), EYE_DARK))
		table.insert(sparkles, ball(model, "Sparkle" .. i, 0.2, at(x - 0.1, 3.26, -1.38), WHITE))
		table.insert(sparkles, ball(model, "SparkleSmall" .. i, 0.1, at(x + 0.1, 2.96, -1.37), WHITE))
		-- ขนตางอนที่หางตา
		blob(model, "Lash" .. i, sv(0.1, 0.26, 0.08), at(side * 0.95, 3.38, -1.13) * CFrame.Angles(0, 0, math.rad(-side * 35)), EYE_DARK)
		blob(model, "Blush" .. i, sv(0.48, 0.26, 0.25), at(side * 1.0, 2.68, -0.95), BLUSH, { Transparency = 0.15 })
	end

	-- หูเล็กแหลม
	for _, side in { -1, 1 } do
		local tag = side < 0 and "L" or "R"
		local base = at(side * 0.8, 4.05, -0.05) * CFrame.Angles(0, 0, -side * math.rad(18)) * CFrame.Angles(0, math.pi, 0)
		Util.ear(model, "Ear" .. tag, base, 0.6 * S, 0.85 * S, 0.25 * S, UNI_WHITE)
		Util.ear(model, "EarInner" .. tag, base * CFrame.new(0, 0.08 * S, 0.14 * S), 0.32 * S, 0.5 * S, 0.05 * S, PINK)
	end

	-- เขาเกลียว: ทรงกระบอกซ้อนเล็กลงเรื่อย ๆ สลับสี เอียงไปข้างหน้า 15°
	local hornBase = at(0, 4.2, -0.55) * CFrame.Angles(math.rad(-15), 0, 0)
	local height = 0.32
	for i, d in { 0.5, 0.4, 0.3, 0.2 } do
		Util.cylinder(model, "Horn" .. i, hornBase * CFrame.new(0, (i - 1) * height * S, 0), height * S, d * S, { Color = RAINBOW[(i - 1) % #RAINBOW + 1] })
	end
	ball(model, "HornTip", 0.15, hornBase * CFrame.new(0, 4 * height * S, 0), RAINBOW[5])

	-- แผงคอสีรุ้ง (หน้าม้า + ไล่ลงหลังหัว)
	blob(model, "Forelock", sv(0.75, 0.5, 0.6), at(0.4, 4.1, -0.8) * CFrame.Angles(0, 0, math.rad(-20)), RAINBOW[1])
	blob(model, "Mane1", sv(0.95, 0.75, 0.95), at(0, 4.2, 0.35), RAINBOW[1])
	blob(model, "Mane2", sv(0.95, 0.75, 0.95), at(0, 3.7, 0.95), RAINBOW[2])
	blob(model, "Mane3", sv(0.9, 0.7, 0.9), at(0, 3.1, 1.2), RAINBOW[3])
	blob(model, "Mane4", sv(0.85, 0.65, 0.85), at(0, 2.5, 1.05), RAINBOW[4])

	-- หางสีรุ้ง
	local tailPivot = Util.part(model, "TailPivot", { Size = sv(0.3, 0.3, 0.3), CFrame = at(0, 1.0, 1.0), Transparency = 1 })
	ball(model, "Tail1", 0.62, at(0, 1.15, 1.3), RAINBOW[1])
	ball(model, "Tail2", 0.6, at(0, 1.55, 1.6), RAINBOW[2])
	ball(model, "Tail3", 0.58, at(0, 2.0, 1.7), RAINBOW[3])
	ball(model, "TailTip", 0.6, at(0, 2.45, 1.55), RAINBOW[4])

	-- ประกายรุ้งรอบตัว (ใช้ภาพประกายที่ติดมากับ Roblox)
	local glitter = Instance.new("ParticleEmitter")
	glitter.Name = "Glitter"
	glitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	glitter.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, RAINBOW[1]),
		ColorSequenceKeypoint.new(0.33, RAINBOW[2]),
		ColorSequenceKeypoint.new(0.66, RAINBOW[3]),
		ColorSequenceKeypoint.new(1, RAINBOW[5]),
	})
	glitter.LightEmission = 1
	glitter.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 0) })
	glitter.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(1, 1) })
	glitter.Lifetime = NumberRange.new(0.8, 1.4)
	glitter.Rate = 14
	glitter.Speed = NumberRange.new(1.5, 3)
	glitter.SpreadAngle = Vector2.new(180, 180)
	glitter.Parent = body

	local bob, wag = rig(model, root, body, tailPivot)
	return {
		model = model,
		root = root,
		head = head,
		bob = bob,
		bobBase = bob.C0,
		wag = wag,
		wagBase = wag.C0,
		eyes = eyes,
		sparkles = sparkles,
		wagTime = 0.6,
		wagAngle = 25,
	}
end

-- สร้างตามชนิด (ชื่อตรงกับ Config.Animals)
AnimalModels.builders = {
	Cat = AnimalModels.cat,
	Dog = AnimalModels.dog,
	Panda = AnimalModels.panda,
	Unicorn = AnimalModels.unicorn,
}

-- ท่าทางตอนมีชีวิต: หางแกว่ง + กะพริบตา (เรียกหลังใส่ตัวลงแมพแล้ว)
-- หยุดเองเมื่อตัวถูกลบ
function AnimalModels.startIdle(animal: Animal)
	if animal.wag and animal.wagBase then
		local angle = math.rad(animal.wagAngle or 22)
		animal.wag.C0 = animal.wagBase * CFrame.Angles(0, -angle, 0)
		TweenService:Create(
			animal.wag,
			TweenInfo.new(animal.wagTime or 0.7, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
			{ C0 = animal.wagBase * CFrame.Angles(0, angle, 0) }
		):Play()
	end

	task.spawn(function()
		while animal.model.Parent do
			task.wait(math.random(25, 55) / 10)
			if not animal.model.Parent then
				break
			end
			for _, eye in animal.eyes do
				(eye:FindFirstChildOfClass("SpecialMesh") :: SpecialMesh).Scale = Vector3.new(1, 0.12, 1)
			end
			for _, s in animal.sparkles do
				s.Transparency = 1
			end
			task.wait(0.12)
			for _, eye in animal.eyes do
				local mesh = eye:FindFirstChildOfClass("SpecialMesh")
				if mesh then
					mesh.Scale = Vector3.new(1, 1, 1)
				end
			end
			for _, s in animal.sparkles do
				s.Transparency = 0
			end
		end
	end)
end

return AnimalModels
