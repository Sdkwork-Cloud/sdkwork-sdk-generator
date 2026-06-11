export function formatJavaGeneratedContent(content: string): string {
  return `${String(content).trim().replace(/[ \t]+$/gm, '')}\n`;
}
