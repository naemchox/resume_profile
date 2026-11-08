-- ได้ร้าน / คืนร้าน / ใครใช้ร้านได้ (เจ้าของ + คนช่วยเสิร์ฟ)
-- เข้าเกม (โหลดเซฟเสร็จ) = ได้ร้านว่างเลขน้อยสุดอัตโนมัติ แล้วไปเกิดหน้าร้านตัวเอง · รีสปอว์นก็เกิดหน้าร้าน
-- 1 ผู้เล่น 1 ร้าน · ออกจากเกมแล้วร้านกลับเป็นว่าง และคนช่วยของร้านนั้นหลุดหมด
-- ร้านมี 6 ร้าน → ตั้ง Max Players = 6 ทุกคนจึงได้ร้านเสมอ · ถ้าเต็มจริงเกิดที่ลานกลาง + ขึ้นข้อความ

local Players = game:GetService("Players")

local DataService = require(script.Parent.DataService)
local Announce = require(script.Parent.Announce)

local PlotService = {}

local ownerOf: { [Model]: Player } = {}
local plotOf: { [Player]: Model } = {}
local claimedCallbacks: { (Model, Player) -> () } = {}
local releasedCallbacks: { (Model) -> () } = {}

-- คนช่วยเสิร์ฟของแต่ละร้าน (กด Yes ที่หน้าต่าง "Help serve?" · ดู HelpService)
-- คนหนึ่งช่วยได้ทีละร้าน · player attribute "HelpingPlot" = ชื่อร้านที่ช่วยอยู่ ให้ฝั่งผู้เล่นรู้
local helpersOf: { [Model]: { [Player]: boolean } } = {}
local helpingOf: { [Player]: Model } = {}

local function ownerLabel(plot: Model): TextLabel?
	local sign = plot:FindFirstChild("Sign")
	return sign and sign:FindFirstChild("OwnerLabel", true) :: TextLabel?
end

local plotsFolder: Folder

-- ย้ายตัวละครไปหน้าร้าน (รอให้ Roblox วางตัวที่จุดเกิดปกติเสร็จก่อน ไม่งั้นโดนย้ายทับ)
local function sendHome(player: Player, character: Model)
	local plot = plotOf[player]
	local spot = plot and plot:FindFirstChild("OwnerSpawn") :: BasePart?
	if not spot then
		return
	end
	local root = character:WaitForChild("HumanoidRootPart", 5)
	if not root then
		return
	end
	task.wait()
	if character.Parent and plotOf[player] == plot then
		character:PivotTo(spot.CFrame + Vector3.new(0, 3, 0))
	end
end

local function claim(plot: Model, player: Player)
	if ownerOf[plot] or plotOf[player] then
		return
	end
	-- ยังโหลดเซฟไม่เสร็จ ห้ามจอง (กันเริ่มจาก 0 แล้วเซฟทับ) · ปกติโหลดเสร็จใน 1–2 วินาที
	if not DataService.isLoaded(player) then
		return
	end
	ownerOf[plot] = player
	plotOf[player] = plot
	plot:SetAttribute("OwnerUserId", player.UserId)

	local label = ownerLabel(plot)
	if label then
		label.Text = player.DisplayName .. "'s shop"
	end

	for _, fn in claimedCallbacks do
		task.spawn(fn, plot, player)
	end
	if player.Character then
		task.spawn(sendHome, player, player.Character)
	end
end

-- ร้านว่างเลขน้อยสุด (Plot1, Plot2, ...) คนในเซิร์ฟเวอร์จะได้อยู่ใกล้กัน
local function freePlot(): Model?
	local best: Model? = nil
	local bestId = math.huge
	for _, plot in plotsFolder:GetChildren() do
		local id = plot:GetAttribute("PlotId")
		if plot:IsA("Model") and not ownerOf[plot] and typeof(id) == "number" and id < bestId then
			best, bestId = plot, id
		end
	end
	return best
end

local function autoClaim(player: Player)
	if not player.Parent or plotOf[player] then
		return
	end
	local plot = freePlot()
	if plot then
		claim(plot, player)
	else
		Announce.to(player, "All shops are taken. Try another server.")
	end
end

local function release(player: Player)
	local plot = plotOf[player]
	if not plot then
		return
	end
	ownerOf[plot] = nil
	plotOf[player] = nil
	plot:SetAttribute("OwnerUserId", 0)
	for helper in helpersOf[plot] or {} do
		PlotService.removeHelper(helper)
	end

	local label = ownerLabel(plot)
	if label then
		label.Text = "Free shop"
	end
	for _, fn in releasedCallbacks do
		task.spawn(fn, plot)
	end
end

-- เรียกหลังทุกระบบลงทะเบียน onClaimed แล้ว (ลูกค้า, อัปเกรด)
function PlotService.init(plots: Folder)
	plotsFolder = plots

	local function track(player: Player)
		player.CharacterAdded:Connect(function(character)
			sendHome(player, character)
		end)
	end
	Players.PlayerAdded:Connect(track)
	for _, player in Players:GetPlayers() do
		track(player)
	end

	-- โหลดเซฟเสร็จ = ได้ร้านทันที (กันเริ่มจาก 0 แล้วเซฟทับ)
	DataService.onLoaded(autoClaim)

	Players.PlayerRemoving:Connect(function(player)
		PlotService.removeHelper(player)
		release(player)
	end)
end

function PlotService.getOwner(plot: Model): Player?
	return ownerOf[plot]
end

function PlotService.getPlot(player: Player): Model?
	return plotOf[player]
end

-- ใครกดใช้ของในร้านได้: เจ้าของ + คนที่กด Yes มาช่วยเสิร์ฟร้านนี้ · ร้านว่างไม่มีใครใช้ได้
function PlotService.canUse(player: Player, plot: Model): boolean
	local owner = ownerOf[plot]
	if not owner then
		return false
	end
	return owner == player or helpingOf[player] == plot
end

-- ร้านที่คนนี้ช่วยเสิร์ฟอยู่ (ไม่ได้ช่วยใคร = nil)
function PlotService.getHelping(player: Player): Model?
	return helpingOf[player]
end

function PlotService.helperCount(plot: Model): number
	local n = 0
	for _ in helpersOf[plot] or {} do
		n += 1
	end
	return n
end

-- เริ่มช่วยร้านนี้ (ถ้าช่วยร้านอื่นอยู่จะย้ายมาร้านนี้แทน) · HelpService ตรวจเงื่อนไขก่อนเรียก
function PlotService.addHelper(player: Player, plot: Model)
	PlotService.removeHelper(player)
	helpersOf[plot] = helpersOf[plot] or {}
	helpersOf[plot][player] = true
	helpingOf[player] = plot
	player:SetAttribute("HelpingPlot", plot.Name)
end

-- เลิกช่วย · คืนร้านที่เคยช่วย (ไม่ได้ช่วยอยู่ = nil)
function PlotService.removeHelper(player: Player): Model?
	local plot = helpingOf[player]
	if not plot then
		return nil
	end
	helpingOf[player] = nil
	local set = helpersOf[plot]
	if set then
		set[player] = nil
	end
	if player.Parent then
		player:SetAttribute("HelpingPlot", nil)
	end
	return plot
end

function PlotService.onClaimed(fn: (Model, Player) -> ())
	table.insert(claimedCallbacks, fn)
end

function PlotService.onReleased(fn: (Model) -> ())
	table.insert(releasedCallbacks, fn)
end

return PlotService
