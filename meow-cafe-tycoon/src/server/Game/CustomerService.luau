--[[
	ลูกค้า: เกิด → เดินเข้าร้าน → ต่อคิว → สั่ง → (เสิร์ฟ) → นั่งโต๊ะ → เดินออก

	- เกิดเฉพาะร้านที่มีเจ้าของ ทุก SpawnInterval วินาที ถ้าคิวยังไม่เต็ม
	- เดินด้วย TweenService เลื่อน Root ไปตามจุดในแมพ (PLAN.md ข้อ 9.7)
	- ลูกค้าแต่ละตัวมีเธรดของตัวเองเธรดเดียวที่สั่งให้มันเดิน
	  คนอื่นแค่เปลี่ยน slot/state แล้วปลุกด้วย wake ไม่ขยับตัวมันเอง จึงไม่มี tween ชนกัน
	- ได้เหรียญตอนเสิร์ฟ (PLAN.md ข้อ 9.7)
]]

local Debris = game:GetService("Debris")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local Util = require(script.Parent.Parent.Map.Util)
local AnimalModels = require(script.Parent.AnimalModels)
local Announce = require(script.Parent.Announce)
local Economy = require(script.Parent.Economy)
local PlotService = require(script.Parent.PlotService)
local StationService = require(script.Parent.StationService)
local UpgradeService = require(script.Parent.UpgradeService)

local CustomerService = {}

local shops: { [Model]: any } = {}

local BOB_TWEEN = TweenInfo.new(0.16, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)

-- ── จุดในแมพ ───────────────────────────────────────────

local function point(plot: Model, folder: string?, name: string): Vector3
	local parent = folder and plot:FindFirstChild(folder) or plot
	return (parent :: Instance):FindFirstChild(name).Position
end

local function towardCounter(plot: Model): Vector3
	return (plot.PrimaryPart :: BasePart).CFrame.LookVector
end

local function flat(v: Vector3): Vector3
	return Vector3.new(v.X, 0, v.Z)
end

-- ── การเดิน ────────────────────────────────────────────

local function setBob(c, on: boolean)
	if on and not c.bobTween then
		c.bobTween = TweenService:Create(c.animal.bob, BOB_TWEEN, { C0 = c.animal.bobBase * CFrame.new(0, 0.35 * AnimalModels.SCALE, 0) })
		c.bobTween:Play()
	elseif not on and c.bobTween then
		c.bobTween:Cancel()
		c.bobTween = nil
		c.animal.bob.C0 = c.animal.bobBase
	end
end

local function face(c, direction: Vector3)
	local d = flat(direction)
	if d.Magnitude < 0.01 then
		return
	end
	local pos = c.animal.root.Position
	c.animal.root.CFrame = CFrame.lookAt(pos, pos + d)
end

-- เดินตรงไปที่ pos รอจนถึง · คืน false ถ้าลูกค้าถูกลบระหว่างทาง
local function walkTo(c, pos: Vector3): boolean
	if not c.alive then
		return false
	end
	local root = c.animal.root
	local delta = flat(pos - root.Position)
	local dist = delta.Magnitude
	if dist < 0.05 then
		return true
	end
	face(c, delta)
	local tween = TweenService:Create(
		root,
		TweenInfo.new(dist / Config.Customers.WalkSpeed, Enum.EasingStyle.Linear),
		{ CFrame = CFrame.lookAt(pos, pos + delta) }
	)
	c.tween = tween
	setBob(c, true)
	tween:Play()
	tween.Completed:Wait()
	c.tween = nil
	if not c.alive then
		return false
	end
	setBob(c, false)
	return true
end

local function walkPath(c, points: { Vector3 }): boolean
	for _, p in points do
		if not walkTo(c, p) then
			return false
		end
	end
	return true
end

-- ── ป้ายบนหัว ──────────────────────────────────────────

local function clearBubble(c)
	if c.barGui then
		c.barGui:Destroy()
		c.barGui = nil
	end
	if c.bubbleGui then
		c.bubbleGui:Destroy()
		c.bubbleGui = nil
		c.bubble = nil
	end
	if c.prompt then
		c.prompt:Destroy()
		c.prompt = nil
	end
