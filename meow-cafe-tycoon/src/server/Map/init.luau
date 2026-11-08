--[[
	สร้างแมพทั้งหมด: พื้นโลก + ลานกลาง + 6 ร้าน

	  เหนือ:  Plot1 (x -90)  Plot2 (x 0)  Plot3 (x 90)   z = -80
	  กลาง:   ลานกลาง z -40..40
	  ใต้:    Plot4 (x -90)  Plot5 (x 0)  Plot6 (x 90)   z = 80

	ทุกร้านหันหน้า (+Z local) เข้าหาลานกลาง
	เรียก Map.build() ซ้ำได้ จะลบของเก่าแล้วสร้างใหม่
]]

local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")

local Util = require(script.Util)
local Palette = require(script.Palette)
local Shop = require(script.Shop)
local Plaza = require(script.Plaza)

local Map = {}

Map.PLOT_ORIGINS = {
	CFrame.new(-90, 0, -80),
	CFrame.new(0, 0, -80),
	CFrame.new(90, 0, -80),
	CFrame.new(-90, 0, 80) * CFrame.Angles(0, math.pi, 0),
	CFrame.new(0, 0, 80) * CFrame.Angles(0, math.pi, 0),
	CFrame.new(90, 0, 80) * CFrame.Angles(0, math.pi, 0),
}

local HALF_X, HALF_Z = 150, 130

local function clearOld()
	for _, name in { "World", "Plaza", "Plots" } do
		local old = Workspace:FindFirstChild(name)
		if old then
			old:Destroy()
		end
	end
	-- Baseplate กับ SpawnLocation จากเทมเพลตของ Studio ทับพื้นของเรา
	for _, name in { "Baseplate", "SpawnLocation" } do
		local old = Workspace:FindFirstChild(name)
		if old and old:IsA("BasePart") then
			old:Destroy()
		end
	end
end

local function buildWorld(): Folder
	local world = Instance.new("Folder")
	world.Name = "World"

	-- พื้นหญ้าต่ำกว่าพื้นร้าน 0.2 ไม่ให้ผิวซ้อนกันจนกระพริบ
	Util.box(world, "Ground", CFrame.new(), Vector3.new(-HALF_X, -1.2, -HALF_Z), Vector3.new(HALF_X, -0.2, HALF_Z), {
		Color = Palette.WorldGrass,
	})

	-- กำแพงล่องหนรอบแมพ กันตกขอบ
	local bounds = Instance.new("Folder")
	bounds.Name = "Bounds"
	bounds.Parent = world
	local wall = { Transparency = 1, CastShadow = false }
	local h = 40
	Util.box(bounds, "North", CFrame.new(), Vector3.new(-HALF_X, -1, -HALF_Z - 1), Vector3.new(HALF_X, h, -HALF_Z), table.clone(wall))
	Util.box(bounds, "South", CFrame.new(), Vector3.new(-HALF_X, -1, HALF_Z), Vector3.new(HALF_X, h, HALF_Z + 1), table.clone(wall))
	Util.box(bounds, "West", CFrame.new(), Vector3.new(-HALF_X - 1, -1, -HALF_Z), Vector3.new(-HALF_X, h, HALF_Z), table.clone(wall))
	Util.box(bounds, "East", CFrame.new(), Vector3.new(HALF_X, -1, -HALF_Z), Vector3.new(HALF_X + 1, h, HALF_Z), table.clone(wall))

	world.Parent = Workspace
	return world
end

local function setLighting()
	-- ลดความสว่างลง ภาพแรกขาวจ้าจนสีพาสเทลหาย
	Lighting.ClockTime = 14.5
	Lighting.Brightness = 1.5
	Lighting.ExposureCompensation = -0.25
	Lighting.OutdoorAmbient = Color3.fromRGB(128, 120, 136)
end

function Map.build()
	clearOld()
	setLighting()
	buildWorld()
	Plaza.build(Workspace)

	local plots = Instance.new("Folder")
	plots.Name = "Plots"
	for id, origin in Map.PLOT_ORIGINS do
		Shop.build(plots, id, origin)
	end
	plots.Parent = Workspace
end

return Map
