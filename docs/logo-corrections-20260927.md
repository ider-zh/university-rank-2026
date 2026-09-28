# 南京大学与多伦多大学 Logo 修正

南京大学旧记录误选了 Commons 的 `Motto of Nanjing University .jpg`。素材许可证有效不代表它是校徽；旧选择逻辑只依据上游图片关联和授权，缺少素材角色排除。多伦多大学旧记录 `logo: null`，并非前端图片尺寸问题。

本次两个定点修正：

- 南京大学：从[官方标识页面](https://njunju.nju.edu.cn/3647/list.htm)的视觉规范压缩包提取 `01校标.jpg`，保留完整紫色盾形校标，等比缩放，不裁切、不重绘。
- 多伦多大学：采用[官网](https://www.utoronto.ca/)小尺寸图标资源目录中的 192px 蓝色树形标识，不将其描述为完整盾徽。

这两个官方标识没有开放许可证。仅作为当前 LAN 开发预览的院校识别素材，明确记录保留所有权利；不伪称公共领域、学校许可或背书。公开分发前需另行核验使用权限。来源声明已显示在图片来源页。

`scripts/official-logo-policy.mjs` 固定学校 ID、准确 URL、源文件 SHA-256、压缩包成员及审核日期。仅这两个 Logo 允许走官方标识例外；校园照片和其他学校不放开。`scripts/logo-correct-official.mjs` 使用缓存，可独立运行，亦接入正常媒体导出；源文件变化时停止并要求重新审核。

```sh
node scripts/logo-correct-official.mjs
npm run data:validate
npm test
```

旧记录备份在 `archives/logo-corrections-20260927/<release>-<id>-previous.json`；旧图片保留用于回退，但清单不再引用。已检查当前全部 Logo 标题中的 motto／校训候选，另两张是明确包含校训的真实 Logo／盾徽，不能仅因含有 motto 单词就误删。新规则排除独立校训图片，并加入采集、发布校验及回归测试。
