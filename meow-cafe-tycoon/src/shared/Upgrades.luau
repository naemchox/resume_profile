--[[
	สูตรอัปเกรด (PLAN.md ข้อ 10.3) ใช้ทั้งสองฝั่ง
	เซิร์ฟเวอร์ใช้คิดผลจริง · ฝั่งผู้เล่นใช้โชว์ในเมนู (ก่อน → หลัง, ราคา) เท่านั้น
	ตัวเลขทั้งหมดอยู่ใน Config.Upgrades
]]

local Config = require(script.Parent.Config)

local Upgrades = {}

-- ราคาซื้อระดับถัดไป · เต็มแล้ว = nil
function Upgrades.cost(id: string, level: number): number?
	local def = Config.Upgrades[id]
	if not def or level >= def.max then
		return nil
	end
	return math.floor(def.cost * def.growth ^ level + 0.5)
end

-- ตัวคูณเวลาทำเมนู (ระดับ 5 = 0.4)
function Upgrades.speedMult(level: number): number
	return math.max(0.1, 1 - Config.Upgrades.Speed.step * level)
end

-- ตัวคูณราคาที่ลูกค้าจ่าย (ระดับ 5 = 2)
function Upgrades.priceMult(level: number): number
	return 1 + Config.Upgrades.Price.step * level
end

-- จำนวนโต๊ะที่เปิด (ระดับ 4 = 6)
function Upgrades.tables(level: number): number
	return Config.Customers.StartTables + level
end

-- ลูกค้ามาทุกกี่วินาที (ระดับ 4 = 4)
function Upgrades.spawnInterval(level: number): number
	return math.max(1, Config.Customers.SpawnInterval - Config.Upgrades.Seats.spawnStep * level)
end

return Upgrades
