/// <reference types="tree-sitter-cli/dsl" />
// @ts-check
const ATTACHED_MODIFIERS = [
    "bold",
    "italic",
    "underline",
    "strikethr",
    "spoiler",
    "superscript",
    "subscript",
];
const VERBATIM_ATTACHED_MODIFIERS = [
    "verbatim",
    // "comment",
    // "math",
    // "macro",
];

const word = /[\p{L}\p{N}]+/;
const whitespace = /\p{Zs}+/;
const newline = choice("\n", "\r", "\r\n");

/// General TODOS:
//  - Abstract repeating patterns (e.g. nestable detached modifiers) into Javascript functions.
//  - Add tests for link modifiers, then everything else.
//  - Make every node have an alias($.node, $.node_prefix). Only some currently do.

module.exports = grammar({
    name: "norg3",

    // Tell treesitter we want to handle whitespace ourselves
    extras: ($) => [$._preceding_whitespace],
    externals: ($) => [
        $._preceding_whitespace,
        $.eof,
        $.para_break,
        $._newline,

        $.bold_close,
        $.italic_close,
        $.underline_close,
        $.strikethr_close,
        $.spoiler_close,
        $.superscript_close,
        $.subscript_close,
        $.verbatim_close,
        $.comment_close,
        $.math_close,
        $.macro_close,

        $.open_conflict,
        $._close_conflict,

        $.heading_stars,
        $.unordered_list_prefix,
        $.ordered_list_prefix,
        $.quote_prefix,

        $.strong_carryover_prefix,

        $.weak_delimiting_modifier,

        $._dedent,

        // don't use this token from grammar.
        // this is for checking if parser is in recovery mode
        $._recovery,
    ],

    conflicts: ($) => [
        // [$.soft_para_break, $.soft_break],
        // [$.punc, $.verbatim_open],
    ],

    precedences: () => [],

    inline: () => [],

    supertypes: ($) => [
        $.non_structural,
        // $.nestable_modifier,
    ],

    rules: {
        document: ($) =>
            repeat(
                choice(
                    $.heading,
                    $.non_structural,
                    // $.strong_delimiting_modifier,
                    $._newline,
                ),
            ),

        heading: ($) =>
            prec.right(seq(
                $.heading_stars,
                $.ws,
                field(
                    "title",
                    choice(
                        alias($.paragraph, $.inline),
                        $.slide,
                        $.indent_segment
                    )
                ),
                repeat(choice(
                    $.heading,
                    $.non_structural,
                    $._newline,
                )),
                optional(choice(
                    seq(
                        $._dedent,
                    ),
                ))
            )),
        tag: ($) => seq(
            $.strong_carryover_prefix,
            $.identifier,
            choice($._newline, $.eof)
        ),
        identifier: (_) => /[A-Za-z]+/,

        slide_prefix: ($) => seq(token(prec(1, ":")), $._newline),
        indent_prefix: ($) => seq(token(prec(1, "::")), $._newline),
        slide: ($) => seq(
            $.slide_prefix,
            prec.right(repeat1(
                choice(
                    $.non_structural
                )
            ))
        ),
        indent_segment: ($) => seq(
            $.indent_prefix,
            prec.right(
                repeat1(
                    choice(
                        $.non_structural,
                        // $.structural,
                        $._newline,
                    )
                )
            )
        ),
        non_structural: ($) =>
            choice(
                $.paragraph,
                // $.nestable_modifier,
                // $.rangeable_detached_modifier,
                $.tag,
                // $.delimiting_modifier,
            ),

        paragraph: ($) => seq(
            $._non_ws,
            choice(
                // $.soft_para_break,
                $.para_break,
                $.eof
            )
        ),

        _soft_break: ($) => seq(optional(whitespace), alias(newline, $.soft_break)),
        // soft_para_break: (_) => token(seq(optional(whitespace), newline)),
        trailing_ws: (_) => whitespace,
        ws: (_) => whitespace,
        word: (_) => word,
        punc: ($) =>
            choice(
                token(prec(2, seq("*", repeat1("*")))),
                token(prec(2, seq("/", repeat1("/")))),
                token(prec(2, seq("-", repeat1("-")))),
                token(prec(2, seq("!", repeat1("!")))),
                token(prec(2, seq("^", repeat1("^")))),
                token(prec(2, seq(",", repeat1(",")))),
                token(prec(2, seq("`", repeat1("`")))),
                token(prec(2, seq("%", repeat1("%")))),
                token(prec(2, seq("$", repeat1("$")))),
                token(prec(2, seq("&", repeat1("&")))),
                "*",
                "/",
                "_",
                "-",
                "!",
                "^",
                ",",
                "`",
                "%",
                "$",
                "&",
                ":",
                $._close_conflict,
                // NOTE: only `(` can be parsed as punctuation and not `{`, `[`
                "(",
                ")",
                "|",
                "}",
                "]",
                token(/[^\{\[\n\r\p{Z}\p{L}\p{N}]/),
            ),

        verbatim_open: (_) => prec(1, "`"),
        verbatim: ($) =>
            seq($.verbatim_open, $._verbatim_non_ws, $.verbatim_close),
        _verbatim_non_ws: ($) =>
            choice(
                $.word,
                $.punc,
                prec.left(seq($._verbatim_non_ws, $._verbatim_non_ws)),
                prec.left(seq($._verbatim_non_ws, $.ws, $._verbatim_non_ws)),
                prec.right(
                    seq($._verbatim_non_ws, $._soft_break, $._verbatim_non_ws),
                ),
            ),
        ...gen_attached_modifier("bold", "*"),
        ...gen_attached_modifier("italic", "/"),
        ...gen_attached_modifier("underline", "_"),
        ...gen_attached_modifier("strikethr", "-"),
        ...gen_attached_modifier("spoiler", "!"),
        ...gen_attached_modifier("superscript", "^"),
        ...gen_attached_modifier("subscript", ","),
        ...gen_attached_modifier_etc("bold"),
        ...gen_attached_modifier_etc("italic"),
        ...gen_attached_modifier_etc("underline"),
        ...gen_attached_modifier_etc("strikethr"),
        ...gen_attached_modifier_etc("spoiler"),
        ...gen_attached_modifier_etc("superscript"),
        ...gen_attached_modifier_etc("subscript"),

        _non_ws: ($) =>
            choice(
                // $.para_break,
                seq($.word, optional(alias($.open_conflict, $.punc))),
                $.punc,
                ...ATTACHED_MODIFIERS.map((t) => $[t]),
                $.verbatim,
                prec.left(seq($._non_ws, $._non_ws)),
                prec.left(seq($._non_ws, $.ws, $._non_ws)),
                prec.right(seq($._non_ws, $._soft_break, $._non_ws)),
            ),
    },
});

/**
 * @param {string} type
 * @param {string} mod
 */
function gen_attached_modifier(type, mod) {
    /**
     * @type {RuleBuilders<string, string>}
     */
    let rules = {};
    rules[type + "_open"] = (_) => prec(1, mod);
    rules[type] = ($) =>
        prec(
            1,
            seq(
                // alias($[type + "_open"], "_open"),
                $[type + "_open"],
                // $._non_ws,
                prec.right($["_" + type + "_non_ws"]),
                $[type + "_close"],
                // optional(field("extension", $.attached_modifier_extension)),
            ),
        );
    return rules;
}
/**
 * @param {string} type
 */
function gen_attached_modifier_etc(type) {
    const other_attached_modfiers = ATTACHED_MODIFIERS.filter((t) => t != type);
    /**
     * @type {RuleBuilders<string, string>}
     */
    let rules = {};
    rules["_" + type + "_non_ws"] = ($) =>
        choice(
            seq($.word, optional(alias($.open_conflict, $.punc))),
            $.punc,
            $.verbatim,
            seq(
                choice(
                    ...other_attached_modfiers.map((t) => $[t]),
                    // ...other_attached_modfiers.map((t) => $["free_" + t]),
                    ...VERBATIM_ATTACHED_MODIFIERS.map((t) => $[t]),
                    // ...VERBATIM_ATTACHED_MODIFIERS.map((t) => $["free_" + t]),
                ),
            ),
            prec.left(
                seq($["_" + type + "_non_ws"], $["_" + type + "_non_ws"]),
            ),
            prec.left(
                seq($["_" + type + "_non_ws"], $.ws, $["_" + type + "_non_ws"]),
            ),
            prec.right(
                seq(
                    $["_" + type + "_non_ws"],
                    $._soft_break,
                    $["_" + type + "_non_ws"],
                ),
            ),
        );
    return rules;
}
