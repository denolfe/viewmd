# Language Detection

Every block below is an untagged fence. Headings state the expected result. A detected block gets syntax colors but no title.

## Detected

### Shebang: bash

```
#!/usr/bin/env bash
set -euo pipefail
for f in *.md; do
  echo "$f"
done
```

### Shebang: python

```
#!/usr/bin/python3.11
import sys
print(sys.argv)
```

### Shebang: typescript (bun)

```
#!/usr/bin/env bun
const name: string = 'viewmd'
console.log(name)
```

### Shell prompt: bash

```
$ bun install
$ bun test --watch
```

### JSON

```
{
  "name": "viewmd",
  "version": "0.10.0",
  "private": true,
  "keywords": ["markdown", "tui"]
}
```

### HTML: document

```
<!DOCTYPE html>
<html lang="en">
  <body>
    <h1>Hello</h1>
  </body>
</html>
```

### HTML: README header fragment

```
<p align="center">
  <a href="https://example.com"><img src="logo.png" alt="Logo" width="200"></a>
</p>
```

### HTML: comment first

```
<!-- badge row -->
<span><img src="badge.svg"></span>
```

### Go

```
// Package main is the entry point.
package main

import "fmt"

func main() {
	fmt.Println("hi")
}
```

### Python: def

```
def greet(name: str) -> str:
    return f"hello {name}"
```

### Python: from-import

```
from pathlib import Path

print(Path.cwd())
```

### Rust: fn

```
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

### Rust: use

```
use std::collections::HashMap;

let mut m = HashMap::new();
```

### TOML

```
[package]
name = "viewmd"
version = "0.1.0"

[dependencies]
serde = "1"
```

## Plain (not detected)

### File tree

```
src/
├── index.tsx
└── app/
    ├── App.tsx
    └── lib/
```

### Log output

```
ERROR 2024-01-01T10:00:00Z failed to connect to db
WARN  retrying in 5s...
```

### Prose

```
This is just some plain text the author put in a fence.
Note: it should stay uncolored.
```

### Command output without prompt

```
added 42 packages in 1.2s
```

### Unknown shebang (perl)

```
#!/usr/bin/env perl
print "hi\n";
```

### Invalid JSON (JS object)

```
{ name: 'viewmd', private: true }
```

### JSX (expression attribute)

```
<div className={styles.card}>
  {children}
</div>
```

### JSX component

```
<Button onClick>Click</Button>
```

### HTML tag outside the list

```
<section>
  <p>Hi</p>
</section>
```

### Java package (not Go)

```
package com.example;

public class Main {}
```

### Zig fn (not Rust)

```
pub fn main() void {
    std.debug.print("hi\n", .{});
}
```

### Bare assignment (not TOML)

```
x = 1
y = 2
```

## Tagged (unchanged)

### Explicit `text` stays plain

```text
$ bun install
```

### Explicit `json` keeps its title

```json
{ "a": 1 }
```
