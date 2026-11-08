-- เหรียญของผู้เล่น: เซิร์ฟเวอร์เป็นเจ้าของตัวเลขอย่างเดียว
-- ตัวเลขจริงอยู่ในข้อมูลที่ DataService โหลด/เซฟ (PLAN.md ข้อ 10.2)
-- leaderstats แค่โชว์ (ผู้เล่นแก้ค่าฝั่งตัวเองได้ แต่ไม่ส่งผลกับเซิร์ฟเวอร์)
-- ยังโหลดไม่เสร็จ = ได้/ใช้เหรียญไม่ได้

local Players = game:GetService("Players")

local DataService = require(script.Parent.DataService)

local Economy = {}

local function display(player: Player)
	local data = DataService.get(player)
	local stats = player:FindFirstChild("leaderstats")
	local value = stats and stats:FindFirstChild("Coins")
	if data and value then
		(value :: IntValue).Value = data.coins
	end
end

local function setup(player: Player)
	if player:FindFirstChild("leaderstats") then
		return
	end
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local value = Instance.new("IntValue")
	value.Name = "Coins"
	value.Value = 0
	value.Parent = stats
	stats.Parent = player
end

-- เรียกหลัง DataService.init()
function Economy.init()
	Players.PlayerAdded:Connect(setup)
	for _, player in Players:GetPlayers() do
		setup(player)
	end
	DataService.onLoaded(function(player)
		setup(player)
		display(player)
	end)
end

function Economy.get(player: Player): number
	local data = DataService.get(player)
	return data and data.coins or 0
end

function Economy.add(player: Player, amount: number)
	local data = DataService.get(player)
	if not data or amount <= 0 then
		return
	end
	data.coins += math.floor(amount)
	display(player)
end

-- ใช้เหรียญ · เหรียญไม่พอ/ยังโหลดไม่เสร็จ = false ไม่หักอะไร
function Economy.spend(player: Player, amount: number): boolean
	local data = DataService.get(player)
	amount = math.floor(amount)
	if not data or amount < 0 or data.coins < amount then
		return false
	end
	data.coins -= amount
	display(player)
	return true
end

return Economy
