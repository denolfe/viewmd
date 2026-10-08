import { describe, expect, test } from 'bun:test'
import { detectLang } from './detect-lang'

describe('detectLang', () => {
  describe('shebang', () => {
    test.each([
      ['#!/bin/bash\necho hi', 'bash'],
      ['#!/bin/sh\necho hi', 'bash'],
      ['#!/usr/bin/env zsh\necho hi', 'bash'],
      ['#!/usr/bin/env python3\nprint(1)', 'python'],
      ['#!/usr/bin/python3.11\nprint(1)', 'python'],
      ['#!/usr/bin/env -S node --no-warnings\nconsole.log(1)', 'javascript'],
      ['#!/usr/bin/env bun\nconsole.log(1)', 'typescript'],
      ['#!/usr/bin/env FOO=1 deno\nconsole.log(1)', 'typescript'],
    ])('%p -> %p', (src, lang) => {
      expect(detectLang(src)).toBe(lang)
    })

    test('unknown interpreter yields undefined', () => {
      expect(detectLang('#!/usr/bin/env perl\nprint 1;')).toBeUndefined()
    })
  })

  test('shell prompt on first line', () => {
    expect(detectLang('$ bun install\n$ bun test')).toBe('bash')
    expect(detectLang('\n$ ls\nfile.txt')).toBe('bash')
  })

  test('JSON object or array', () => {
    expect(detectLang('{"a": 1, "b": [true, null]}')).toBe('json')
    expect(detectLang('[\n  1,\n  2\n]')).toBe('json')
  })

  test('JSON-like but invalid stays undetected', () => {
    expect(detectLang('{ a: 1 }')).toBeUndefined()
  })

  test.each([
    '<!DOCTYPE html>\n<html></html>',
    '<html lang="en">\n</html>',
    '<div class="card">\n  <p>Hi</p>\n</div>',
    '<img src="logo.png" alt="Logo" width="200">',
    '<p align="center">\n  <a href="x"><img src="y"></a>\n</p>',
    '\n<table>\n  <tr><td>1</td></tr>\n</table>',
    '<br/>',
    '<!-- comment -->\n<span>x</span>',
  ])('HTML: %p', src => {
    expect(detectLang(src)).toBe('html')
  })

  test.each([
    ['JSX expression attribute', '<div className={styles.card}>\n  {children}\n</div>'],
    ['component tag', '<App />'],
    ['component named like a tag', '<Button>Click</Button>'],
    ['unknown tag', '<foo>bar</foo>'],
    ['tag-name prefix', '<abc>'],
    ['HTML after prose', 'Use this:\n<div></div>'],
  ])('not HTML: %s', (_, src) => {
    expect(detectLang(src)).toBeUndefined()
  })

  test('Go package clause', () => {
    expect(detectLang('// Package main\npackage main\n\nfunc main() {}')).toBe('go')
  })

  test('Java package clause is not Go', () => {
    expect(detectLang('package com.example;')).toBeUndefined()
  })

  test.each([
    'def foo(x):\n    return x + 1',
    'async def foo() -> None:\n    pass',
    'from os import path',
    'class Foo(Base):\n    pass',
  ])('Python: %p', src => {
    expect(detectLang(src)).toBe('python')
  })

  test.each([
    'fn main() {\n    println!("hi");\n}',
    'pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}',
    'use std::collections::HashMap;',
  ])('Rust: %p', src => {
    expect(detectLang(src)).toBe('rust')
  })

  test('Zig fn signature is not Rust', () => {
    expect(detectLang('pub fn main() void {\n}')).toBeUndefined()
  })

  test('TOML with a table header', () => {
    expect(detectLang('[package]\nname = "x"\nversion = "0.1.0"')).toBe('toml')
  })

  test('bare assignment without a table header stays undetected', () => {
    expect(detectLang('x = 1')).toBeUndefined()
  })

  test.each([
    ['file tree', 'src/\n├── index.ts\n└── app/'],
    ['log output', 'ERROR 2024-01-01 failed to connect\nretrying in 5s...'],
    ['prose', 'This is just some plain text.'],
    ['empty', ''],
  ])('plain text stays undetected: %s', (_, src) => {
    expect(detectLang(src)).toBeUndefined()
  })
})
