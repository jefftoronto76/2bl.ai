// Probe A: does the README's "only width/height required" hold in the types?
import HTMLFlipBook from 'react-pageflip';
export function A() {
  return (
    <HTMLFlipBook width={300} height={500}>
      <div>Page 1</div>
      <div>Page 2</div>
    </HTMLFlipBook>
  );
}
