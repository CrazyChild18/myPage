TRIP = {
    "slug": "iceland-2026",
    "title": "冰岛环线自驾 · 2026",
    "subtitle": "4 人 · 北京出发 · Land Rover Defender 4x4",
    "start_date": "2026-09-26",
    "end_date": "2026-10-07",
    "travelers": 4,
    "origin": "北京",
    "summary": "以 Borg、教堂城和凯夫拉维克为住宿据点，覆盖黄金圈、雷克雅内斯半岛、南岸、冰河湖、F225 与蓝湖。",
    "car": "Land Rover Defender 4x4；9月26日至10月5日；Platinum Insurance、道路救援、额外驾驶员、4G WiFi、不限里程。",
    "car_image_url": "https://volcanotrails.overcastcdn.com/images/536_04.2e16d0ba.fill-1200x630.jpg",
    "accommodations": [
        {
            "name": "Borg 整套小木屋",
            "dates": "9月26日入住，9月30日退房",
            "address": "Borg, Grímsnes- og Grafningshreppur 805, Iceland",
            "details": "三间卧室、一个卫生间、有厨房；Notion 记录总费用 ¥8,717.26。",
            "image_url": "https://images.unsplash.com/photo-1520984032042-162d526883e0?auto=format&fit=crop&w=1400&q=82",
        },
        {
            "name": "教堂城整套小木屋",
            "dates": "9月30日入住，10月4日退房",
            "address": "Hæðargarður, 教堂城, Skaftárhreppur 881, Iceland",
            "details": "三间卧室、四张床、有厨房；Notion 记录价格 ¥12,632.21。",
            "image_url": "https://images.unsplash.com/photo-1486911278844-a81c5267e227?auto=format&fit=crop&w=1400&q=82",
        },
        {
            "name": "凯夫拉维克机场附近出租单元",
            "dates": "10月4日入住，10月6日退房",
            "address": "Sunnubraut 16 1. hæð, 凯夫拉维克, Iceland",
            "details": "三间卧室、有厨房，距离国际机场约 5 分钟车程；Notion 记录价格 ¥5,780.66。",
            "image_url": "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1400&q=82",
        },
    ],
}


ICELAND_IMAGES = {
    "golden": "https://images.unsplash.com/photo-1504893524553-b855bce32c67?auto=format&fit=crop&w=1400&q=82",
    "geothermal": "https://images.unsplash.com/photo-1529963183134-61a90db47eaf?auto=format&fit=crop&w=1400&q=82",
    "reykjavik": "https://images.unsplash.com/photo-1520769669658-f07657f5a307?auto=format&fit=crop&w=1400&q=82",
    "south": "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=1400&q=82",
    "glacier": "https://images.unsplash.com/photo-1499244571948-7ccddb3583f1?auto=format&fit=crop&w=1400&q=82",
    "road": "https://images.unsplash.com/photo-1504893524553-b855bce32c67?auto=format&fit=crop&w=1400&q=82",
    "cabin": "https://images.unsplash.com/photo-1520984032042-162d526883e0?auto=format&fit=crop&w=1400&q=82",
    "airport": "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1400&q=82",
}


def image_for(title, node_type, city):
    if node_type == "hotel":
        return ICELAND_IMAGES["cabin"]
    if node_type == "transport":
        return ICELAND_IMAGES["airport"] if "机场" in title or "巴黎" in title or "北京" in title else ICELAND_IMAGES["road"]
    if any(word in title for word in ("蓝湖", "Gunnuhver", "Secret Lagoon", "Kerið", "盖歇尔")):
        return ICELAND_IMAGES["geothermal"]
    if any(word in title for word in ("冰川", "Jökulsárlón", "Diamond", "Hofs")):
        return ICELAND_IMAGES["glacier"]
    if city == "雷克雅未克":
        return ICELAND_IMAGES["reykjavik"]
    if city == "黄金圈":
        return ICELAND_IMAGES["golden"]
    if city in ("南岸", "维克", "教堂城", "东南冰岛"):
        return ICELAND_IMAGES["south"]
    return ICELAND_IMAGES["road"]


