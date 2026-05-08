// Без secure context (http на не-localhost) navigator.clipboard недоступен — фолбэк на execCommand.
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch { /* fall through */ }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}
