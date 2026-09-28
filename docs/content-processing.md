# 首屏简介与中文规范

学校首屏将校园图作为装饰背景，与校名、Logo、简介、官网链接合并。深色渐变遮罩保证文字可读，无图或加载失败时保留深绿色背景，图片署名和授权仍可访问。静态样例与通用详情页共用 `SchoolHeader`。

## 离线模型处理

首次使用离线处理前，将 `scripts/content.config.example.json` 复制为 `scripts/content.config.json`，再配置 API 凭据（或设置 `UNIVERSITY_CONTENT_API_KEY`）。本机配置已被 Git 忽略，公开仓库只保存无密钥示例。

`scripts/content.config.json` 配置用户提供的 API 地址、模型 `qwen3.8-27b` 和凭据；只供离线预处理使用，不在 `src/` 或浏览器包中。可用 `UNIVERSITY_CONTENT_API_KEY` 覆盖配置。网页只读取结果 JSON，不访问模型服务。

```sh
# 默认前六所，或明确选择学校
npm run data:content -- --ids Q13371,Q41506,Q34433,Q16955,Q16952,Q738236
# 批量扩展到当前入选的全部 1000 所；默认并发 2，按内容哈希断点复用
npm run data:content -- --limit 1000
npm run build
```

当前已生成六所样例学校的中英文简介；其他学校使用已有简介回退，未宣称全量模型处理完成。模型依据既有百科快照的前三段和精选 infobox 字段，不读取私人人物或数据库凭据。提示词限制虚构优势、排名、时效性人数与争议细节，结果保留引用字段、源资料哈希、模型、提示词版本和生成时间。数值必须出现在引用资料中；格式、语言和明显宣传用语会校验。自动校验不能证明每句事实成立，页面明确标注 AI 辅助、待人工复核。

生成文件在 `public/content/<catalog release>/<QID>.json`，六校静态页面构建时读取，通用页面只请求自己的文件。证据原文在 `reports/<release>/content-sources/`，缓存留在非公开 `archives/content-cache/`。源资料更改后需要重新生成；失败不伪造替代内容。

## 简体中文

使用 OpenCC `t → cn` 在预处理时规范展示文本，不在浏览器加载字典。学校名、简介、信息卡、校友姓名与图片展示署名统一简体；URL、资源路径、标识符、分数和原始审计资料不改写。英文内容不做翻译。

```sh
# 现有数据转换：复制到暂存版本，转换、刷新哈希、校验后切换指针
npm run data:simplify
```

学校 / 样例导出、媒体采集和模型输出均已接入同一转换器。`data:validate` 检查展示 JSON 不再含可转换的繁体文本。2026-09-13 首次转换修改 731 份 JSON，发布 `catalog-20260913T021738Z` 和 `sample-20260913T021738Z`；此前数据保存在 `archives/`，可以恢复。
