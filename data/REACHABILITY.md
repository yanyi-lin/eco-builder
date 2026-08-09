# 数据源可达性测试报告

测试环境：中国大陆（无代理）
测试时间：2026-08-09

## 可达性总结

| 数据源 | 域名 | 状态 | 响应时间 | 备注 |
|--------|------|------|----------|------|
| **GBIF API** | api.gbif.org | ✅ 可达 | ~1.8s | 物种匹配、出现记录均可用 |
| **GloBI API** | api.globalbioticinteractions.org | ✅ 可达 | ~1.2s | 意外地快，交互数据完整 |
| **NESDC** | nesdc.org.cn | ✅ 可达 | ~3.2s | 首页可访问，API端点待探索 |
| **CERN** | cern.ac.cn | ✅ 可达 | ~2.6s | 重定向后正常访问 |
| CoLChina | sp2000.org.cn | ❌ 失败 | - | 连接超时 |
| Geodata | geodata.cn | ❌ 失败 | - | 连接超时 |
| especies.cn | especies.cn | ❌ 失败 | - | 连接超时 |
| BioONE | bio-one.org.cn | ❌ 失败 | - | 连接超时 |
| ScienceDB | sciencedb.cn | ❌ 失败 | - | 连接超时 |

## 已保存数据

### GBIF 物种匹配数据 (species/match)
- `gbif_species_match.json` - Vulpes vulpes (赤狐)
- `gbif_lynx_match.json` - Lynx lynx (猞猁)
- `gbif_lepus_match.json` - Lepus americanus (雪兔)
- `gbif_tiger_match.json` - Panthera tigris (虎)
- `gbif_deer_match.json` - Cervus elaphus (马鹿)
- `gbif_bear_match.json` - Ursus arctos (棕熊)
- `gbif_poaceae_match.json` - Poaceae (禾本科)

### GBIF 出现记录 (occurrence/search)
- `gbif_occurrence_vulpes.json` - 赤狐出现记录
- `gbif_occurrence_lynx.json` - 猞猁出现记录
- `gbif_occurrence_lepus.json` - 雪兔出现记录 (空)
- `gbif_tiger_occurrence.json` - 虎出现记录

### GloBI 交互网络 (interaction)
- `globi_canis_lupus.json` - 狼 (Canis lupus) 的交互关系
- `globi_lynx_lepus.json` - 猞猁-雪兔捕食关系
- `globi_lepus_interactions.json` - 雪兔的交互关系
- `globi_bear_interactions.json` - 棕熊的交互关系
- `globi_deer_interactions.json` - 马鹿的交互关系
- `globi_tiger_interactions.json` - 虎的交互关系
- `globi_poaceae.json` - 禾本科植物的交互关系

## 数据结构示例

### GBIF Species Match
```json
{
  "usageKey": 2435240,
  "scientificName": "Lynx lynx (Linnaeus, 1758)",
  "canonicalName": "Lynx lynx",
  "rank": "SPECIES",
  "status": "ACCEPTED",
  "confidence": 99,
  "matchType": "EXACT",
  "kingdom": "Animalia",
  "phylum": "Chordata",
  "class": "Mammalia",
  "order": "Carnivora",
  "family": "Felidae",
  "genus": "Lynx",
  "species": "Lynx lynx"
}
```

### GloBI Interaction
```json
{
  "columns": [
    "source_taxon_name",
    "target_taxon_name", 
    "interaction_type",
    "latitude",
    "longitude",
    "study_title"
  ],
  "data": [
    ["Lynx lynx", "Lepus americanus", "interactsWith", null, null, "..."]
  ]
}
```

## 结论

### 可用数据源
1. **GBIF API** - 物种分类信息、出现记录
2. **GloBI API** - 物种间交互关系（捕食、寄生等）
3. **NESDC/CERN** - 需要进一步探索数据接口

### 不可用数据源
- CoLChina、Geodata、especies.cn、BioONE、ScienceDB 均无法连接

### 建议
- 主要依赖 GBIF + GloBI 构建 demo
- 国内数据源需要用户手动下载后本地使用
- Agent 可内置常见物种的预缓存数据
