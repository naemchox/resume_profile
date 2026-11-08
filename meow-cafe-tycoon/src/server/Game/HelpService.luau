--[[
	ช่วยเสิร์ฟร้านคนอื่น (PLAN.md 9.2 ฉ.)
	- เดินเข้าโซนเคาน์เตอร์ร้านคนอื่น → หน้าต่าง "Help serve?" (ฝั่งผู้เล่น src/client/HelpPopup.client.luau)
	- กด Yes → ส่ง HelpRequest มาที่นี่ → ตรวจแล้วเพิ่มเป็นคนช่วย → แจ้งเจ้าของร้าน (มีปุ่ม Remove)
	- เจ้าของกด Remove → ส่ง RemoveHelper มาที่นี่ → คนนั้นหลุด และกดช่วยร้านนี้ไม่ได้อีกจนกว่าเจ้าของคืนร้าน

	ความปลอดภัย: ผู้เล่นส่งแค่ "ร้านไหน" กับ "ไล่ใคร" เซิร์ฟเวอร์ตรวจทุกอย่างเอง
	(ร้านมีอยู่จริง มีเจ้าของ ยืนใกล้เคาน์เตอร์จริง ไม่ใช่ร้านตัวเอง ไม่ถูกไล่ไว้ คนช่วยไม่เต็ม
	 ไล่ได้เฉพาะคนที่ช่วยร้านตัวเอง · กดถี่เกินถูกตัดทิ้ง) ส่วนเหรียญยังคำนวณที่เซิร์ฟเวอร์ทั้งหมด
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local HelpZone = require(ReplicatedStorage.Shared.HelpZone)
local PlotService = require(script.Parent.PlotService)
local StationService = require(script.Parent.StationService)

local HelpService = {}

local notice: RemoteEvent
local plotsFolder: Folder
-- ร้านที่เจ้าของไล่คนนี้ออกแล้ว (ล้างเมื่อเจ้าของคืนร้าน)
local blocked: { [Model]: { [Player]: boolean } } = {}
local lastRequest: { [Player]: number } = {}

local function remote(folder: Folder, name: string): RemoteEvent
	local existing = folder:FindFirstChild(name)
	if existing and existing:IsA("RemoteEvent") then
		return existing
	end
	local e = Instance.new("RemoteEvent")
	e.Name = name
	e.Parent = folder
	return e
end

local function tooFast(player: Player): boolean
	local now = os.clock()
	if lastRequest[player] and now - lastRequest[player] < 0.5 then
		return true
	end
	lastRequest[player] = now
	return false
end

-- บอกฝั่งผู้เล่นว่าร้านไหนเขาถูกไล่ไว้ หน้าต่างจะได้ไม่โผล่ร้านนั้นอีก
local function syncBlocked(player: Player)
	local names = {}
	for plot, set in blocked do
		if set[player] then
			table.insert(names, plot.Name)
		end
	end
	player:SetAttribute("HelpBlocked", table.concat(names, ","))
end

local function onHelpRequest(player: Player, plot: any)
	if tooFast(player) then
		return
	end
	if typeof(plot) ~= "Instance" or plot.Parent ~= plotsFolder or not plot:IsA("Model") then
		return
	end
	local owner = PlotService.getOwner(plot)
	if not owner or owner == player then
		return
	end
	if PlotService.getHelping(player) == plot then
		return
	end
	if blocked[plot] and blocked[plot][player] then
		return
	end
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root or not HelpZone.inside(plot, root.Position, 10) then
		return
	end
	if PlotService.helperCount(plot) >= Config.Helpers.MaxHelpers then
		notice:FireClient(player, "full", owner.DisplayName)
		return
	end

	-- ย้ายจากร้านเดิม: ของในมือเป็นของร้านเดิม ทิ้งไป
	if PlotService.getHelping(player) then
		StationService.clearHeld(player)
	end
	PlotService.addHelper(player, plot)
	notice:FireClient(player, "joined", owner.DisplayName)
	notice:FireClient(owner, "helper", player.DisplayName, player.UserId)
end

local function onRemoveHelper(owner: Player, userId: any)
	if typeof(userId) ~= "number" then
		return
	end
	local plot = PlotService.getPlot(owner)
	local helper = Players:GetPlayerByUserId(userId)
	if not plot or not helper or PlotService.getHelping(helper) ~= plot then
		return
	end
	PlotService.removeHelper(helper)
	StationService.clearHeld(helper)
	blocked[plot] = blocked[plot] or {}
	blocked[plot][helper] = true
	syncBlocked(helper)
	notice:FireClient(helper, "removed", owner.DisplayName)
	notice:FireClient(owner, "removedDone", helper.DisplayName)
end

function HelpService.init(plots: Folder)
	plotsFolder = plots
	local folder = ReplicatedStorage:FindFirstChild("Remotes")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	notice = remote(folder, "HelpNotice") -- เซิร์ฟเวอร์ → ผู้เล่น
	remote(folder, "HelpRequest").OnServerEvent:Connect(onHelpRequest)
	remote(folder, "RemoveHelper").OnServerEvent:Connect(onRemoveHelper)

	-- เจ้าของคืนร้าน = ล้างรายชื่อที่เคยถูกไล่ (PlotService ล้างคนช่วยให้แล้ว)
	PlotService.onReleased(function(plot)
		local set = blocked[plot]
		blocked[plot] = nil
		for player in set or {} do
			if player.Parent then
				syncBlocked(player)
			end
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		lastRequest[player] = nil
		for _, set in blocked do
			set[player] = nil
		end
	end)
end

return HelpService
