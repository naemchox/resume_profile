--[[
	ตัวเลขเหรียญบนกลางจอ (PLAN.md หัวข้อ 5: เหรียญอยู่บนกลาง)
	- อ่านค่าจาก leaderstats.Coins ที่เซิร์ฟเวอร์ส่งมา แค่โชว์ ไม่ส่งอะไรกลับ
	- ขนาดตามสัดส่วนจอ ใช้ได้ทั้ง PC และมือถือ
	- เป็นแบบง่ายไว้ก่อน UI เต็ม (ปุ่มอัปเกรด ฯลฯ) ทำในสัปดาห์ 2
]]

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local FONT = Font.fromEnum(Enum.Font.FredokaOne)

local gui = Instance.new("ScreenGui")
gui.Name = "CoinHud"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

local pill = Instance.new("Frame")
pill.Name = "Coins"
pill.AnchorPoint = Vector2.new(0.5, 0)
pill.Position = UDim2.new(0.5, 0, 0, 10)
pill.Size = UDim2.fromScale(0.18, 0.08)
pill.BackgroundColor3 = Color3.fromRGB(255, 250, 240)
pill.Parent = gui

local aspect = Instance.new("UIAspectRatioConstraint")
aspect.AspectRatio = 3
aspect.Parent = pill
local limit = Instance.new("UISizeConstraint")
limit.MinSize = Vector2.new(120, 40)
limit.MaxSize = Vector2.new(240, 80)
limit.Parent = pill
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0.5, 0)
corner.Parent = pill
local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(255, 176, 196)
stroke.Thickness = 3
stroke.Parent = pill

-- เหรียญเป็นวงกลมสีทอง (ไม่ใช้อีโมจิ เพราะ Roblox แสดงอีโมจิบางตัวเพี้ยน)
local coin = Instance.new("Frame")
coin.Name = "Icon"
coin.AnchorPoint = Vector2.new(0, 0.5)
coin.Position = UDim2.fromScale(0.07, 0.5)
coin.Size = UDim2.fromScale(0.7, 0.7)
coin.SizeConstraint = Enum.SizeConstraint.RelativeYY
coin.BackgroundColor3 = Color3.fromRGB(255, 206, 84)
coin.Parent = pill
local coinCorner = Instance.new("UICorner")
coinCorner.CornerRadius = UDim.new(0.5, 0)
coinCorner.Parent = coin
local coinStroke = Instance.new("UIStroke")
coinStroke.Color = Color3.fromRGB(214, 150, 40)
coinStroke.Thickness = 2
coinStroke.Parent = coin

local label = Instance.new("TextLabel")
label.Name = "Amount"
label.AnchorPoint = Vector2.new(1, 0.5)
label.Position = UDim2.fromScale(0.92, 0.5)
label.Size = UDim2.fromScale(0.62, 0.75)
label.BackgroundTransparency = 1
label.FontFace = FONT
label.TextScaled = true
label.TextXAlignment = Enum.TextXAlignment.Right
label.TextColor3 = Color3.fromRGB(96, 62, 84)
label.Text = "0"
label.Parent = pill

local scale = Instance.new("UIScale")
scale.Parent = pill

gui.Parent = player:WaitForChild("PlayerGui")

local last = 0
local function show(value: number)
	label.Text = tostring(value)
	if value ~= last then
		-- เด้งนิดหนึ่งตอนได้/ใช้เหรียญ (ซื้ออัปเกรด)
		scale.Scale = 1.15
		TweenService:Create(scale, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
	end
	last = value
end

local stats = player:WaitForChild("leaderstats")
local coins = stats:WaitForChild("Coins") :: IntValue
last = coins.Value
label.Text = tostring(coins.Value)
coins.Changed:Connect(show)
