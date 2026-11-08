--[[
	โหลด / เซฟข้อมูลผู้เล่น (PLAN.md ข้อ 10.2)
	ข้อมูลต่อผู้เล่น: { version = 1, coins, upgrades = { Speed, Seats, Price } }

	- โหลดตอนเข้าเกม (ลอง 4 ครั้ง) · เซฟทุก Config.Data.AutoSave วินาที · เซฟตอนออก · เซฟทุกคนตอนเซิร์ฟเวอร์ปิด
	- โหลดไม่สำเร็จ = เล่นได้แต่ไม่เซฟทับ ข้อมูลเดิมจะได้ไม่หาย แล้วบอกผู้เล่น
	- กันเซฟซ้อน 2 เซิร์ฟเวอร์: ข้อมูลมีป้าย lock ว่าเซิร์ฟเวอร์ไหนถืออยู่
	  เซิร์ฟเวอร์อื่นถืออยู่ (ยังไม่เก่าเกิน 2 นาที) → รอให้ปล่อยก่อน · เซฟได้เฉพาะเซิร์ฟเวอร์ที่ถือ lock
	- ใช้ UpdateAsync ทุกครั้ง ไม่ใช้ SetAsync
	- Studio ใช้ที่เก็บชื่อ ..._Dev (ต้องเปิด Game Settings → Security → Enable Studio Access to API Services)
]]

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Announce = require(script.Parent.Announce)

local DataService = {}

export type Data = {
	version: number,
	coins: number,
	upgrades: { [string]: number },
}

type Profile = {
	data: Data,
	canSave: boolean, -- false = โหลดไม่สำเร็จ ห้ามเซฟทับ
	saving: boolean,
}

local IS_STUDIO = RunService:IsStudio()
local SERVER_ID = HttpService:GenerateGUID(false) -- ใช้แทน JobId (ใน Studio JobId ว่าง)
local LOCK_TIMEOUT = 120 -- วินาที · lock เก่ากว่านี้ถือว่าเซิร์ฟเวอร์เดิมดับไปแล้ว

local store: DataStore? = nil
local profiles: { [Player]: Profile } = {}
local loadedCallbacks: { (Player, Data) -> () } = {}

local function key(player: Player): string
	return "Player_" .. player.UserId
end

local function defaultData(): Data
	local upgrades = {}
	for id in Config.Upgrades do
		upgrades[id] = 0
	end
	return { version = 1, coins = 0, upgrades = upgrades }
end

-- เติมช่องที่ขาด / ตัดค่าที่ผิด (เผื่อเพิ่มอัปเกรดใหม่ในอนาคต หรือข้อมูลเสีย)
local function clean(raw: any): Data
	local data = defaultData()
	if typeof(raw) ~= "table" then
		return data
	end
	if typeof(raw.coins) == "number" and raw.coins >= 0 then
		data.coins = math.floor(raw.coins)
	end
	if typeof(raw.upgrades) == "table" then
		for id, def in Config.Upgrades do
			local level = raw.upgrades[id]
			if typeof(level) == "number" then
				data.upgrades[id] = math.clamp(math.floor(level), 0, def.max)
			end
		end
	end
	return data
end

local function lockFree(raw: any): boolean
	local lock = typeof(raw) == "table" and raw.lock
	if typeof(lock) ~= "table" or lock.server == SERVER_ID then
		return true
	end
	return typeof(lock.time) ~= "number" or os.time() - lock.time > LOCK_TIMEOUT
end

-- โหลด + จอง lock · คืน (สำเร็จไหม, ข้อมูล)
local function load(player: Player): (boolean, Data?)
	if not store then
		return false, nil
	end
	local ATTEMPTS = 4
	for attempt = 1, ATTEMPTS do
		local result: Data? = nil
		local busy = false
		-- รอบสุดท้ายยังติด lock = เซิร์ฟเวอร์เดิมน่าจะค้าง ยึด lock มาเลย
		local force = attempt == ATTEMPTS
		local ok, err = pcall(function()
			store:UpdateAsync(key(player), function(raw)
				if not force and not lockFree(raw) then
					busy = true
					return nil -- ไม่แก้อะไร รอเซิร์ฟเวอร์เดิมปล่อย
				end
				busy = false
				local data = clean(raw)
				result = data
				local out = table.clone(data) :: any
				out.lock = { server = SERVER_ID, time = os.time() }
				return out
			end)
		end)
		if ok and result then
			return true, result
		end
		-- Studio ยังไม่เปิดสิทธิ์ API = ลองกี่รอบก็ไม่ได้ เลิกเลย จะได้ไม่ต้องรอ
		if not ok and string.find(tostring(err), "403") then
			warn("[DataService] Studio ยังไม่เปิดสิทธิ์: Game Settings → Security → Enable Studio Access to API Services")
			return false, nil
		end
		if not player.Parent then
			return false, nil
		end
		task.wait(busy and 5 or attempt * 2)
	end
	return false, nil
