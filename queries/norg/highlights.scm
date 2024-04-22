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
(spoiler) @markup.spoiler
(superscript) @markup.superscript
(subscript) @markup.subscript
(inline_comment) @comment
(verbatim) @markup.raw.verbatim @nospell
(math) @markup.math @nospell
(inline_macro) @macro @nospell

(
  [
    (bold [(bold_open) (bold_close)] @conceal)
    (italic [(italic_open) (italic_close)] @conceal)
    (underline [(underline_open) (underline_close)] @conceal)
    (strikethrough [(strikethrough_open) (strikethrough_close)] @conceal)
    (spoiler [(spoiler_open) (spoiler_close)] @conceal)
    (superscript [(superscript_open) (superscript_close)] @conceal)
    (subscript [(subscript_open) (subscript_close)] @conceal)
    (inline_comment [(inline_comment_open) (inline_comment_close)] @conceal)
    (verbatim [(verbatim_open) (verbatim_close)] @conceal)
    (math [(math_open) (math_close)] @conceal)
    (inline_macro [(inline_macro_open) (inline_macro_close)] @conceal)
    (free_form_open) @conceal
    (free_form_close) @conceal
  ]
  (#set! conceal ""))

; (verbatim
;   (whitespace) @markup.raw.verbatim.special
;   (#set! conceal "␣"))

;; TODO: conceal only when used without extensions
((inline_comment) @conceal
  (#set! conceal ""))

[
  (uri)
  (link_target_file)
  (link_target_wiki)
  (link_target_magic)
  (link_target_timestamp)
  ] @markup.link.url
(norg_file (path) @markup.link.url)
(norg_file
  ":" @punctuation.delimiter
  (#set! conceal ""))
(description) @markup.link.label
;; FIX(boltless): maybe I can warp these two queries in single query
(link
  [
    "["
    "]"
    "{"
    "}"
  ] @conceal
  (#set! conceal ""))
(link
  target: [
            (norg_file (path) @markup.link.url)
          ]
  )
(link
  target: (_) @conceal
  description: (_)
  (#set! conceal ""))
(anchor
  [
    "["
    "]"
    "{"
    target: (_) @markup.link.url
    "}"
  ] @markup.link
  (#set! conceal ""))

(escape_sequence) @string.escape

;; it breaks when treesitter tries to match hard break
; ((escape_sequence) @conceal
;   (#offset! @conceal 0 0 0 -1)
;   (#set! conceal ""))

(verbatim_ranged_tag
  "@" @keyword
  (identifier) @keyword
  "@end" @keyword)
(verbatim_ranged_tag
  content: (_) @markup.raw.block @nospell
  (#set! "priority" 90))
(standard_ranged_tag
  ;; HACK: aliased "|" here is invalid. I have no idea why
  (std_ranged_tag_prefix) @namespace
  (identifier) @namespace
  "|end" @namespace)
(infirm_tag
  "." @namespace
  (identifier) @namespace)

((strong_carryover_tag
  (identifier) @_name
  (#eq? @_name "comment"))
  .
  (_) @comment
  (#set! "priority" 90))
; (standard_ranged_tag
;   (identifier) @_name
;   content: (_) @comment
;   (#eq? @_name "comment")
;   (#set! "priority" 90))

[
  (unordered_list_prefix)
  (ordered_list_prefix)
  (quote_list_prefix)
] @markup.list

(null_list_prefix) @comment

(footnote
  title: (_) @markup.strong)
(definition
  title: (_) @markup.strong)
(table
  title: (_) @markup.strong)

(weak_delimiting_modifier) @punctuation.special
(strong_delimiting_modifier) @punctuation.special

(open_conflict
  [
    (bold_open)
    (italic_open)
    ;; TODO: add more
  ] @warn)

(ext_attribute
  key: (_) @variable.member)
(ext_attribute
  value: (_) @string)
(weak_carryover_tag
  "+" @punctuation.special
  key: (_) @variable.member)
(weak_carryover_tag
  value: (_) @string)
(strong_carryover_tag
  "#" @punctuation.special
  name: (_) @attribute
  argument: (_)? @string)

; HACK: for debug perpose
(ext_attribute
  !key) @markup.underline

(ERROR) @error

; vim:ts=2:sw=2:
