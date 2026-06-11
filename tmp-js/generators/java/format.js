export function formatJavaGeneratedContent(content) {
    return `${String(content).trim().replace(/[ \t]+$/gm, '')}\n`;
}
