let newline = choice("\n", "\r", "\r\n");
let newline_or_eof = choice("\n", "\r", "\r\n", "\0");

/// General TODOS:
//  - Abstract repeating patterns (e.g. nestable detached modifiers) into Javascript functions.
//  - Add tests for link modifiers, then everything else.
//  - Make every node have an alias($.node, $.node_prefix). Only some currently do.

// KNOWN ISSUES:
// - *./text/* fails (issue with $.paragraph grammar disallowing such an order)

module.exports = grammar({
    name: "norg",

    // Tell treesitter we want to handle whitespace ourselves
    extras: ($) => [$._preceding_whitespace],
    externals: ($) => [
        $._preceding_whitespace,

        $.paragraph_break,

        $.punctuation,

        $.non_open,
        $.non_close,

        $.bold_open,
        $.bold_close,

        $.italic_open,
        $.italic_close,

        $.underline_open,
        $.underline_close,

        $.strikethrough_open,
        $.strikethrough_close,

        $.spoiler_open,
        $.spoiler_close,

        $.superscript_open,
        $.superscript_close,

        $.subscript_open,
        $.subscript_close,

        $.verbatim_open,
        $.verbatim_close,

        $.math_open,
        $.math_close,

        $.inline_macro_open,
        $.inline_macro_close,
    ],

    conflicts: ($) => [
        [$.open_conflict, $.verbatim],
        [$.open_conflict, $.math],
        [$.open_conflict, $.inline_macro],
    ],

    precedences: ($) => [],

    inline: ($) => [
        $.paragraph_inner,
        $.verbatim_paragraph_inner,
    ],

    supertypes: ($) => [],

    rules: {
        document: ($) => repeat(choice(
            $.paragraph,
            newline
        )),

        _character: (_) => token(/[\p{L}\p{N}]/u),

        punctuation: ($) => token(/[^\n\r\p{Z}\p{L}\p{N}]/u),

        word: ($) => prec.right(repeat1($._character)),
        whitespace: (_) => token(prec(1, /\p{Zs}+/u)),
        soft_break: (_) => newline,

        paragraph: ($) => prec.right(2, seq($.paragraph_inner, optional($.paragraph_break))),
        // this can be simplified by seq($.paragraph_inner, $.soft_break, $.paragraph_inner)
        // but it's exposed like this to make $.paragraph_inner inline token
        paragraph_inner: ($) =>
            prec.right(
                seq(
                    choice(
                        seq($.whitespace, alias($.non_close, $.punctuation)),
                        seq($.word, alias($.non_open, $.punctuation)),
                        $.whitespace,
                        $.word,
                        $.punctuation,
                        $.bold,
                        $.italic,
                        $.underline,
                        $.strikethrough,
                        $.spoiler,
                        $.superscript,
                        $.subscript,
                        $.verbatim,
                        $.inline_macro,
                        $.math,
                        $.open_conflict,
                    ),
                    repeat(
                        choice(
                            seq($.whitespace, alias($.non_close, $.punctuation)),
                            seq($.word, alias($.non_open, $.punctuation)),
                            $.whitespace,
                            $.word,
                            $.punctuation,
                            $.bold,
                            $.italic,
                            $.underline,
                            $.strikethrough,
                            $.spoiler,
                            $.superscript,
                            $.subscript,
                            $.verbatim,
                            $.inline_macro,
                            $.math,
                            $.open_conflict,
                            seq($.soft_break, $.paragraph_inner),
                        ),
                    ),
                )
            ),

        verbatim_paragraph_inner: ($) =>
            prec.right(
                repeat1(
                    choice(
                        seq($.whitespace, alias($.non_close, $.punctuation)),
                        seq($.word, alias($.non_open, $.punctuation)),
                        $.whitespace,
                        $.word,
                        $.punctuation,
                        $.verbatim_open,
                        $.math_open,
                        $.inline_macro_open,
                        seq($.soft_break, $.verbatim_paragraph_inner),
                    ),
                ),
            ),

        open_conflict: ($) =>
            prec.dynamic(
                -1,
                seq(
                    choice(
                        $.bold_open,
                        $.italic_open,
                        $.underline_open,
                        $.strikethrough_open,
                        $.spoiler_open,
                        $.superscript_open,
                        $.subscript_open,
                        $.verbatim_open,
                        $.math_open,
                        $.inline_macro_open,
                    ),
                    $.paragraph_inner,
                ),
            ),

        // paragraph_break: (_) => token(prec(1, seq(newline, newline_or_eof))),

        bold: ($) => seq($.bold_open, $.paragraph_inner, $.bold_close),
        italic: ($) => seq($.italic_open, $.paragraph_inner, $.italic_close),
        underline: ($) => seq($.underline_open, $.paragraph_inner, $.underline_close),
        strikethrough: ($) =>
            seq($.strikethrough_open, $.paragraph_inner, $.strikethrough_close),
        spoiler: ($) => seq($.spoiler_open, $.paragraph_inner, $.spoiler_close),
        superscript: ($) =>
            seq($.superscript_open, $.paragraph_inner, $.superscript_close),
        subscript: ($) => seq($.subscript_open, $.paragraph_inner, $.subscript_close),

        verbatim: ($) =>
            prec.right(
                -1,
                seq($.verbatim_open, $.verbatim_paragraph_inner, $.verbatim_close),
            ),

        math: ($) =>
            prec.right(
                -1,
                seq($.math_open, $.verbatim_paragraph_inner, $.math_close),
            ),

        inline_macro: ($) =>
            prec.right(
                -1,
                seq(
                    $.inline_macro_open,
                    $.verbatim_paragraph_inner,
                    $.inline_macro_close,
                ),
            ),
    },
});
