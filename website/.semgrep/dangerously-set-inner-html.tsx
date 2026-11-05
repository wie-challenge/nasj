// Test cases for dangerously-set-inner-html.yml (run with: semgrep --test)
declare const comment: string;

export function Unsafe() {
  // ruleid: nasj-dangerously-set-inner-html
  return <div dangerouslySetInnerHTML={{ __html: comment }} />;
}

export function Safe() {
  // ok: nasj-dangerously-set-inner-html
  return <div>{comment}</div>;
}
