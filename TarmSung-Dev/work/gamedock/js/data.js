/* GAMEDOCK — คลังสินค้า (แหล่งข้อมูลชุดเดียวของทั้งเว็บ)
   หน้าแรกถูกสร้างจากลิสต์นี้ตั้งแต่ตอนเขียนไฟล์ ส่วนตะกร้า/บัญชี/หลังบ้าน
   อ่านลิสต์เดียวกันนี้ตอนรัน — ของชนิดเดียวกันจึงมีที่มาที่เดียว แก้ราคาที่นี่
   ที่เดียวแล้วเปลี่ยนทั้งเว็บ ไม่ใช่ไล่แก้ทีละหน้า
   ตอนต่อฐานข้อมูลจริง ไฟล์นี้จะถูกแทนด้วย GET /api/products ที่คืนรูปแบบเดียวกัน */
window.GD_PRODUCTS = /* PRODUCTS_JSON_START */ [
{"sku":"NVD-PS5-DLX","name":"Nova Drifter — Deluxe Edition (แผ่นแท้ โซน 3)","art":"nova","cover":"NOVA<br>DRIFTER","plats":["PS5"],"price":1790,"was":2290,"badge":["off","-22%"],"rating":4.8,"reviews":214,"sold":182,"stock":48,"group":"flash"},
{"sku":"IRS-PS5-STD","name":"Iron Siege: Last Bastion (พากย์ไทย)","art":"siege","cover":"IRON<br>SIEGE","plats":["PS5","PC"],"price":1290,"was":1990,"badge":["off","-35%"],"rating":4.6,"reviews":97,"sold":140,"stock":20,"group":"flash"},
{"sku":"SLV-NSW-STD","name":"Silent Verdant — Standard Edition","art":"verd","cover":"SILENT<br>VERDANT","plats":["SWITCH"],"price":990,"was":1590,"badge":["off","-38%"],"rating":4.9,"reviews":332,"sold":290,"stock":10,"group":"flash"},
{"sku":"RKX-NSW-STD","name":"Rally King X (รองรับเล่น 4 คนจอเดียว)","art":"rally","cover":"RALLY<br>KING X","plats":["SWITCH"],"price":890,"was":1290,"badge":["off","-31%"],"rating":4.5,"reviews":128,"sold":96,"stock":54,"group":"flash"},
{"sku":"NN7-XBX-COL","name":"Night Noir 1977 — Collector Edition","art":"noir","cover":"NIGHT<br>NOIR 77","plats":["XBOX"],"price":1490,"was":2490,"badge":["off","-40%"],"rating":4.7,"reviews":76,"sold":61,"stock":9,"group":"flash"},
{"sku":"ABP-PC-KEY","name":"Abyss Protocol (โค้ดดิจิทัล ส่งอีเมลทันที)","art":"abyss","cover":"ABYSS<br>PROTOCOL","plats":["PC"],"price":690,"was":1190,"badge":["off","-42%"],"rating":4.4,"reviews":203,"sold":410,"stock":90,"group":"flash","digital":true},

{"sku":"DFZ-PS5-ULT","name":"Drift Zero — Ultimate Edition","art":"drift","cover":"DRIFT<br>ZERO","plats":["PS5"],"price":1990,"badge":["new","ใหม่"],"rating":4.7,"reviews":58,"stock":25,"group":"grid"},
{"sku":"KES-NSW-STD","name":"Kite of the Elder Sky (มีซับไทย)","art":"kite","cover":"KITE OF<br>ELDER SKY","plats":["SWITCH"],"price":1690,"badge":["pre","พรีออเดอร์"],"note":"วางจำหน่าย 12 ก.ย.","stock":99,"group":"grid"},
{"sku":"ABP-PC-DLX","name":"Abyss Protocol — Deluxe + Season Pass","art":"abyss","cover":"ABYSS<br>PROTOCOL","plats":["PC"],"price":1390,"was":1790,"badge":["off","-22%"],"rating":4.4,"reviews":203,"stock":40,"group":"grid","digital":true},
{"sku":"NVD-PS5-STD","name":"Nova Drifter — Standard Edition","art":"nova","cover":"NOVA<br>DRIFTER","plats":["PS5"],"price":1490,"rating":4.8,"reviews":214,"stock":60,"group":"grid"},
{"sku":"NN7-XBX-USED","name":"Night Noir 1977 (มือสอง สภาพดีมาก)","art":"noir","cover":"NIGHT<br>NOIR 77","plats":["XBOX"],"price":790,"badge":["used","มือสอง"],"note":"ตรวจสภาพแล้ว ประกันร้าน 30 วัน","rating":4.7,"reviews":76,"stock":3,"group":"grid"},
{"sku":"SLV-NSW-ART","name":"Silent Verdant + อาร์ตบุ๊กปกแข็ง","art":"verd","cover":"SILENT<br>VERDANT","plats":["SWITCH"],"price":1890,"rating":4.9,"reviews":332,"stock":12,"group":"grid"},
{"sku":"IRS-PS5-USED","name":"Iron Siege: Last Bastion (มือสอง)","art":"siege","cover":"IRON<br>SIEGE","plats":["PS5"],"price":690,"badge":["used","มือสอง"],"note":"ตรวจสภาพแล้ว ประกันร้าน 30 วัน","rating":4.6,"reviews":97,"stock":2,"group":"grid"},
{"sku":"RKX-MUL-GLD","name":"Rally King X — Gold Edition","art":"rally","cover":"RALLY<br>KING X","plats":["SWITCH","PC"],"price":1290,"was":1590,"badge":["off","-19%"],"rating":4.5,"reviews":128,"stock":30,"group":"grid"},
{"sku":"DFZ-PC-KEY","name":"Drift Zero (โค้ดดิจิทัล Steam)","art":"drift","cover":"DRIFT<br>ZERO","plats":["PC"],"price":1190,"note":"ส่งโค้ดทางอีเมลทันที","rating":4.7,"reviews":58,"stock":999,"group":"grid","digital":true},
{"sku":"KES-NSW-COL","name":"Kite of the Elder Sky — Collector Box","art":"kite","cover":"KITE OF<br>ELDER SKY","plats":["SWITCH"],"price":3290,"badge":["pre","พรีออเดอร์"],"note":"วางจำหน่าย 12 ก.ย.","stock":15,"group":"grid"},
{"sku":"NVD-PS5-SP","name":"Nova Drifter — Season Pass (โค้ดเสริม)","art":"nova","cover":"NOVA<br>DRIFTER","plats":["PS5"],"price":590,"note":"ส่งโค้ดทางอีเมลทันที","rating":4.3,"reviews":41,"stock":999,"group":"grid","digital":true},
{"sku":"ABP-PC-STD","name":"Abyss Protocol — Standard (แผ่นแท้)","art":"abyss","cover":"ABYSS<br>PROTOCOL","plats":["PC"],"price":890,"was":1190,"badge":["off","-25%"],"rating":4.4,"reviews":203,"stock":22,"group":"grid"},

{"sku":"HW-PS5-SLIM","name":"PlayStation 5 Slim (รุ่นใส่แผ่น)","art":"drift","cover":"PS5","plats":["เครื่อง"],"price":16900,"was":18500,"stock":8,"group":"console","spec":["1TB SSD","4K 120Hz","จอย DualSense 1 ตัว","เครื่องศูนย์ไทย"],"icon":"i-console","inst":1690},
{"sku":"HW-NSW-OLED","name":"Nintendo Switch OLED (เครื่องศูนย์ไทย)","art":"verd","cover":"SWITCH","plats":["เครื่อง"],"price":11900,"stock":4,"group":"console","spec":["จอ OLED 7\"","64GB","จอย Joy-Con คู่","ประกัน 1 ปี"],"icon":"i-handheld","inst":1190},
{"sku":"HW-XBX-SX","name":"Xbox Series X (1TB · ใส่แผ่น)","art":"noir","cover":"XBOX","plats":["เครื่อง"],"price":15900,"was":17200,"stock":6,"group":"console","spec":["1TB SSD","4K 120Hz","จอยไร้สาย","ประกัน 1 ปี"],"icon":"i-console","inst":1590},
{"sku":"HW-PS5-VR","name":"ชุดแว่น VR ไร้สาย (เล่นได้เองไม่ต้องต่อเครื่อง)","art":"abyss","cover":"VR","plats":["เครื่อง"],"price":18900,"stock":2,"group":"console","spec":["จอ OLED 4K","คอนโทรลเลอร์ 2 ชิ้น","ประกัน 1 ปี"],"icon":"i-vr","inst":1890},

{"sku":"GC-PSN","name":"บัตร PlayStation Store","art":"nova","cover":"PSN","plats":["บัตร"],"price":300,"stock":999,"group":"code","digital":true,"opts":[300,600,1000,2000]},
{"sku":"GC-NIN","name":"บัตร Nintendo eShop","art":"verd","cover":"eSHOP","plats":["บัตร"],"price":350,"stock":999,"group":"code","digital":true,"opts":[350,700,1400]},
{"sku":"GC-XGP","name":"บัตร Xbox Game Pass","art":"noir","cover":"GAME PASS","plats":["บัตร"],"price":329,"stock":999,"group":"code","digital":true,"opts":[329,899,3290]},
{"sku":"GC-STM","name":"บัตร Steam Wallet","art":"drift","cover":"STEAM","plats":["บัตร"],"price":150,"stock":999,"group":"code","digital":true,"opts":[150,500,1000]}
] /* PRODUCTS_JSON_END */;
