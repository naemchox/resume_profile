--[[
	เมนูอัปเกรด (PLAN.md ข้อ 10.4)
	- เปิดได้ 2 ทาง: ปุ่ม Upgrades ขวากลาง (เหนือปุ่ม Invite) · ตู้ Upgrade ในร้าน (prompt "Open Upgrades")
	- หน้าต่างกลางจอ 3 แถว: ไอคอน + ชื่อ, จุดบอกระดับ, ผลก่อน → หลัง, ปุ่มซื้อบอกราคา
	  เหรียญไม่พอ = ปุ่มเทา · ระดับเต็ม = MAX
	- ฝั่งนี้แค่โชว์: ระดับอ่านจาก player attribute "Upgrade_<ชื่อ>" · ราคา/ผลคิดจาก Shared.Upgrades
	  กดซื้อ = ส่งชื่ออัปเกรดไปให้เซิร์ฟเวอร์ตรวจและหักเหรียญเอง (BuyUpgrade)
	- ไม่ใช้อีโมจิ · ปุ่มสูงอย่างน้อย 44 px · หน้าต่างเปิดอยู่ยังเดินได้
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)
local Upgrades = require(ReplicatedStorage.Shared.Upgrades)

local player = Players.LocalPlayer
local buyRemote = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("BuyUpgrade") :: RemoteFunction

local FONT = Font.fromEnum(Enum.Font.FredokaOne)
local CREAM = Color3.fromRGB(255, 250, 240)
local INK = Color3.fromRGB(96, 62, 84)
local SOFT_INK = Color3.fromRGB(170, 120, 150)
local PINK = Color3.fromRGB(255, 170, 204)
local DEEP_PINK = Color3.fromRGB(236, 110, 160)
local MINT = Color3.fromRGB(120, 214, 170)
local GREY = Color3.fromRGB(214, 200, 210)
local LAVENDER = Color3.fromRGB(190, 160, 240)
local GOLD = Color3.fromRGB(255, 206, 84)

-- สีไอคอนของแต่ละอัปเกรด
local ICON_COLOR = {
	Speed = Color3.fromRGB(255, 196, 120),
	Seats = Color3.fromRGB(152, 222, 232),
	Price = GOLD,
}

-- ── ตัวช่วยสร้าง UI ───────────────────────────────────

local function corner(parent: GuiObject, radius: UDim?)
	local c = Instance.new("UICorner")
	c.CornerRadius = radius or UDim.new(0.5, 0)
	c.Parent = parent
end

local function stroke(parent: GuiObject, color: Color3, thickness: number)
	local s = Instance.new("UIStroke")
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Color = color
	s.Thickness = thickness
	s.Parent = parent
	return s
end

local function frame(parent: Instance, pos: UDim2, size: UDim2, color: Color3, anchor: Vector2?): Frame
	local f = Instance.new("Frame")
	f.AnchorPoint = anchor or Vector2.new(0.5, 0.5)
	f.Position = pos
	f.Size = size
	f.BackgroundColor3 = color
	f.BorderSizePixel = 0
	f.Parent = parent
	return f
end

local function text(parent: Instance, value: string, pos: UDim2, size: UDim2, color: Color3, align: Enum.TextXAlignment?): TextLabel
	local t = Instance.new("TextLabel")
	t.AnchorPoint = Vector2.new(0, 0.5)
	t.Position = pos
	t.Size = size
	t.BackgroundTransparency = 1
	t.FontFace = FONT
	t.TextScaled = true
	t.TextColor3 = color
	t.TextXAlignment = align or Enum.TextXAlignment.Left
	t.Text = value
	t.Parent = parent
	return t
end

local function pop(target: GuiObject, from: number)
	local s = target:FindFirstChildOfClass("UIScale") or Instance.new("UIScale")
	s.Parent = target
	s.Scale = from
	TweenService:Create(s, TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
end

-- ไอคอนวาดด้วย Frame ในวงกลมขาว
local function drawIcon(circle: Frame, id: string)
	local color = ICON_COLOR[id] or PINK
	local function bar(pos: UDim2, size: UDim2, rotation: number?)
		local b = frame(circle, pos, size, color)
		b.Rotation = rotation or 0
		corner(b)
	end
	if id == "Speed" then
		-- ลูกศร >> สองชั้น
		for _, x in { 0.38, 0.6 } do
			bar(UDim2.fromScale(x, 0.4), UDim2.fromScale(0.3, 0.12), 45)
			bar(UDim2.fromScale(x, 0.6), UDim2.fromScale(0.3, 0.12), -45)
		end
	elseif id == "Seats" then
		-- โต๊ะ: แผ่นบน + ขา
		bar(UDim2.fromScale(0.5, 0.38), UDim2.fromScale(0.62, 0.14))
		bar(UDim2.fromScale(0.5, 0.58), UDim2.fromScale(0.12, 0.34))
		bar(UDim2.fromScale(0.5, 0.74), UDim2.fromScale(0.36, 0.1))
	else
		-- เหรียญ + ขีดกลาง
		local coin = frame(circle, UDim2.fromScale(0.5, 0.5), UDim2.fromScale(0.6, 0.6), color)
		corner(coin)
		stroke(coin, Color3.fromRGB(214, 150, 40), 2)
		local mark = frame(coin, UDim2.fromScale(0.5, 0.5), UDim2.fromScale(0.16, 0.5), Color3.fromRGB(214, 150, 40))
		corner(mark)
	end
end

-- ── ปุ่ม Upgrades บนจอ (สไตล์เดียวกับ Invite) ──────────

local gui = Instance.new("ScreenGui")
gui.Name = "UpgradeMenu"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

local openButton = Instance.new("TextButton")
openButton.Name = "Upgrades"
openButton.AnchorPoint = Vector2.new(1, 0.5)
openButton.Position = UDim2.new(1, -16, 0.58, -60)
openButton.Size = UDim2.fromScale(0.14, 0.09)
openButton.BackgroundColor3 = LAVENDER
openButton.Text = ""
openButton.Parent = gui
corner(openButton)
stroke(openButton, CREAM, 3)
do
	local aspect = Instance.new("UIAspectRatioConstraint")
	aspect.AspectRatio = 2.6
	aspect.Parent = openButton
	local limit = Instance.new("UISizeConstraint")
	limit.MinSize = Vector2.new(110, 42) -- เท่าปุ่ม Invite
	limit.MaxSize = Vector2.new(210, 80)
	limit.Parent = openButton

	local icon = frame(openButton, UDim2.fromScale(0.08, 0.5), UDim2.fromScale(0.62, 0.62), CREAM, Vector2.new(0, 0.5))
	icon.SizeConstraint = Enum.SizeConstraint.RelativeYY
	corner(icon)
	-- ลูกศรขึ้น: หัว ^ + ก้าน
	for _, r in { -45, 45 } do
		local head = frame(icon, UDim2.fromScale(0.5 + (r < 0 and -0.11 or 0.11), 0.36), UDim2.fromScale(0.36, 0.14), Color3.fromRGB(150, 110, 220))
		head.Rotation = r
		corner(head)
	end
	local shaft = frame(icon, UDim2.fromScale(0.5, 0.56), UDim2.fromScale(0.14, 0.44), Color3.fromRGB(150, 110, 220))
	corner(shaft)

	local label = text(openButton, "Upgrades", UDim2.fromScale(0.36, 0.5), UDim2.fromScale(0.58, 0.55), Color3.new(1, 1, 1), Enum.TextXAlignment.Center)
	label.TextStrokeTransparency = 0.4
	label.TextStrokeColor3 = Color3.fromRGB(110, 70, 170)
end

-- วางเหนือปุ่ม Invite พอดี (สูงเท่ากัน + ช่องว่าง 12 px) ไม่ว่าจอเล็กหรือใหญ่
local function placeButton()
	openButton.Position = UDim2.new(1, -16, 0.58, -(openButton.AbsoluteSize.Y + 12))
end
openButton:GetPropertyChangedSignal("AbsoluteSize"):Connect(placeButton)

-- ── หน้าต่าง ──────────────────────────────────────────

local window = frame(gui, UDim2.fromScale(0.5, 0.5), UDim2.fromScale(0.5, 0.66), CREAM)
window.Name = "Window"
window.Visible = false
corner(window, UDim.new(0, 24))
stroke(window, PINK, 4)
do
	local limit = Instance.new("UISizeConstraint")
	limit.MinSize = Vector2.new(320, 250)
	limit.MaxSize = Vector2.new(560, 430)
	limit.Parent = window
end

local title = text(window, "Upgrades", UDim2.fromScale(0.5, 0.1), UDim2.fromScale(0.6, 0.11), INK, Enum.TextXAlignment.Center)
title.AnchorPoint = Vector2.new(0.5, 0.5)

local closeButton = Instance.new("TextButton")
closeButton.Name = "Close"
closeButton.AnchorPoint = Vector2.new(0.5, 0.5)
closeButton.Position = UDim2.new(1, -30, 0, 30)
closeButton.Size = UDim2.fromOffset(44, 44)
closeButton.BackgroundColor3 = PINK
closeButton.Text = ""
closeButton.Parent = window
corner(closeButton)
stroke(closeButton, CREAM, 2)
for _, r in { 45, -45 } do
	local x = frame(closeButton, UDim2.fromScale(0.5, 0.5), UDim2.fromScale(0.55, 0.13), Color3.new(1, 1, 1))
	x.Rotation = r
	corner(x)
end

local list = frame(window, UDim2.fromScale(0.5, 0.58), UDim2.fromScale(0.92, 0.76), CREAM)
list.BackgroundTransparency = 1
do
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0.03, 0)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = list
end

type Row = {
	id: string,
	frame: Frame,
	dots: { Frame },
	effect: TextLabel,
	buy: TextButton,
	buyLabel: TextLabel,
	busy: boolean,
}
local rows: { Row } = {}

local function makeRow(id: string, order: number): Row
	local def = Config.Upgrades[id]
	local row = frame(list, UDim2.new(), UDim2.fromScale(1, 0.31), Color3.fromRGB(255, 240, 246), Vector2.zero)
	row.LayoutOrder = order
	corner(row, UDim.new(0.25, 0))

	local circle = frame(row, UDim2.fromScale(0.03, 0.5), UDim2.fromScale(0.7, 0.7), Color3.new(1, 1, 1), Vector2.new(0, 0.5))
	circle.SizeConstraint = Enum.SizeConstraint.RelativeYY
	corner(circle)
	drawIcon(circle, id)

	text(row, def.label, UDim2.fromScale(0.2, 0.27), UDim2.fromScale(0.3, 0.32), INK)

	-- จุดบอกระดับ ●●○○○
	local dotsBox = frame(row, UDim2.fromScale(0.5, 0.27), UDim2.fromScale(0.2, 0.2), CREAM, Vector2.new(0, 0.5))
	dotsBox.BackgroundTransparency = 1
	local dotsLayout = Instance.new("UIListLayout")
	dotsLayout.FillDirection = Enum.FillDirection.Horizontal
	dotsLayout.Padding = UDim.new(0, 4)
	dotsLayout.VerticalAlignment = Enum.VerticalAlignment.Center
	dotsLayout.Parent = dotsBox
	local dots = {}
	for i = 1, def.max do
		local dot = frame(dotsBox, UDim2.new(), UDim2.fromScale(1, 1), GREY, Vector2.zero)
		dot.SizeConstraint = Enum.SizeConstraint.RelativeYY
		dot.LayoutOrder = i
		corner(dot)
		table.insert(dots, dot)
	end

	local effect = text(row, "", UDim2.fromScale(0.2, 0.7), UDim2.fromScale(0.5, 0.28), SOFT_INK)

	local buy = Instance.new("TextButton")
	buy.Name = "Buy"
	buy.AnchorPoint = Vector2.new(1, 0.5)
	buy.Position = UDim2.fromScale(0.97, 0.5)
	buy.Size = UDim2.fromScale(0.25, 0.68)
	buy.BackgroundColor3 = MINT
	buy.Text = ""
	buy.Parent = row
	corner(buy)
	stroke(buy, CREAM, 2)
	local buyLimit = Instance.new("UISizeConstraint")
	buyLimit.MinSize = Vector2.new(70, 44) -- นิ้วกดง่ายบนมือถือ
	buyLimit.Parent = buy
	local buyLabel = text(buy, "", UDim2.fromScale(0.5, 0.5), UDim2.fromScale(0.82, 0.6), Color3.new(1, 1, 1), Enum.TextXAlignment.Center)
	buyLabel.AnchorPoint = Vector2.new(0.5, 0.5)
	buyLabel.TextStrokeTransparency = 0.5
	buyLabel.TextStrokeColor3 = INK

	return { id = id, frame = row, dots = dots, effect = effect, buy = buy, buyLabel = buyLabel, busy = false }
end

local function fmtSeconds(s: number): string
	return string.format("%.1fs", s)
end

local function pct(mult: number): string
	return "+" .. math.floor((mult - 1) * 100 + 0.5) .. "%"
end

-- ข้อความผลก่อน → หลัง (เต็มแล้วโชว์ค่าปัจจุบันอย่างเดียว)
local function effectText(id: string, level: number, isMax: boolean): string
	if id == "Speed" then
		local base = Config.Menus.Coffee.makeTime
		local now = fmtSeconds(base * Upgrades.speedMult(level))
		return "Coffee " .. now .. (isMax and "" or (" > " .. fmtSeconds(base * Upgrades.speedMult(level + 1))))
	elseif id == "Seats" then
		local now = Upgrades.tables(level)
		return "Tables " .. now .. (isMax and "" or (" > " .. Upgrades.tables(level + 1)))
	else
		local now = pct(Upgrades.priceMult(level))
		return "Price " .. now .. (isMax and "" or (" > " .. pct(Upgrades.priceMult(level + 1))))
	end
end

local function coins(): number
	local stats = player:FindFirstChild("leaderstats")
	local value = stats and stats:FindFirstChild("Coins")
	return value and (value :: IntValue).Value or 0
end

local function refresh()
	local have = coins()
	for _, row in rows do
		if not row.busy then
			local level = player:GetAttribute("Upgrade_" .. row.id) or 0
			local price = Upgrades.cost(row.id, level)
			for i, dot in row.dots do
				dot.BackgroundColor3 = i <= level and DEEP_PINK or GREY
			end
			row.effect.Text = effectText(row.id, level, price == nil)
			if not price then
				row.buyLabel.Text = "MAX"
				row.buy.BackgroundColor3 = LAVENDER
				row.buy.AutoButtonColor = false
			else
				row.buyLabel.Text = tostring(price)
				local afford = have >= price
				row.buy.BackgroundColor3 = afford and MINT or GREY
				row.buy.AutoButtonColor = afford
			end
		end
	end
end

-- ป้ายปุ่มชั่วคราว แล้วกลับเป็นปกติ
local function note(row: Row, message: string)
	row.busy = true
	row.buyLabel.Text = message
	task.delay(1.2, function()
		row.busy = false
		refresh()
	end)
end

local function buy(row: Row)
	if row.busy then
		return
	end
	local level = player:GetAttribute("Upgrade_" .. row.id) or 0
	local price = Upgrades.cost(row.id, level)
	if not price then
		return
	end
	if coins() < price then
		pop(row.buy, 0.85)
		note(row, "Need more")
		return
	end
	row.busy = true
	local ok, success, reason = pcall(buyRemote.InvokeServer, buyRemote, row.id)
	row.busy = false
	if ok and success then
		pop(row.frame, 0.92)
		refresh()
	elseif ok and reason == "coins" then
		note(row, "Need more")
	elseif ok and reason == "busy" then
		refresh()
	else
		note(row, "Try again")
	end
end

for i, id in Config.UpgradeOrder do
	local row = makeRow(id, i)
	table.insert(rows, row)
	row.buy.Activated:Connect(function()
		buy(row)
	end)
end

-- ── เปิด / ปิด ────────────────────────────────────────

local function setOpen(open: boolean)
	if window.Visible == open then
		return
	end
	window.Visible = open
	if open then
		refresh()
		pop(window, 0.7)
	end
end

openButton.Activated:Connect(function()
	pop(openButton, 0.85)
	setOpen(not window.Visible)
end)
closeButton.Activated:Connect(function()
	setOpen(false)
end)

gui.Parent = player:WaitForChild("PlayerGui")
placeButton()

-- ระดับ / เหรียญเปลี่ยน → อัปเดตหน้าต่าง
for _, id in Config.UpgradeOrder do
	player:GetAttributeChangedSignal("Upgrade_" .. id):Connect(refresh)
end
task.spawn(function()
	local stats = player:WaitForChild("leaderstats")
	local value = stats:WaitForChild("Coins") :: IntValue
	value.Changed:Connect(refresh)
	refresh()
end)

-- ── ตู้อัปเกรดในร้าน: prompt ฝั่งผู้เล่น (ไม่ต้องส่งอะไรเข้าเซิร์ฟเวอร์) ──

-- ร้านไกล ๆ อาจโหลดมาทีหลัง (Streaming) จึงดักชิ้น Base ของตู้ทุกครั้งที่โผล่มา
local function setupKiosk(base: Instance)
	if not base:IsA("BasePart") or base.Name ~= "Base" or not base.Parent or base.Parent.Name ~= "UpgradeKiosk" then
		return
	end
	if base:FindFirstChild("UpgradePrompt") then
		return
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "UpgradePrompt"
	prompt.ActionText = "Open Upgrades"
	prompt.ObjectText = "Upgrade"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = Config.Prompts.StationDistance
	prompt.RequiresLineOfSight = false
	prompt.Parent = base
	prompt.Triggered:Connect(function()
		setOpen(true)
	end)
end

local plots = Workspace:WaitForChild("Plots")
plots.DescendantAdded:Connect(setupKiosk)
for _, part in plots:GetDescendants() do
	setupKiosk(part)
end