def node(node_id, day, date, time, title, node_type, lat, lng, description, city):
    return {
        "id": node_id,
        "day": day,
        "date": date,
        "time": time,
        "title": title,
        "type": node_type,
        "lat": lat,
        "lng": lng,
        "description": description,
        "city": city,
        "status": "planned",
        "image_url": image_for(title, node_type, city),
    }


NODES = [
    node("is-d01-01", 1, "2026-09-26", "15:00", "抵达凯夫拉维克国际机场", "transport", 63.9850, -22.6056, "航班落地后入境、取行李，并领取租赁的 Land Rover Defender 4x4。", "凯夫拉维克"),
    node("is-d01-02", 1, "2026-09-26", "18:00", "入住 Borg 小木屋", "hotel", 64.0737, -20.7649, "前往 Borg, Grímsnes- og Grafningshreppur 805 办理入住，作为黄金圈阶段的住宿据点。", "Borg"),
    node("is-d02-01", 2, "2026-09-27", "09:00", "从 Borg 小木屋出发", "transport", 64.0737, -20.7649, "黄金圈自驾日，从小木屋出发。", "黄金圈"),
    node("is-d02-02", 2, "2026-09-27", "10:00", "辛格维利尔国家公园", "sightseeing", 64.2559, -21.1295, "从 Borg 约 50km / 45min。游览 Þingvellir 国家公园。", "黄金圈"),
    node("is-d02-03", 2, "2026-09-27", "12:00", "Kerið 火山口", "sightseeing", 64.0413, -20.8851, "从辛格维利尔约 55km / 50min。", "黄金圈"),
    node("is-d02-04", 2, "2026-09-27", "14:00", "盖歇尔间歇泉", "sightseeing", 64.3104, -20.3024, "从 Kerið 约 55km / 50min。", "黄金圈"),
    node("is-d02-05", 2, "2026-09-27", "15:30", "黄金瀑布", "sightseeing", 64.3271, -20.1199, "从盖歇尔约 10km / 10min。", "黄金圈"),
    node("is-d02-06", 2, "2026-09-27", "17:30", "Flúðir / Secret Lagoon", "leisure", 64.1376, -20.3090, "从黄金瀑布约 60km / 1h，泡温泉后返回 Borg 休息。", "黄金圈"),
    node("is-d02-07", 2, "2026-09-27", "20:30", "返回 Borg 小木屋", "hotel", 64.0737, -20.7649, "结束黄金圈一日自驾。", "Borg"),
    node("is-d03-01", 3, "2026-09-28", "09:00", "Gunnuhver 地热区", "sightseeing", 63.8192, -22.6844, "雷克雅内斯半岛轻松一日，先游览 Gunnuhver 地热区。", "雷克雅内斯半岛"),
    node("is-d03-02", 3, "2026-09-28", "10:30", "Reykjanesviti 灯塔", "sightseeing", 63.8159, -22.7051, "参观雷克雅内斯灯塔。", "雷克雅内斯半岛"),
    node("is-d03-03", 3, "2026-09-28", "12:30", "Bridge Between Continents", "sightseeing", 63.8683, -22.6755, "在欧亚与北美板块之间的桥梁停留。", "雷克雅内斯半岛"),
    node("is-d03-04", 3, "2026-09-28", "15:00", "蓝湖温泉（体力允许可加）", "leisure", 63.8804, -22.4495, "Notion 方案中的可选项目，建议提前预约；若当天不去，10月5日仍有正式蓝湖安排。", "雷克雅内斯半岛"),
    node("is-d03-05", 3, "2026-09-28", "19:00", "返回 Borg 小木屋", "hotel", 64.0737, -20.7649, "结束雷克雅内斯半岛约 140km / 2.5h 自驾。", "Borg"),
    node("is-d04-01", 4, "2026-09-29", "09:30", "哈尔格林姆教堂", "sightseeing", 64.1417, -21.9266, "从 Borg 前往雷克雅未克市区。", "雷克雅未克"),
    node("is-d04-02", 4, "2026-09-29", "11:00", "哈帕音乐厅", "sightseeing", 64.1500, -21.9326, "沿市区步行游览哈帕音乐厅。", "雷克雅未克"),
    node("is-d04-03", 4, "2026-09-29", "12:00", "太阳航海者", "sightseeing", 64.1476, -21.9223, "海岸线上的太阳航海者雕塑。", "雷克雅未克"),
    node("is-d04-04", 4, "2026-09-29", "14:00", "托宁湖", "leisure", 64.1462, -21.9425, "在雷克雅未克市区散步休息。", "雷克雅未克"),
    node("is-d04-05", 4, "2026-09-29", "16:00", "Bónus 采购补给", "shopping", 64.1450, -21.9080, "采购后续南岸与长途自驾所需补给。", "雷克雅未克"),
    node("is-d04-06", 4, "2026-09-29", "19:00", "返回 Borg 小木屋", "hotel", 64.0737, -20.7649, "完成雷克雅未克市区日。", "Borg"),
    node("is-d05-01", 5, "2026-09-30", "09:00", "从 Borg 退房出发", "transport", 64.0737, -20.7649, "更换住宿，开始南岸行程。", "南岸"),
    node("is-d05-02", 5, "2026-09-30", "11:00", "塞里雅兰瀑布", "sightseeing", 63.6156, -19.9886, "从 Borg 约 125km / 1h40min。", "南岸"),
    node("is-d05-03", 5, "2026-09-30", "13:00", "斯科加瀑布", "sightseeing", 63.5321, -19.5114, "从塞里雅兰瀑布约 30km / 25min。", "南岸"),
    node("is-d05-04", 5, "2026-09-30", "15:00", "Loftsalahellir Cave", "sightseeing", 63.4215, -19.1532, "按 Notion 方案停留 Loftsalahellir Cave。", "南岸"),
    node("is-d05-05", 5, "2026-09-30", "16:00", "Dyrhólaey", "sightseeing", 63.4029, -19.1303, "游览 Dyrhólaey 海岬。", "南岸"),
    node("is-d05-06", 5, "2026-09-30", "19:00", "入住教堂城小木屋", "hotel", 63.7907, -18.0569, "入住 Hæðargarður, 教堂城；晚上视天气等待极光。", "教堂城"),
    node("is-d06-01", 6, "2026-10-01", "09:30", "Víkurfjara Black Sand Beach", "sightseeing", 63.4186, -19.0059, "游览维克黑沙滩。", "维克"),
    node("is-d06-02", 6, "2026-10-01", "11:30", "Víkurkirkja", "sightseeing", 63.4194, -19.0106, "参观维克教堂。", "维克"),
    node("is-d06-03", 6, "2026-10-01", "14:00", "Fjaðrárgljúfur", "sightseeing", 63.7713, -18.1718, "游览羽毛峡谷。", "教堂城"),
    node("is-d06-04", 6, "2026-10-01", "17:00", "Bónus 采购补给", "shopping", 63.4183, -19.0060, "按计划采购后续自驾补给。", "维克"),
    node("is-d06-05", 6, "2026-10-01", "19:30", "返回教堂城小木屋", "hotel", 63.7907, -18.0569, "结束约 160km / 2h40min 自驾。", "教堂城"),
    node("is-d07-01", 7, "2026-10-02", "09:00", "Hofs Church", "sightseeing", 63.9057, -16.7064, "前往 Hofs Church。", "东南冰岛"),
    node("is-d07-02", 7, "2026-10-02", "12:00", "Jökulsárlón Glacier Lagoon", "sightseeing", 64.0784, -16.2306, "游览杰古沙龙冰河湖。", "东南冰岛"),
    node("is-d07-03", 7, "2026-10-02", "14:30", "Diamond Beach", "sightseeing", 64.0442, -16.1770, "游览钻石沙滩。", "东南冰岛"),
    node("is-d07-04", 7, "2026-10-02", "19:30", "返回教堂城小木屋", "hotel", 63.7907, -18.0569, "结束约 360km / 5h 长途自驾。", "教堂城"),
    node("is-d08-01", 8, "2026-10-03", "09:00", "F225 内陆探险", "transport", 63.9830, -19.6360, "按 Notion 方案驾驶 F225；出发前必须确认道路开放、天气和涉水条件。", "Fjallabak"),
    node("is-d08-02", 8, "2026-10-03", "12:00", "Fjallabak Nature Reserve", "sightseeing", 63.9833, -19.0667, "Fjallabak 自然保护区探索。", "Fjallabak"),
    node("is-d08-03", 8, "2026-10-03", "18:30", "返回教堂城小木屋", "hotel", 63.7907, -18.0569, "结束 F 路约 115km / 2h 计划路段，实际用时以路况为准。", "教堂城"),
    node("is-d09-01", 9, "2026-10-04", "08:30", "冰川徒步", "leisure", 63.9905, -16.9667, "按 Notion 方案参加冰川徒步，具体集合点和时段待预订后补充。", "南岸"),
    node("is-d09-02", 9, "2026-10-04", "14:00", "开车前往凯夫拉维克", "transport", 63.9850, -22.6056, "冰川徒步后长途前往凯夫拉维克机场区域。", "凯夫拉维克"),
    node("is-d09-03", 9, "2026-10-04", "20:00", "入住凯夫拉维克机场附近民宿", "hotel", 64.0049, -22.5624, "入住 Sunnubraut 16 1. hæð，距离国际机场约 5 分钟车程。", "凯夫拉维克"),
    node("is-d10-01", 10, "2026-10-05", "10:00", "蓝湖温泉", "leisure", 63.8804, -22.4495, "从民宿前往蓝湖温泉，约 50km / 45min。", "雷克雅内斯半岛"),
    node("is-d10-02", 10, "2026-10-05", "16:00", "整理行李并归还租车", "transport", 63.9850, -22.6056, "归还车辆前整理行李并检查油量、车辆与个人物品，办理还车。", "凯夫拉维克"),
    node("is-d10-03", 10, "2026-10-05", "19:00", "返回机场附近民宿", "hotel", 64.0049, -22.5624, "完成还车，保证次日清晨从容出发。", "凯夫拉维克"),
    node("is-d11-01", 11, "2026-10-06", "05:30", "前往凯夫拉维克机场", "transport", 63.9850, -22.6056, "清晨出发，办理值机与退税，冰岛本地行程结束。", "凯夫拉维克"),
    node("is-d11-02", 11, "2026-10-06", "08:00", "凯夫拉维克机场 → 巴黎", "transport", 49.0097, 2.5479, "搭乘返程航班前往巴黎；具体航班信息待补充。", "巴黎"),
    node("is-d12-01", 12, "2026-10-07", "10:00", "巴黎 → 北京", "transport", 40.0801, 116.5847, "从巴黎返程北京，具体航班信息待补充。", "北京"),
]


