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

        $.bold_open,
        $.italic_open,
        $.underline_open,
        $.strikethr_open,
        $.spoiler_open,
        $.superscript_open,
        $.subscript_open,
        $.__verbatim_open,
        $.comment_open,
        $.math_open,
        $.macro_open,
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
        $._newline_close_conflict,
        $._flag_reset_markup,
        $._flag_non_open,

        $.heading_stars,
        $.unordered_list_prefix,
        $.ordered_list_prefix,
        $.quote_prefix,

        $.weak_delimiting_modifier,

        $._dedent,

        // $._recovery,
    ],

    conflicts: ($) => [
        ...ATTACHED_MODIFIERS.map((t) => [
            $["_fail_" + t],
            // $["_" + t + "_non_ws"],
            $._non_ws,
        ]),
        // [$._fail_verbatim, $.verbatim],
        // [$._fail_verbatim, $._verbatim_non_ws],
        // [$._non_ws, $._fail_verbatim],
        // [$._non_ws, $._verbatim_non_ws],
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
                // TODO: make recursive grammar to make ERROR when paragraph is followed by paragraph
                choice(
                    $.test_heading,
                    $.non_structural,
                    // $.strong_delimiting_modifier,
                ),
            ),

        test_heading: ($) =>
            prec.dynamic(2, seq(
                $.heading_stars,
                $.ws,
                $.paragraph,
            )),
        non_structural: ($) =>
            choice(
                // NOTE: reset markup stack on paragraph break
                // put this here instead of end of paragraph to reset on document start
                // parser sometimes have cache left when performing multiple tests
                $._flag_reset_markup,
                $.paragraph,
                newline,
                // $.nestable_modifier,
                // $.rangeable_detached_modifier,
                // $.tag,
                // $.delimiting_modifier,
            ),

        paragraph: ($) => prec.right(seq(
            $._non_ws,
            choice(
                alias($.soft_break, $.para_break),
                $.eof
            )
        )),
        tag: ($) => seq(token(prec(1, "@")), $.word),

        soft_break: (_) => token(seq(optional(whitespace), newline)),
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

        // verbatim_open: ($) => $._verbatim_open,
        verbatim_open: (_) => "`",
        verbatim: ($) =>
            // NOTE: using prec.dynamic for cases where we can't use symbol
            // precedence e.g. "word `word`"
            prec.dynamic(1,
                seq(
                    $.verbatim_open,
                    $._verbatim_non_ws,
                    $.verbatim_close
                ),
            ),
        ...gen_attached_modifier("bold", "*"),
        ...gen_attached_modifier("italic", "/"),
        ...gen_attached_modifier("underline", "_"),
        ...gen_attached_modifier("strikethr", "-"),
        ...gen_attached_modifier("spoiler", "!"),
        ...gen_attached_modifier("superscript", "^"),
        ...gen_attached_modifier("subscript", ","),
        _fail_verbatim: ($) =>
            // $.verbatim_open,
            seq(alias($.verbatim_open, $.punc), $._non_ws),
            // seq(alias($.verbatim_open, $.punc), $._verbatim_non_ws),
        _verbatim_non_ws: ($) =>
            choice(
                $.word,
                $.punc,
                // // disallow non-verbatim markups inside verbatim markup
                // ...ATTACHED_MODIFIERS.map((t) =>
                //     alias($[t + "_open"], $.punc),
                // ),
                ...ATTACHED_MODIFIERS.map((t) => 
                    seq(
                        alias($[t + "_open"], $.punc),
                        optional($._flag_non_open)
                    ),
                ),
                // ...ATTACHED_MODIFIERS.map((t) => $[t]),
                // ...ATTACHED_MODIFIERS.map((t) => $["_fail_" + t]),
                prec.left(seq($._verbatim_non_ws, $._verbatim_non_ws)),
                prec.left(seq($._verbatim_non_ws, $.ws, $._verbatim_non_ws)),
                prec.left(
                    seq($._verbatim_non_ws, $.soft_break, $._verbatim_non_ws),
                ),
            ),
        ...gen_attached_modifier_etc("bold"),
        ...gen_attached_modifier_etc("italic"),
        ...gen_attached_modifier_etc("underline"),
        ...gen_attached_modifier_etc("strikethr"),
        ...gen_attached_modifier_etc("spoiler"),
        ...gen_attached_modifier_etc("superscript"),
        ...gen_attached_modifier_etc("subscript"),

        _non_ws: ($) =>
            choice(
                seq($.word, optional(alias($.open_conflict, $.punc))),
                $.punc,
                $._fail_bold,
                $._fail_italic,
                $._fail_underline,
                $._fail_strikethr,
                ...ATTACHED_MODIFIERS.map((t) => $[t]),
                // $._fail_verbatim,
                $.verbatim,
                prec.left(seq($._non_ws, $._non_ws)),
                prec.left(seq($._non_ws, $.ws, $._non_ws)),
                prec.left(seq($._non_ws, $.soft_break, $._non_ws)),
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
    // rules[type + "_open"] = (_) => prec(1, mod);
    rules[type] = ($) =>
        prec(1,
            seq(
                // alias($[type + "_open"], "_open"),
                $[type + "_open"],
                $._non_ws,
                // prec.right($["_" + type + "_non_ws"]),
                // $["_" + type + "_non_ws"],
                $[type + "_close"],
                // optional(field("extension", $.attached_modifier_extension)),
            )
        );
    return rules;
}
/**
 * seperate function to give lower symbol precedence than actual attached
 * modifier itself
 * @param {string} type
 */
function gen_attached_modifier_etc(type) {
    const other_attached_modfiers = ATTACHED_MODIFIERS.filter((t) => t != type);
    /**
     * @type {RuleBuilders<string, string>}
     */
    let rules = {};
    rules["_fail_" + type] = ($) =>
        seq(
            alias($[type + "_open"], $.punc),
            // $[type + "_open"],
            // $["_" + type + "_non_ws"]
            optional($._non_ws),
        );
    rules["_" + type + "_non_ws"] = ($) =>
        choice(
            seq($.word, optional(alias($.open_conflict, $.punc))),
            $.punc,
            ...other_attached_modfiers.map((t) => $["_fail_" + t]),
            // $._fail_verbatim,
            $.verbatim,
            // ...other_attached_modfiers.map((t) => $[t + "_close"]),
            ...other_attached_modfiers.map((t) => $[t]),
            // ...other_attached_modfiers.map((t) => $["free_" + t]),
            ...VERBATIM_ATTACHED_MODIFIERS.map((t) => $[t]),
            // ...VERBATIM_ATTACHED_MODIFIERS.map((t) => $["free_" + t]),
            prec.left(
                seq($["_" + type + "_non_ws"], $["_" + type + "_non_ws"]),
            ),
            prec.left(
                seq(
                    $["_" + type + "_non_ws"],
                    $.ws,
                    // optional(alias($._newline_close_conflict, $.punc)),
                    // $["_" + type + "_non_ws"]
                    choice(
                        alias($._newline_close_conflict, $.punc),
                        seq(
                            optional(alias($._newline_close_conflict, $.punc)),
                            $["_" + type + "_non_ws"],
                        )
                    ),
                ),
            ),
            prec.left(
                seq(
                    $["_" + type + "_non_ws"],
                    $.soft_break,
                    choice(
                        alias($._newline_close_conflict, $.punc),
                        seq(
                            optional(alias($._newline_close_conflict, $.punc)),
                            $["_" + type + "_non_ws"],
                        )
                    ),
                ),
            ),
        );
    return rules;
}
