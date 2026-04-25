# Import Everything


![MarginNote](https://img.shields.io/badge/MarginNote-4.2.3%2B-3A7AFE)

Import Everything是一个MarginNote4插件，用来把常见文档、表格、演示文稿、Markdown、代码和图片整理成统一预览，然后导出为PDF并导入到MarginNote。

## What it does

- 拖入多个文件
- 在面板里统一预览
- 合并导出为PDF
- 一键导入到MarginNote文档
- 支持导入CSS样式
- 支持上传自定义字体

## Supported files

- 文档: `docx` `rtf`
- 表格: `xls` `xlsx` `csv`
- 演示文稿: `pptx`
- 标记与网页: `md` `markdown` `html` `htm` `xhtml`
- 电子书: `epub`
- 纯文本: `txt`
- 代码: `js` `ts` `py` `rs` `java` `go`等常见源码文件
- 图片: `png` `jpg` `jpeg` `gif` `webp` `bmp` `tif` `tiff` `svg` `ico` `avif` `heic` `heif`

暂不支持: `doc`、`ppt`

## Development

项目使用[MN Rails](https://www.npmjs.com/package/mn-rails)创建

要求:

- macOS
- MarginNote4.2.3+
- Node.js20+
- `pnpm`9+

安装依赖:

```bash
pnpm install
```

启动开发:

```bash
pnpm dev
```



打包发布:

```bash
pnpm build
```

## Project layout

```text
src/        MarginNote插件代码
web/        React面板源码
scripts/    构建、热部署、版本脚本
dist/       打包中间产物
```

## Roadmap

- 补更多格式解析器
- 优化大文件导入体验
- 改善预览排版和导出质量
- 完善错误提示
- 优化和MN的联动

## Contributing

欢迎提Issue和PR。

## License

本项目使用MIT License，详见根目录[LICENSE](LICENSE)。
