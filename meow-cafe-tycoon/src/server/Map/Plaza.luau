--[[
	ลานกลาง: ถนนยาวระหว่างแถวร้านเหนือ-ใต้ (x -130..130, z -40..40)
	มีน้ำพุแมวตรงกลาง จุดเกิดผู้เล่น ป้ายโบนัสรายวัน ม้านั่ง โคมไฟ
]]

local Util = require(script.Parent.Util)
local Palette = require(script.Parent.Palette)

local Plaza = {}

local function v(x: number, y: number, z: number): Vector3
	return Vector3.new(x, y, z)
end

local function buildFountain(parent: Instance)
	local f = Instance.new("Model")
	f.Name = "CatFountain"
	local root = CFrame.new()

	Util.cylinder(f, "Basin", root, 1.5, 16, { Color = Palette.Plaza, Material = Enum.Material.Slate })
	Util.cylinder(f, "Water", root * CFrame.new(0, 1.45, 0), 0.2, 14, {
		Color = Palette.Water,
		Material = Enum.Material.Glass,
		Transparency = 0.25,
		CanCollide = false,
	})
	Util.cylinder(f, "Pedestal", root * CFrame.new(0, 1.5, 0), 3, 3, { Color = Palette.Trim })

	-- รูปปั้นแมวทำจากทรงง่าย ๆ (ออกแบบเอง)
	local cat = Palette.StatueCat
	Util.part(f, "CatBody", { Shape = Enum.PartType.Ball, Size = v(4, 4, 4), CFrame = CFrame.new(0, 6.4, 0), Color = cat })
	Util.part(f, "CatHead", { Shape = Enum.PartType.Ball, Size = v(3.4, 3.4, 3.4), CFrame = CFrame.new(0, 9.4, 0.3), Color = cat })
	for _, x in { -0.9, 0.9 } do
		Util.ear(f, x < 0 and "CatEarL" or "CatEarR", CFrame.new(x, 10.5, 0.3), 1.4, 1.5, 0.4, cat)
		Util.part(f, x < 0 and "CatEyeL" or "CatEyeR", {
			Shape = Enum.PartType.Ball,
			Size = v(0.5, 0.5, 0.5),
			CFrame = CFrame.new(x * 0.7, 9.7, 1.85),
			Color = Palette.Text,
		})
	end
	Util.part(f, "CatTail", {
		Size = v(0.6, 3, 0.6),
		CFrame = CFrame.new(0, 6.8, -2.2) * CFrame.Angles(math.rad(-30), 0, 0),
		Color = cat,
	})

	f.Parent = parent
end

local function buildBench(parent: Instance, cf: CFrame)
	local m = Instance.new("Model")
	m.Name = "Bench"
	Util.part(m, "Seat", {
		ClassName = "Seat",
		Size = v(6, 0.6, 2),
		CFrame = cf * CFrame.new(0, 1.8, 0),
		Color = Palette.Wood,
	})
	-- คนนั่งหันไปทาง LookVector (-Z) พนักพิงจึงอยู่ฝั่ง +Z
	Util.part(m, "Back", { Size = v(6, 2, 0.4), CFrame = cf * CFrame.new(0, 3, 0.8), Color = Palette.Wood })
	for _, x in { -2.4, 2.4 } do
		Util.part(m, "Leg", { Size = v(0.5, 1.5, 1.6), CFrame = cf * CFrame.new(x, 0.75, 0), Color = Palette.Trunk })
	end
	m.Parent = parent
end

function Plaza.build(parent: Instance): Folder
	local plaza = Instance.new("Folder")
	plaza.Name = "Plaza"

	Util.box(plaza, "Ground", CFrame.new(), v(-130, -1, -40), v(130, 0, 40), { Color = Palette.Plaza })

	buildFountain(plaza)

	local spawn = Util.part(plaza, "SpawnLocation", {
		ClassName = "SpawnLocation",
		Size = v(6, 1, 6),
		CFrame = CFrame.new(24, 0.5, 0),
		Color = Palette.Spawn,
	}) :: SpawnLocation
	spawn.Neutral = true
	spawn.Duration = 0

	-- ป้ายโบนัสรายวัน (ตอนนี้แค่ป้าย ระบบทำในสัปดาห์ 4)
	local board = Util.part(plaza, "DailyBonusBoard", {
		Size = v(0.6, 5, 10),
		CFrame = CFrame.new(-24, 5.5, 0),
		Color = Palette.Trim,
	})
	Util.surfaceText(board, Enum.NormalId.Right, "Daily Bonus\nComing soon", Palette.Text)
	for _, z in { -4.5, 4.5 } do
		Util.part(plaza, "BoardPost", { Size = v(0.6, 3, 0.6), CFrame = CFrame.new(-24, 1.5, z), Color = Palette.Wood })
	end

	-- ม้านั่งรอบน้ำพุ หันหน้าเข้าน้ำพุ
	for _, p in { v(0, 0, 13), v(0, 0, -13), v(-13, 0, 9), v(13, 0, -9) } do
		buildBench(plaza, CFrame.lookAt(p, v(0, 0, 0)))
	end

	for _, x in { -45, 45, -135 + 5, 135 - 5 } do
		for _, z in { -34, 34 } do
			Util.lamp(plaza, CFrame.new(x, 0, z), Palette.LampPost, Palette.LampGlow)
		end
	end

	plaza.Parent = parent
	return plaza
end

return Plaza
