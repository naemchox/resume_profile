-- ตัวช่วยสร้างชิ้นส่วนแมพ ทุกชิ้น Anchored ผิวเรียบ

local Util = {}

local FONT = Font.fromEnum(Enum.Font.FredokaOne)

-- สร้าง Part (หรือ class อื่นผ่าน props.ClassName) แล้วใส่ค่าที่ส่งมา
function Util.part(parent: Instance, name: string, props: { [string]: any }): BasePart
	local p = Instance.new(props.ClassName or "Part") :: any
	p.Name = name
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	-- Shape ต้องมาก่อน Size ไม่งั้นขนาดลูกบอลอาจเพี้ยน
	if props.Shape then
		p.Shape = props.Shape
	end
	for key, value in props do
		if key ~= "ClassName" and key ~= "Shape" then
			p[key] = value
		end
	end
	p.Parent = parent
	return p
end

-- กล่องจากมุมต่ำสุดถึงมุมสูงสุด (พิกัด local ของ origin)
function Util.box(parent: Instance, name: string, origin: CFrame, min: Vector3, max: Vector3, props: { [string]: any }?): BasePart
	local p = props or {}
	local size = max - min
	p.Size = Vector3.new(math.abs(size.X), math.abs(size.Y), math.abs(size.Z))
	p.CFrame = origin * CFrame.new((min + max) / 2)
	return Util.part(parent, name, p)
end

-- จุดล่องหน ใช้เป็น waypoint / จุดคิว / จุดเกิด ให้สคริปต์ใช้ทีหลัง
function Util.marker(parent: Instance, name: string, cf: CFrame): BasePart
	return Util.part(parent, name, {
		Size = Vector3.new(2, 0.2, 2),
		CFrame = cf,
		Transparency = 1,
		CanCollide = false,
		CanTouch = false,
		CanQuery = false,
		CastShadow = false,
	})
end

-- ทรงกระบอกตั้งตรง (Cylinder ของ Roblox วางแกน X จึงต้องหมุน)
function Util.cylinder(parent: Instance, name: string, baseCf: CFrame, height: number, diameter: number, props: { [string]: any }?): BasePart
	local p = props or {}
	p.Shape = Enum.PartType.Cylinder
	p.Size = Vector3.new(height, diameter, diameter)
	p.CFrame = baseCf * CFrame.new(0, height / 2, 0) * CFrame.Angles(0, 0, math.pi / 2)
	return Util.part(parent, name, p)
end

-- หูแมวสามเหลี่ยม: WedgePart 2 ชิ้นหันหลังชนกัน หน้าหูหัน +Z
-- baseCf = กึ่งกลางฐานหู
function Util.ear(parent: Instance, name: string, baseCf: CFrame, width: number, height: number, thickness: number, color: Color3)
	local half = width / 2
	for i, side in { -1, 1 } do
		Util.part(parent, name .. i, {
			ClassName = "WedgePart",
			Size = Vector3.new(thickness, height, half),
			CFrame = baseCf * CFrame.new(side * half / 2, height / 2, 0) * CFrame.Angles(0, -side * math.pi / 2, 0),
			Color = color,
		})
	end
end

local function makeLabel(text: string, color: Color3?): TextLabel
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextScaled = true
	label.FontFace = FONT
	label.TextColor3 = color or Color3.fromRGB(96, 62, 84)
	return label
end

-- ข้อความติดผิวชิ้นส่วน (ป้ายร้าน ป้ายสถานี)
-- area = {position, size} แบบ UDim2 ถ้าอยากแบ่งป้ายเป็นหลายบรรทัด
function Util.surfaceText(part: BasePart, face: Enum.NormalId, text: string, color: Color3?, area: { position: UDim2, size: UDim2 }?): TextLabel
	local gui = part:FindFirstChild("Gui_" .. face.Name) :: SurfaceGui?
	if not gui then
		local g = Instance.new("SurfaceGui")
		g.Name = "Gui_" .. face.Name
		g.Face = face
		g.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		g.PixelsPerStud = 40
		g.LightInfluence = 0
		g.Parent = part
		gui = g
	end
	local label = makeLabel(text, color)
	if area then
		label.Position = area.position
		label.Size = area.size
	end
	label.Parent = gui
	return label
end

-- ป้ายลอยเหนือของ (มองเห็นจากทุกมุม อ่านง่ายบนมือถือ)
-- offset = ตำแหน่งป้ายเทียบกับกึ่งกลาง part (แกน local ของ part)
-- ป้ายหมุนหันกล้องเสมอ จุดวางต้องห่างผนังเกินครึ่งความกว้างป้าย ไม่งั้นป้ายจมผนังตอนมองเฉียง
function Util.billboard(part: BasePart, text: string, offset: Vector3, widthStuds: number?): TextLabel
	local anchor = Instance.new("Attachment")
	anchor.Name = "BillboardAnchor"
	anchor.Position = offset
	anchor.Parent = part

	local gui = Instance.new("BillboardGui")
	gui.Name = "Billboard"
	gui.Adornee = anchor
	gui.Size = UDim2.fromScale(widthStuds or 7, 1.6)
	gui.MaxDistance = 70
	gui.LightInfluence = 0
	local label = makeLabel(text, Color3.fromRGB(255, 255, 255))
	label.TextStrokeTransparency = 0.2
	label.TextStrokeColor3 = Color3.fromRGB(96, 62, 84)
	label.Parent = gui
	gui.Parent = part
	return label
end

-- ต้นไม้ทรงกลม (ลำต้น + พุ่ม)
function Util.tree(parent: Instance, baseCf: CFrame, trunkColor: Color3, leafColor: Color3)
	local model = Instance.new("Model")
	model.Name = "Tree"
	Util.cylinder(model, "Trunk", baseCf, 6, 1.6, { Color = trunkColor })
	Util.part(model, "Leaves", {
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(8, 8, 8),
		CFrame = baseCf * CFrame.new(0, 8.5, 0),
		Color = leafColor,
	})
	model.Parent = parent
	return model
end

-- โคมไฟเสา
function Util.lamp(parent: Instance, baseCf: CFrame, postColor: Color3, glowColor: Color3)
	local model = Instance.new("Model")
	model.Name = "Lamp"
	Util.part(model, "Post", {
		Size = Vector3.new(0.6, 8, 0.6),
		CFrame = baseCf * CFrame.new(0, 4, 0),
		Color = postColor,
	})
	local bulb = Util.part(model, "Bulb", {
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(1.8, 1.8, 1.8),
		CFrame = baseCf * CFrame.new(0, 8.6, 0),
		Color = glowColor,
		Material = Enum.Material.Neon,
	})
	local light = Instance.new("PointLight")
	light.Range = 18
	light.Brightness = 1.2
	light.Color = glowColor
	light.Parent = bulb
	model.Parent = parent
	return model
end

return Util
