-- จุดเริ่มฝั่งเซิร์ฟเวอร์: สร้างแมพ แล้วเปิดระบบเกม (PLAN.md ข้อ 9, ขั้น 6A)

local Workspace = game:GetService("Workspace")

local Map = require(script.Parent.Map)
local DataService = require(script.Parent.Game.DataService)
local Economy = require(script.Parent.Game.Economy)
local PlotService = require(script.Parent.Game.PlotService)
local StationService = require(script.Parent.Game.StationService)
local CustomerService = require(script.Parent.Game.CustomerService)
local Announce = require(script.Parent.Game.Announce)
local HelpService = require(script.Parent.Game.HelpService)
local UpgradeService = require(script.Parent.Game.UpgradeService)

Map.build()

local plots = Workspace:WaitForChild("Plots") :: Folder
Announce.init()
DataService.init()
Economy.init()
UpgradeService.init() -- ก่อน PlotService: ต้องลงทะเบียนเปิดโต๊ะตอนจองร้านก่อน
CustomerService.init() -- ต้องลงทะเบียนก่อน PlotService เริ่มรับการจองร้าน
StationService.init(plots)
PlotService.init(plots)
HelpService.init(plots)
