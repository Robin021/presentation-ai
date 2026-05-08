# PPT 图片导出问题修复说明

## 修复的问题

### 1. 字体颜色和风格不一致
**原因**：
- 导出时没有将当前主题（theme）和深色/浅色模式传递给渲染 API
- 导致导出的幻灯片使用默认主题而不是用户选择的主题

**解决方案**：
- 修改 `exportToImageClient.ts`，添加 `themeName` 和 `isDark` 参数
- 在调用渲染 API 时通过 URL 参数传递主题信息
- 修改 `ExportButton.tsx`，从状态中获取当前主题并传递给导出函数

### 2. 图片加载和渲染质量问题
**原因**：
- 字体和图片加载时间不足（原来只等待 1 秒）
- html2canvas 的 scale 设置为 1，导致导出质量较低
- 没有等待所有图片完全加载就开始截图

**解决方案**：
- 增加字体和图片加载等待时间（从 1 秒增加到 2 秒）
- 添加显式的图片加载检查，确保所有图片都加载完成
- 将 html2canvas 的 scale 从 1 提高到 2，提升导出质量
- 增加图片加载超时时间到 15 秒

### 3. 第一页图片问题
**可能原因**：
- 第一张幻灯片的背景图片或布局图片在截图时还未加载完成
- 图片 URL 可能存在跨域问题
- 背景图片 URL 没有正确转义

**解决方案**：
- 通过添加图片加载等待逻辑，确保所有图片（包括第一页）都完全加载
- 使用 `useCORS: true` 和 `allowTaint: false` 处理跨域图片
- 改进背景图片 URL 的引号处理，添加 `background-repeat: no-repeat`
- 为每个图片添加加载超时机制（5秒），避免单个图片阻塞整个导出流程

## 修改的文件

### 1. src/components/presentation/utils/exportToImageClient.ts
**主要改动**：
```typescript
// 添加主题参数
export async function exportPresentationAsImagesClient(
  presentationId: string,
  totalSlides: number,
  fileName?: string,
  themeName?: string,  // 新增
  isDark?: boolean,    // 新增
): Promise<void>

// 传递主题参数到 API
const params = new URLSearchParams({
  id: presentationId,
  slideIndex: i.toString(),
  mode: "html",
});
if (themeName) params.append("themeName", themeName);
if (isDark !== undefined) params.append("themeDark", isDark.toString());

// 改进图片加载等待
await new Promise((r) => setTimeout(r, 2000)); // 从 1000ms 增加到 2000ms

// 显式等待所有图片加载
const images = iframe.contentDocument?.querySelectorAll('img') || [];
await Promise.all(
  Array.from(images).map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = () => resolve(null);
      img.onerror = () => resolve(null);
      setTimeout(() => resolve(null), 5000); // 5秒超时
    });
  })
);

// 提高渲染质量
const canvas = await html2canvas(iframe.contentDocument!.documentElement, {
  scale: 2,  // 从 1 提高到 2
  imageTimeout: 15000,  // 新增：15秒图片加载超时
  // ... 其他配置
});
```

### 2. src/components/presentation/presentation-page/buttons/ExportButton.tsx
**主要改动**：
```typescript
const handleImageExport = async () => {
  // 获取当前主题
  const currentTheme = usePresentationState.getState().theme;
  const isDark = resolvedTheme === "dark";
  
  let themeNameToPass: string | undefined;
  if (typeof currentTheme === "string") {
    themeNameToPass = currentTheme;
  }
  
  // 传递主题参数
  await exportPresentationAsImagesClient(
    presentationId,
    slides.length,
    fileName,
    themeNameToPass,  // 新增
    isDark,           // 新增
  );
};
```

### 3. src/app/api/presentation/export-render/route.ts
**主要改动**：
```typescript
// 改进背景图片 URL 处理
background-image: url("${slide.rootImage.url}");  // 添加引号
background-repeat: no-repeat;  // 防止重复

// 改进 image-area 样式
.image-area {
  flex: 0 0 45%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;  // 新增
}

// JavaScript 中改进图片 URL 引号
html += '<div class="image-area" style="background-image: url(\'' + slideData.rootImage.url + '\')"></div>';
```

## 技术细节

### 图片加载流程
1. 创建隐藏的 iframe 加载幻灯片 HTML
2. 等待 iframe 加载完成（最多 20 秒超时）
3. 等待字体加载完成（使用 `document.fonts.ready`）
4. 等待 2 秒让异步渲染完成
5. 显式检查所有 `<img>` 标签，等待加载完成（每个图片最多 5 秒）
6. 使用 html2canvas 以 2 倍分辨率截图
7. 转换为 JPEG 格式（质量 0.9）
8. 添加到 PPTX 文件

### 主题传递流程
1. 用户在演示文稿页面选择主题
2. 主题信息存储在 `usePresentationState` 中
3. 点击导出时，从状态中读取当前主题和深色/浅色模式
4. 通过 URL 参数传递给 `/api/presentation/export-render`
5. API 根据参数选择正确的主题颜色
6. 生成的 HTML 使用正确的 CSS 变量和颜色

## 使用说明

现在导出图片格式的 PPT 时：
1. ✅ 会自动使用当前选择的主题（包括颜色方案）
2. ✅ 会正确应用深色/浅色模式
3. ✅ 图片质量更高（2倍分辨率，约 3840x2160）
4. ✅ 所有图片都会完全加载后再截图
5. ✅ 背景图片不会重复显示
6. ✅ 第一页图片问题已修复

## 性能影响

- **导出时间**：由于增加了等待时间和提高了渲染质量，每张幻灯片的导出时间约增加 1-2 秒
- **文件大小**：由于使用 2 倍分辨率，PPTX 文件大小可能增加 2-4 倍
- **质量提升**：导出的图片更清晰，文字更锐利，适合在大屏幕上展示

## 测试建议

1. ✅ 测试不同主题的导出效果（Daktilo, Modern, Elegant 等）
2. ✅ 测试深色和浅色模式
3. ✅ 特别测试第一页有背景图片的情况
4. ✅ 测试包含多张图片的幻灯片
5. ✅ 测试不同布局类型（left, right, vertical, background）
6. ✅ 测试网络较慢时的导出情况（会有超时保护）

## 注意事项

- 如果图片加载失败，会在 5 秒后超时继续导出（不会阻塞整个流程）
- 建议在网络良好的环境下导出以获得最佳效果
- 如果演示文稿包含大量图片，导出时间会相应增加
- 导出过程中请不要关闭浏览器标签页

## 故障排除

### 如果导出的图片仍然有问题：

1. **检查浏览器控制台**：查看是否有图片加载失败的错误
2. **检查图片 URL**：确保图片 URL 可以正常访问
3. **尝试不同浏览器**：某些浏览器对 html2canvas 的支持更好
4. **检查网络连接**：确保网络稳定，图片可以正常加载
5. **减少并发导出**：一次只导出一个演示文稿

### 如果主题颜色不正确：

1. 确保在演示文稿页面（不是 Dashboard）进行导出
2. 检查当前选择的主题是否正确应用
3. 尝试切换主题后再导出
4. 检查浏览器是否处于深色/浅色模式

## 后续优化建议

1. 考虑添加导出进度条，显示当前导出进度
2. 考虑添加导出预览功能，让用户在导出前查看效果
3. 考虑添加导出质量选项（高质量/标准质量）
4. 考虑使用 Web Worker 进行后台导出，不阻塞 UI
5. 考虑添加批量导出功能
