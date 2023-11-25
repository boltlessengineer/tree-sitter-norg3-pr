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
        $.close_conflict,

        $.heading_stars,
        $.unordered_list_prefix,
        $.ordered_list_prefix,
        $.quote_prefix,

        $.weak_delimiting_modifier,

        $._dedent,
    ],

    conflicts: ($) => [
        [$.para_break, $.soft_break],
        ...ATTACHED_MODIFIERS.map((t) => [$["_fail_" + t], $["_" + t + "_non_ws"]]),
        // ...ATTACHED_MODIFIERS.map((t) => [$._non_ws, $[t]]),
        // ...ATTACHED_MODIFIERS.map((t) => [$._bold_non_ws, $[t]]),
        // ...ATTACHED_MODIFIERS.map((t) => [$._italic_non_ws, $[t]]),
        // ...ATTACHED_MODIFIERS.map((t) => [$._underline_non_ws, $[t]]),
        // ...ATTACHED_MODIFIERS.map((t) => [$._strikethr_non_ws, $[t]]),
        // ...ATTACHED_MODIFIERS.map((t) => [$._spoiler_non_ws, $[t]]),
        // ...ATTACHED_MODIFIERS.map((t) => [$._superscript_non_ws, $[t]]),
        // ...ATTACHED_MODIFIERS.map((t) => [$._subscript_non_ws, $[t]]),
        // [$._fail_bold, $._bold_non_ws],
        // [$._fail_italic, $._italic_non_ws],
        // [$._fail_underline, $._underline_non_ws],
        // [$._fail_strikethr, $._strikethr_non_ws],
        [$.punc, $.verbatim_open],
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
                    $.test_heading,
                    $.non_structural,
                    // $.strong_delimiting_modifier,
                ),
            ),

        test_heading: ($) =>
            prec.dynamic(1, seq(
                $.heading_stars,
                $.ws,
                $.paragraph,
            )),
        non_structural: ($) =>
            choice(
                $.paragraph,
                newline,
                // $.nestable_modifier,
                // $.rangeable_detached_modifier,
                // $.tag,
                // $.delimiting_modifier,
            ),

        paragraph: ($) => seq(
            $._non_ws,
            choice(prec(10, $.para_break), $.eof)
        ),
        tag: ($) => seq(token(prec(1, "@")), $.word),

        soft_break: (_) => token(seq(optional(whitespace), newline)),
        para_break: (_) => token(seq(optional(whitespace), newline)),
        ws: (_) => whitespace,
        word: (_) => word,
        punc: ($) => choice(
            ".",
            "*",
            "/",
            "_",
            "-",
            "!",
            "^",
            ",",
            "`",
            "@",
            $.close_conflict,
        ),

        verbatim_open: (_) => prec(0, "`"),
        verbatim: ($) =>
            seq($.verbatim_open, $._verbatim_non_ws, $.verbatim_close),
        _verbatim_non_ws: ($) =>
            choice(
                $.word,
                $.punc,
                prec.left(seq($._verbatim_non_ws, $._verbatim_non_ws)),
                prec.left(seq($._verbatim_non_ws, $.ws, $._verbatim_non_ws)),
                prec.left(
                    seq($._verbatim_non_ws, $.soft_break, $._verbatim_non_ws),
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
        // bold_open: (_) => prec(0, "*"),
        // bold: ($) =>
        //     seq(
        //         $.bold_open,
        //         $._bold_non_ws,
        //         $.bold_close,
        //     ),
        // _bold_non_ws: ($) =>
        //     choice(
        //         $.word,
        //         $.punc,
        //         $.italic,
        //         $.verbatim,
        //         prec.left(seq($._bold_non_ws, $._bold_non_ws)),
        //         prec.left(seq($._bold_non_ws, $.ws, $._bold_non_ws)),
        //         prec.left(seq($._bold_non_ws, $.soft_break, $._bold_non_ws)),
        //     ),
        // italic_open: (_) => prec(0, "/"),
        // italic: ($) =>
        //     seq(
        //         $.italic_open,
        //         $._italic_non_ws,
        //         $.italic_close,
        //     ),
        // _italic_non_ws: ($) =>
        //     choice(
        //         $.word,
        //         $.punc,
        //         $.bold,
        //         $.verbatim,
        //         prec.left(seq($._italic_non_ws, $._italic_non_ws)),
        //         prec.left(seq($._italic_non_ws, $.ws, $._italic_non_ws)),
        //         prec.left(seq($._italic_non_ws, $.soft_break, $._italic_non_ws)),
        //     ),

        _non_ws: ($) =>
            choice(
                // $.para_break,
                seq($.word, optional(
                    $.open_conflict,
                    // alias($.open_conflict, $.punc)
                )),
                $.punc,
                $._fail_bold,
                $._fail_italic,
                $._fail_underline,
                $._fail_strikethr,
                ...ATTACHED_MODIFIERS.map((t) => $[t]),
                $.verbatim,
                prec.left(seq($._non_ws, $._non_ws)),
                prec.left(seq($._non_ws, $.ws, $._non_ws)),
                prec.right(seq($._non_ws, $.soft_break, $._non_ws)),
            ),
    },
});

/**
 * @param {string} type
 * @param {string} mod
 */
function gen_attached_modifier(type, mod) {
    let rules = {};
    rules[type + "_open"] = (_) => prec(1, mod);
    // NOTE: give precedence level on *_open to give higher prefer
    // level to stack with *_open even attached modifier is not completed yet
    // rules[type + "_open"] = (_) => prec(1, mod);
    rules[type] = ($) =>
        prec(1,
        seq(
            // alias($[type + "_open"], "_open"),
            $[type+"_open"],
            // $._non_ws,
            prec.right($["_" + type + "_non_ws"]),
            $[type+"_close"],
            // optional(field("extension", $.attached_modifier_extension)),
            )
        );
    return rules;
}
function gen_attached_modifier_etc(type) {
    const other_attached_modfiers = ATTACHED_MODIFIERS.filter((t) => t != type);
    let rules = {};
    rules["_fail_" + type] = ($) =>
        seq(
            alias($[type + "_open"], $.punc),
            $["_" + type + "_non_ws"],
        ),
    rules["_" + type + "_non_ws"] = ($) =>
        choice(
            seq($.word, optional(
                $.open_conflict,
                // alias($.open_conflict, $.punc)
            )),
            $.punc,
            ...other_attached_modfiers.map((t) => $["_fail_" + t]),
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
                    $.soft_break,
                    $["_" + type + "_non_ws"],
                ),
            ),
        );
    return rules;
}
