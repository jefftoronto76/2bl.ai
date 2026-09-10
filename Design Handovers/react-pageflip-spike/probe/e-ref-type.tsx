// Probe E: what is the ref handle type? (expect: any)
import { useRef } from 'react';
import HTMLFlipBook from 'react-pageflip';
export function E() {
  const ref = useRef<null>(null);
  return <HTMLFlipBook ref={ref} width={1} height={1} className="" style={{}} startPage={0} size="fixed" minWidth={0} maxWidth={0} minHeight={0} maxHeight={0} drawShadow flippingTime={1} usePortrait startZIndex={0} autoSize maxShadowOpacity={1} showCover mobileScrollSupport clickEventForward useMouseEvents swipeDistance={1} showPageCorners disableFlipByClick><div /></HTMLFlipBook>;
}
