(comment) @comment @spell

[
  (addition)
  (new_file)
] @diff.plus

[
  (deletion)
  (old_file)
] @diff.minus

(change) @diff.delta

(commit) @constant

(location) @attribute

(command
  "diff" @function
  (argument) @variable.parameter)

(filename) @string.special.path

(special) @string.special

"\\" @punctuation.special

(mode) @number

; Line markers (+ - < > !) carry no capture of their own, so they inherit the
; line's diff.plus/diff.minus color. OpenTUI ignores `priority` and would let a
; punctuation capture override the line color.
".." @punctuation.special

[
  (binary_change)
  (similarity)
  (dissimilarity)
  (file_change)
] @label

(index
  "index" @keyword)

(similarity
  (score) @number
  "%" @number)

(dissimilarity
  (score) @number
  "%" @number)

(binary_patch
  [
    "GIT"
    "binary"
    "patch"
  ] @label)

(binary_hunk
  [
    "literal"
    "delta"
  ] @keyword
  (size) @number)

forward: (binary_hunk
  (payload) @diff.plus)

reverse: (binary_hunk
  (payload) @diff.minus)
