# 腾讯云翻译集成使用说明

## 功能特性

✅ **已完成的功能:**
- 腾讯云机器翻译API集成
- 批量文本翻译支持
- 智能文本分段（区分需要翻译的内容vs标记语言）
- 翻译失败时自动降级到占位符模式
- 支持多种源语言和目标语言

## 使用方法

### 1. 基础HTML转Markdown（无翻译）
```bash
node html-to-markdown.js --url https://example.com --output output.md
```

### 2. 仅生成翻译占位符
```bash
node html-to-markdown.js --url https://example.com --output output.md --translate
```

### 3. 完整翻译功能（使用腾讯云API）
```bash
node html-to-markdown.js \
  --url https://example.com \
  --output output.md \
  --translate \
  --secret-id YOUR_SECRET_ID \
  --secret-key YOUR_SECRET_KEY \
  --target-lang zh \
  --source-lang en \
  --region ap-singapore
```

### 4. 单独测试翻译功能
```bash
node tencent-translator.js YOUR_SECRET_ID YOUR_SECRET_KEY "Hello world" zh
```

## 参数说明

| 参数 | 必需 | 说明 | 示例值 |
|------|------|------|--------|
| `--url` | ✅ | 要转换的网页URL | `https://example.com` |
| `--output` | ✅ | 输出Markdown文件路径 | `output.md` |
| `--translate` | ❌ | 启用翻译模式 | 无值参数 |
| `--secret-id` | ❌ | 腾讯云SecretId | `YOUR_SECRET_ID` |
| `--secret-key` | ❌ | 腾讯云SecretKey | `YOUR_SECRET_KEY` |
| `--target-lang` | ❌ | 目标语言 | `zh`（默认中文） |
| `--source-lang` | ❌ | 源语言 | `auto`（默认自动识别） |
| `--region` | ❌ | 腾讯云地域 | `ap-singapore`（默认新加坡） |

## 支持的语言代码

### 常用语言
- `zh` - 简体中文
- `zh-TW` - 繁体中文  
- `en` - 英语
- `ja` - 日语
- `ko` - 韩语
- `fr` - 法语
- `es` - 西班牙语
- `de` - 德语
- `auto` - 自动识别

完整语言列表请参考腾讯云机器翻译API文档。

### 常用地域代码
- `ap-singapore` - 新加坡（默认）
- `ap-beijing` - 北京
- `ap-shanghai` - 上海  
- `ap-guangzhou` - 广州
- `ap-hongkong` - 香港
- `na-ashburn` - 美国东部

## 工作原理

1. **HTML下载**: 从指定URL下载网页内容
2. **内容清理**: 移除script、style等不需要的标签
3. **Markdown转换**: 使用Turndown将HTML转为Markdown
4. **智能分段**: 识别需要翻译的文本段落（跳过代码块、标题、列表等）
5. **批量翻译**: 使用腾讯云API批量翻译文本段落
6. **结果组装**: 将原文和译文组合输出

## 翻译示例

### 输入HTML
```html
<h1>Welcome to Our Website</h1>
<p>This is a sample paragraph that needs translation.</p>
```

### 输出Markdown（带翻译）
```markdown
Welcome to Our Website
======================

This is a sample paragraph that needs translation.

这是一个需要翻译的示例段落。
```

## 错误处理

- **API认证失败**: 自动降级到占位符模式，检查 SecretId/SecretKey 是否正确
- **网络超时**: 自动重试机制
- **翻译失败**: 显示 `[TRANSLATION_FAILED]` 标记
- **限流处理**: 批量间自动添加延迟，避免触发API限制
- **地域错误**: 如果地域不支持，尝试更换为 `ap-singapore` 或 `ap-beijing`

## 成本控制

- 使用批量翻译API减少调用次数
- 智能分段避免翻译无意义内容  
- 支持设置最大批量大小（当前：10条/批次）
- 批次间自动延迟1秒避免限流

## 获取腾讯云API凭证

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 前往 [访问管理 > API密钥管理](https://console.cloud.tencent.com/cam/capi)
3. 创建新的API密钥，获取 SecretId 和 SecretKey
4. 确保账户有机器翻译服务的使用权限

## 注意事项

1. **API凭证安全**: 
   - ⚠️ 不要在代码中硬编码凭证
   - ⚠️ 不要将凭证提交到代码仓库
   - 建议使用环境变量存储凭证
2. **网络环境**: 确保能访问腾讯云API服务
3. **字符限制**: 单次请求文本长度总和需小于6000字符
4. **费用控制**: 翻译API按字符收费，请关注使用量
5. **地域选择**: 选择距离较近的地域可获得更好的延迟

## 技术架构

```
html-to-markdown.js (主程序)
├── TurndownService (HTML转Markdown)
├── TencentTranslator (翻译服务)
│   ├── 批量翻译接口
│   ├── 签名认证
│   └── 错误处理
└── 智能分段算法
    ├── 识别可翻译内容
    ├── 跳过代码/标记
    └── 段落边界检测
```

---

**项目已完成腾讯云翻译集成！🚀**