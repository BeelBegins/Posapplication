import assert from "node:assert/strict";
import test from "node:test";
import { safeHref, sanitizeRichText } from "../src/products/hr/richtext";

test("keeps simple formatting and strips attributes", () => {
  assert.equal(sanitizeRichText('<h3 class="x">Title</h3><p style="color:red">Be <strong>kind</strong>.</p>'), "<h3>Title</h3><p>Be <strong>kind</strong>.</p>");
});

test("drops event handlers, scripts and unknown elements", () => {
  const out = sanitizeRichText('<img src=x onerror=alert(1)><p onclick="x()">Hi</p><script>alert(2)</script><iframe src="//evil"></iframe><svg onload=alert(3)><circle/></svg>ok');
  assert.equal(out, "<p>Hi</p>ok");
  assert.doesNotMatch(out, /onerror|onclick|script|alert/);
});

test("JSON-looking content is escaped, not executed", () => {
  const out = sanitizeRichText('{"x":"<img src=x onerror=alert(1)>"}');
  assert.equal(out, "{&quot;x&quot;:&quot;&quot;}");
});

test("links only allow http(s) and mailto", () => {
  assert.equal(sanitizeRichText('<a href="https://hr.example/p?a=1&amp;b=2">p</a>'), '<a href="https://hr.example/p?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">p</a>');
  assert.equal(sanitizeRichText('<a href="javascript:alert(1)">x</a>'), "<a>x</a>");
  assert.equal(sanitizeRichText('<a href="jav&#x09;ascript&colon;alert(1)">x</a>'), "<a>x</a>");
  assert.equal(safeHref(" mailto:hr@example.com"), "mailto:hr@example.com");
});

test("text and broken markup are escaped and tags are balanced", () => {
  assert.equal(sanitizeRichText("a < b & c > d"), "a &lt; b &amp; c &gt; d");
  assert.equal(sanitizeRichText("<p>open <b>bold"), "<p>open <b>bold</b></p>");
  assert.equal(sanitizeRichText("<p>x</b></p>"), "<p>x</p>");
  assert.equal(sanitizeRichText("<!-- c --><p>&nbsp;ok</p>"), "<p>&nbsp;ok</p>");
  assert.equal(sanitizeRichText(null), "");
});
