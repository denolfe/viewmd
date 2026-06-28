# Raw HTML Stress Test

Realistic raw-HTML patterns scraped from typical READMEs. Use this to compare rendering before/after raw-HTML handling lands.

## Centered Banner

<div align="center">

# Project Name

A short tagline goes here.

</div>

## Badge Row

<p align="center">
  <a href="https://example.com/build"><img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build" /></a>
  <a href="https://example.com/npm"><img src="https://img.shields.io/npm/v/example" alt="npm" /></a>
  <a href="https://example.com/license"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License" /></a>
</p>

## Collapsible Details

<details>
<summary>Click to expand installation steps</summary>

1. Install via npm: `npm install example`
2. Import it: `import { thing } from 'example'`
3. Use it: `thing()`

</details>

<details open>
<summary><strong>Already-open block with bold summary</strong></summary>

Content inside an open details block — should remain visible.

</details>

## Sub/Sup

The chemical formula H<sub>2</sub>O is water. Einstein's E=mc<sup>2</sup> changed physics.

Footnote-ish<sup>[1]</sup> reference.

## Inline kbd

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> to open the command palette.

## Picture / Responsive Image

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://example.com/logo-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="https://example.com/logo-light.png" />
  <img alt="Logo" src="https://example.com/logo.png" />
</picture>

## Mark / Highlight

Some <mark>highlighted text</mark> in the middle of a sentence.

## Br Tags

Line one<br>
Line two<br />
Line three

## HTML Comments

<!-- This comment should be invisible. -->

A paragraph with an inline <!-- inline comment --> comment in the middle.

## Table via HTML

<table>
  <thead>
    <tr><th>Name</th><th>Role</th></tr>
  </thead>
  <tbody>
    <tr><td>Ada</td><td>Engineer</td></tr>
    <tr><td>Linus</td><td>Maintainer</td></tr>
  </tbody>
</table>

## Iframe / Embed (should be hidden or replaced)

<iframe src="https://example.com/embed" width="560" height="315"></iframe>

<video src="https://example.com/demo.mp4" controls></video>

## Script / Style (must NEVER render contents)

<script>alert('xss')</script>

<style>body { display: none; }</style>

## Mixed Inline HTML in Paragraph

This paragraph mixes <em>HTML em</em>, <strong>HTML strong</strong>, <code>html code</code>, and a <a href="https://example.com">raw anchor</a> alongside markdown **bold** and `code`.

## Self-closing & Void Elements

A horizontal rule via HTML:

<hr />

A line break inside text<br />continues here.

## Unknown Tag

<custom-element foo="bar">should degrade gracefully</custom-element>