def edge(edge_id, source, target, transport_type="car", distance=None, duration=None):
    return {
        "id": edge_id,
        "source": source,
        "target": target,
        "transport_type": transport_type,
        "distance": distance,
        "duration": duration,
    }


EDGE_DETAILS = {
    ("is-d02-01", "is-d02-02"): ("car", "50 km", "45 min"),
    ("is-d02-02", "is-d02-03"): ("car", "55 km", "50 min"),
    ("is-d02-03", "is-d02-04"): ("car", "55 km", "50 min"),
    ("is-d02-04", "is-d02-05"): ("car", "10 km", "10 min"),
    ("is-d02-05", "is-d02-06"): ("car", "60 km", "1 h"),
    ("is-d03-01", "is-d03-02"): ("car", None, "短途"),
    ("is-d04-01", "is-d04-02"): ("walk", None, "步行"),
    ("is-d04-02", "is-d04-03"): ("walk", None, "步行"),
    ("is-d04-03", "is-d04-04"): ("walk", None, "步行"),
    ("is-d05-01", "is-d05-02"): ("car", "125 km", "1 h 40 min"),
    ("is-d05-02", "is-d05-03"): ("car", "30 km", "25 min"),
    ("is-d10-01", "is-d10-02"): ("car", "约 50 km", "45 min"),
    ("is-d11-01", "is-d11-02"): ("flight", None, "航班"),
    ("is-d11-02", "is-d12-01"): ("flight", None, "航班"),
}


EDGES = []
for index, current in enumerate(NODES[:-1]):
    following = NODES[index + 1]
    if current["day"] != following["day"] and current["id"] != "is-d11-02":
        continue
    values = EDGE_DETAILS.get((current["id"], following["id"]), ("car", None, None))
    EDGES.append(edge(f"is-e{len(EDGES) + 1:02d}", current["id"], following["id"], *values))
