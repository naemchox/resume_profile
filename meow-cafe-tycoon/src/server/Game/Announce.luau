--[[
	ประกาศให้ทุกคนในเซิร์ฟเวอร์เห็น (เช่น ยูนิคอร์นมาที่ร้านใคร)

	RemoteEvent ทางเดียว: เซิร์ฟเวอร์ → ผู้เล่นเท่านั้น
	เซิร์ฟเวอร์ไม่ฟัง OnServerEvent เลย ผู้เล่นจึงส่งอะไรกลับมาไม่ได้ ไม่เปิดช่องโกง (PLAN.md ข้อ 9.2 ง.)
	ฝั่งผู้เล่นแสดงผลที่ src/client/Announcement.client.luau
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Announce = {}

local remote: RemoteEvent? = nil

function Announce.init()
	local folder = ReplicatedStorage:FindFirstChild("Remotes")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	local event = folder:FindFirstChild("Announcement") :: RemoteEvent?
	if not event then
		local e = Instance.new("RemoteEvent")
		e.Name = "Announcement"
		e.Parent = folder
		event = e
	end
	remote = event
end

function Announce.all(text: string)
	if remote then
		remote:FireAllClients(text)
	end
end

-- ประกาศให้คนเดียวเห็น (เช่น โหลดเซฟไม่สำเร็จ)
function Announce.to(player: Player, text: string)
	if remote and player.Parent then
		remote:FireClient(player, text)
	end
end

return Announce
