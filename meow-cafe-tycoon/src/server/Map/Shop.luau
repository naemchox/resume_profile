--[[
	ร้านต้นแบบ 1 ช่อง (80×80 studs) เรียกซ้ำ 6 ครั้งได้ 6 ร้านหน้าตาเดียวกัน

	พิกัด local ของช่อง: กึ่งกลางช่อง = (0, 0, 0), ผิวพื้นหญ้า y = 0
	+Z = หน้าร้าน (หันหาลานกลาง), -Z = หลังร้าน

	ผังคร่าว ๆ (มองจากบน):
	  z -36..-30  สถานี 5 ช่อง (เปิด 3: Coffee, Bakery, Shake)
	  z -25..-23  เคาน์เตอร์ (ช่องเดินเข้าหลังเคาน์เตอร์อยู่ฝั่งขวา x 16..25)
	  z -19..5    จุดต่อคิว Q1..Q5 กลางร้าน (ห่างกัน 6)
	  x ±15       โต๊ะ 6 ชุด (เปิด 2)
	  z 14        ผนังหน้า + ประตู กว้าง 8
	  z 14..40    ลานหน้าร้าน ทางเดิน ป้าย แท่นจองร้าน
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Util = require(script.Parent.Util)
local Palette = require(script.Parent.Palette)

local Shop = {}

local function v(x: number, y: number, z: number): Vector3
	return Vector3.new(x, y, z)
end

-- ขอบเขตตัวร้าน
local MIN_X, MAX_X = -26, 26
local MIN_Z, MAX_Z = -36, 14
local WALL_TOP = 14
local FLOOR_TOP = 0.6

local MENUS = {
	{ id = "Coffee", label = "Coffee", color = Palette.Coffee },
	{ id = "Bakery", label = "Bakery", color = Palette.Bakery },
	{ id = "Shake", label = "Milkshake", color = Palette.Shake },
	{ id = "Slot4", label = "Soon", locked = true },
	{ id = "Slot5", label = "Soon", locked = true },
}

local TABLES = {
	{ x = -15, z = -14 }, -- Table1 (เปิด)
	{ x = 15, z = -14 }, -- Table2 (เปิด)
	{ x = -15, z = -4 },
	{ x = 15, z = -4 },
	{ x = -15, z = 6 },
	{ x = 15, z = 6 },
}
local START_TABLES = Config.Customers.StartTables -- เปิดเพิ่มด้วยอัปเกรด Seats (UpgradeService)

-- ระยะห่างระหว่างจุดต่อคิว (เดิม 4 แมวตัวใหญ่ขึ้นแล้วยืนเบียดกัน · 6 = Q1 z -19 ถึง Q5 z 5 ยังห่างประตู)
local QUEUE_GAP = 6

local function folder(parent: Instance, name: string): Folder
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent
	return f
end

local function model(parent: Instance, name: string): Model
	local m = Instance.new("Model")
	m.Name = name
	m.Parent = parent
	return m
end

local function buildShell(plot: Model, o: CFrame)
	local b = model(plot, "Building")

	-- พื้นร้าน + พื้นไม้หลังเคาน์เตอร์
	Util.box(b, "Floor", o, v(MIN_X, 0, MIN_Z), v(MAX_X, FLOOR_TOP, MAX_Z), { Color = Palette.Floor })
	Util.box(b, "StaffFloor", o, v(MIN_X + 1, FLOOR_TOP, MIN_Z + 1), v(MAX_X - 1, FLOOR_TOP + 0.05, -25.5), { Color = Palette.StaffFloor })

	-- ผนังซ้าย ขวา หลัง
	local wall = { Color = Palette.Wall }
	Util.box(b, "WallLeft", o, v(MIN_X, FLOOR_TOP, MIN_Z), v(MIN_X + 1, WALL_TOP, MAX_Z), table.clone(wall))
	Util.box(b, "WallRight", o, v(MAX_X - 1, FLOOR_TOP, MIN_Z), v(MAX_X, WALL_TOP, MAX_Z), table.clone(wall))
	Util.box(b, "WallBack", o, v(MIN_X + 1, FLOOR_TOP, MIN_Z), v(MAX_X - 1, WALL_TOP, MIN_Z + 1), table.clone(wall))

	-- ผนังหน้า: 2 ฝั่งประตู มีหน้าต่างบานใหญ่ ให้คนข้างนอกมองเห็นร้าน
	local fz1, fz2 = MAX_Z - 1, MAX_Z
	local function frontSegment(tag: string, xa: number, xb: number)
		Util.box(b, "Front" .. tag .. "Low", o, v(xa, FLOOR_TOP, fz1), v(xb, 4, fz2), table.clone(wall))
		Util.box(b, "Front" .. tag .. "High", o, v(xa, 10, fz1), v(xb, WALL_TOP, fz2), table.clone(wall))
		Util.box(b, "Front" .. tag .. "PillarA", o, v(xa, 4, fz1), v(xa + 2, 10, fz2), { Color = Palette.Trim })
		Util.box(b, "Front" .. tag .. "PillarB", o, v(xb - 2, 4, fz1), v(xb, 10, fz2), { Color = Palette.Trim })
		Util.box(b, "Window" .. tag, o, v(xa + 2, 4, fz1 + 0.4), v(xb - 2, 10, fz2 - 0.4), {
			Color = Palette.Glass,
			Material = Enum.Material.Glass,
			Transparency = 0.55,
		})
	end
	frontSegment("L", MIN_X + 1, -4)
	frontSegment("R", 4, MAX_X - 1)
	Util.box(b, "AboveDoor", o, v(-4, 10, fz1), v(4, WALL_TOP, fz2), table.clone(wall))
	Util.box(b, "Awning", o, v(-6, 10.2, MAX_Z), v(6, 10.8, MAX_Z + 3), { Color = Palette.Awning })

	-- หลังคา + หูแมว (จุดเด่นเห็นจากไกล)
	Util.box(b, "Roof", o, v(MIN_X - 1, WALL_TOP, MIN_Z - 1), v(MAX_X + 1, WALL_TOP + 1, MAX_Z + 1), { Color = Palette.Roof })
	-- หูแมวขยับออกด้านข้าง เปิดที่ให้ป้ายชื่อร้านใหญ่ขึ้น
	for _, x in { -20, 20 } do
		local tag = x < 0 and "L" or "R"
		Util.ear(b, "Ear" .. tag, o * CFrame.new(x, WALL_TOP + 1, 6), 10, 8, 2, Palette.Roof)
		Util.ear(b, "EarInner" .. tag, o * CFrame.new(x, WALL_TOP + 1, 7.1), 6, 5, 0.2, Palette.EarInner)
	end

	-- ไฟเพดาน
	for i, z in { -24, -10, 4 } do
		local light = Util.box(b, "CeilingLight" .. i, o, v(-3, WALL_TOP - 0.4, z - 1), v(3, WALL_TOP, z + 1), {
			Color = Palette.LampGlow,
			Material = Enum.Material.Neon,
			CastShadow = false,
		})
		local pl = Instance.new("PointLight")
		pl.Range = 28
		pl.Brightness = 0.9
		pl.Color = Palette.LampGlow
		pl.Parent = light
	end
end

local function buildSign(plot: Model, o: CFrame)
	-- ป้ายกว้าง 28 สูง 8 (เดิม 20×5.5 อ่านไม่ออกจากลานกลาง)
	local sign = Util.box(plot, "Sign", o, v(-14, WALL_TOP + 1, MAX_Z - 1), v(14, WALL_TOP + 9, MAX_Z), { Color = Palette.Trim })
	Util.surfaceText(sign, Enum.NormalId.Back, "Meow Meow Café", Palette.Text, {
		position = UDim2.fromScale(0.04, 0.05),
		size = UDim2.fromScale(0.92, 0.6),
	})
	local owner = Util.surfaceText(sign, Enum.NormalId.Back, "Free shop", Palette.Claim, {
		position = UDim2.fromScale(0.1, 0.66),
		size = UDim2.fromScale(0.8, 0.28),
	})
	owner.Name = "OwnerLabel"
end

local function buildCounterAndStations(plot: Model, o: CFrame)
	local counter = model(plot, "Counter")
	Util.box(counter, "Base", o, v(MIN_X + 1, FLOOR_TOP, -25.5), v(16, 4, -22.5), { Color = Palette.Wood })
	Util.box(counter, "Top", o, v(MIN_X + 1, 4, -25.8), v(16.3, 4.5, -22.2), { Color = Palette.CounterTop })

	local stations = folder(plot, "Stations")
	for i, menu in MENUS do
		local x = -20 + (i - 1) * 10
		local m = model(stations, menu.id)
		m:SetAttribute("MenuId", menu.id)
		m:SetAttribute("Unlocked", not menu.locked)

		local base = Util.box(m, "Base", o, v(x - 2.5, FLOOR_TOP, -35), v(x + 2.5, 4, -30), {
			Color = menu.locked and Palette.Locked or Palette.CounterTop,
			Transparency = menu.locked and 0.5 or 0,
		})
		m.PrimaryPart = base
		-- ป้ายลอยเหนือสถานี (ป้ายที่ฐานโดนเคาน์เตอร์บังจากฝั่งลูกค้า)
		-- วางที่ขอบหน้าสถานี ห่างผนังหลัง 5 studs ป้ายกว้าง 5 จึงไม่จมผนัง
		Util.billboard(base, menu.label, Vector3.new(0, 5.5, 2.5), 5)
		if not menu.locked then
			Util.box(m, "Machine", o, v(x - 1.5, 4, -34.5), v(x + 1.5, 7, -32), { Color = menu.color })
		end
	end
end

-- ถังขยะหลังเคาน์เตอร์ ชิดผนังซ้ายข้างสถานีกาแฟ (ไม่ขวางทางเดินหลังเคาน์เตอร์)
-- ไว้ทิ้งของที่ทำผิด
local function buildTrash(plot: Model, o: CFrame)
	local trash = model(plot, "TrashBin")
	local body = Util.cylinder(trash, "Body", o * CFrame.new(-23.5, FLOOR_TOP, -28), 3.2, 2.6, { Color = Palette.Shake })
	Util.cylinder(trash, "Lid", o * CFrame.new(-23.5, FLOOR_TOP + 3.2, -28), 0.3, 2.9, { Color = Palette.Trim })
	trash.PrimaryPart = body
	-- Cylinder ถูกหมุนให้แกน X ชี้ขึ้น offset "ขึ้นข้างบน" จึงเป็นแกน X
	Util.billboard(body, "Trash", Vector3.new(3.4, 0, 0), 4)
end

local function buildKiosk(plot: Model, o: CFrame)
	local kiosk = model(plot, "UpgradeKiosk")
	-- ชิดผนังซ้าย หันจอเข้ากลางร้าน (+X) ไม่บังสถานีกาแฟ
	local base = Util.box(kiosk, "Base", o, v(MIN_X + 1, FLOOR_TOP, -20.5), v(MIN_X + 4, 5, -17.5), { Color = Palette.Kiosk })
	Util.box(kiosk, "Screen", o, v(MIN_X + 3.4, 5, -20.2), v(MIN_X + 4, 7.5, -17.8), {
		Color = Palette.Screen,
	})
	kiosk.PrimaryPart = base
	-- ขยับป้ายออกจากผนังซ้าย 2 studs (local +X = กลางร้าน)
	Util.billboard(base, "Upgrade", Vector3.new(2, 5, 0), 5)
end

local function buildQueueAndPath(plot: Model, o: CFrame)
	local queue = folder(plot, "Queue")
	for i = 1, 5 do
		local q = Util.marker(queue, "Q" .. i, o * CFrame.new(0, FLOOR_TOP + 0.1, -19 + (i - 1) * QUEUE_GAP))
		q:SetAttribute("Order", i)
	end

	-- เส้นทางลูกค้า: CustomerSpawn → WP1 → WP2 → WP3 (ในร้าน) → คิว / โต๊ะ
	-- ขาออกใช้เส้นเดิมย้อนกลับ
	local path = folder(plot, "Path")
	local points = {
		v(0, 0.2, 30),
		v(0, 0.2, 18),
		v(0, FLOOR_TOP + 0.1, 10),
	}
	for i, p in points do
		local wp = Util.marker(path, "WP" .. i, o * CFrame.new(p))
		wp:SetAttribute("Order", i)
	end
	-- ทางออก: เดินเลนซ้าย (x -7) ระหว่างแถวคิวกับโต๊ะ ไม่เดินทะลุแถวคิว
	-- ExitA = ข้างคิวหน้าสุด, ExitB = ใกล้ประตู แล้วต่อ WP3 → WP2 → WP1
	Util.marker(path, "ExitA", o * CFrame.new(-7, FLOOR_TOP + 0.1, -19))
	Util.marker(path, "ExitB", o * CFrame.new(-7, FLOOR_TOP + 0.1, 8))

	Util.marker(plot, "CustomerSpawn", o * CFrame.new(34, 0.2, 34))
end

local function buildSeats(plot: Model, o: CFrame)
	local seats = folder(plot, "Seats")
	for i, t in TABLES do
		local unlocked = i <= START_TABLES
		local m = model(seats, "Table" .. i)
		m:SetAttribute("Unlocked", unlocked)

		-- โต๊ะที่ยังล็อก: โปร่งใส เดินทะลุได้ ให้เห็นว่าอัปเกรดแล้วจะได้อะไร
		local function look(props: { [string]: any }): { [string]: any }
			if not unlocked then
				props.Transparency = 0.75
				props.CanCollide = false
			end
			return props
		end

		local x, z = t.x, t.z
		local top = Util.box(m, "Top", o, v(x - 2, 3, z - 2), v(x + 2, 3.4, z + 2), look({ Color = Palette.Wood }))
		Util.box(m, "Leg", o, v(x - 0.4, FLOOR_TOP, z - 0.4), v(x + 0.4, 3, z + 0.4), look({ Color = Palette.Wood }))
		m.PrimaryPart = top

		for c, side in { -1, 1 } do
			local cz = z + side * 3.5
			local chair = Util.box(m, "Chair" .. c, o, v(x - 1.2, FLOOR_TOP, cz - 1.2), v(x + 1.2, 2.2, cz + 1.2), look({ Color = Palette.Wall }))
			local backZ = cz + side * 1
			Util.box(m, "ChairBack" .. c, o, v(x - 1.2, 2.2, math.min(backZ, backZ + side * 0.4)), v(x + 1.2, 5, math.max(backZ, backZ + side * 0.4)), look({ Color = Palette.Wall }))

			-- จุดนั่งของลูกค้า หันหน้าเข้าโต๊ะ
			local sit = Instance.new("Attachment")
			sit.Name = "SitPoint"
			sit.CFrame = CFrame.lookAt(Vector3.new(0, 0.8, 0), Vector3.new(0, 0.8, -side))
			sit.Parent = chair
		end
	end
end

local function buildOutside(plot: Model, o: CFrame)
	local outside = folder(plot, "Outside")

	Util.box(outside, "Walkway", o, v(-4, 0, MAX_Z), v(4, 0.1, 40), { Color = Palette.Path })

	-- กระบะดอกไม้ใต้หน้าต่าง
	for _, xs in { { -23, -6 }, { 6, 23 } } do
		Util.box(outside, "FlowerBox", o, v(xs[1], 0, MAX_Z), v(xs[2], 1.5, MAX_Z + 2), { Color = Palette.Wood })
		Util.box(outside, "Flowers", o, v(xs[1] + 0.2, 1.5, MAX_Z + 0.2), v(xs[2] - 0.2, 2.1, MAX_Z + 1.8), {
			Color = Palette.Flowers,
			Material = Enum.Material.Grass,
		})
	end

	for _, p in { v(-34, 0, -34), v(34, 0, -34), v(-34, 0, 4), v(34, 0, 4) } do
		Util.tree(outside, o * CFrame.new(p), Palette.Trunk, Palette.Leaves)
	end
	for _, x in { -6, 6 } do
		Util.lamp(outside, o * CFrame.new(x, 0, 24), Palette.LampPost, Palette.LampGlow)
	end

	-- จุดเกิดของเจ้าของร้าน (ล่องหน) ข้างทางเดิน หันหน้าเข้าร้าน · ได้ร้านอัตโนมัติ ไม่มีแท่นจองแล้ว
	Util.marker(plot, "OwnerSpawn", o * CFrame.lookAt(v(-12, 0.2, 24), v(-12, 0.2, 0)))

	-- จุดวางของแต่ง (ล่องหน) ไว้ใช้กับของแต่งที่ขาย
	local slots = folder(plot, "DecorSlots")
	local decor = {
		{ p = v(-22, FLOOR_TOP, 10), kind = "Indoor" },
		{ p = v(22, FLOOR_TOP, 10), kind = "Indoor" },
		{ p = v(-22, FLOOR_TOP, -9), kind = "Indoor" },
		{ p = v(22, FLOOR_TOP, -9), kind = "Indoor" },
		{ p = v(-14, 0, 24), kind = "Outdoor" },
		{ p = v(14, 0, 24), kind = "Outdoor" },
	}
	for i, d in decor do
		local s = Util.marker(slots, "Slot" .. i, o * CFrame.new(d.p))
		s:SetAttribute("Kind", d.kind)
	end
end

-- สร้างร้าน 1 ช่อง ที่ตำแหน่ง origin (CFrame กึ่งกลางช่อง หัน +Z หาลานกลาง)
function Shop.build(parent: Instance, id: number, origin: CFrame): Model
	local plot = Instance.new("Model")
	plot.Name = "Plot" .. id
	plot:SetAttribute("PlotId", id)
	plot:SetAttribute("OwnerUserId", 0)

	local ground = Util.box(plot, "Ground", origin, v(-40, -1, -40), v(40, 0, 40), { Color = Palette.PlotGrass })
	plot.PrimaryPart = ground

	buildShell(plot, origin)
	buildSign(plot, origin)
	buildCounterAndStations(plot, origin)
	buildKiosk(plot, origin)
	buildTrash(plot, origin)
	buildQueueAndPath(plot, origin)
	buildSeats(plot, origin)
	buildOutside(plot, origin)

	plot.Parent = parent
	return plot
end

return Shop
