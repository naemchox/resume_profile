--[[
	แถบประกาศใต้ตัวเลขเหรียญ (เช่น "A Unicorn visited ...'s café!")
	- รับข้อความจากเซิร์ฟเวอร์อย่างเดียว ไม่ส่งอะไรกลับ
	- มีหลายประกาศติดกัน = โชว์ทีละอัน
	- ขนาดตามสัดส่วนจอ ใช้ได้ทั้ง PC และมือถือ
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local remote = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Announcement") :: RemoteEvent

local SHOW_TIME = 4

local gui = Instance.new("ScreenGui")
gui.Name = "Announcement"
gui.ResetOnSpawn = false

local banner = Instance.new("Frame")
banner.Name = "Banner"
banner.AnchorPoint = Vector2.new(0.5, 0)
banner.Position = UDim2.new(0.5, 0, 0, 96) -- ใต้ตัวเลขเหรียญ
banner.Size = UDim2.fromScale(0.5, 0.07)
banner.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
banner.Visible = false
banner.Parent = gui

local limit = Instance.new("UISizeConstraint")
limit.MinSize = Vector2.new(260, 36)
limit.MaxSize = Vector2.new(560, 60)
limit.Parent = banner
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0.5, 0)
corner.Parent = banner
-- พื้นหลังไล่สีรุ้งพาสเทล
local gradient = Instance.new("UIGradient")
gradient.Color = ColorSequence.new({
	ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 170, 204)),
	ColorSequenceKeypoint.new(0.5, Color3.fromRGB(206, 174, 255)),
	ColorSequenceKeypoint.new(1, Color3.fromRGB(150, 206, 255)),
})
gradient.Parent = banner
local scale = Instance.new("UIScale")
scale.Parent = banner

local label = Instance.new("TextLabel")
label.AnchorPoint = Vector2.new(0.5, 0.5)
label.Position = UDim2.fromScale(0.5, 0.5)
label.Size = UDim2.fromScale(0.92, 0.7)
label.BackgroundTransparency = 1
label.FontFace = Font.fromEnum(Enum.Font.FredokaOne)
label.TextScaled = true
label.TextColor3 = Color3.fromRGB(255, 255, 255)
label.TextStrokeTransparency = 0.3
label.TextStrokeColor3 = Color3.fromRGB(120, 80, 140)
label.Parent = banner

gui.Parent = player:WaitForChild("PlayerGui")

local queue: { string } = {}
local showing = false

local function showNext()
	if showing or #queue == 0 then
		return
	end
	showing = true
	label.Text = table.remove(queue, 1) :: string
	banner.Visible = true
	scale.Scale = 0.6
	TweenService:Create(scale, TweenInfo.new(0.35, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
	task.wait(SHOW_TIME)
	banner.Visible = false
	showing = false
	showNext()
end

remote.OnClientEvent:Connect(function(text: string)
	if typeof(text) ~= "string" then
		return
	end
	table.insert(queue, text)
	task.spawn(showNext)
end)