end

-- เซฟ · release = ปล่อย lock ด้วย (ตอนผู้เล่นออก / เซิร์ฟเวอร์ปิด)
local function save(player: Player, profile: Profile, release: boolean)
	if not store or not profile.canSave or profile.saving then
		return
	end
	profile.saving = true
	local data = profile.data
	pcall(function()
		store:UpdateAsync(key(player), function(raw)
			if not lockFree(raw) then
				return nil -- เซิร์ฟเวอร์อื่นถือข้อมูลอยู่แล้ว ห้ามเซฟทับ
			end
			local out = table.clone(data) :: any
			out.upgrades = table.clone(data.upgrades)
			out.lock = if release then nil else { server = SERVER_ID, time = os.time() }
			return out
		end)
	end)
	profile.saving = false
end

local function onPlayerAdded(player: Player)
	if profiles[player] then
		return
	end
	local ok, data = load(player)
	if not player.Parent then
		return
	end

	local profile: Profile = { data = data or defaultData(), canSave = ok, saving = false }
	if IS_STUDIO and Config.Debug.ResetData then
		profile.data = defaultData()
	end
	if IS_STUDIO and Config.Debug.StartCoins > 0 then
		profile.data.coins = Config.Debug.StartCoins
	end
	profiles[player] = profile

	if not ok then
		warn("[DataService] โหลดข้อมูลไม่สำเร็จ: " .. player.Name .. " (เล่นได้แต่จะไม่เซฟ)")
		task.delay(3, function()
			Announce.to(player, "Couldn't load your save. Progress this time won't be saved.")
		end)
	end

	for _, fn in loadedCallbacks do
		task.spawn(fn, player, profile.data)
	end
end

function DataService.init()
	local name = Config.Data.StoreName .. (IS_STUDIO and "_Dev" or "")
	local ok, result = pcall(DataStoreService.GetDataStore, DataStoreService, name)
	if ok then
		store = result
	else
		warn("[DataService] เปิด DataStore ไม่ได้ (ใน Studio ให้เปิด Enable Studio Access to API Services): " .. tostring(result))
	end

	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	Players.PlayerRemoving:Connect(function(player)
		local profile = profiles[player]
		if profile then
			while profile.saving do -- รอรอบเซฟอัตโนมัติที่ค้างอยู่ แล้วค่อยเซฟรอบสุดท้าย
				task.wait(0.1)
			end
			save(player, profile, true)
			profiles[player] = nil
		end
	end)

	-- เซฟอัตโนมัติ
	task.spawn(function()
		while true do
			task.wait(Config.Data.AutoSave)
			for player, profile in profiles do
				task.spawn(save, player, profile, false)
			end
		end
	end)

	-- เซิร์ฟเวอร์ปิด: เซฟทุกคนพร้อมกัน แล้วรอจนเสร็จ (Roblox ให้เวลาราว 30 วินาที)
	game:BindToClose(function()
		local pending = 0
		for player, profile in profiles do
			pending += 1
			task.spawn(function()
				save(player, profile, true)
				pending -= 1
			end)
		end
		-- รอทั้งรอบนี้ และรอบที่ PlayerRemoving เริ่มไว้ก่อนแล้ว
		local function busy(): boolean
			if pending > 0 then
				return true
			end
			for _, profile in profiles do
				if profile.saving then
					return true
				end
			end
			return false
		end
		local started = os.clock()
		while busy() and os.clock() - started < 25 do
			task.wait(0.2)
		end
	end)
end

-- ข้อมูลของผู้เล่น (ยังโหลดไม่เสร็จ = nil) · แก้ค่าในตารางนี้ได้เลย รอบเซฟถัดไปจะเก็บให้
function DataService.get(player: Player): Data?
	local profile = profiles[player]
	return profile and profile.data
end

function DataService.isLoaded(player: Player): boolean
	return profiles[player] ~= nil
end

-- เรียกทุกครั้งที่ผู้เล่นโหลดข้อมูลเสร็จ (ถ้าโหลดเสร็จไปแล้วก่อนลงทะเบียน เรียกให้ทันที)
function DataService.onLoaded(fn: (Player, Data) -> ())
	table.insert(loadedCallbacks, fn)
	for player, profile in profiles do
		task.spawn(fn, player, profile.data)
	end
end

return DataService
