# Language Parsers

Code blocks for every language sanemd ships a parser for.

## JavaScript

```javascript
const greet = name => `Hello, ${name}!`
console.log(greet('world'))
```

## TypeScript

```typescript
type User = { id: number; name: string }
const user: User = { id: 1, name: 'Ada' }
```

## Bash

```bash
#!/usr/bin/env bash
for f in *.md; do
  echo "Found: $f"
done
```

## Python

```python
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print([fib(i) for i in range(10)])
```

## Rust

```rust
fn main() {
    let xs: Vec<i32> = (1..=5).collect();
    let sum: i32 = xs.iter().sum();
    println!("sum = {sum}");
}
```

## Go

```go
package main

import "fmt"

func main() {
    for i := 0; i < 3; i++ {
        fmt.Println("hello", i)
    }
}
```

## JSON

```json
{
  "name": "sanemd",
  "version": "0.1.0",
  "dependencies": {
    "@opentui/core": "*"
  }
}
```

## YAML

```yaml
name: sanemd
runtime: bun
features:
  - syntax-highlighting
  - toc-sidebar
```

## TOML

```toml
[package]
name = "sanemd"
version = "0.1.0"

[dependencies]
opentui = "*"
```

## HTML

```html
<!doctype html>
<html lang="en">
  <body>
    <h1>Hello</h1>
    <p>World</p>
  </body>
</html>
```

## CSS

```css
.title {
  color: #f0f;
  font-weight: bold;
  padding: 0.5rem 1rem;
}
```

## Zig

```zig
const std = @import("std");

pub fn main() void {
    std.debug.print("hello {s}\n", .{"zig"});
}
```

## Markdown

```markdown
# Heading

- list item
- **bold** and _italic_

> a blockquote
```
