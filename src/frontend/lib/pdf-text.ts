/**
 * @file 【前端·基础】浏览器内提取 PDF 文本
 * 做什么：用 unpdf 把 PDF 读成字符串。原文件不上传（N-2）。
 * 为什么懒加载：pdf 解析比较重，只有用户选了文件才下载这段代码。
 */
export async function extractPdfText(file: File): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}
