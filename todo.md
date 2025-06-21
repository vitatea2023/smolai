# HTML to Markdown with Translation - TODO

## Current Status ✅
- [x] 基础HTML转Markdown功能
- [x] 智能文本分段（区分需要翻译的内容vs标记语言）
- [x] CLI参数支持（`--translate`）
- [x] 调试占位符系统（`<!-- [TRANSLATION_PLACEHOLDER] -->`）

## Next Steps 🔄

### 1. 翻译API集成
- [ ] 添加翻译API配置参数（`--translate-api`, `--api-key`等）
- [ ] 实现翻译函数，支持批量翻译文本段落
- [ ] 添加翻译语言选择（`--target-lang zh-CN`）
- [ ] 实现翻译占位符替换逻辑

### 2. 翻译质量优化
- [ ] 添加上下文保持机制（保留**粗体**、[链接]等格式）
- [ ] 实现翻译缓存，避免重复翻译相同内容
- [ ] 添加翻译重试机制（API调用失败时）
- [ ] 支持翻译进度显示

### 3. 高级功能
- [ ] 支持自定义分段规则配置
- [ ] 添加翻译质量检查（检测明显的翻译错误）
- [ ] 支持多语言并排输出格式
- [ ] 添加翻译统计信息（字符数、成本估算等）

## 使用示例

### 当前可用命令
```bash
# 基础转换（无翻译）
node html-to-markdown.js --url https://example.com --output output.md

# 带翻译占位符
node html-to-markdown.js --url https://example.com --output output.md --translate
```

### 计划中的命令
```bash
# 完整翻译功能（待实现）
node html-to-markdown.js \
  --url https://example.com \
  --output output.md \
  --translate \
  --translate-api openai \
  --api-key YOUR_API_KEY \
  --target-lang zh-CN

# 批量处理（待实现）
node html-to-markdown.js \
  --urls urls.txt \
  --output-dir ./translated/ \
  --translate \
  --translate-api deepl
```

## 文件结构

```
/root/code/smolai/
├── html-to-markdown.js     # 主程序
├── package.json           # 依赖配置
├── todo.md               # 本文件
└── 25-06-20-claude-code.md # 示例输出文件
```

## 代码架构说明

### 主要函数
- `parseArgs()` - 解析命令行参数
- `fetchHTML()` - 下载网页内容
- `cleanHTML()` - 清理HTML内容
- `segmentText()` - **核心分段逻辑**，识别可翻译内容
- `processSegments()` - 处理分段，插入占位符
- `convertToMarkdown()` - 主转换函数

### 分段逻辑
当前分段算法会跳过以下内容（不翻译）：
- 空行和短行（<10字符）
- 标题（`#` 开头）
- 列表项（`*` 或 `-` 开头）
- 链接行（纯链接格式）
- 代码块（```` 包围）
- 分割线（`---` 或 `===`）
- 只包含符号/数字的行
- 行号标记（`123→` 格式）

### 翻译占位符格式
```html
<!-- [TRANSLATION_PLACEHOLDER] -->
```

## 翻译API集成指南

### 建议的API接口
```javascript
async function translateText(text, options) {
  // options: { apiProvider, apiKey, targetLang, sourceContent }
  // 返回: { translatedText, confidence, cost }
}
```

### 建议支持的翻译服务
- OpenAI GPT API（推荐，质量高）
- Google Translate API
- DeepL API
- 百度翻译API
- 腾讯翻译API

### 替换逻辑示例
```javascript
// 查找所有翻译占位符并替换
function replaceTranslationPlaceholders(markdown, translations) {
  let index = 0;
  return markdown.replace(/<!-- \[TRANSLATION_PLACEHOLDER\] -->/g, () => {
    return translations[index++] || '<!-- [TRANSLATION_FAILED] -->';
  });
}
```

## 测试建议

1. **分段测试** - 验证不同类型内容的分段准确性
2. **翻译质量测试** - 对比不同API的翻译效果
3. **格式保持测试** - 确保翻译后Markdown格式完整
4. **大文件测试** - 测试长文档的处理性能
5. **错误处理测试** - 测试API失败、网络超时等异常情况

## 性能考虑

- 实现批量翻译以减少API调用次数
- 添加翻译缓存避免重复翻译
- 考虑并发控制避免API限流
- 大文件分块处理避免内存溢出

---

**Ready for Translation API Integration! 🚀**