# 师生人数补全

对当前收录的 1,000 所学校核查学生与教师人数。原始评分输入缺学生数 14 所、缺教师数 82 所。修正数据和原始快照分开保存，**不自动重算排名、不覆盖已有正数**。

## 执行

```sh
npm run data:population
npm run data:population -- --live
```

默认只使用已缓存的远端快照和 Wikimedia 资料；`--live` 为缺失学校查询 Wikidata、展开 Wikipedia infobox，并核对 QID 和页面修订号。成功结果缓存，失败原因记录；网络失败不解释为人数为零。再次运行仅请求未成功的页面。需要 SSH 访问数据管道及可用的互联网代理。

2026-09-13 首轮结果：直接补学生数 4 所、教师数 4 所（共 7 所学校）；仍缺学生数 10 所、教师数 78 所，其中 50 所有独立 THE 估算。实时页面成功缓存 23 所，60 所请求返回 HTTP 429，不能据此断言这些页面没有数据。采集器现遇到 429 即停止后续网络请求，留待限流解除后续跑。

输出位置：`reports/<release>/population-backfill/`。

- `summary.json`：本次直接补全、剩余缺失及估算覆盖。
- `overlay.json`：直接修正及独立的 THE 估算数据，包含来源、年份、口径和证据。
- `observations.json`：全部候选、拒绝原因及原始 Parquet 文件 SHA-256。
- `unresolved.json`：仍待补充或需要合并／停办身份审核的学校。

原始输入及实时请求缓存位于 `archives/population-backfill/<release>/`，不打包进公开网站。

## 口径边界

Wikipedia 的 `academic staff`／`faculty` 用于教师候选，Wikidata P2196 用于学生候选。P1128 是员工总数，不能作为教师数。仅本科生、当年招生数、全时当量（FTE）、区间和多个无法区分的数字不自动充当全校人数。相同优先级、年份、口径的冲突数据隔离，不取平均。

THE 的学生数和师生比必须来自同一条来源记录，其商仅记为 `estimatedAcademicStaff`。NCES 的 UGDS 是本科生数，不继续用它和不同口径的师生比推导实测教师数。已有旧流程中的这类值本轮不覆盖，仍需另行清洗。

年份未知不伪造年份；20251201 是数据快照日期，不是所有统计的观测年份。历史年份可以补充缺失信息，但不代表当前人数。已停办／合并记录隔离；未来停办、大学系统与单一校园及师资定义差异仍需人工复核。

英国学校的一类漏数来自未展开的 HESA 模板。实时展开后可读到牛津教师 8,005、伯明翰教师 4,865（均标注 2024/25），但这并不意味着可以与旧年份学生数直接相除来计算当前师生比。

## 管道接入

`scripts/population_overlay.py` 提供 `validate_overlay`、`export_parquet` 和 `apply_population_backfill`。在 UniDataPipeline 的 Polars 环境运行：

```python
from population_overlay import apply_population_backfill
corrected = apply_population_backfill(frame, "overlay.json")
```

输入须含 `entity_id`、`student_count`、`faculty_count`。应在合并数据后、旧逻辑把缺失／零替换为 1 **之前**调用。只填缺失或非正数且有直接证据的字段；估算不写入 `faculty_count`。写入新的 Parquet 路径，保留旧文件。新增数据产物不会自动替换线上导出源；前端评分仍使用原始快照。

本轮远端交付位置（`192.168.1.229:/home/ider/workspace/UniDataPipeline`）：

- `scripts/population-backfill-20260913/`：修正 JSON、源数据与证据、合并适配器、修正／估算 Parquet、集成检查报告。
- `dist/university_population_backfill_20260913.parquet`：1,000 所已收录学校的合并后师生人数列，应用直接补全；不是完整 LLM 表的替代品。

必须在全部院校已经合并的阶段接入，因为部分院校根本没有旧 LLM 提取行，仅修改旧 LLM 表无法补到这些学校。集成检查验证行数和 ID 不变、只改变 4 个学生数及 4 个教师数、已有正数不变、源文件散列不变，估算不注入人数列。

补齐少量人数本身不能解决师资分值过低：归一化范围、异常分母、院校系统混用和既有口径错误还需要独立修复与排名回归验证。
