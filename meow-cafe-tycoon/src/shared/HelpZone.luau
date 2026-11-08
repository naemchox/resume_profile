--[[
	โซนรอบเคาน์เตอร์ที่ทำให้หน้าต่าง "Help serve?" โผล่ (PLAN.md 9.2 ฉ.)
	ใช้ทั้งสองฝั่ง: ผู้เล่นเช็กว่าควรโชว์หน้าต่างไหม · เซิร์ฟเวอร์เช็กซ้ำตอนกด Yes ว่ายืนอยู่ใกล้จริง
	อิงจากแผ่นบนเคาน์เตอร์ (plot.Counter.Top) จึงตามทิศของร้านแต่ละแถวเองได้
]]

local HelpZone = {}

-- ระยะจากกลางเคาน์เตอร์ (studs ตามแกนของร้าน) · ครอบเคาน์เตอร์ ครัว และคิวช่วงหน้า
HelpZone.HALF_X = 26
HelpZone.HALF_Z = 12

function HelpZone.counterTop(plot: Instance): BasePart?
	local counter = plot:FindFirstChild("Counter")
	local top = counter and counter:FindFirstChild("Top")
	if top and top:IsA("BasePart") then
		return top
	end
	return nil
end

-- slack = ยอมให้เกินขอบได้เท่าไหร่ (เซิร์ฟเวอร์ใส่เผื่อเน็ตช้า ตัวละครเดินไปนิดหนึ่งแล้ว)
function HelpZone.inside(plot: Instance, position: Vector3, slack: number?): boolean
	local top = HelpZone.counterTop(plot)
	if not top then
		return false
	end
	local extra = slack or 0
	local p = top.CFrame:PointToObjectSpace(position)
	return math.abs(p.X) <= HelpZone.HALF_X + extra and math.abs(p.Z) <= HelpZone.HALF_Z + extra and math.abs(p.Y) <= 15
end

return HelpZone
