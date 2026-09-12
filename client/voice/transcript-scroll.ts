export function isNearTranscriptEnd(element: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">, threshold = 36): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

export function scrollTranscriptToLatest(element: Pick<HTMLElement, "scrollHeight" | "scrollTop">): void {
  element.scrollTop = element.scrollHeight;
}
