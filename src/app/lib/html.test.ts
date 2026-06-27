import { describe, expect, test } from 'bun:test'
import { stripHtml } from './html'

describe('stripHtml — common README HTML', () => {
  test('drops a wrapper div, keeps inner text', () => {
    expect(stripHtml('<div align="center">Centered text</div>')).toBe('Centered text')
  })

  test('details renders as expanded with arrow and indented body', () => {
    expect(stripHtml('<details><summary>Toggle</summary>Hidden body</details>')).toBe(
      '▾ Toggle\n  Hidden body',
    )
  })

  test('details with open attribute renders the same (always expanded)', () => {
    expect(stripHtml('<details open><summary>S</summary>B</details>')).toBe('▾ S\n  B')
  })

  test('details without summary uses bare arrow', () => {
    expect(stripHtml('<details>just body</details>')).toBe('▾\n  just body')
  })

  test('multi-line details body keeps every line indented', () => {
    expect(stripHtml('<details><summary>S</summary>\nline1\nline2\n</details>')).toBe(
      '▾ S\n  line1\n  line2',
    )
  })

  test('sequential details blocks each expand independently', () => {
    expect(
      stripHtml('<details><summary>A</summary>1</details><details><summary>B</summary>2</details>'),
    ).toBe('▾ A\n  1\n▾ B\n  2')
  })

  test('nested details flatten — inner content preserved', () => {
    const out = stripHtml(
      '<details><summary>Outer</summary><details><summary>Inner</summary>X</details></details>',
    )
    expect(out).toContain('Outer')
    expect(out).toContain('Inner')
    expect(out).toContain('X')
  })

  test('sub/sup unwrap inner text', () => {
    expect(stripHtml('H<sub>2</sub>O')).toBe('H2O')
    expect(stripHtml('E=mc<sup>2</sup>')).toBe('E=mc2')
  })

  test('inline mark unwraps', () => {
    expect(stripHtml('Some <mark>highlighted</mark> text')).toBe('Some highlighted text')
  })

  test('br tags disappear (the inline renderer handles real <br>)', () => {
    expect(stripHtml('one<br>two<br />three')).toBe('onetwothree')
  })

  test('paragraph wrapper with nested anchors and images keeps visible text only', () => {
    const input =
      '<p align="center"><a href="https://x"><img src="y" alt="Build" /></a> <a href="https://z">link text</a></p>'
    expect(stripHtml(input)).toBe('link text')
  })

  test('html-style table flattens to its cell text', () => {
    const input =
      '<table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody><tr><td>Ada</td><td>Engineer</td></tr></tbody></table>'
    expect(stripHtml(input)).toContain('Name')
    expect(stripHtml(input)).toContain('Engineer')
  })
})

describe('stripHtml — sanitization edge cases', () => {
  test('script tag removes its body entirely', () => {
    expect(stripHtml('<script>alert("xss")</script>')).toBe('')
  })

  test('script tag with attributes removes its body', () => {
    expect(stripHtml('<script type="text/javascript">window.x = 1</script>')).toBe('')
  })

  test('style tag removes its body entirely', () => {
    expect(stripHtml('<style>body { display: none; }</style>')).toBe('')
  })

  test('script does not bleed into surrounding text', () => {
    expect(stripHtml('before<script>nope</script>after')).toBe('beforeafter')
  })

  test('html comments are removed', () => {
    expect(stripHtml('<!-- secret --> visible')).toBe('visible')
  })

  test('inline html comment between words', () => {
    expect(stripHtml('before <!-- hidden --> after')).toBe('before  after')
  })

  test('unknown / custom elements unwrap to inner text', () => {
    expect(stripHtml('<custom-element foo="bar">inside</custom-element>')).toBe('inside')
  })

  test('self-closing void elements vanish', () => {
    expect(stripHtml('<hr />')).toBe('')
    expect(stripHtml('<br />')).toBe('')
  })
})

describe('stripHtml — entity decoding', () => {
  test('common named entities', () => {
    expect(stripHtml('foo &amp; bar &lt;baz&gt;')).toBe('foo & bar <baz>')
  })

  test('numeric decimal entity', () => {
    expect(stripHtml('A&#65;B')).toBe('AAB')
  })

  test('numeric hex entity', () => {
    expect(stripHtml('&#x2713; done')).toBe('✓ done')
  })

  test('nbsp becomes a regular space', () => {
    expect(stripHtml('a&nbsp;b')).toBe('a b')
  })

  test('unknown named entity passes through verbatim', () => {
    expect(stripHtml('&fakeentity;')).toBe('&fakeentity;')
  })
})

describe('stripHtml — whitespace normalization', () => {
  test('runs of blank lines collapse to a single paragraph break', () => {
    expect(stripHtml('a\n\n\n\nb')).toBe('a\n\nb')
  })

  test('trailing whitespace before a newline is trimmed', () => {
    expect(stripHtml('a   \nb')).toBe('a\nb')
  })

  test('leading and trailing blank lines from a wrapper are removed', () => {
    expect(stripHtml('<div>\n\n  text\n\n</div>')).toBe('text')
  })

  test('empty input returns empty string', () => {
    expect(stripHtml('')).toBe('')
  })

  test('input with only tags returns empty string', () => {
    expect(stripHtml('<div></div><span></span>')).toBe('')
  })
})

describe('stripHtml — should NOT swallow text that merely looks tag-ish', () => {
  test('arithmetic comparison stays intact', () => {
    expect(stripHtml('a < b and c > d')).toBe('a < b and c > d')
  })

  test('lone less-than before a digit stays intact', () => {
    expect(stripHtml('temperature < 0')).toBe('temperature < 0')
  })
})
