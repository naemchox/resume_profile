--[[
	สถานีทำเมนู + ของที่ผู้เล่นถืออยู่
	- กด "Make ..." → สถานีขึ้น "Making..." → ครบเวลา → ผู้เล่นถือของ 1 ชิ้น
	- ถือได้ทีละชิ้น · จับเวลาฝั่งเซิร์ฟเวอร์ ผู้เล่นเร่งเวลาเองไม่ได้
	- ตาย/รีสปอว์น = ของในมือหาย
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local PlotService = require(script.Parent.PlotService)
local UpgradeService = require(script.Parent.UpgradeService)

local StationService = {}

local held: { [Player]: string } = {}
local heldPart: { [Player]: BasePart } = {}
local making: { [Player]: boolean } = {}

local function stationLabel(base: BasePart): TextLabel?
	local board = base:FindFirstChild("Billboard")
	return board and board:FindFirstChildOfClass("TextLabel")
end

-- เปลี่ยนข้อความป้ายชั่วคราว แล้วคืนค่าเดิม
local function flash(label: TextLabel?, text: string, original: string)
	if not label then
		return
	end
	label.Text = text
	task.delay(1.5, function()
		if label.Text == text then
			label.Text = original
		end
	end)
end

local function clearVisual(player: Player)
	local part = heldPart[player]
	if part then
		part:Destroy()
		heldPart[player] = nil
	end
end

-- ชิ้นเล็กสีเมนูติดมือขวา (รองรับทั้งตัว R15 และ R6)
local function showVisual(player: Player, menuId: string)
	clearVisual(player)
	local character = player.Character
	local hand = character and (character:FindFirstChild("RightHand") or character:FindFirstChild("Right Arm"))
	if not hand or not hand:IsA("BasePart") then
		return
	end
	local item = Instance.new("Part")
	item.Name = "HeldItem"
	item.Size = Vector3.new(0.9, 0.9, 0.9)
	item.Color = Config.Menus[menuId].color
	item.Material = Enum.Material.SmoothPlastic
	item.CanCollide = false
	item.CanTouch = false
	item.CanQuery = false
	item.Massless = true
	item.CFrame = hand.CFrame * CFrame.new(0, -hand.Size.Y / 2 - 0.3, -0.2)
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = hand
	weld.Part1 = item
	weld.Parent = item
	item.Parent = character
	heldPart[player] = item
end

local function setupStation(plot: Model, station: Model)
	local menuId = station.Name
	local menu = Config.Menus[menuId]
	local base = station.PrimaryPart
	if not menu or not base or station:GetAttribute("Unlocked") ~= true then
		return
	end
	local label = stationLabel(base)

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "MakePrompt"
	prompt.ActionText = "Make " .. menu.label
	prompt.ObjectText = menu.price .. " coins" -- อัปเดตตามอัปเกรด Price ของเจ้าของร้าน (ดู init)
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = Config.Prompts.StationDistance
	prompt.RequiresLineOfSight = false
	prompt.Parent = base

	prompt.Triggered:Connect(function(player)
		if not PlotService.canUse(player, plot) then
			flash(label, "Owner & helpers only", menu.label)
			return
		end
		if held[player] or making[player] then
			flash(label, "Hands full!", menu.label)
			return
		end

		making[player] = true
		prompt.Enabled = false
		if label then
			label.Text = "Making..."
		end

		-- อัปเกรด Speed ของเจ้าของร้าน · อ่านค่าตอนเริ่มทำ ซื้อระหว่างทำมีผลชิ้นถัดไป
		task.wait(menu.makeTime * UpgradeService.speedMult(plot))

		making[player] = nil
		prompt.Enabled = true
		if label then
			label.Text = menu.label
		end
		-- ผู้เล่นอาจออกจากเกม/เสียร้านระหว่างรอ
		if player.Parent and PlotService.canUse(player, plot) then
			held[player] = menuId
			showVisual(player, menuId)
		end
	end)
end

-- ถังขยะ: ทิ้งของในมือ (ทำผิดเมนูก็ทิ้งแล้วทำใหม่ได้)
local function setupTrash(plot: Model, trash: Model)
	local body = trash.PrimaryPart
	if not body then
		return
	end
	local label = stationLabel(body)

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "TrashPrompt"
	prompt.ActionText = "Throw away"
	prompt.ObjectText = "Trash"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = Config.Prompts.StationDistance
	prompt.RequiresLineOfSight = false
	prompt.Parent = body

	prompt.Triggered:Connect(function(player)
		if not PlotService.canUse(player, plot) then
			flash(label, "Owner & helpers only", "Trash")
			return
		end
		if not held[player] then
			flash(label, "Hands empty", "Trash")
			return
		end
		StationService.clearHeld(player)
		flash(label, "Thrown away", "Trash")
	end)
end

function StationService.init(plots: Folder)
	for _, plot in plots:GetChildren() do
		local trash = plot:FindFirstChild("TrashBin")
		if plot:IsA("Model") and trash and trash:IsA("Model") then
			setupTrash(plot, trash)
		end
		local stations = plot:FindFirstChild("Stations")
		if plot:IsA("Model") and stations then
			for _, station in stations:GetChildren() do
				if station:IsA("Model") then
					setupStation(plot, station)
				end
			end
		end
	end

	-- ราคาบนปุ่ม Make ตามอัปเกรด Price ของเจ้าของร้าน
	UpgradeService.onPlotChanged(function(plot)
		local stations = plot:FindFirstChild("Stations")
		if not stations then
			return
		end
		local mult = UpgradeService.priceMult(plot)
		for _, station in stations:GetChildren() do
			local menu = Config.Menus[station.Name]
			local prompt = station.PrimaryPart and station.PrimaryPart:FindFirstChild("MakePrompt")
			if menu and prompt then
				(prompt :: ProximityPrompt).ObjectText = math.floor(menu.price * mult + 0.5) .. " coins"
			end
		end
	end)

	local function track(player: Player)
		player.CharacterAdded:Connect(function()
			held[player] = nil
			heldPart[player] = nil
		end)
	end
	Players.PlayerAdded:Connect(track)
	for _, p in Players:GetPlayers() do
		track(p)
	end
	Players.PlayerRemoving:Connect(function(player)
		held[player] = nil
		heldPart[player] = nil
		making[player] = nil
	end)
end

function StationService.getHeld(player: Player): string?
	return held[player]
end

function StationService.clearHeld(player: Player)
	held[player] = nil
	clearVisual(player)
end

return StationService