end

-- รายการที่สั่ง (แพนด้าสั่งหลายอย่าง) · ชิ้นที่เสิร์ฟแล้วขีดฆ่าสีเขียว
local function bubbleText(c): string
	local lines = {}
	for _, item in c.items do
		local label = Config.Menus[item.id].label
		if item.done then
			table.insert(lines, '<font color="#8fd19e"><s>' .. label .. "</s></font>")
		else
			table.insert(lines, label)
		end
	end
	return table.concat(lines, "\n")
end

local function remainingLabels(c): string
	local names = {}
	for _, item in c.items do
		if not item.done then
			table.insert(names, Config.Menus[item.id].label)
		end
	end
	return table.concat(names, " / ")
end

local function flashBubble(c, text: string)
	local label = c.bubble
	if not label then
		return
	end
	label.Text = text
	task.delay(1.5, function()
		if c.bubble == label and label.Text == text then
			label.Text = bubbleText(c)
		end
	end)
end

-- หัวใจลอยขึ้นจากหัวตอนได้ของ (ทำจาก Frame ใน BillboardGui จึงหันหาจอเสมอ ไม่พึ่งอีโมจิ)
-- หัวใจ = สี่เหลี่ยมหมุน 45° + วงกลม 2 วงที่ขอบบน
local function popHeart(c)
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromScale(1.6, 1.6)
	gui.StudsOffset = Vector3.new(-1.6, 3.2, 0)
	gui.LightInfluence = 0
	gui.MaxDistance = 70

	local color = Color3.fromRGB(255, 110, 160)
	local s = 0.46
	local d = s / (2 * math.sqrt(2))
	local shapes = {}
	local function piece(pos: UDim2, rotation: number, round: boolean)
		local f = Instance.new("Frame")
		f.AnchorPoint = Vector2.new(0.5, 0.5)
		f.Position = pos
		f.Size = UDim2.fromScale(s, s)
		f.Rotation = rotation
		f.BackgroundColor3 = color
		f.BorderSizePixel = 0
		if round then
			local corner = Instance.new("UICorner")
			corner.CornerRadius = UDim.new(0.5, 0)
			corner.Parent = f
		end
		f.Parent = gui
		table.insert(shapes, f)
	end
	piece(UDim2.fromScale(0.5, 0.58), 45, false)
	piece(UDim2.fromScale(0.5 - d, 0.58 - d), 0, true)
	piece(UDim2.fromScale(0.5 + d, 0.58 - d), 0, true)
	gui.Parent = c.animal.head

	local info = TweenInfo.new(1.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(gui, info, { StudsOffset = Vector3.new(-1.6, 6.2, 0) }):Play()
	for _, f in shapes do
		TweenService:Create(f, info, { BackgroundTransparency = 1 }):Play()
	end
	Debris:AddItem(gui, 1.4)
end

local function popCoins(c, amount: number, tip: boolean?)
	local head = c.animal.head
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromScale(4, 1.5)
	gui.StudsOffset = Vector3.new(0, 4.5, 0)
	gui.LightInfluence = 0
	gui.MaxDistance = 70
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = "+" .. amount .. (tip and " Tip!" or "")
	label.TextScaled = true
	label.FontFace = Font.fromEnum(Enum.Font.FredokaOne)
	label.TextColor3 = Color3.fromRGB(255, 214, 90)
	label.TextStrokeTransparency = 0.2
	label.TextStrokeColor3 = Color3.fromRGB(120, 80, 30)
	label.Parent = gui
	gui.Parent = head

	local info = TweenInfo.new(1.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(gui, info, { StudsOffset = Vector3.new(0, 7, 0) }):Play()
	TweenService:Create(label, info, { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
	Debris:AddItem(gui, 1.3)

	if Config.Sounds.Coin ~= "" then
		local sound = Instance.new("Sound")
		sound.SoundId = Config.Sounds.Coin
		sound.Volume = 0.6
		sound.Parent = head
		sound:Play()
		Debris:AddItem(sound, 3)
	end
end

-- ข้อความลอยขึ้นสั้น ๆ (เช่น หมารอนานจนเดินหนี)
local function popText(c, text: string, color: Color3)
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromScale(5, 1.4)
	gui.StudsOffset = Vector3.new(0, 4.5, 0)
	gui.LightInfluence = 0
	gui.MaxDistance = 70
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextScaled = true
	label.FontFace = Font.fromEnum(Enum.Font.FredokaOne)
	label.TextColor3 = color
	label.TextStrokeTransparency = 0.3
	label.Parent = gui
	gui.Parent = c.animal.head
	local info = TweenInfo.new(1.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(gui, info, { StudsOffset = Vector3.new(0, 6.5, 0) }):Play()
	TweenService:Create(label, info, { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
	Debris:AddItem(gui, 1.6)
end

-- ── คิว ────────────────────────────────────────────────

local function dequeue(c)
	local queue = c.shop.queue
	local index = table.find(queue, c)
	if not index then
		return
	end
	table.remove(queue, index)
	for i, other in queue do
		if other.slot ~= i then
			other.slot = i
			other.wake:Fire()
		end
	end
end

local function serve(c, player: Player)
	if not c.alive or c.state ~= "queue" or c.slot ~= 1 then
		return
	end
	local plot = c.shop.plot
	if not PlotService.canUse(player, plot) then
		flashBubble(c, "Owner & helpers only")
		return
	end
	local heldId = StationService.getHeld(player)
	if heldId == nil then
		flashBubble(c, "Make " .. remainingLabels(c) .. " first")
		return
	end
	-- ของในมือต้องตรงกับรายการที่ยังไม่ได้เสิร์ฟสักอย่าง
	local item
	for _, it in c.items do
		if not it.done and it.id == heldId then
			item = it
			break
		end
	end
	if not item then
		flashBubble(c, "Wants " .. remainingLabels(c))
		return
	end

	local menu = Config.Menus[heldId]
	StationService.clearHeld(player)
	item.done = true

	-- ราคา × อัปเกรด Price ของเจ้าของร้าน × ตัวคูณของสัตว์ · หมาเสิร์ฟไวได้ทิป (ยังไม่ถึงหน้าเคาน์เตอร์ก็นับว่าไว)
	local def = c.def
	local amount = menu.price * UpgradeService.priceMult(plot) * (def.pay or 1)
	local tip = false
	if def.tipWindow then
		local waited = c.patienceStart and (os.clock() - c.patienceStart) or 0
		if waited <= def.tipWindow then
			tip = true
			amount *= 1 + (def.tipBonus or 0)
		end
	end
	amount = math.floor(amount + 0.5)

	-- เหรียญเข้าเจ้าของร้านเต็มจำนวน · คนที่มาช่วยเสิร์ฟได้โบนัสเพิ่ม (สร้างใหม่ ไม่หักจากเจ้าของ)
	local owner = PlotService.getOwner(plot)
	if owner then
		Economy.add(owner, amount)
	end
	popCoins(c, amount, tip)
	popHeart(c)
	if owner and owner ~= player then
		local bonus = math.max(1, math.floor(amount * Config.Helpers.Bonus + 0.5))
		Economy.add(player, bonus)
		-- โผล่ช้ากว่าเลขเหรียญนิดหนึ่ง จะได้ไม่ทับกัน
		task.delay(0.5, function()
			if c.animal and c.animal.head and c.animal.head.Parent then
				popText(c, "Helper +" .. bonus, Color3.fromRGB(150, 220, 255))
			end
		end)
	end

	-- ยังเหลือรายการ (แพนด้า): อยู่หน้าเคาน์เตอร์ต่อ อัปเดตป้าย
	local left = remainingLabels(c)
	if left ~= "" then
		if c.bubble then
			c.bubble.Text = bubbleText(c)
		end
		if c.prompt then
			c.prompt.ObjectText = left
		end
		return
	end

	c.state = "served"
	clearBubble(c)
	dequeue(c)
	c.wake:Fire()
end

local function showOrder(c)
	-- ป้ายเริ่มสูงกว่ากลางหัว 3.1 studs (พ้นหูทุกชนิด) · สั่งหลายอย่าง = ป้ายสูงขึ้นทีละบรรทัด
	local lines = #c.items
	local offsetY = lines > 1 and (3.1 + 0.7 * lines) or 3.9
	local label = Util.billboard(c.animal.head, bubbleText(c), Vector3.new(0, offsetY, 0), 6)
	label.RichText = true
	if lines > 1 then
		(label.Parent :: BillboardGui).Size = UDim2.fromScale(6, 1.4 * lines)
	end
	c.bubble = label
	c.bubbleGui = label.Parent

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "ServePrompt"
	prompt.ActionText = "Serve"
	prompt.ObjectText = remainingLabels(c)
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = Config.Prompts.ServeDistance
	prompt.RequiresLineOfSight = false
	-- ใช้คนละปุ่มกับสถานี (E) ไม่งั้นยืนกลางเคาน์เตอร์แล้วปุ่ม Serve โดนซ่อน
	prompt.KeyboardKeyCode = Enum.KeyCode.F
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonY
	prompt.Parent = c.animal.head
	prompt.Triggered:Connect(function(player)
		serve(c, player)
	end)
	c.prompt = prompt
end

-- ── ความอดทน (หมา) ──────────────────────────────────
-- เริ่มนับตอนถึงหน้าเคาน์เตอร์ (Q1) · หลอดใต้ป้ายเมนูหดจากเขียวเป็นแดง
-- หมดเวลา: เดินออกไม่จ่าย ไม่หักเหรียญ (PLAN.md ข้อ 9.8)

local function startPatience(c)
	local patience = c.def.patience
	c.patienceStart = os.clock()

	local gui = Instance.new("BillboardGui")
	gui.Name = "Patience"
	gui.Size = UDim2.fromScale(3.6, 0.45)
	gui.StudsOffset = Vector3.new(0, 2.6, 0)
	gui.LightInfluence = 0
	gui.MaxDistance = 70
	local back = Instance.new("Frame")
	back.Size = UDim2.fromScale(1, 1)
	back.BackgroundColor3 = Color3.fromRGB(255, 250, 245)
	back.BorderSizePixel = 0
	back.Parent = gui
	local backCorner = Instance.new("UICorner")
	backCorner.CornerRadius = UDim.new(0.5, 0)
	backCorner.Parent = back
	local fill = Instance.new("Frame")
	fill.Size = UDim2.fromScale(1, 1)
	fill.BackgroundColor3 = Color3.fromRGB(110, 210, 120)
	fill.BorderSizePixel = 0
	fill.Parent = back
	local fillCorner = Instance.new("UICorner")
	fillCorner.CornerRadius = UDim.new(0.5, 0)
	fillCorner.Parent = fill
	gui.Parent = c.animal.head
	c.barGui = gui

	local info = TweenInfo.new(patience, Enum.EasingStyle.Linear)
	TweenService:Create(fill, info, { Size = UDim2.fromScale(0, 1), BackgroundColor3 = Color3.fromRGB(240, 80, 80) }):Play()

	task.delay(patience, function()
		if c.alive and c.state == "queue" and c.slot == 1 then
			c.state = "angry"
			clearBubble(c)
			popText(c, "Too slow!", Color3.fromRGB(255, 120, 120))
			dequeue(c)
			c.wake:Fire()
		end
	end)
end

-- ── ที่นั่ง ────────────────────────────────────────────

local function reserveSeat(c): Attachment?
	local seats = c.shop.plot:FindFirstChild("Seats")
	if not seats then
		return nil
	end
	local free = {}
	for _, table_ in seats:GetChildren() do
		if table_:GetAttribute("Unlocked") == true then
			for _, chairName in { "Chair1", "Chair2" } do
				local chair = table_:FindFirstChild(chairName)
				local sit = chair and chair:FindFirstChild("SitPoint")
				if sit and not c.shop.seatTaken[sit] then
					table.insert(free, sit)
				end
			end
		end
	end
	if #free == 0 then
		return nil
	end
	local sit = free[math.random(1, #free)]
	c.shop.seatTaken[sit] = c
	c.seat = sit
	return sit
end

local function releaseSeat(c)
	if c.seat then
		c.shop.seatTaken[c.seat] = nil
		c.seat = nil
	end
end

-- ── ชีวิตของลูกค้า 1 ตัว ──────────────────────────────

local function removeCustomer(c)
	if not c.alive then
		return
	end
	c.alive = false
	if c.tween then
		c.tween:Cancel()
	end
	setBob(c, false)
	clearBubble(c)
	releaseSeat(c)
	dequeue(c)
	c.shop.all[c] = nil
	if c.def.rare then
		c.shop.rareActive = false
	end
	c.animal.model:Destroy()
	c.wake:Fire()
end

local function lifecycle(c)
	local plot = c.shop.plot
	local floorY = point(plot, "Queue", "Q1").Y
	local spawnPos = point(plot, nil, "CustomerSpawn")
	local wp1, wp2, wp3 = point(plot, "Path", "WP1"), point(plot, "Path", "WP2"), point(plot, "Path", "WP3")
	local exitA, exitB = point(plot, "Path", "ExitA"), point(plot, "Path", "ExitB")

	-- เข้าร้าน
	if not walkPath(c, { wp1, wp2, wp3 }) then
		return
	end

	-- ต่อคิว: เดินไปช่องของตัวเอง ถ้า slot เปลี่ยน (ตัวหน้าออก) ก็เดินต่อ
	c.state = "queue"
	while c.alive and c.state == "queue" do
		-- ได้เป็นตัวหน้าสุดเมื่อไหร่ สั่งเมนูทันที (ไม่ต้องรอเดินถึงจุด)
		if c.slot == 1 and not c.prompt then
			showOrder(c)
		end
		local target = point(plot, "Queue", "Q" .. c.slot)
		if flat(target - c.animal.root.Position).Magnitude > 0.1 then
			walkTo(c, target)
		else
			face(c, towardCounter(plot))
			if c.slot == 1 and c.def.patience and not c.patienceStart then
				startPatience(c)
			end
			c.wake.Event:Wait()
		end
	end
	if not c.alive then
		return
	end

	-- รอนานเกิน (หมา): เดินออกเลย ไม่นั่ง ไม่จ่าย
	if c.state == "angry" then
		if walkPath(c, { exitA, exitB, wp3, wp2, wp1, spawnPos }) then
			removeCustomer(c)
		end
		return
	end

	-- เสิร์ฟแล้ว: ไปนั่งถ้ามีโต๊ะว่าง ไม่งั้นเดินออกเลย
	local sit = reserveSeat(c)
	if sit then
		-- เดินไปข้างเก้าอี้ (ด้านหลังเก้าอี้มีพนักพิง ด้านหน้าเป็นโต๊ะ) แล้วขึ้นนั่ง
		local seatCf = sit.WorldCFrame
		local beside = Vector3.new(seatCf.X, floorY, seatCf.Z) + flat(seatCf.RightVector) * 2.2
		if not walkTo(c, beside) then
			return
		end
		c.animal.root.CFrame = seatCf
		task.wait(Config.Customers.SeatTime)
		if not c.alive then
			return
		end
		releaseSeat(c)
		c.animal.root.CFrame = CFrame.new(beside)
		if not walkPath(c, { exitB, wp3, wp2, wp1, spawnPos }) then
			return
		end
	else
		if not walkPath(c, { exitA, exitB, wp3, wp2, wp1, spawnPos }) then
			return
		end
	end
	removeCustomer(c)
end

-- ── เกิดลูกค้า ─────────────────────────────────────────

-- สุ่มเมนูที่สั่ง count อย่าง ไม่ซ้ำกัน จากสถานีที่เปิดอยู่
local function pickOrders(plot: Model, count: number): { { id: string, done: boolean } }?
	local options = {}
	local stations = plot:FindFirstChild("Stations")
	if stations then
		for _, s in stations:GetChildren() do
			if s:GetAttribute("Unlocked") == true and Config.Menus[s.Name] then
				table.insert(options, s.Name)
			end
		end
	end
	if #options == 0 then
		return nil
	end
	local items = {}
	for _ = 1, math.min(count, #options) do
		local id = table.remove(options, math.random(1, #options))
		table.insert(items, { id = id, done = false })
	end
	return items
end

-- ลูกค้าหายาก (ยูนิคอร์น): ร้านหนึ่งมีได้ทีละตัว และต้องรอ cooldown หลังตัวล่าสุดมาถึง
local function rareAllowed(shop, def): boolean
	if shop.rareActive then
		return false
	end
	return shop.lastRare == nil or os.clock() - shop.lastRare >= (def.cooldown or 0)
end

-- สุ่มชนิดลูกค้าตาม weight (เฉพาะชนิดที่มีโมเดลแล้ว และหายากที่ยังไม่ติดเงื่อนไข)
local function pickKind(shop): string
	-- สวิตช์ทดสอบ: บังคับยูนิคอร์น (เฉพาะใน Studio · ข้ามโอกาสและเวลารอ แต่ยังทีละตัว)
	if Config.Debug.ForceUnicorn and RunService:IsStudio() and not shop.rareActive then
		return "Unicorn"
	end

	local eligible = {}
	local total = 0
	for kind, def in Config.Animals do
		if AnimalModels.builders[kind] and (not def.rare or rareAllowed(shop, def)) then
			table.insert(eligible, kind)
			total += def.weight
		end
	end
	local roll = math.random() * total
	for _, kind in eligible do
		roll -= Config.Animals[kind].weight
		if roll <= 0 then
			return kind
		end
	end
	return "Cat"
end

-- ยูนิคอร์นมาถึง: เสียงพิเศษ + ประกาศทั้งเซิร์ฟเวอร์ (จุดตัดคลิป / โชว์เพื่อน)
local function announceRare(shop, c)
	shop.rareActive = true
	shop.lastRare = os.clock()
	if Config.Sounds.Unicorn ~= "" then
		local sound = Instance.new("Sound")
		sound.SoundId = Config.Sounds.Unicorn
		sound.Volume = 0.8
		sound.Parent = c.animal.head
		sound:Play()
		Debris:AddItem(sound, 5)
	end
	local owner = PlotService.getOwner(shop.plot)
	local name = owner and owner.DisplayName or "someone"
	Announce.all("A " .. c.kind .. " visited " .. name .. "'s café!")
end

local function spawnCustomer(shop)
	local kind = pickKind(shop)
	local def = Config.Animals[kind]
	local count = def.orderCount and math.random(def.orderCount[1], def.orderCount[2]) or 1
	local items = pickOrders(shop.plot, count)
	if not items then
		return
	end
	local animal = AnimalModels.builders[kind]()
	local c = {
		kind = kind,
		def = def,
		animal = animal,
		shop = shop,
		items = items,
		slot = #shop.queue + 1,
		state = "entering",
		alive = true,
		wake = Instance.new("BindableEvent"),
	}
	table.insert(shop.queue, c)
	shop.all[c] = true

	-- PivotTo ย้ายทุกชิ้นพร้อมกัน (ก่อนใส่ลงแมพ ข้อต่อยังไม่ทำงาน ย้ายแค่ Root ไม่ได้)
	animal.model:PivotTo(CFrame.new(point(shop.plot, nil, "CustomerSpawn")))
	animal.model.Parent = shop.folder
	AnimalModels.startIdle(animal)
	if def.rare then
		announceRare(shop, c)
	end
	task.spawn(lifecycle, c)
end

local function startShop(plot: Model)
	if shops[plot] then
		return
	end
	local folder = Instance.new("Folder")
	folder.Name = "Customers"
	folder.Parent = plot
	local shop = { plot = plot, queue = {}, all = {}, seatTaken = {}, active = true, folder = folder }
	shops[plot] = shop

	task.wait(Config.Customers.FirstSpawnDelay)
	while shop.active do
		if #shop.queue < Config.Customers.MaxQueue then
			spawnCustomer(shop)
		end
		task.wait(UpgradeService.spawnInterval(plot)) -- อัปเกรด Seats ของเจ้าของร้าน = มาถี่ขึ้น
	end
end

local function stopShop(plot: Model)
	local shop = shops[plot]
	if not shop then
		return
	end
	shops[plot] = nil
	shop.active = false
	for c in shop.all do
		removeCustomer(c)
	end
	shop.folder:Destroy()
end

function CustomerService.init()
	PlotService.onClaimed(startShop)
	PlotService.onReleased(stopShop)
end

return CustomerService
