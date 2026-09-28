# University Rank 2026

Astro + Tailwind CSS + React 的世界大学静态站点。预处理先审核高等教育机构资格和资料完整性，再按来源综合分保留前 1,000 所学校。支持搜索、地区筛选、五维调权、排序分页、旧版学科榜和四校对比；学校详情及 infobox 按需加载。学校 Logo 和已获取的真实校园主图保存在本地，六所样本大学额外提供校友雪碧图。

当前是开发核验版，不是官方榜单。企业、非高等教育学校及身份不明记录不会直接进入公开排名；收录依据和排除原因保留在质量报告。网站名次在通过筛选的集合内重算，原始分数和来源名次保留用于追溯，不修改源数据库。调权仅重排已入选的 1,000 所学校，不会召回预筛选之外的学校。

## 本地运行

需要 Node.js >= 22.12；依赖锁定在 `package-lock.json`。

```sh
npm ci
npm run dev
```

访问 `http://localhost:4321/zh/` 或 `/en/`。已有导出资源随项目保存，启动和构建无需访问原数据库或 S3。

当前 LAN dev 使用 `http://192.168.1.220:4322/zh/`，允许域名 `lambdax220`。客户端 DNS / hosts 需将该名字指向 `192.168.1.220`，然后访问 `http://lambdax220:4322/zh/`。其他任意域名未放开。

```sh
npm run data:validate
npm test
npm run check
npm run build
npm run preview
```

`dist/` 可由任意静态 HTTP 服务器托管，无后端服务。当前预览页面禁止搜索引擎索引，源快照成绩未作为正式排名发布。

## 重新导出

```sh
npm run data:export
npm run data:catalog
npm run data:media
npm run data:supplements
```

`data:export` 导出六校媒体样本；`data:catalog` 在导出前完成院校资格筛选、质量检查和前 1,000 所预排名，再生成详情与对应学科榜。默认通过 SSH 使用 `192.168.1.229` 的既有 UniDataPipeline 环境，只读数据库和 S3。凭据留在远端。脚本先校验生成产物，再切换本地版本指针；旧目录移到非公开的 `archives/`，避免被排除的机构仍可通过旧 JSON 地址访问。不会修改旧项目或源数据。

样本：哈佛、斯坦福、清华、北大、牛津、新加坡国立。校友采用固定种子，从每校影响力候选池抽取最多 16 人。人物教育关系尚未逐人核实。

- [数据契约](docs/data-contract.md)
- [首批样本与验证结果](docs/sample-milestone.md)
- [排名和 infobox 实现说明](docs/rankings-and-infobox.md)
- [当前院校准入与预排名](docs/admission.md)
- [本地图片、授权与 CDN 迁移](docs/media-acquisition.md)
- [南京大学与多伦多大学 Logo 修正](docs/logo-corrections-20260927.md)
- [校徽覆盖率检查与本轮补充](docs/logo-coverage-20260927.md)
- [模型简介与简体中文处理](docs/content-processing.md)
- [详细学校介绍、美国收入与校园安全数据](docs/us-data-and-overviews.md)
- [Qwen 全量中文简介检查、润色及审校工作流](docs/overview-polish-workflow.md)
- [师生人数补全与来源审计](docs/population-backfill.md)
- [调研报告](docs/research-2026-09-13.md)
- 完整质量报告：`reports/<当前 release>/quality.json`

后续重点：抽查院校准入结果，处理身份待确认与分数冲突记录，扩大经过授权核验的校园照片覆盖。图片 URL 使用本地静态路径，后续可以迁移到 CDN；新闻仍不展示。
