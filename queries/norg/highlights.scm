(heading
  (heading_prefix) @markup.heading.1.marker
  title: (_) @markup.heading.1
)
(heading (heading
  (heading_prefix) @markup.heading.2.marker
  title: (_) @markup.heading.2
))
(heading (heading (heading
  (heading_prefix) @markup.heading.3.marker
  title: (_) @markup.heading.3
)))
(heading (heading (heading (heading
  (heading_prefix) @markup.heading.4.marker
  title: (_) @markup.heading.4
))))
(heading (heading (heading (heading (heading
  (heading_prefix) @markup.heading.5.marker
  title: (_) @markup.heading.5
)))))
(heading (heading (heading (heading (heading (heading
  (heading_prefix) @markup.heading.6.marker
  title: (_) @markup.heading.6
))))))
; fallback highlight to level6 from level7
(heading (heading (heading (heading (heading (heading (heading
  (heading_prefix) @markup.heading.6.marker
  title: (_) @markup.heading.6
)))))))

(bold) @markup.strong
(italic) @markup.italic
(underline) @markup.underline
(strikethrough) @markup.strikethrough
(inline_comment) @comment
(verbatim) @markup.raw.verbatim @nospell
(math) @markup.math @nospell

; TODO: only conceal on valid markup
(_
  [
    (bold_open)
    (bold_close)
    (italic_open)
    (italic_close)
    (underline_open)
    (underline_close)
    (strikethrough_open)
    (strikethrough_close)
    (verbatim_open)
    (verbatim_close)
    (free_form_open)
    (free_form_close)
  ] @conceal
  (#set! conceal ""))
; (verbatim
;   (whitespace) @conceal @markup.raw.verbatim
;   (#set! conceal "␣"))

((inline_comment) @conceal
  (#set! conceal ""))

(uri) @markup.link.url
(description) @markup.link.label
(link
  [
    "["
    "]"
    "{"
    "}"
  ] @markup.link
  (#set! conceal ""))
(link
  target: (_) @markup.link
  description: (_)
  (#set! conceal ""))
(anchor
  [
    "["
    "]"
    "{"
    target: (_)
    "}"
  ] @markup.link
  (#set! conceal ""))

(escape_sequence) @string.escape

((escape_sequence) @conceal
  (#offset! @conceal 0 0 0 -1)
  (#set! conceal ""))

(verbatim_ranged_tag
  "@" @markup.raw.delimiter
  (identifier) @namespace
  "@end" @markup.raw.delimiter)
(verbatim_ranged_tag
  content: (_) @markup.raw.block @nospell
  (#set! "priority" 90))

[
  (unordered_list_prefix)
  (ordered_list_prefix)
  (quote_list_prefix)
] @markup.list

(null_list_prefix) @comment

(strong_carryover_tag
  "#" @punctuation.special
  param: (_)? @parameter
) @type

(weak_carryover_tag
  "+" @punctuation.special
  param: (_)? @parameter
) @type

(weak_delimiting_modifier) @punctuation.special
(strong_delimiting_modifier) @punctuation.special

(open_conflict
  [
    (bold_open)
    (italic_open)
    ;; TODO: add more
  ] @warn
)

(ERROR) @error

; vim:ts=2:sw=2:
