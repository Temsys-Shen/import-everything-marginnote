import { describe, expect, it } from "vitest";
import { normalizeBulletIndentation } from "./normalizeBulletIndentation";

describe("normalizeBulletIndentation", () => {
  it("合并一级子弹的续行，去除空行", () => {
    const input = [
      "- 叠加原理",
      "",
      "  ：光的叠加行为会产生新的颜色，如：",
      "",
      "  - 红+绿=黄（Y=Yellow）",
      "  - 红+蓝=品红（M=Magenta）",
      "  - 绿+蓝=青（C=Cyan）",
    ].join("\n");

    const expected = [
      "- 叠加原理 ：光的叠加行为会产生新的颜色，如：",
      "  - 红+绿=黄（Y=Yellow）",
      "  - 红+蓝=品红（M=Magenta）",
      "  - 绿+蓝=青（C=Cyan）",
    ].join("\n");

    expect(normalizeBulletIndentation(input)).toBe(expected);
  });

  it("合并二级子弹的续行", () => {
    const input = [
      "  - 冷色调特征",
      "",
      "    ：",
      "",
      "    - 引发平静、放松、宁静悠远的感受",
      "    - 可能伴随孤独感和对未知的思考",
    ].join("\n");

    const expected = [
      "  - 冷色调特征 ：",
      "    - 引发平静、放松、宁静悠远的感受",
      "    - 可能伴随孤独感和对未知的思考",
    ].join("\n");

    expect(normalizeBulletIndentation(input)).toBe(expected);
  });

  it("保留同级子弹平级关系", () => {
    const input = [
      "- 定义：单色搭配即使用相同色相",
      "- 视觉效果：可使画面呈现安稳",
      "- 单色搭配中的色彩关系",
      "",
      "  47:48",
      "",
      "  - 核心特征：保持色相统一",
      "  - 典型表现：如海面与服装",
    ].join("\n");

    const expected = [
      "- 定义：单色搭配即使用相同色相",
      "- 视觉效果：可使画面呈现安稳",
      "- 单色搭配中的色彩关系 47:48",
      "  - 核心特征：保持色相统一",
      "  - 典型表现：如海面与服装",
    ].join("\n");

    expect(normalizeBulletIndentation(input)).toBe(expected);
  });

  it("处理多级嵌套（三级）", () => {
    const input = [
      "- 一级",
      "",
      "  - 二级",
      "",
      "    - 三级",
      "",
      "  - 二级2",
    ].join("\n");

    const expected = [
      "- 一级",
      "  - 二级",
      "    - 三级",
      "",
      "  - 二级2",
    ].join("\n");

    expect(normalizeBulletIndentation(input)).toBe(expected);
  });

  it("图片子弹行保持不变", () => {
    const input = [
      "- ![img](https://example.com/image.png)",
      "",
      "  - 核心特征：保持色相统一",
    ].join("\n");

    const expected = [
      "- ![img](https://example.com/image.png)",
      "  - 核心特征：保持色相统一",
    ].join("\n");

    expect(normalizeBulletIndentation(input)).toBe(expected);
  });

  it("不处理标题行 ####", () => {
    const input = [
      "#### 一、基础色彩搭配 ﻿12:45﻿",
      "",
      "- 子弹1",
      "",
      "  - 子子弹",
    ].join("\n");

    const expected = [
      "#### 一、基础色彩搭配 ﻿12:45﻿",
      "",
      "- 子弹1",
      "  - 子子弹",
    ].join("\n");

    expect(normalizeBulletIndentation(input)).toBe(expected);
  });

  it("纯文本段落不参与子弹合并", () => {
    const input = [
      "- 列表项1",
      "",
      "这是一个独立段落",
      "",
      "- 列表项2",
    ].join("\n");

    const expected = [
      "- 列表项1",
      "这是一个独立段落",
      "",
      "- 列表项2",
    ].join("\n");

    expect(normalizeBulletIndentation(input)).toBe(expected);
  });

  it("空字符串返回空字符串", () => {
    expect(normalizeBulletIndentation("")).toBe("");
  });

  it("没有子弹的纯文本不变", () => {
    const input = "纯文本内容\n没有子弹列表";
    expect(normalizeBulletIndentation(input)).toBe(input);
  });

  it("模拟实际文件片段：标题+多级子弹", () => {
    const input = [
      "###### 1）三原色的叠加色 ﻿15:52﻿",
      "",
      "- ![img](https://example.com/img.png)",
      "",
      "- 叠加原理",
      "",
      "  ：光的叠加行为会产生新的颜色，如：",
      "",
      "  - 红+绿=黄（Y=Yellow）",
      "  - 红+蓝=品红（M=Magenta）",
      "  - 绿+蓝=青（C=Cyan）",
      "",
      "- 白光产生：三原色等量叠加会得到白色",
      "",
      "###### 2）色彩呈现的原理 ﻿16:48﻿",
      "",
      "- 自然色彩成因",
    ].join("\n");

    const expected = [
      "###### 1）三原色的叠加色 ﻿15:52﻿",
      "",
      "- ![img](https://example.com/img.png)",
      "",
      "- 叠加原理 ：光的叠加行为会产生新的颜色，如：",
      "  - 红+绿=黄（Y=Yellow）",
      "  - 红+蓝=品红（M=Magenta）",
      "  - 绿+蓝=青（C=Cyan）",
      "",
      "- 白光产生：三原色等量叠加会得到白色",
      "###### 2）色彩呈现的原理 ﻿16:48﻿",
      "",
      "- 自然色彩成因",
    ].join("\n");

    expect(normalizeBulletIndentation(input)).toBe(expected);
  });
});
