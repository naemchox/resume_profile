--[[
	หน้าต่าง "Help serve?" + แจ้งเตือนเรื่องคนช่วย (PLAN.md 9.2 ฉ.)
	- เดินเข้าโซนเคาน์เตอร์ร้านคนอื่น → หน้าต่างถาม Yes / No
	  กด No หรือเดินออก = หน้าต่างหาย และจะถามใหม่เมื่อเดินกลับเข้ามา
	- กด Yes → ขอเซิร์ฟเวอร์ (เซิร์ฟเวอร์ตรวจเองทุกอย่าง) → เจ้าของได้แจ้งเตือนพร้อมปุ่ม Remove
	- แจ้งเตือนเรียงกันใต้แถบประกาศ หายเองตามเวลาใน Config.Helpers.NoticeTime
	- ไม่ใช้อีโมจิ · ปุ่มใหญ่พอให้นิ้วกดบนมือถือ
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)
local HelpZone = require(ReplicatedStorage.Shared.HelpZone)

local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local helpRequest = remotes:WaitForChild("HelpRequest") :: RemoteEvent
local removeHelper = remotes:WaitForChild("RemoveHelper") :: RemoteEvent
local helpNotice = remotes:WaitForChild("HelpNotice") :: RemoteEvent
local plots = Workspace:WaitForChild("Plots")

local FONT = Font.fromEnum(Enum.Font.FredokaOne)
local CREAM = Color3.fromRGB(255, 250, 240)
local INK = Color3.fromRGB(96, 62, 84)
local PINK = Color3.fromRGB(255, 170, 204)
local MINT = Color3.fromRGB(120, 214, 170)
local GREY = Color3.fromRGB(214, 200, 210)

local gui = Instance.new("ScreenGui")
gui.Name = "HelpPopup"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

local function round(parent: GuiObject, radius: UDim?)
	local c = Instance.new("UICorner")
	c.CornerRadius = radius or UDim.new(0.5, 0)
	c.Parent = parent
end

local function text(parent: GuiObject, value: string, pos: UDim2, size: UDim2, color: Color3): TextLabel
	local t = Instance.new("TextLabel")
	t.AnchorPoint = Vector2.new(0.5, 0.5)
	t.Position = pos
	t.Size = size
	t.BackgroundTransparency = 1
	t.FontFace = FONT
	t.TextScaled = true
	t.TextColor3 = color
	t.Text = value
	t.Parent = parent
	return t
end

local function button(parent: GuiObject, label: string, color: Color3, pos: UDim2, size: UDim2): TextButton
	local b = Instance.new("TextButton")
	b.AnchorPoint = Vector2.new(0.5, 0.5)
	b.Position = pos
	b.Size = size
	b.BackgroundColor3 = color
	b.Text = ""
	b.Parent = parent
	round(b)
	local stroke = Instance.new("UIStroke")
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Color = CREAM
	stroke.Thickness = 2
	stroke.Parent = b
	local t = text(b, label, UDim2.fromScale(0.5, 0.5), UDim2.fromScale(0.8, 0.62), Color3.new(1, 1, 1))
	t.TextStrokeTransparency = 0.5
	t.TextStrokeColor3 = INK
	return b
end

local function pop(target: GuiObject)
	local s = target:FindFirstChildOfClass("UIScale") or Instance.new("UIScale")
	s.Parent = target
	s.Scale = 0.6
	TweenService:Create(s, TweenInfo.new(0.35, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
end

-- ── หน้าต่างถาม ──────────────────────────────────────────

local card = Instance.new("Frame")
card.Name = "Ask"
card.AnchorPoint = Vector2.new(0.5, 1)
card.Position = UDim2.fromScale(0.5, 0.8) -- เหนือกลางล่าง ไม่ทับจอยซ้ายและปุ่มกระโดดขวา
card.Size = UDim2.fromScale(0.36, 0.2)
card.BackgroundColor3 = CREAM
card.Visible = false
card.Parent = gui
round(card, UDim.new(0.18, 0))
local cardLimit = Instance.new("UISizeConstraint")
cardLimit.MinSize = Vector2.new(260, 110)
cardLimit.MaxSize = Vector2.new(440, 170)
cardLimit.Parent = card
local cardStroke = Instance.new("UIStroke")
cardStroke.Color = PINK
cardStroke.Thickness = 3
cardStroke.Parent = card

local title = text(card, "", UDim2.fromScale(0.5, 0.22), UDim2.fromScale(0.9, 0.26), INK)
text(
	card,
	"You get +" .. math.floor(Config.Helpers.Bonus * 100 + 0.5) .. "% bonus coins",
	UDim2.fromScale(0.5, 0.45),
	UDim2.fromScale(0.8, 0.16),
	Color3.fromRGB(170, 120, 150)
)
local yes = button(card, "Yes", MINT, UDim2.fromScale(0.3, 0.75), UDim2.fromScale(0.36, 0.32))
local no = button(card, "No", GREY, UDim2.fromScale(0.7, 0.75), UDim2.fromScale(0.36, 0.32))

-- ── แจ้งเตือน ────────────────────────────────────────────

local list = Instance.new("Frame")
list.Name = "Notices"
list.AnchorPoint = Vector2.new(0.5, 0)
list.Position = UDim2.new(0.5, 0, 0, 160) -- ใต้แถบประกาศยูนิคอร์น
list.Size = UDim2.new(0.5, 0, 0.4, 0)
list.BackgroundTransparency = 1
list.Parent = gui
local layout = Instance.new("UIListLayout")
layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
layout.Padding = UDim.new(0, 8)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = list

local order = 0
local function toast(message: string, color: Color3, removeUserId: number?)
	order += 1
	local t = Instance.new("Frame")
	t.LayoutOrder = order
	t.Size = UDim2.new(1, 0, 0, 46)
	t.BackgroundColor3 = color
	t.Parent = list
	round(t)
	local limit = Instance.new("UISizeConstraint")
	limit.MinSize = Vector2.new(260, 40)
	limit.MaxSize = Vector2.new(520, 52)
	limit.Parent = t
	local stroke = Instance.new("UIStroke")
	stroke.Color = CREAM
	stroke.Thickness = 2
	stroke.Parent = t

	local labelWidth = removeUserId and 0.66 or 0.92
	local label = text(t, message, UDim2.fromScale(0.04 + labelWidth / 2, 0.5), UDim2.fromScale(labelWidth, 0.6), Color3.new(1, 1, 1))
	label.TextStrokeTransparency = 0.4
	label.TextStrokeColor3 = INK

	if removeUserId then
		local remove = button(t, "Remove", Color3.fromRGB(240, 130, 150), UDim2.fromScale(0.85, 0.5), UDim2.fromScale(0.25, 0.78))
		remove.Activated:Connect(function()
			removeHelper:FireServer(removeUserId)
			t:Destroy()
		end)
	end

	pop(t)
	task.delay(Config.Helpers.NoticeTime, function()
		if t.Parent then
			t:Destroy()
		end
	end)
end

gui.Parent = player:WaitForChild("PlayerGui")

helpNotice.OnClientEvent:Connect(function(kind: string, name: string, userId: number?)
	if typeof(name) ~= "string" then
		return
	end
	if kind == "helper" then
		toast(name .. " is helping you serve!", MINT, userId)
	elseif kind == "joined" then
		toast("You're helping at " .. name .. "'s café!", MINT)
	elseif kind == "removed" then
		toast(name .. " wants to serve alone now", PINK)
	elseif kind == "removedDone" then
		toast(name .. " stopped helping", PINK)
	elseif kind == "full" then
		toast(name .. "'s café has enough helpers", PINK)
	end
end)

-- ── ตรวจว่ายืนอยู่หน้าเคาน์เตอร์ร้านไหน ───────────────────

local asking: Model? = nil
local dismissed: { [Model]: boolean } = {} -- ตอบไปแล้ว ไม่ถามซ้ำจนกว่าจะเดินออกจากโซน

local function isBlocked(plot: Model): boolean
	local list = player:GetAttribute("HelpBlocked")
	if typeof(list) ~= "string" or list == "" then
		return false
	end
	return table.find(string.split(list, ","), plot.Name) ~= nil
end

local function ownerName(plot: Model): string?
	local id = plot:GetAttribute("OwnerUserId")
	if typeof(id) ~= "number" or id == 0 or id == player.UserId then
		return nil
	end
	local owner = Players:GetPlayerByUserId(id)
	return owner and owner.DisplayName or nil
end

local function hide()
	asking = nil
	card.Visible = false
end

yes.Activated:Connect(function()
	if asking then
		dismissed[asking] = true
		helpRequest:FireServer(asking)
	end
	hide()
end)
no.Activated:Connect(function()
	if asking then
		dismissed[asking] = true
	end
	hide()
end)

while true do
	task.wait(0.25)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
	local found: Model? = nil
	local foundName: string? = nil
	for _, plot in plots:GetChildren() do
		if plot:IsA("Model") then
			local inside = root ~= nil and HelpZone.inside(plot, root.Position)
			if not inside then
				dismissed[plot] = nil -- เดินออกแล้ว กลับมาใหม่ถามอีกครั้ง
			elseif not found then
				local name = ownerName(plot)
				if name and not dismissed[plot] and player:GetAttribute("HelpingPlot") ~= plot.Name and not isBlocked(plot) then
					found = plot
					foundName = name
				end
			end
		end
	end

	if found ~= asking then
		if found and foundName then
			asking = found
			title.Text = "Help serve at " .. foundName .. "'s café?"
			card.Visible = true
			pop(card)
		else
			hide()
		end
	end
end
