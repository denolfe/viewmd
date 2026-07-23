import { describe, expect, test } from 'bun:test'
import { parseHtmlSegments, stripHtml } from './html'

describe('stripHtml — common README HTML', () => {
  test('drops a wrapper div, keeps inner text', () => {
    expect(stripHtml('<div align="center">Centered text</div>')).toBe('Centered text')
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

  test('out-of-range hex numeric entity decodes to U+FFFD, does not throw', () => {
    expect(() => stripHtml('<div>&#x110000;</div>')).not.toThrow()
    expect(stripHtml('<div>&#x110000;</div>')).toBe('�')
  })

  test('out-of-range decimal numeric entity decodes to U+FFFD, does not throw', () => {
    expect(() => stripHtml('<div>&#9999999999;</div>')).not.toThrow()
    expect(stripHtml('<div>&#9999999999;</div>')).toBe('�')
  })

  test('valid hex numeric entity still decodes correctly', () => {
    expect(stripHtml('<span>&#x41;</span>')).toBe('A')
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

describe('parseHtmlSegments — anchors and images', () => {
  test('clickable banner: link wrapping image', () => {
    expect(parseHtmlSegments('<a href="https://x"><img alt="Banner" src="b.jpg" /></a>')).toEqual([
      {
        kind: 'link',
        href: 'https://x',
        children: [{ kind: 'image', alt: 'Banner', src: 'b.jpg' }],
      },
    ])
  })

  test('badge row inside <p>: text separator preserved as single space', () => {
    const input =
      '<p align="left"><a href="https://a"><img alt="A" src="a.svg"></a>&nbsp;<a href="https://b"><img alt="B" src="b.svg" /></a></p>'
    const segs = parseHtmlSegments(input)
    expect(segs).toHaveLength(3)
    expect(segs[0]).toMatchObject({ kind: 'link', href: 'https://a' })
    expect(segs[1]).toEqual({ kind: 'text', value: ' ' })
    expect(segs[2]).toMatchObject({ kind: 'link', href: 'https://b' })
  })

  test('nav row: link-wrapped <strong> becomes link with plain text inside', () => {
    const input =
      '<h4><a href="https://docs"><strong>Explore the Docs</strong></a>&nbsp;·&nbsp;<a href="https://com"><strong>Community</strong></a></h4>'
    const segs = parseHtmlSegments(input)
    expect(segs).toHaveLength(3)
    expect(segs[0]).toEqual({
      kind: 'link',
      href: 'https://docs',
      children: [{ kind: 'text', value: 'Explore the Docs' }],
    })
    expect(segs[1]).toEqual({ kind: 'text', value: ' · ' })
    expect(segs[2]).toEqual({
      kind: 'link',
      href: 'https://com',
      children: [{ kind: 'text', value: 'Community' }],
    })
  })

  test('whitespace between elements collapses to a single space', () => {
    const input = '<p>\n  <a href="x">A</a>\n  <a href="y">B</a>\n</p>'
    const segs = parseHtmlSegments(input)
    expect(segs).toEqual([
      { kind: 'link', href: 'x', children: [{ kind: 'text', value: 'A' }] },
      { kind: 'text', value: ' ' },
      { kind: 'link', href: 'y', children: [{ kind: 'text', value: 'B' }] },
    ])
  })

  test('standalone image without link emits image segment', () => {
    expect(parseHtmlSegments('<img alt="X" src="x.png" />')).toEqual([
      { kind: 'image', alt: 'X', src: 'x.png' },
    ])
  })

  test('script/style contents removed before parsing', () => {
    expect(parseHtmlSegments('<script>alert(1)</script>')).toEqual([])
    expect(parseHtmlSegments('<style>body{x:1}</style>')).toEqual([])
  })

  test('anchor with single-quoted attributes', () => {
    expect(parseHtmlSegments("<a href='https://x'>text</a>")).toEqual([
      { kind: 'link', href: 'https://x', children: [{ kind: 'text', value: 'text' }] },
    ])
  })

  test('unclosed anchor still emits link with following content as children', () => {
    const segs = parseHtmlSegments('<a href="x">tail')
    expect(segs).toEqual([{ kind: 'link', href: 'x', children: [{ kind: 'text', value: 'tail' }] }])
  })

  test('adjacent block-level chunks break onto separate lines', () => {
    const input = '<p><a href="a">A</a></p><h4><a href="b">B</a></h4>'
    const segs = parseHtmlSegments(input)
    expect(segs).toEqual([
      { kind: 'link', href: 'a', children: [{ kind: 'text', value: 'A' }] },
      { kind: 'text', value: '\n' },
      { kind: 'link', href: 'b', children: [{ kind: 'text', value: 'B' }] },
    ])
  })

  test('<br> forces a line break inside otherwise-inline content', () => {
    expect(parseHtmlSegments('one<br>two<br />three')).toEqual([
      { kind: 'text', value: 'one\ntwo\nthree' },
    ])
  })

  test('<hr> renders as a line break between siblings', () => {
    const segs = parseHtmlSegments('<a href="a">A</a><hr/><a href="b">B</a>')
    expect(segs).toEqual([
      { kind: 'link', href: 'a', children: [{ kind: 'text', value: 'A' }] },
      { kind: 'text', value: '\n' },
      { kind: 'link', href: 'b', children: [{ kind: 'text', value: 'B' }] },
    ])
  })

  test('badge row + nav row from a single HTML chunk produce a real break', () => {
    const input =
      '<p align="left">' +
      '<a href="https://b1"><img alt="Build" src="b.svg"></a>&nbsp;' +
      '<a href="https://d"><img alt="Discord" src="d.svg" /></a>' +
      '</p>' +
      '<hr/>' +
      '<h4>' +
      '<a href="https://docs"><strong>Docs</strong></a>&nbsp;·&nbsp;' +
      '<a href="https://com"><strong>Community</strong></a>' +
      '</h4>'
    const segs = parseHtmlSegments(input)
    const newlineCount = segs.filter(s => s.kind === 'text' && s.value.includes('\n')).length
    expect(newlineCount).toBeGreaterThanOrEqual(1)
    expect(segs.some(s => s.kind === 'link' && s.href === 'https://docs')).toBe(true)
    expect(segs.some(s => s.kind === 'link' && s.href === 'https://b1')).toBe(true)
  })
})
