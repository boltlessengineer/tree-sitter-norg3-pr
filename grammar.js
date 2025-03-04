/// <reference types="tree-sitter-cli/dsl" />
// @ts-check
const newline = choice("\n", "\r", "\r\n");
const newline_or_eof = choice("\n", "\r", "\r\n", "\0");
const whitespace = /\p{Zs}+/u;
const whitespace_or_newline = token(prec.right(choice(
    whitespace,
    newline,
    seq(whitespace, newline),
)))

const ATTACHED_MODIFIERS = [
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "spoiler",
    "superscript",
    "subscript",
    "inline_comment",
];
const VERBATIM_ATTACHED_MODIFIERS = [
    "verbatim",
    "math",
    "inline_macro",
];

/// General TODOS:
//  - Abstract repeating patterns (e.g. nestable detached modifiers) into Javascript functions.
//  - Make every node have an alias($.node, $.node_prefix). Only some currently do.

/**
 * @param {RuleOrLiteral} rule
 */
function repeat2(rule) {
    return seq(rule, rule, repeat(rule));
}

module.exports = grammar({
    name: "norg",

    // Tell treesitter we want to handle whitespace ourselves
    extras: ($) => [
        $._preceding_whitespace,
    ],
    externals: ($) => [
        $._preceding_whitespace,

        $.paragraph_break,
        $._newline,
        $._failed_close,
        $.__inside_verbatim,

        $._punctuation,

        $.desc_open,
        $.desc_close,
        $.target_open,
        $.target_close,

        $.not_open,
        $.not_close,

        $.free_form_open,
        $.free_form_close,

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

        $.inline_comment_open,
        $.inline_comment_close,

        $.verbatim_open,
        $.verbatim_close,

        $.math_open,
        $.math_close,

        $.inline_macro_open,
        $.inline_macro_close,

        $.heading_prefix,
        $.unordered_list_prefix,
        $.ordered_list_prefix,
        $.quote_list_prefix,
        $.null_list_prefix,

        $.weak_delimiting_modifier,
        $._dedent_heading,
        $._dedent_list,
        $.__indent_seg_end,
        $.std_ranged_tag_prefix,
        $.std_ranged_tag_end,
        $._auto_semi,

        $._error_sentinel,
    ],

    conflicts: ($) => [
        [$.open_conflict, $.verbatim],
        [$.open_conflict, $.math],
        [$.open_conflict, $.inline_macro],
        ...ATTACHED_MODIFIERS.map((kind) => [
            [$.open_conflict, $[kind], $.verbatim],
            [$.open_conflict, $[kind], $.math],
            [$.open_conflict, $[kind], $.inline_macro],
        ]).flat(),
        [$._link_description, $.verbatim],
        [$._link_description, $.math],
        [$._link_description, $.inline_macro],
        [$._link_target, $.verbatim],
        [$._link_target, $.math],
        [$._link_target, $.inline_macro],

        [$.tag, $.unordered_list_item],
        [$.tag, $.ordered_list_item],
        [$.tag, $.quote_list_item],
    ],

    precedences: () => [],

    inline: ($) => [$.paragraph_inner, $.verbatim_paragraph_inner, $.document_content],

    supertypes: ($) => [
        $.attached_modifiers,
        $.non_structural,
        $.tag,
        $.nestable_detached_modifiers,
        $.rangeable_detached_modifiers,
    ],

    rules: {
        document: ($) => repeat($.document_content),
        document_content: ($) => 
            choice(
                $.heading,
                $.non_structural,
                $._newline,
                $.strong_delimiting_modifier,
                $._fake_weak_delimiting_modfiier,
            ),
        _fake_weak_delimiting_modfiier: ($) =>
            alias(
                token(seq(repeat2("-"), newline)),
                $.weak_delimiting_modifier
            ),
        paragraph: ($) => seq(
            repeat($.weak_carryover_tag),
            $.paragraph_inner,
            $.paragraph_break
        ),

        punctuation: ($) => choice(
            token(repeat1('*')),
            token(repeat1('/')),
            token(repeat1('_')),
            token(repeat1('-')),
            token(repeat1('!')),
            token(repeat1('`')),
            token(repeat1('&')),
            token(repeat1('$')),
            // '#',
            // '+',
            // '.',
            // '|',
            // '@',
            // '=',
            '.',
            /[^\n\r\p{Z}\p{L}\p{N}]/u,
            $._punctuation
        ),

        _word: (_) => /[\p{L}\p{N}]+/,
        word: ($) => $._word,
        whitespace: (_) => token(prec(1, whitespace)),
        soft_break: (_) => token(prec(1, newline)),

        escape_sequence: (_) => token(seq("\\", choice(/./, newline))),

        paragraph_inner: ($) =>
            prec.right(
                repeat1(
                    choice(
                        $._general,

                        $.attached_modifiers,
                        $.open_conflict,

                        $.anchor,
                        $.link,
                    ),
                ),
            ),
        attached_modifiers: ($) =>
            choice(
                ...ATTACHED_MODIFIERS.map((kind) => $[kind]),
                ...VERBATIM_ATTACHED_MODIFIERS.map((kind) => $[kind]),
            ),
        _general: ($) =>
            choice(
                seq($.whitespace, optional(alias($.not_close, $.punctuation))),
                prec.right(seq($.word, optional(alias($.not_open, $.punctuation)))),
                $.punctuation,
                $.escape_sequence,
                seq($.soft_break, optional(alias($.not_close, $.punctuation))),
            ),

        verbatim_paragraph_inner: ($) =>
            prec.right(
                repeat1(
                    choice(
                        $.__inside_verbatim,
                        $._general,
                        alias(
                            choice(
                                ...ATTACHED_MODIFIERS.map((kind) => $[kind + "_open"]),
                                ...VERBATIM_ATTACHED_MODIFIERS.map((kind) => $[kind + "_open"]),
                                $.target_open,
                                $.desc_open,
                                // list of link target prefixes to make conflict
                                // see link-11 ~ link-17
                                ":",
                                "/",
                                "#",
                                "?",
                                "=",
                            ),
                            $.punctuation,
                        ),
                    ),
                ),
            ),

        open_conflict: ($) =>
            // dynamic precedence to solve cases like link-09
            prec.dynamic(-1,
                seq(
                    choice(
                        ...ATTACHED_MODIFIERS.map((kind) => $[kind + "_open"]),
                        ...VERBATIM_ATTACHED_MODIFIERS.map((kind) => $[kind + "_open"]),
                    ),
                    optional($.paragraph_inner),
                    $._failed_close,
                ),
            ),

        identifier: (_) => token(prec(1, /[0-9A-Za-z][0-9A-Za-z\-_\.\+=]*/)),
        _free_form: ($) =>
            seq(
                $.free_form_open,
                repeat(
                    choice(
                        $.paragraph_inner,
                        alias(token(prec(1, "\\")), $.punctuation),
                    )
                ),
                $.free_form_close,
            ),
        _verbatim_free_form: ($) =>
            seq(
                alias("|", $.free_form_open),
                repeat(
                    choice(
                        $.verbatim_paragraph_inner,
                        alias(token(prec(1, "\\")), $.punctuation),
                        alias("|", $.punctuation),
                    ),
                ),
                alias("|", $.free_form_close),
            ),

        bold: gen_attached_modifier("bold"),
        italic: gen_attached_modifier("italic"),
        underline: gen_attached_modifier("underline"),
        strikethrough: gen_attached_modifier("strikethrough"),
        spoiler: gen_attached_modifier("spoiler"),
        superscript: gen_attached_modifier("superscript"),
        subscript: gen_attached_modifier("subscript"),
        inline_comment: gen_attached_modifier("inline_comment"),

        verbatim: gen_verbatim_attached_modifier("verbatim"),
        math: gen_verbatim_attached_modifier("math"),
        inline_macro: gen_verbatim_attached_modifier("inline_macro"),

        _link_description: ($) =>
            seq(
                alias($.desc_open, "["),
                optional(field("description", $.description)),
                alias($.desc_close, "]"),
            ),
        description: ($) => $.paragraph_inner,

        _link_target: ($) =>
            seq(
                alias($.target_open, "{"),
                field("target", choice(
                    $.scope,
                    $.norg_file,
                    $.uri,
                    $.link_target_file,
                    $.link_target_wiki,
                    $.link_target_magic,
                    $.link_target_timestamp,
                )),
                alias($.target_close, "}"),
            ),
        uri: ($) => repeat1(
            choice(
                $._word,
                alias($.punctuation, "punctuation"),
            )
        ),
        path: (_) => /[^:\}]+/,
        norg_file: ($) =>
            seq(
                ":",
                optional(
                    choice(
                        seq(
                            token(prec(1, "$")),
                            choice(
                                field("root", alias("/", $.current_workspace)),
                                seq(field("root", alias(/[^\$\/:\}]+/, $.workspace)), "/"),
                            )
                        ),
                        field("root", alias(token(prec(1, "/")), $.file_root))
                    )
                ),
                field("path", $.path),
                ":",
                optional(field("scope", $.scope)),
            ),
        link_target_file: ($) =>
            seq(
                alias(token("/"), $.file_prefix),
                whitespace,
                field("value", $.path),
            ),
        link_target_wiki: ($) =>
            seq(
                alias(token("?"), $.wiki_prefix),
                whitespace,
                field("value", $.path),
            ),
        link_target_magic: ($) =>
            seq(
                alias(token("#"), $.magic_prefix),
                whitespace,
                field("value", $.path),
            ),
        link_target_timestamp: ($) =>
            seq(
                alias(token("@"), $.timestamp_prefix),
                whitespace,
                field("value", $.path),
            ),
        scope: ($) =>
            seq(
                $._scope_item,
                repeat(seq(token(prec(9, " : ")), $._scope_item)),
            ),
        _scope_item: ($) =>
            choice(
                $.link_scope_heading,
                $.link_scope_footnote,
                $.link_scope_definition,
            ),
        link_scope_heading: ($) =>
            seq(
                alias(token(repeat1("*")), $.heading_prefix),
                whitespace,
                alias($.description, $.title)
            ),
        link_scope_footnote: ($) =>
            seq(
                alias(token(prec(1, seq("^", optional("^")))), $.footnote_prefix),
                whitespace,
                alias($.description, $.title)
            ),
        link_scope_definition: ($) =>
            seq(
                alias(token(prec(1, seq("$", optional("$")))), $.definition_prefix),
                whitespace,
                alias($.description, $.title)
            ),
        anchor: ($) =>
            prec.right(
                seq(
                    $._link_description,
                    optional($._link_target),
                )
            ),
        link: ($) =>
            prec.right(
                seq(
                    $._link_target,
                    optional($._link_description),
                )
            ),

        strong_delimiting_modifier: (_) => token(seq(repeat2("="), newline)),
        horizontal_rule: (_) => token(prec(1, seq(repeat2("_"), newline))),
        extensions: ($) =>
            seq(
                token(prec(1, "(")),
                repeat(
                    choice(
                        $.ext_attribute,
                        ";",
                        token(seq(optional(whitespace), newline)),
                    ),
                ),
                ")",
            ),
        // TODO: add support for escape sequence in identifier/parameter
        ext_identifier: (_) => token(/[^\s\n\r;\(\)]+/),
        ext_param: (_) => token(/[^\s\n\r;\(\)][^\n\r;\(\)]*/),
        ext_attribute: ($) =>
            choice(
                seq(
                    optional(whitespace),
                    field("key", $.ext_identifier),
                    optional(whitespace),
                    optional(
                        field("value", $.ext_param)
                    ),
                    choice(
                        ";",
                        $._auto_semi,
                    ),
                ),
                seq(
                    // alias(whitespace, $.undone),
                    whitespace,
                    choice(
                        ";",
                        $._auto_semi,
                    ),
                )
            ),
        heading: ($) =>
            prec.right(
                seq(
                    $.heading_prefix,
                    whitespace,
                    optional(
                        seq(
                            $.extensions,
                            whitespace,
                        )
                    ),
                    field(
                        "title",
                        choice(
                            $.paragraph,
                            $.slide,
                            $.indent_segment,
                        ),
                    ),
                    repeat(choice($.heading, $.non_structural, $._newline)),
                    optional(choice($._dedent_heading, $.weak_delimiting_modifier))
                ),
            ),
        nestable_detached_modifiers: ($) =>
            choice(
                $.unordered_list,
                $.ordered_list,
                $.quote_list,
                $.null_list,
            ),
        unordered_list: ($) => seq(
            repeat($.weak_carryover_tag),
            prec.right(repeat1($.unordered_list_item))
        ),
        unordered_list_item: ($) =>
            prec.right(
                seq(
                    $.unordered_list_prefix,
                    whitespace,
                    optional(
                        seq(
                            $.extensions,
                            whitespace,
                        )
                    ),
                    choice(
                        $.paragraph,
                        $.tag,
                    ),
                    repeat($.nestable_detached_modifiers),
                    optional($._dedent_list),
                )
            ),
        ordered_list: ($) => seq(
            repeat($.weak_carryover_tag),
            prec.right(repeat1($.ordered_list_item))
        ),
        ordered_list_item: ($) =>
            prec.right(
                seq(
                    $.ordered_list_prefix,
                    whitespace,
                    optional(
                        seq(
                            $.extensions,
                            whitespace,
                        )
                    ),
                    choice(
                        $.paragraph,
                        $.tag,
                    ),
                    repeat($.nestable_detached_modifiers),
                    optional($._dedent_list),
                )
            ),
        quote_list: ($) => seq(
            repeat($.weak_carryover_tag),
            prec.right(repeat1($.quote_list_item))
        ),
        quote_list_item: ($) =>
            prec.right(
                seq(
                    $.quote_list_prefix,
                    whitespace,
                    optional(
                        seq(
                            $.extensions,
                            whitespace,
                        )
                    ),
                    choice(
                        $.paragraph,
                        $.tag,
                    ),
                    repeat($.nestable_detached_modifiers),
                    optional($._dedent_list),
                )
            ),
        null_list: ($) => seq(
            repeat($.weak_carryover_tag),
            prec.right(repeat1($.null_list_item))
        ),
        null_list_item: ($) =>
            prec.right(
                seq(
                    $.null_list_prefix,
                    whitespace,
                    optional(
                        seq(
                            $.extensions,
                            whitespace,
                        )
                    ),
                    choice(
                        $.paragraph,
                        $.tag,
                    ),
                    repeat($.nestable_detached_modifiers),
                    optional($._dedent_list),
                )
            ),
        rangeable_detached_modifiers: ($) =>
            choice(
                $.footnote,
                $.definition,
                $.table,
            ),
        _verbatim_segment: ($) => repeat1(choice(/[^\s\\]+/, $.escape_sequence)),
        argument: ($) => $._verbatim_segment,
        verbatim_param_list: ($) => seq(
            $._verbatim_segment,
            repeat(
                seq(
                    whitespace,
                    $._verbatim_segment,
                )
            )
        ),
        _intersecting_modifier: (_) => token(prec(1, " : ")),
        footnote: ($) =>
            choice(
                seq(
                    "^ ",
                    optional(seq($.extensions, whitespace)),
                    field("title", $.verbatim_param_list),
                    choice(newline, $._intersecting_modifier),
                    $.paragraph,
                ),
                seq(
                    token(seq("^^", whitespace_or_newline)),
                    optional(seq($.extensions, whitespace)),
                    field("title", $.verbatim_param_list),
                    newline,
                    repeat(
                        choice(
                            $.non_structural,
                            $._newline,
                            $.strong_delimiting_modifier,
                            $._fake_weak_delimiting_modfiier,
                        ),
                    ),
                    token(prec(1, seq("^^", newline_or_eof))),
                )
            ),
        definition: ($) =>
            choice(
                seq(
                    "$ ",
                    optional(seq($.extensions, whitespace)),
                    field("title", $.verbatim_param_list),
                    choice(newline, $._intersecting_modifier),
                    $.paragraph,
                ),
                seq(
                    token(seq("$$", whitespace_or_newline)),
                    optional(seq($.extensions, whitespace)),
                    field("title", $.verbatim_param_list),
                    newline,
                    repeat(
                        choice(
                            $.non_structural,
                            $._newline,
                            $.strong_delimiting_modifier,
                            $._fake_weak_delimiting_modfiier,
                        ),
                    ),
                    token(prec(1, seq("$$", newline_or_eof))),
                )
            ),
        table: ($) =>
            choice(
                seq(
                    ": ",
                    field("title", $.verbatim_param_list),
                    optional(seq($.extensions, whitespace)),
                    choice(newline, $._intersecting_modifier),
                    $.paragraph,
                ),
                seq(
                    token(seq("::", whitespace_or_newline)),
                    optional(seq($.extensions, whitespace)),
                    field("title", $.verbatim_param_list),
                    newline,
                    repeat(
                        choice(
                            $.non_structural,
                            $._newline,
                            $.strong_delimiting_modifier,
                            $._fake_weak_delimiting_modfiier,
                        ),
                    ),
                    token(prec(1, seq("::", newline_or_eof))),
                )
            ),
        non_structural: ($) =>
            choice(
                $.paragraph,
                $.tag,
                $.horizontal_rule,
                $.nestable_detached_modifiers,
                $.rangeable_detached_modifiers,
            ),
        tag: ($) =>
            choice(
                $.strong_carryover_tag,
                $.infirm_tag,
                $.standard_ranged_tag,
                $.verbatim_ranged_tag,
                $.macro_ranged_tag,
            ),
        strong_carryover_tag: ($) =>
            seq(
                token(prec(1, '#')),
                field("name", $.identifier),
                repeat(seq(whitespace, field('argument', $.argument))),
                choice($._newline, "\0"),
            ),
        weak_carryover_tag: ($) =>
            seq(
                token(prec(1, '+')),
                field("key", $.ext_identifier),
                optional(
                    seq(whitespace, field("value", $.ext_param))
                ),
                choice($._newline, "\0"),
            ),
        infirm_tag: ($) =>
            seq(
                '.',
                $.identifier,
                repeat(seq(whitespace, field('argument', $.argument))),
                choice($._newline, "\0"),
            ),
        standard_ranged_tag: ($) =>
            seq(
                $.std_ranged_tag_prefix,
                $.identifier,
                repeat(seq(whitespace, field('argument', $.argument))),
                $._newline,
                repeat($.document_content),
                alias($.std_ranged_tag_end, '|end'),
                choice($._newline, "\0"),
            ),
        verbatim_ranged_tag: ($) =>
            seq(
                token(prec(1, '@')),
                $.identifier,
                repeat(seq(whitespace, field('argument', $.argument))),
                $._newline,
                optional(
                    field(
                        'content',
                        $.verbatim_lines,
                    )
                ),
                token(prec(1, '@end')),
                choice($._newline, "\0"),
            ),
        macro_ranged_tag: ($) =>
            seq(
                prec(1, '='),
                $.identifier,
                repeat(seq(whitespace, field('argument', $.argument))),
                $._newline,
                optional(
                    field(
                        'content',
                        $.verbatim_lines,
                    )
                ),
                token(prec(1, '=end')),
                choice($._newline, "\0"),
            ),
        verbatim_lines: ($) => repeat1(seq(optional(/.*/), $._newline)),
        slide: ($) =>
            seq(
                prec(1, ":"),
                $._newline,
                prec.right(repeat1($.non_structural)),
            ),
        indent_segment: ($) =>
            prec.right(
                seq(
                    prec(1, "::"),
                    $._newline,
                    repeat1(
                        choice(
                            $.non_structural,
                            $._newline,
                        ),
                    ),
                    optional(
                        choice($.weak_delimiting_modifier, $.__indent_seg_end)
                    )
                ),
            ),
    },
});

/**
 * @param {string} kind
 */
function gen_attached_modifier(kind) {
    return (/** @type GrammarSymbols<any> */ $) =>
        seq(
            $[kind + "_open"],
            choice(
                $._free_form,
                $.paragraph_inner,
            ),
            $[kind + "_close"],
            optional($.extensions),
        )
}

/**
 * @param {string} kind
 */
function gen_verbatim_attached_modifier(kind) {
    return (/** @type GrammarSymbols<any> */ $) =>
        prec.dynamic(
            1,
            prec.right(
                -1,
                seq(
                    $[kind + "_open"],
                    choice(
                        $._verbatim_free_form,
                        $.verbatim_paragraph_inner,
                    ),
                    $[kind + "_close"],
                    optional($.extensions),
                ),
            )
        )
}
