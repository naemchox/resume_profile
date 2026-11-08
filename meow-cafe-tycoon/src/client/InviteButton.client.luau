--[[
	ปุ่ม Invite ขวากลางจอ (PLAN.md 9.2 ฉ.)
	- กดแล้วเปิดหน้าต่างชวนเพื่อนของ Roblox ให้เข้าเซิร์ฟเวอร์เดียวกัน
	- เรียก SocialService ฝั่งผู้เล่นตรง ๆ ไม่ส่งอะไรเข้าเซิร์ฟเวอร์
	- ใน Studio หน้าต่างชวนเพื่อนมักไม่เปิด → ปุ่มขึ้น "Not available here" แทน ต้องลองในเกมจริง
	- เว้นที่เหนือปุ่มไว้ให้ปุ่มอัปเกรด (สัปดาห์ 2) · ไม่ทับจอยและปุ่มกระโดดบนมือถือ
]]

local Players = game:GetService("Players")
local SocialService = game:GetService("SocialService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local FONT = Font.fromEnum(Enum.Font.FredokaOne)
local LABEL = "Invite"

local gui = Instance.new("ScreenGui")
gui.Name = "InviteButton"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

local button = Instance.new("TextButton")
button.Name = "Invite"
button.AnchorPoint = Vector2.new(1, 0.5)
button.Position = UDim2.new(1, -16, 0.58, 0)
button.Size = UDim2.fromScale(0.14, 0.09)
button.BackgroundColor3 = Color3.fromRGB(255, 170, 204)
button.AutoButtonColor = true
button.Text = ""
button.Parent = gui

local aspect = Instance.new("UIAspectRatioConstraint")
aspect.AspectRatio = 2.6
aspect.Parent = button
local limit = Instance.new("UISizeConstraint")
limit.MinSize = Vector2.new(110, 42) -- ใหญ่พอให้นิ้วกดบนมือถือ
limit.MaxSize = Vector2.new(210, 80)
limit.Parent = button
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0.5, 0)
corner.Parent = button
local stroke = Instance.new("UIStroke")
stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
stroke.Color = Color3.fromRGB(255, 250, 240)
stroke.Thickness = 3
stroke.Parent = button

-- ไอคอนวงกลมขาวมีเครื่องหมายบวก (วาดด้วย Frame ไม่ใช้อีโมจิ)
local icon = Instance.new("Frame")
icon.Name = "Icon"
icon.AnchorPoint = Vector2.new(0, 0.5)
icon.Position = UDim2.fromScale(0.08, 0.5)
icon.Size = UDim2.fromScale(0.62, 0.62)
icon.SizeConstraint = Enum.SizeConstraint.RelativeYY
icon.BackgroundColor3 = Color3.fromRGB(255, 250, 240)
icon.Parent = button
local iconCorner = Instance.new("UICorner")
iconCorner.CornerRadius = UDim.new(0.5, 0)
iconCorner.Parent = icon
for _, size in { UDim2.fromScale(0.56, 0.16), UDim2.fromScale(0.16, 0.56) } do
	local bar = Instance.new("Frame")
	bar.AnchorPoint = Vector2.new(0.5, 0.5)
	bar.Position = UDim2.fromScale(0.5, 0.5)
	bar.Size = size
	bar.BackgroundColor3 = Color3.fromRGB(236, 110, 160)
	bar.BorderSizePixel = 0
	bar.Parent = icon
	local barCorner = Instance.new("UICorner")
	barCorner.CornerRadius = UDim.new(0.5, 0)
	barCorner.Parent = bar
end

local label = Instance.new("TextLabel")
label.Name = "Label"
label.AnchorPoint = Vector2.new(1, 0.5)
label.Position = UDim2.fromScale(0.92, 0.5)
label.Size = UDim2.fromScale(0.58, 0.6)
label.BackgroundTransparency = 1
label.FontFace = FONT
label.TextScaled = true
label.TextColor3 = Color3.fromRGB(255, 255, 255)
label.TextStrokeTransparency = 0.4
label.TextStrokeColor3 = Color3.fromRGB(180, 70, 120)
label.Text = LABEL
label.Parent = button

local scale = Instance.new("UIScale")
scale.Parent = button

gui.Parent = player:WaitForChild("PlayerGui")

local busy = false

local function bounce()
	scale.Scale = 0.85
	TweenService:Create(scale, TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
end

-- เปลี่ยนข้อความชั่วคราว (เช่น ใน Studio เปิดหน้าต่างชวนไม่ได้)
local function note(text: string)
	label.Text = text
	task.delay(2, function()
		label.Text = LABEL
	end)
end

button.Activated:Connect(function()
	if busy then
		return
	end
	busy = true
	bounce()
	local ok, canInvite = pcall(SocialService.CanSendGameInviteAsync, SocialService, player)
	if ok and canInvite then
		local opened = pcall(SocialService.PromptGameInvite, SocialService, player)
		if not opened then
			note("Try again")
		end
	else
		note("Not available here")
	end
	busy = false
end)
