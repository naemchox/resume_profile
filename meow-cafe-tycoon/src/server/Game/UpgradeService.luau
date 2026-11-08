--[[
	อัปเกรด 3 อย่าง: Speed, Seats, Price (PLAN.md ข้อ 10.3, 10.5)

	- ระดับเก็บในข้อมูลผู้เล่น (DataService) ติดตัวผู้เล่น ไม่ผูกกับร้าน
	- ผลในร้านใช้ระดับของ "เจ้าของร้าน" คนช่วยเสิร์ฟทำในร้านนั้นก็ได้ผลเดียวกัน
	- ซื้อแล้วมีผลทันที: เวลาทำ/ราคา/รอบลูกค้า อ่านค่าใหม่ทุกครั้ง · โต๊ะเปิดเพิ่มทันทีพร้อมเด้ง
	- ฝั่งผู้เล่นรู้ระดับจาก player attribute "Upgrade_<ชื่อ>" (อ่านอย่างเดียว)

	ความปลอดภัย: ผู้เล่นส่งได้แค่ชื่ออัปเกรด (RemoteFunction BuyUpgrade)
	เซิร์ฟเวอร์ตรวจเอง: ชื่อมีจริง ข้อมูลโหลดเสร็จ ยังไม่เต็ม เหรียญพอ กดถี่ถูกตัด · ราคาคิดจาก Config เท่านั้น
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local Upgrades = require(ReplicatedStorage.Shared.Upgrades)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local PlotService = require(script.Parent.PlotService)

local UpgradeService = {}

local LOCKED_TRANSPARENCY = 0.75 -- ต้องตรงกับโต๊ะล็อกใน Map/Shop.luau
local lastBuy: { [Player]: number } = {}
local changedCallbacks: { (Model) -> () } = {}

-- ── ระดับ ──────────────────────────────────────────────

function UpgradeService.level(player: Player?, id: string): number
	local data = player and DataService.get(player)
	return data and data.upgrades[id] or 0
end

-- ระดับของเจ้าของร้าน (ร้านว่าง = 0)
local function plotLevel(plot: Model, id: string): number
	return UpgradeService.level(PlotService.getOwner(plot), id)
end

function UpgradeService.speedMult(plot: Model): number
	return Upgrades.speedMult(plotLevel(plot, "Speed"))
end

function UpgradeService.priceMult(plot: Model): number
	return Upgrades.priceMult(plotLevel(plot, "Price"))
end

function UpgradeService.spawnInterval(plot: Model): number
	return Upgrades.spawnInterval(plotLevel(plot, "Seats"))
end

local function syncAttributes(player: Player)
	for id in Config.Upgrades do
		player:SetAttribute("Upgrade_" .. id, UpgradeService.level(player, id))
	end
end

-- ── โต๊ะ ───────────────────────────────────────────────

-- เด้งขึ้นนิดหนึ่งแล้วลงที่เดิม (โต๊ะ anchored ทั้งหมด ใช้ PivotTo)
local function bounce(t: Model)
	local base = t:GetPivot()
	local DURATION = 0.4
	local started = os.clock()
	while true do
		local a = (os.clock() - started) / DURATION
		if a >= 1 or not t.Parent then
			break
		end
		t:PivotTo(base * CFrame.new(0, math.sin(a * math.pi) * 1.2, 0))
		task.wait()
	end
	if t.Parent then
		t:PivotTo(base)
	end
end

-- เปิด/ปิดโต๊ะให้ตรงจำนวน · animate = โต๊ะที่เพิ่งเปิดค่อย ๆ ชัด + เด้ง
local function setTables(plot: Model, count: number, animate: boolean)
	local seats = plot:FindFirstChild("Seats")
	if not seats then
		return
	end
	local i = 1
	while true do
		local t = seats:FindFirstChild("Table" .. i)
		if not t or not t:IsA("Model") then
			break
		end
		local want = i <= count
		if t:GetAttribute("Unlocked") ~= want then
			t:SetAttribute("Unlocked", want)
			for _, part in t:GetDescendants() do
				if part:IsA("BasePart") then
					part.CanCollide = want
					local target = want and 0 or LOCKED_TRANSPARENCY
					if want and animate then
						TweenService:Create(part, TweenInfo.new(0.4), { Transparency = target }):Play()
					else
						part.Transparency = target
					end
				end
			end
			if want and animate then
				task.spawn(bounce, t)
			end
		end
		i += 1
	end
end

-- ผลของร้านเปลี่ยน (จอง / คืน / เจ้าของซื้ออัปเกรด)
local function plotChanged(plot: Model, animate: boolean)
	setTables(plot, Upgrades.tables(plotLevel(plot, "Seats")), animate)
	for _, fn in changedCallbacks do
		task.spawn(fn, plot)
	end
end

-- เรียกเมื่อผลของร้านเปลี่ยน (เช่น StationService อัปเดตราคาบนป้าย)
function UpgradeService.onPlotChanged(fn: (Model) -> ())
	table.insert(changedCallbacks, fn)
end

-- ── ซื้อ ───────────────────────────────────────────────

-- คืน (สำเร็จไหม, เหตุผลถ้าไม่สำเร็จ: "loading" | "max" | "coins" | "busy" | "bad")
local function buy(player: Player, id: any): (boolean, string?)
	local now = os.clock()
	if lastBuy[player] and now - lastBuy[player] < 0.25 then
		return false, "busy"
	end
	lastBuy[player] = now

	if typeof(id) ~= "string" or not Config.Upgrades[id] then
		return false, "bad"
	end
	local data = DataService.get(player)
	if not data then
		return false, "loading"
	end
	local level = data.upgrades[id] or 0
	local price = Upgrades.cost(id, level)
	if not price then
		return false, "max"
	end
	if not Economy.spend(player, price) then
		return false, "coins"
	end

	data.upgrades[id] = level + 1
	syncAttributes(player)
	local plot = PlotService.getPlot(player)
	if plot then
		plotChanged(plot, true)
	end
	return true, nil
end

function UpgradeService.init()
	local folder = ReplicatedStorage:FindFirstChild("Remotes")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	local remote = folder:FindFirstChild("BuyUpgrade")
	if not remote then
		remote = Instance.new("RemoteFunction")
		remote.Name = "BuyUpgrade"
		remote.Parent = folder
	end
	(remote :: RemoteFunction).OnServerInvoke = buy

	DataService.onLoaded(syncAttributes)
	PlotService.onClaimed(function(plot)
		plotChanged(plot, true)
	end)
	PlotService.onReleased(function(plot)
		plotChanged(plot, false)
	end)
	Players.PlayerRemoving:Connect(function(player)
		lastBuy[player] = nil
	end)
end

return UpgradeService
