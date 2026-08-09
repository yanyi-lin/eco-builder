# 物种数据缓存

基于 GBIF + GloBI API 获取的物种数据，供 eco-builder 使用。

## 物种分类信息 (GBIF)

| 物种 | 拉丁名 | GBIF Key | 纲 | 目 | 科 |
|------|--------|----------|-----|-----|-----|
| 赤狐 | Vulpes vulpes | 5219243 | Mammalia | Carnivora | Canidae |
| 猞猁 | Lynx lynx | 2435240 | Mammalia | Carnivora | Felidae |
| 雪兔 | Lepus americanus | 2435238 | Mammalia | Lagomorpha | Leporidae |
| 虎 | Panthera tigris | 2440842 | Mammalia | Carnivora | Felidae |
| 马鹿 | Cervus elaphus | 2440920 | Mammalia | Artiodactyla | Cervidae |
| 棕熊 | Ursus arctos | 2433015 | Mammalia | Carnivora | Ursidae |
| 大熊猫 | Ailuropoda melanoleuca | 2433015 | Mammalia | Carnivora | Ursidae |
| 禾本科 | Poaceae | - | - | Poales | Poaceae |

## 捕食关系 (GloBI)

### 猞猁-雪兔 (经典 Lotka-Volterra)
- Lynx lynx → Lepus americanus (捕食)
- Lynx lynx → Lepus tolai (中亚野兔)
- Lynx lynx → Lepus timidus (北方雪兔)

### 虎的猎物
- Panthera tigris → Atherurus macrourus (亚洲 brush-tailed porcupine)
- Panthera tigris → Arctonyx collaris (猪獾)
- Panthera tigris → Rucervus duvaucelii (沼泽鹿)
- Panthera tigris → Naemorhedus caudatus (喜马拉雅斑羚)
- Panthera tigris → Presbytis thomasi (托马斯叶猴)
- Panthera tigris → Tetracerus quadricornis (四角羚)
- Panthera tigris → Muntiacus feae (菲亚麂)

### 大熊猫的食物
- Ailuropoda melanoleuca → Bambusa (竹属)
- Ailuropoda melanoleuca → Carex (苔草属)
- Ailuropoda melanoleuca → Abies balsamea (香脂冷杉)

### 棕熊的交互
- Ursus arctos → 多种植物和动物

## 数据文件位置

```
data/raw/
├── gbif_*_match.json      # GBIF 物种匹配
├── gbif_*_occurrence.json # GBIF 出现记录
└── globi_*_interactions.json  # GloBI 交互网络
```

## 使用建议

1. **经典教学 demo**: 猞猁-雪兔 (已有完整捕食关系数据)
2. **中国特有 demo**: 大熊猫-竹子 (互利/捕食关系)
3. **食物网 demo**: 虎-多种猎物 (复杂网络)
4. **竞争关系 demo**: 需要添加 competition 类型

## 数据质量说明

- GBIF 物种匹配: 高置信度 (confidence=99)
- GloBI 交互: 来自多个研究，interaction_type 多为 "interactsWith" 或 "eats"
- 部分数据缺少地理坐标和定量强度
